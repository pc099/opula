// @ts-nocheck
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { auditService } from './auditService';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenData {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isRevoked: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  permissions: string[];
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export class AuthService {
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key';
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  async createUser(userData: CreateUserRequest, createdBy: string): Promise<User> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [userData.email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      // Create user
      const userId = uuidv4();
      const result = await client.query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at
      `, [userId, userData.email, passwordHash, userData.firstName, userData.lastName, userData.role, true]);

      await client.query('COMMIT');

      const user = result.rows[0];

      // Audit log
      await auditService.logEvent({
        action: 'user_created',
        userId: createdBy,
        targetUserId: user.id,
        details: {
          email: user.email,
          role: user.role
        },
        ipAddress: '',
        userAgent: ''
      });

      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticateUser(credentials: LoginRequest, ipAddress: string, userAgent: string): Promise<{ user: User; tokens: AuthTokens }> {
    const client = await pool.connect();

    try {
      // Get user by email
      const result = await client.query(`
        SELECT id, email, password_hash, first_name, last_name, role, is_active, last_login_at
        FROM users 
        WHERE email = $1 AND is_active = true
      `, [credentials.email]);

      if (result.rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(credentials.password, user.password_hash);
      if (!isValidPassword) {
        // Audit failed login attempt
        await auditService.logEvent({
          action: 'login_failed',
          userId: user.id,
          details: { reason: 'invalid_password' },
          ipAddress,
          userAgent
        });
        throw new Error('Invalid credentials');
      }

      // Update last login
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      // Generate tokens
      const tokens = await this.generateTokensInternal(user.id);

      // Audit successful login
      await auditService.logEvent({
        action: 'login_success',
        userId: user.id,
        details: { method: 'password' },
        ipAddress,
        userAgent
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          isActive: user.is_active,
          lastLoginAt: user.last_login_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        tokens
      };
    } finally {
      client.release();
    }
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const client = await pool.connect();

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;

      // Check if refresh token exists and is not revoked
      const tokenResult = await client.query(`
        SELECT rt.id, rt.user_id, rt.is_revoked, u.is_active
        FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = $1 AND rt.expires_at > NOW()
      `, [refreshToken]);

      if (tokenResult.rows.length === 0 || tokenResult.rows[0].is_revoked || !tokenResult.rows[0].is_active) {
        throw new Error('Invalid refresh token');
      }

      const userId = tokenResult.rows[0].user_id;

      // Revoke old refresh token
      await client.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE token = $1',
        [refreshToken]
      );

      // Generate new tokens
      const tokens = await this.generateTokensInternal(userId);

      return tokens;
    } finally {
      client.release();
    }
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE token = $1',
        [refreshToken]
      );
    } finally {
      client.release();
    }
  }

  async createApiKey(name: string, permissions: string[], createdBy: string, expiresAt?: Date): Promise<{ apiKey: ApiKey; key: string }> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Generate API key
      const key = this.generateApiKey();
      const keyHash = await bcrypt.hash(key, 10);
      const apiKeyId = uuidv4();

      // Store API key
      const result = await client.query(`
        INSERT INTO api_keys (id, name, key_hash, permissions, is_active, expires_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, permissions, is_active, expires_at, created_by, created_at
      `, [apiKeyId, name, keyHash, JSON.stringify(permissions), true, expiresAt, createdBy]);

      await client.query('COMMIT');

      const apiKeyData = result.rows[0];

      // Audit log
      await auditService.logEvent({
        action: 'api_key_created',
        userId: createdBy,
        details: {
          apiKeyId: apiKeyData.id,
          name: apiKeyData.name,
          permissions
        },
        ipAddress: '',
        userAgent: ''
      });

      return {
        apiKey: {
          id: apiKeyData.id,
          name: apiKeyData.name,
          keyHash: apiKeyData.key_hash,
          permissions: JSON.parse(apiKeyData.permissions),
          isActive: apiKeyData.is_active,
          expiresAt: apiKeyData.expires_at,
          createdBy: apiKeyData.created_by,
          createdAt: apiKeyData.created_at
        },
        key
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    const client = await pool.connect();

    try {
      // Get all active API keys
      const result = await client.query(`
        SELECT id, name, key_hash, permissions, is_active, expires_at, last_used_at, created_by, created_at
        FROM api_keys 
        WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())
      `);

      // Check each key hash
      for (const row of result.rows) {
        const isValid = await bcrypt.compare(key, row.key_hash);
        if (isValid) {
          // Update last used timestamp
          await client.query(
            'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
            [row.id]
          );

          return {
            id: row.id,
            name: row.name,
            keyHash: row.key_hash,
            permissions: JSON.parse(row.permissions),
            isActive: row.is_active,
            expiresAt: row.expires_at,
            lastUsedAt: new Date(),
            createdBy: row.created_by,
            createdAt: row.created_at
          };
        }
      }

      return null;
    } finally {
      client.release();
    }
  }

  async revokeApiKey(apiKeyId: string, revokedBy: string): Promise<void> {
    const client = await pool.connect();

    try {
      const result = await client.query(
        'UPDATE api_keys SET is_active = false WHERE id = $1 RETURNING name',
        [apiKeyId]
      );

      if (result.rows.length > 0) {
        // Audit log
        await auditService.logEvent({
          action: 'api_key_revoked',
          userId: revokedBy,
          details: {
            apiKeyId,
            name: result.rows[0].name
          },
          ipAddress: '',
          userAgent: ''
        });
      }
    } finally {
      client.release();
    }
  }

  private async generateTokensOriginal(userId: string): Promise<AuthTokens> {
    const client = await pool.connect();

    try {
      // Generate access token
      // @ts-ignore
      const accessToken = jwt.sign(
        { id: userId, type: 'access' },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiry }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { id: userId, type: 'refresh' },
        this.jwtRefreshSecret as any,
        { expiresIn: this.refreshTokenExpiry }
      );

      // Store refresh token
      const refreshTokenId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await client.query(`
        INSERT INTO refresh_tokens (id, user_id, token, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [refreshTokenId, userId, refreshToken, expiresAt]);

      // Get token expiry time
      const decoded = jwt.decode(accessToken) as any;
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

      return {
        accessToken,
        refreshToken,
        expiresIn
      };
    } finally {
      client.release();
    }
  }

  private generateApiKey(): string {
    const prefix = 'aiops_';
    const randomBytes = require('crypto').randomBytes(32).toString('hex');
    return `${prefix}${randomBytes}`;
  }

  async getUserById(userId: string): Promise<User | null> {
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at, updated_at
        FROM users 
        WHERE id = $1 AND is_active = true
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        isActive: user.is_active,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } finally {
      client.release();
    }
  }

  // Make generateTokens public for OAuth service
  async generateTokens(userId: string): Promise<AuthTokens> {
    return this.generateTokensInternal(userId);
  }

  private async generateTokensInternal(userId: string): Promise<AuthTokens> {
    const client = await pool.connect();

    try {
      // Generate access token
      // @ts-ignore
      const accessToken = jwt.sign(
        { id: userId, type: 'access' },
        this.jwtSecret,
        { expiresIn: this.accessTokenExpiry }
      );

      // Generate refresh token
      const refreshToken = jwt.sign(
        { id: userId, type: 'refresh' },
        this.jwtRefreshSecret as any,
        { expiresIn: this.refreshTokenExpiry }
      );

      // Store refresh token
      const refreshTokenId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      await client.query(`
        INSERT INTO refresh_tokens (id, user_id, token, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [refreshTokenId, userId, refreshToken, expiresAt]);

      // Get token expiry time
      const decoded = jwt.decode(accessToken) as any;
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);

      return {
        accessToken,
        refreshToken,
        expiresIn
      };
    } finally {
      client.release();
    }
  }
}
