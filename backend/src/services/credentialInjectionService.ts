import { VaultService, SecretData } from './vaultService';
import { pool } from './database';
import { auditService } from './auditService';
import { logger } from '../middleware/requestLogger';

export interface AgentCredentialMapping {
  id: string;
  agentId: string;
  secretPath: string;
  credentialType: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InjectedCredentials {
  [credentialType: string]: SecretData;
}

export interface CredentialTemplate {
  type: string;
  name: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  rotationSupported: boolean;
  defaultRotationInterval?: number;
}

export class CredentialInjectionService {
  private vaultService: VaultService;
  private auditService = auditService;

  constructor(vaultService?: VaultService) {
    this.vaultService = vaultService || new VaultService();
  }

  async initialize(): Promise<void> {
    try {
      await this.vaultService.initialize();
      logger.info('Credential injection service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize credential injection service', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  async mapCredentialToAgent(
    agentId: string,
    secretPath: string,
    credentialType: string,
    userId: string
  ): Promise<AgentCredentialMapping> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Verify agent exists
      const agentResult = await client.query(
        'SELECT id FROM agent_configs WHERE id = $1',
        [agentId]
      );

      if (agentResult.rows.length === 0) {
        throw new Error('Agent not found');
      }

      // Verify secret exists
      const secretResult = await client.query(
        'SELECT id FROM secret_metadata WHERE path = $1',
        [secretPath]
      );

      if (secretResult.rows.length === 0) {
        throw new Error('Secret not found');
      }

      // Create or update mapping
      const mappingId = require('uuid').v4();
      const result = await client.query(`
        INSERT INTO agent_credential_mappings (id, agent_id, secret_path, credential_type, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (agent_id, secret_path) 
        DO UPDATE SET 
          credential_type = EXCLUDED.credential_type,
          is_active = true,
          updated_at = NOW()
        RETURNING *
      `, [mappingId, agentId, secretPath, credentialType, userId]);

      await client.query('COMMIT');

      const mapping = result.rows[0];

      // Audit log
      await this.auditService.logEvent({
        action: 'credential_mapped_to_agent',
        userId,
        details: {
          agentId,
          secretPath,
          credentialType,
          mappingId: mapping.id
        },
        ipAddress: '',
        userAgent: ''
      });

      logger.info('Credential mapped to agent successfully', {
        agentId,
        secretPath,
        credentialType,
        mappingId: mapping.id
      });

      return {
        id: mapping.id,
        agentId: mapping.agent_id,
        secretPath: mapping.secret_path,
        credentialType: mapping.credential_type,
        isActive: mapping.is_active,
        createdBy: mapping.created_by,
        createdAt: mapping.created_at,
        updatedAt: mapping.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async unmapCredentialFromAgent(
    agentId: string,
    secretPath: string,
    userId: string
  ): Promise<void> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        UPDATE agent_credential_mappings 
        SET is_active = false, updated_at = NOW()
        WHERE agent_id = $1 AND secret_path = $2
        RETURNING id
      `, [agentId, secretPath]);

      if (result.rows.length === 0) {
        throw new Error('Credential mapping not found');
      }

      // Audit log
      await this.auditService.logEvent({
        action: 'credential_unmapped_from_agent',
        userId,
        details: {
          agentId,
          secretPath,
          mappingId: result.rows[0].id
        },
        ipAddress: '',
        userAgent: ''
      });

      logger.info('Credential unmapped from agent successfully', {
        agentId,
        secretPath
      });
    } finally {
      client.release();
    }
  }

  async injectCredentialsForAgent(agentId: string): Promise<InjectedCredentials> {
    const client = await pool.connect();
    
    try {
      // Get all active credential mappings for the agent
      const result = await client.query(`
        SELECT secret_path, credential_type
        FROM agent_credential_mappings
        WHERE agent_id = $1 AND is_active = true
      `, [agentId]);

      const credentials: InjectedCredentials = {};

      for (const mapping of result.rows) {
        try {
          const secretData = await this.vaultService.getSecret(
            mapping.secret_path,
            undefined,
            agentId
          );

          credentials[mapping.credential_type] = secretData;
        } catch (error) {
          logger.error(`Failed to inject credential for agent ${agentId}`, {
            secretPath: mapping.secret_path,
            credentialType: mapping.credential_type,
            error: (error as Error).message
          });
          
          // Continue with other credentials even if one fails
          // This ensures partial functionality rather than complete failure
        }
      }

      logger.debug('Credentials injected for agent', {
        agentId,
        credentialTypes: Object.keys(credentials)
      });

      return credentials;
    } finally {
      client.release();
    }
  }

  async getAgentCredentialMappings(agentId: string): Promise<AgentCredentialMapping[]> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT * FROM agent_credential_mappings
        WHERE agent_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `, [agentId]);

      return result.rows.map(row => ({
        id: row.id,
        agentId: row.agent_id,
        secretPath: row.secret_path,
        credentialType: row.credential_type,
        isActive: row.is_active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } finally {
      client.release();
    }
  }

  async validateAgentCredentials(agentId: string): Promise<{
    valid: boolean;
    issues: string[];
    credentialStatus: Record<string, { valid: boolean; error?: string }>;
  }> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT acm.secret_path, acm.credential_type, sm.expires_at
        FROM agent_credential_mappings acm
        LEFT JOIN secret_metadata sm ON acm.secret_path = sm.path
        WHERE acm.agent_id = $1 AND acm.is_active = true
      `, [agentId]);

      const issues: string[] = [];
      const credentialStatus: Record<string, { valid: boolean; error?: string }> = {};
      let allValid = true;

      for (const mapping of result.rows) {
        const credentialType = mapping.credential_type;
        
        try {
          // Check if secret exists and is accessible
          await this.vaultService.getSecret(mapping.secret_path, undefined, agentId);
          
          // Check if secret is expired
          if (mapping.expires_at && new Date(mapping.expires_at) < new Date()) {
            credentialStatus[credentialType] = {
              valid: false,
              error: 'Credential has expired'
            };
            issues.push(`${credentialType} credential has expired`);
            allValid = false;
          } else {
            credentialStatus[credentialType] = { valid: true };
          }
        } catch (error) {
          credentialStatus[credentialType] = {
            valid: false,
            error: (error as Error).message
          };
          issues.push(`${credentialType} credential is invalid: ${(error as Error).message}`);
          allValid = false;
        }
      }

      return {
        valid: allValid,
        issues,
        credentialStatus
      };
    } finally {
      client.release();
    }
  }

  async getCredentialTemplates(): Promise<CredentialTemplate[]> {
    return [
      {
        type: 'aws',
        name: 'AWS Credentials',
        description: 'AWS access key and secret key for API access',
        requiredFields: ['access_key_id', 'secret_access_key'],
        optionalFields: ['session_token', 'region'],
        rotationSupported: true,
        defaultRotationInterval: 90
      },
      {
        type: 'azure',
        name: 'Azure Credentials',
        description: 'Azure service principal credentials',
        requiredFields: ['client_id', 'client_secret', 'tenant_id'],
        optionalFields: ['subscription_id'],
        rotationSupported: true,
        defaultRotationInterval: 90
      },
      {
        type: 'gcp',
        name: 'Google Cloud Credentials',
        description: 'GCP service account key',
        requiredFields: ['service_account_key'],
        optionalFields: ['project_id'],
        rotationSupported: true,
        defaultRotationInterval: 90
      },
      {
        type: 'kubernetes',
        name: 'Kubernetes Credentials',
        description: 'Kubernetes cluster access credentials',
        requiredFields: ['kubeconfig'],
        optionalFields: ['namespace', 'context'],
        rotationSupported: false
      },
      {
        type: 'terraform',
        name: 'Terraform Credentials',
        description: 'Terraform Cloud/Enterprise API token',
        requiredFields: ['api_token'],
        optionalFields: ['organization'],
        rotationSupported: true,
        defaultRotationInterval: 60
      },
      {
        type: 'database',
        name: 'Database Credentials',
        description: 'Database connection credentials',
        requiredFields: ['username', 'password'],
        optionalFields: ['host', 'port', 'database'],
        rotationSupported: true,
        defaultRotationInterval: 60
      },
      {
        type: 'api_key',
        name: 'API Key',
        description: 'Third-party service API key',
        requiredFields: ['api_key'],
        optionalFields: ['api_secret', 'base_url'],
        rotationSupported: true,
        defaultRotationInterval: 30
      },
      {
        type: 'ssh',
        name: 'SSH Credentials',
        description: 'SSH private key and related credentials',
        requiredFields: ['private_key'],
        optionalFields: ['public_key', 'passphrase', 'username'],
        rotationSupported: false
      }
    ];
  }

  async createCredentialFromTemplate(
    templateType: string,
    secretPath: string,
    secretData: SecretData,
    metadata: {
      name: string;
      description?: string;
      tags?: string[];
      rotationEnabled?: boolean;
    },
    userId: string
  ): Promise<void> {
    const templates = await this.getCredentialTemplates();
    const template = templates.find(t => t.type === templateType);

    if (!template) {
      throw new Error(`Unknown credential template type: ${templateType}`);
    }

    // Validate required fields
    for (const field of template.requiredFields) {
      if (!(field in secretData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Set default rotation settings based on template
    const rotationEnabled = metadata.rotationEnabled !== undefined 
      ? metadata.rotationEnabled 
      : template.rotationSupported;

    const rotationInterval = template.defaultRotationInterval;

    // Store the secret
    await this.vaultService.storeSecret(
      secretPath,
      secretData,
      {
        name: metadata.name,
        description: metadata.description,
        tags: [...(metadata.tags || []), templateType],
        rotationEnabled,
        rotationInterval
      },
      userId
    );

    logger.info('Credential created from template', {
      templateType,
      secretPath,
      rotationEnabled,
      userId
    });
  }

  async rotateAgentCredentials(agentId: string, userId: string): Promise<{
    success: string[];
    failed: string[];
  }> {
    const client = await pool.connect();
    
    try {
      // Get all rotatable credentials for the agent
      const result = await client.query(`
        SELECT acm.secret_path, sm.rotation_enabled
        FROM agent_credential_mappings acm
        JOIN secret_metadata sm ON acm.secret_path = sm.path
        WHERE acm.agent_id = $1 AND acm.is_active = true AND sm.rotation_enabled = true
      `, [agentId]);

      const success: string[] = [];
      const failed: string[] = [];

      for (const mapping of result.rows) {
        try {
          await this.vaultService.rotateSecret(mapping.secret_path, userId);
          success.push(mapping.secret_path);
        } catch (error) {
          failed.push(mapping.secret_path);
          logger.error(`Failed to rotate credential for agent ${agentId}`, {
            secretPath: mapping.secret_path,
            error: (error as Error).message
          });
        }
      }

      // Audit log
      await this.auditService.logEvent({
        action: 'agent_credentials_rotated',
        userId,
        details: {
          agentId,
          successCount: success.length,
          failedCount: failed.length,
          success,
          failed
        },
        ipAddress: '',
        userAgent: ''
      });

      return { success, failed };
    } finally {
      client.release();
    }
  }

  async getCredentialUsageReport(timeRange: string = '30d'): Promise<{
    totalCredentials: number;
    activeCredentials: number;
    expiredCredentials: number;
    rotationsDue: number;
    usageByType: Record<string, number>;
    recentAccess: Array<{
      secretPath: string;
      lastAccessed: Date;
      accessCount: number;
    }>;
  }> {
    const client = await pool.connect();
    
    try {
      // Get total and active credentials
      const credentialStats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN expires_at IS NULL OR expires_at > NOW() THEN 1 END) as active,
          COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired,
          COUNT(CASE WHEN rotation_enabled = true AND next_rotation_at <= NOW() THEN 1 END) as rotations_due
        FROM secret_metadata
      `);

      // Get usage by credential type
      const typeUsage = await client.query(`
        SELECT credential_type, COUNT(*) as count
        FROM agent_credential_mappings
        WHERE is_active = true
        GROUP BY credential_type
        ORDER BY count DESC
      `);

      // Get recent access data
      const timeRangeStart = this.getTimeRangeStart(timeRange);
      const recentAccess = await client.query(`
        SELECT 
          secret_path,
          MAX(timestamp) as last_accessed,
          COUNT(*) as access_count
        FROM secret_access_logs
        WHERE timestamp >= $1 AND success = true
        GROUP BY secret_path
        ORDER BY access_count DESC
        LIMIT 10
      `, [timeRangeStart]);

      const stats = credentialStats.rows[0];
      const usageByType: Record<string, number> = {};
      
      typeUsage.rows.forEach(row => {
        usageByType[row.credential_type] = parseInt(row.count);
      });

      return {
        totalCredentials: parseInt(stats.total),
        activeCredentials: parseInt(stats.active),
        expiredCredentials: parseInt(stats.expired),
        rotationsDue: parseInt(stats.rotations_due),
        usageByType,
        recentAccess: recentAccess.rows.map(row => ({
          secretPath: row.secret_path,
          lastAccessed: row.last_accessed,
          accessCount: parseInt(row.access_count)
        }))
      };
    } finally {
      client.release();
    }
  }

  private getTimeRangeStart(timeRange: string): Date {
    const now = new Date();
    const timeRangeMap: Record<string, number> = {
      '1h': 1 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };

    const milliseconds = timeRangeMap[timeRange] || timeRangeMap['30d'];
    return new Date(now.getTime() - milliseconds);
  }
}