import axios from 'axios';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { AuthService, User } from './authService';
import { auditService } from './auditService';

export interface OAuthProvider {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  picture?: string;
}

export interface OAuthAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class OAuthService {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  async getAuthorizationUrl(provider: string, state: string, redirectUri: string): Promise<string> {
    const client = await pool.connect();
    
    try {
      // Get provider configuration
      const result = await client.query(
        'SELECT client_id, auth_url, scope FROM oauth_providers WHERE name = $1 AND is_active = true',
        [provider]
      );

      if (result.rows.length === 0) {
        throw new Error('OAuth provider not found or inactive');
      }

      const { client_id, auth_url, scope } = result.rows[0];

      const params = new URLSearchParams({
        client_id,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state
      });

      return `${auth_url}?${params.toString()}`;
    } finally {
      client.release();
    }
  }

  async handleCallback(provider: string, code: string, redirectUri: string, ipAddress: string, userAgent: string): Promise<{ user: User; tokens: any; isNewUser: boolean }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get provider configuration
      const providerResult = await client.query(
        'SELECT client_id, client_secret, token_url, user_info_url FROM oauth_providers WHERE name = $1 AND is_active = true',
        [provider]
      );

      if (providerResult.rows.length === 0) {
        throw new Error('OAuth provider not found or inactive');
      }

      const { client_id, client_secret, token_url, user_info_url } = providerResult.rows[0];

      // Exchange code for access token
      const tokenResponse = await this.exchangeCodeForToken(
        token_url,
        code,
        client_id,
        client_secret,
        redirectUri
      );

      // Get user info from provider
      const userInfo = await this.getUserInfo(user_info_url, tokenResponse.access_token);

      // Check if user exists by OAuth account
      let userResult = await client.query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at, u.updated_at
        FROM users u
        JOIN oauth_accounts oa ON u.id = oa.user_id
        WHERE oa.provider = $1 AND oa.provider_account_id = $2
      `, [provider, userInfo.id]);

      let user: User;
      let isNewUser = false;

      if (userResult.rows.length === 0) {
        // Check if user exists by email
        userResult = await client.query(
          'SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at FROM users WHERE email = $1',
          [userInfo.email]
        );

        if (userResult.rows.length === 0) {
          // Create new user
          const userId = uuidv4();
          const firstName = userInfo.firstName || userInfo.name?.split(' ')[0] || '';
          const lastName = userInfo.lastName || userInfo.name?.split(' ').slice(1).join(' ') || '';
          
          const newUserResult = await client.query(`
            INSERT INTO users (id, email, first_name, last_name, role, is_active, oauth_only)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at
          `, [userId, userInfo.email, firstName, lastName, 'viewer', true, true]);

          user = {
            id: newUserResult.rows[0].id,
            email: newUserResult.rows[0].email,
            firstName: newUserResult.rows[0].first_name,
            lastName: newUserResult.rows[0].last_name,
            role: newUserResult.rows[0].role,
            isActive: newUserResult.rows[0].is_active,
            createdAt: newUserResult.rows[0].created_at,
            updatedAt: newUserResult.rows[0].updated_at
          };

          isNewUser = true;
        } else {
          user = {
            id: userResult.rows[0].id,
            email: userResult.rows[0].email,
            firstName: userResult.rows[0].first_name,
            lastName: userResult.rows[0].last_name,
            role: userResult.rows[0].role,
            isActive: userResult.rows[0].is_active,
            createdAt: userResult.rows[0].created_at,
            updatedAt: userResult.rows[0].updated_at
          };
        }

        // Create OAuth account link
        await client.query(`
          INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, access_token, refresh_token, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (user_id, provider) DO UPDATE SET
            provider_account_id = EXCLUDED.provider_account_id,
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        `, [
          uuidv4(),
          user.id,
          provider,
          userInfo.id,
          tokenResponse.access_token,
          tokenResponse.refresh_token,
          tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null
        ]);
      } else {
        user = {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          firstName: userResult.rows[0].first_name,
          lastName: userResult.rows[0].last_name,
          role: userResult.rows[0].role,
          isActive: userResult.rows[0].is_active,
          createdAt: userResult.rows[0].created_at,
          updatedAt: userResult.rows[0].updated_at
        };

        // Update OAuth account tokens
        await client.query(`
          UPDATE oauth_accounts 
          SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
          WHERE user_id = $4 AND provider = $5
        `, [
          tokenResponse.access_token,
          tokenResponse.refresh_token,
          tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : null,
          user.id,
          provider
        ]);
      }

      // Update last login
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      await client.query('COMMIT');

      // Generate JWT tokens
      const tokens = await this.authService.generateTokens(user.id);

      // Audit log
      await auditService.logEvent({
        action: isNewUser ? 'oauth_user_created' : 'oauth_login_success',
        userId: user.id,
        details: { 
          provider,
          isNewUser,
          email: user.email
        },
        ipAddress,
        userAgent
      });

      return { user, tokens, isNewUser };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async unlinkOAuthAccount(userId: string, provider: string, requestedBy: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if user has password authentication as backup
      const userResult = await client.query(
        'SELECT password_hash, oauth_only FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const { password_hash, oauth_only } = userResult.rows[0];

      // Check if this is the only authentication method
      const oauthAccountsCount = await client.query(
        'SELECT COUNT(*) as count FROM oauth_accounts WHERE user_id = $1',
        [userId]
      );

      if (oauth_only && parseInt(oauthAccountsCount.rows[0].count) === 1 && !password_hash) {
        throw new Error('Cannot unlink the only authentication method. Please set a password first.');
      }

      // Remove OAuth account
      const result = await client.query(
        'DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2 RETURNING id',
        [userId, provider]
      );

      if (result.rows.length === 0) {
        throw new Error('OAuth account not found');
      }

      await client.query('COMMIT');

      // Audit log
      await auditService.logEvent({
        action: 'oauth_account_unlinked',
        userId: requestedBy,
        targetUserId: userId,
        details: { provider },
        ipAddress: '',
        userAgent: ''
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createOAuthProvider(providerData: Omit<OAuthProvider, 'id' | 'createdAt' | 'updatedAt'>, createdBy: string): Promise<OAuthProvider> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const providerId = uuidv4();
      const result = await client.query(`
        INSERT INTO oauth_providers (id, name, client_id, client_secret, auth_url, token_url, user_info_url, scope, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, name, client_id, client_secret, auth_url, token_url, user_info_url, scope, is_active, created_at, updated_at
      `, [
        providerId,
        providerData.name,
        providerData.clientId,
        providerData.clientSecret,
        providerData.authUrl,
        providerData.tokenUrl,
        providerData.userInfoUrl,
        providerData.scope,
        providerData.isActive
      ]);

      await client.query('COMMIT');

      const provider = result.rows[0];

      // Audit log
      await auditService.logEvent({
        action: 'oauth_provider_created',
        userId: createdBy,
        details: {
          providerId: provider.id,
          name: provider.name
        },
        ipAddress: '',
        userAgent: ''
      });

      return {
        id: provider.id,
        name: provider.name,
        clientId: provider.client_id,
        clientSecret: provider.client_secret,
        authUrl: provider.auth_url,
        tokenUrl: provider.token_url,
        userInfoUrl: provider.user_info_url,
        scope: provider.scope,
        isActive: provider.is_active,
        createdAt: provider.created_at,
        updatedAt: provider.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async exchangeCodeForToken(tokenUrl: string, code: string, clientId: string, clientSecret: string, redirectUri: string): Promise<any> {
    try {
      const response = await axios.post(tokenUrl, {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return response.data;
    } catch (error) {
      throw new Error('Failed to exchange authorization code for access token');
    }
  }

  private async getUserInfo(userInfoUrl: string, accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await axios.get(userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = response.data;

      // Normalize user info from different providers
      return {
        id: data.id || data.sub,
        email: data.email,
        firstName: data.given_name || data.first_name,
        lastName: data.family_name || data.last_name,
        name: data.name,
        picture: data.picture || data.avatar_url
      };
    } catch (error) {
      throw new Error('Failed to fetch user information from OAuth provider');
    }
  }
}