import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './database';
import { auditService } from './auditService';
import { logger } from '../middleware/requestLogger';

export interface VaultConfig {
  url: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  namespace?: string;
  mountPath: string;
}

export interface SecretMetadata {
  id: string;
  name: string;
  path: string;
  description?: string;
  tags: string[];
  rotationEnabled: boolean;
  rotationInterval?: number; // in days
  expiresAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  lastRotatedAt?: Date;
  nextRotationAt?: Date;
}

export interface SecretData {
  [key: string]: string | number | boolean;
}

export interface CredentialRotationPolicy {
  id: string;
  name: string;
  description: string;
  secretPaths: string[];
  rotationInterval: number; // in days
  rotationScript?: string;
  notificationChannels: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretAccessLog {
  id: string;
  secretPath: string;
  userId?: string;
  serviceId?: string;
  action: 'read' | 'write' | 'delete' | 'rotate';
  success: boolean;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

export class VaultService {
  private client: AxiosInstance;
  private config: VaultConfig;
  private auditService = auditService;
  private isAuthenticated: boolean = false;

  constructor(config?: VaultConfig) {
    this.config = config || this.getDefaultConfig();
    
    this.client = axios.create({
      baseURL: this.config.url,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((config: any) => {
      if (this.config.token) {
        config.headers['X-Vault-Token'] = this.config.token;
      }
      if (this.config.namespace) {
        config.headers['X-Vault-Namespace'] = this.config.namespace;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response: any) => response,
      (error: any) => {
        logger.error('Vault API error', {
          status: error.response?.status,
          message: error.response?.data?.errors || error.message,
          url: error.config?.url
        });
        throw error;
      }
    );
  }

  private getDefaultConfig(): VaultConfig {
    return {
      url: process.env.VAULT_URL || 'http://localhost:8200',
      token: process.env.VAULT_TOKEN,
      roleId: process.env.VAULT_ROLE_ID,
      secretId: process.env.VAULT_SECRET_ID,
      namespace: process.env.VAULT_NAMESPACE,
      mountPath: process.env.VAULT_MOUNT_PATH || 'secret'
    };
  }

  async initialize(): Promise<void> {
    try {
      // Authenticate with Vault
      if (this.config.roleId && this.config.secretId) {
        await this.authenticateWithAppRole();
      } else if (this.config.token) {
        await this.validateToken();
      } else {
        throw new Error('No authentication method configured for Vault');
      }

      // Initialize secret engine if needed
      await this.ensureSecretEngine();

      logger.info('Vault service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Vault service', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async authenticateWithAppRole(): Promise<void> {
    try {
      const response = await this.client.post('/v1/auth/approle/login', {
        role_id: this.config.roleId,
        secret_id: this.config.secretId
      });

      this.config.token = response.data.auth.client_token;
      this.isAuthenticated = true;

      logger.info('Successfully authenticated with Vault using AppRole');
    } catch (error) {
      throw new Error(`Vault AppRole authentication failed: ${(error as Error).message}`);
    }
  }

  private async validateToken(): Promise<void> {
    try {
      await this.client.get('/v1/auth/token/lookup-self');
      this.isAuthenticated = true;
      logger.info('Vault token validated successfully');
    } catch (error) {
      throw new Error(`Vault token validation failed: ${(error as Error).message}`);
    }
  }

  private async ensureSecretEngine(): Promise<void> {
    try {
      // Check if secret engine is mounted
      const response = await this.client.get('/v1/sys/mounts');
      const mounts = response.data;
      
      const mountKey = `${this.config.mountPath}/`;
      if (!mounts[mountKey]) {
        // Mount KV v2 secret engine
        await this.client.post(`/v1/sys/mounts/${this.config.mountPath}`, {
          type: 'kv',
          options: {
            version: '2'
          },
          description: 'AIOps Platform secrets'
        });
        
        logger.info(`Mounted secret engine at ${this.config.mountPath}`);
      }
    } catch (error) {
      logger.warn('Could not ensure secret engine', {
        error: (error as Error).message
      });
    }
  }

  async storeSecret(
    path: string,
    data: SecretData,
    metadata: Partial<SecretMetadata>,
    userId: string
  ): Promise<SecretMetadata> {
    if (!this.isAuthenticated) {
      throw new Error('Vault service not authenticated');
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Store secret in Vault
      const vaultPath = `${this.config.mountPath}/data/${path}`;
      await this.client.post(vaultPath, {
        data: data
      });

      // Store metadata in database
      const secretId = uuidv4();
      const secretMetadata: SecretMetadata = {
        id: secretId,
        name: metadata.name || path,
        path: path,
        description: metadata.description,
        tags: metadata.tags || [],
        rotationEnabled: metadata.rotationEnabled || false,
        rotationInterval: metadata.rotationInterval,
        expiresAt: metadata.expiresAt,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastRotatedAt: metadata.rotationEnabled ? new Date() : undefined,
        nextRotationAt: metadata.rotationEnabled && metadata.rotationInterval 
          ? new Date(Date.now() + metadata.rotationInterval * 24 * 60 * 60 * 1000)
          : undefined
      };

      await client.query(`
        INSERT INTO secret_metadata (
          id, name, path, description, tags, rotation_enabled, rotation_interval,
          expires_at, created_by, created_at, updated_at, last_rotated_at, next_rotation_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        secretMetadata.id,
        secretMetadata.name,
        secretMetadata.path,
        secretMetadata.description,
        JSON.stringify(secretMetadata.tags),
        secretMetadata.rotationEnabled,
        secretMetadata.rotationInterval,
        secretMetadata.expiresAt,
        secretMetadata.createdBy,
        secretMetadata.createdAt,
        secretMetadata.updatedAt,
        secretMetadata.lastRotatedAt,
        secretMetadata.nextRotationAt
      ]);

      await client.query('COMMIT');

      // Audit log
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'write',
        success: true,
        ipAddress: '',
        userAgent: ''
      });

      await this.auditService.logEvent({
        action: 'secret_created',
        userId,
        details: {
          secretPath: path,
          secretName: secretMetadata.name,
          rotationEnabled: secretMetadata.rotationEnabled
        },
        ipAddress: '',
        userAgent: ''
      });

      logger.info('Secret stored successfully', {
        path,
        secretId,
        userId
      });

      return secretMetadata;
    } catch (error) {
      await client.query('ROLLBACK');
      
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'write',
        success: false,
        ipAddress: '',
        userAgent: ''
      });

      throw error;
    } finally {
      client.release();
    }
  }

  async getSecret(path: string, userId?: string, serviceId?: string): Promise<SecretData> {
    if (!this.isAuthenticated) {
      throw new Error('Vault service not authenticated');
    }

    try {
      const vaultPath = `${this.config.mountPath}/data/${path}`;
      const response = await this.client.get(vaultPath);
      
      const secretData = response.data.data.data;

      // Audit log
      await this.logSecretAccess({
        secretPath: path,
        userId,
        serviceId,
        action: 'read',
        success: true,
        ipAddress: '',
        userAgent: ''
      });

      if (userId) {
        await this.auditService.logEvent({
          action: 'secret_accessed',
          userId,
          details: {
            secretPath: path,
            serviceId
          },
          ipAddress: '',
          userAgent: ''
        });
      }

      return secretData;
    } catch (error) {
      await this.logSecretAccess({
        secretPath: path,
        userId,
        serviceId,
        action: 'read',
        success: false,
        ipAddress: '',
        userAgent: ''
      });

      if ((error as any).response?.status === 404) {
        throw new Error(`Secret not found at path: ${path}`);
      }
      throw error;
    }
  }

  async updateSecret(
    path: string,
    data: SecretData,
    userId: string
  ): Promise<void> {
    if (!this.isAuthenticated) {
      throw new Error('Vault service not authenticated');
    }

    const client = await pool.connect();
    
    try {
      // Update secret in Vault
      const vaultPath = `${this.config.mountPath}/data/${path}`;
      await this.client.post(vaultPath, {
        data: data
      });

      // Update metadata in database
      await client.query(`
        UPDATE secret_metadata 
        SET updated_at = NOW()
        WHERE path = $1
      `, [path]);

      // Audit log
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'write',
        success: true,
        ipAddress: '',
        userAgent: ''
      });

      await this.auditService.logEvent({
        action: 'secret_updated',
        userId,
        details: {
          secretPath: path
        },
        ipAddress: '',
        userAgent: ''
      });

      logger.info('Secret updated successfully', {
        path,
        userId
      });
    } catch (error) {
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'write',
        success: false,
        ipAddress: '',
        userAgent: ''
      });

      throw error;
    } finally {
      client.release();
    }
  }

  async deleteSecret(path: string, userId: string): Promise<void> {
    if (!this.isAuthenticated) {
      throw new Error('Vault service not authenticated');
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete secret from Vault
      const vaultPath = `${this.config.mountPath}/metadata/${path}`;
      await this.client.delete(vaultPath);

      // Delete metadata from database
      await client.query('DELETE FROM secret_metadata WHERE path = $1', [path]);

      await client.query('COMMIT');

      // Audit log
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'delete',
        success: true,
        ipAddress: '',
        userAgent: ''
      });

      await this.auditService.logEvent({
        action: 'secret_deleted',
        userId,
        details: {
          secretPath: path
        },
        ipAddress: '',
        userAgent: ''
      });

      logger.info('Secret deleted successfully', {
        path,
        userId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'delete',
        success: false,
        ipAddress: '',
        userAgent: ''
      });

      throw error;
    } finally {
      client.release();
    }
  }

  async rotateSecret(path: string, userId: string): Promise<void> {
    if (!this.isAuthenticated) {
      throw new Error('Vault service not authenticated');
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current secret metadata
      const metadataResult = await client.query(
        'SELECT * FROM secret_metadata WHERE path = $1',
        [path]
      );

      if (metadataResult.rows.length === 0) {
        throw new Error(`Secret metadata not found for path: ${path}`);
      }

      const metadata = metadataResult.rows[0];

      if (!metadata.rotation_enabled) {
        throw new Error(`Secret rotation not enabled for path: ${path}`);
      }

      // Generate new secret data (this would be customized based on secret type)
      const newSecretData = await this.generateRotatedSecret(path, metadata);

      // Update secret in Vault
      const vaultPath = `${this.config.mountPath}/data/${path}`;
      await this.client.post(vaultPath, {
        data: newSecretData
      });

      // Update rotation metadata
      const nextRotationAt = new Date(Date.now() + metadata.rotation_interval * 24 * 60 * 60 * 1000);
      
      await client.query(`
        UPDATE secret_metadata 
        SET last_rotated_at = NOW(), next_rotation_at = $1, updated_at = NOW()
        WHERE path = $2
      `, [nextRotationAt, path]);

      await client.query('COMMIT');

      // Audit log
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'rotate',
        success: true,
        ipAddress: '',
        userAgent: ''
      });

      await this.auditService.logEvent({
        action: 'secret_rotated',
        userId,
        details: {
          secretPath: path,
          nextRotationAt
        },
        ipAddress: '',
        userAgent: ''
      });

      logger.info('Secret rotated successfully', {
        path,
        userId,
        nextRotationAt
      });
    } catch (error) {
      await client.query('ROLLBACK');
      
      await this.logSecretAccess({
        secretPath: path,
        userId,
        action: 'rotate',
        success: false,
        ipAddress: '',
        userAgent: ''
      });

      throw error;
    } finally {
      client.release();
    }
  }

  async getSecretsForRotation(): Promise<SecretMetadata[]> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM secret_metadata 
        WHERE rotation_enabled = true 
        AND next_rotation_at <= NOW()
        ORDER BY next_rotation_at ASC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        path: row.path,
        description: row.description,
        tags: JSON.parse(row.tags || '[]'),
        rotationEnabled: row.rotation_enabled,
        rotationInterval: row.rotation_interval,
        expiresAt: row.expires_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastRotatedAt: row.last_rotated_at,
        nextRotationAt: row.next_rotation_at
      }));
    } finally {
      client.release();
    }
  }

  async createRotationPolicy(
    policy: Omit<CredentialRotationPolicy, 'id' | 'createdAt' | 'updatedAt'>,
    userId: string
  ): Promise<CredentialRotationPolicy> {
    const client = await pool.connect();
    
    try {
      const policyId = uuidv4();
      const now = new Date();

      const result = await client.query(`
        INSERT INTO credential_rotation_policies (
          id, name, description, secret_paths, rotation_interval,
          rotation_script, notification_channels, is_active, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        policyId,
        policy.name,
        policy.description,
        JSON.stringify(policy.secretPaths),
        policy.rotationInterval,
        policy.rotationScript,
        JSON.stringify(policy.notificationChannels),
        policy.isActive,
        userId,
        now,
        now
      ]);

      const createdPolicy = result.rows[0];

      await this.auditService.logEvent({
        action: 'rotation_policy_created',
        userId,
        details: {
          policyId,
          name: policy.name,
          secretPaths: policy.secretPaths
        },
        ipAddress: '',
        userAgent: ''
      });

      return {
        id: createdPolicy.id,
        name: createdPolicy.name,
        description: createdPolicy.description,
        secretPaths: JSON.parse(createdPolicy.secret_paths),
        rotationInterval: createdPolicy.rotation_interval,
        rotationScript: createdPolicy.rotation_script,
        notificationChannels: JSON.parse(createdPolicy.notification_channels),
        isActive: createdPolicy.is_active,
        createdBy: createdPolicy.created_by,
        createdAt: createdPolicy.created_at,
        updatedAt: createdPolicy.updated_at
      };
    } finally {
      client.release();
    }
  }

  private async generateRotatedSecret(path: string, metadata: any): Promise<SecretData> {
    // This is a simplified implementation
    // In practice, this would be customized based on the type of secret
    
    if (path.includes('api-key')) {
      return {
        key: this.generateApiKey(),
        rotatedAt: new Date().toISOString()
      };
    } else if (path.includes('password')) {
      return {
        password: this.generatePassword(),
        rotatedAt: new Date().toISOString()
      };
    } else if (path.includes('token')) {
      return {
        token: this.generateToken(),
        rotatedAt: new Date().toISOString()
      };
    }

    // Default: generate a new random secret
    return {
      secret: require('crypto').randomBytes(32).toString('hex'),
      rotatedAt: new Date().toISOString()
    };
  }

  private generateApiKey(): string {
    return 'ak_' + require('crypto').randomBytes(32).toString('hex');
  }

  private generatePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private generateToken(): string {
    return require('crypto').randomBytes(48).toString('base64');
  }

  private async logSecretAccess(log: Omit<SecretAccessLog, 'id' | 'timestamp'>): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query(`
        INSERT INTO secret_access_logs (
          id, secret_path, user_id, service_id, action, success, ip_address, user_agent, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        uuidv4(),
        log.secretPath,
        log.userId,
        log.serviceId,
        log.action,
        log.success,
        log.ipAddress,
        log.userAgent,
        new Date()
      ]);
    } catch (error) {
      logger.error('Failed to log secret access', {
        error: (error as Error).message
      });
    } finally {
      client.release();
    }
  }

  async getSecretMetadata(path?: string): Promise<SecretMetadata[]> {
    const client = await pool.connect();
    
    try {
      let query = 'SELECT * FROM secret_metadata';
      const params: any[] = [];

      if (path) {
        query += ' WHERE path = $1';
        params.push(path);
      }

      query += ' ORDER BY created_at DESC';

      const result = await client.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        path: row.path,
        description: row.description,
        tags: JSON.parse(row.tags || '[]'),
        rotationEnabled: row.rotation_enabled,
        rotationInterval: row.rotation_interval,
        expiresAt: row.expires_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastRotatedAt: row.last_rotated_at,
        nextRotationAt: row.next_rotation_at
      }));
    } finally {
      client.release();
    }
  }

  async injectCredentialsForAgent(agentId: string, secretPaths: string[]): Promise<Record<string, SecretData>> {
    const credentials: Record<string, SecretData> = {};

    for (const path of secretPaths) {
      try {
        const secretData = await this.getSecret(path, undefined, agentId);
        credentials[path] = secretData;
      } catch (error) {
        logger.error(`Failed to inject credential for agent ${agentId}`, {
          path,
          error: (error as Error).message
        });
        // Continue with other secrets even if one fails
      }
    }

    return credentials;
  }
}