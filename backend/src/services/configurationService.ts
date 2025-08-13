import { db } from './database';
import { AgentConfig, Integration } from '../types';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../middleware/requestLogger';
import Joi from 'joi';

// Validation schemas
const integrationSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  type: Joi.string().required(),
  config: Joi.object().required(),
  enabled: Joi.boolean().default(true)
});

const agentConfigSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  type: Joi.string().valid('terraform', 'kubernetes', 'incident-response', 'cost-optimization').required(),
  enabled: Joi.boolean().default(true),
  automationLevel: Joi.string().valid('manual', 'semi-auto', 'full-auto').default('manual'),
  thresholds: Joi.object().default({}),
  approvalRequired: Joi.boolean().default(false),
  integrations: Joi.array().items(integrationSchema).default([])
});

const updateAgentConfigSchema = agentConfigSchema.fork(['name', 'type'], (schema) => schema.optional());

export class ConfigurationService {
  
  // Get all agent configurations with optional filtering
  async getAllConfigurations(filters: {
    type?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ configurations: AgentConfig[]; totalCount: number }> {
    try {
      let query = 'SELECT * FROM agent_configs';
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Apply filters
      if (filters.type) {
        conditions.push(`type = $${paramIndex++}`);
        params.push(filters.type);
      }

      if (filters.enabled !== undefined) {
        conditions.push(`enabled = $${paramIndex++}`);
        params.push(filters.enabled);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      // Get total count for pagination
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
      const countResult = await db.query(countQuery, params);
      const totalCount = parseInt(countResult.rows[0].count);

      // Apply pagination
      query += ' ORDER BY created_at DESC';
      if (filters.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
      }
      if (filters.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
      }

      const result = await db.query(query, params);
      const configurations = result.rows.map(this.mapRowToAgentConfig);

      logger.info('Retrieved agent configurations', {
        count: configurations.length,
        totalCount,
        filters
      });

      return { configurations, totalCount };
    } catch (error) {
      logger.error('Failed to retrieve agent configurations', { error: (error as Error).message });
      
      // Return mock data for development when database is not available
      if (process.env.NODE_ENV === 'development') {
        logger.info('Returning mock configuration data for development');
        const mockConfigurations: AgentConfig[] = [
          {
            id: '1',
            name: 'Terraform Infrastructure Agent',
            type: 'terraform',
            enabled: true,
            automationLevel: 'semi-auto',
            thresholds: { cpu: 80, memory: 85 },
            approvalRequired: true,
            integrations: [
              { 
                id: 'aws-integration-1',
                name: 'AWS', 
                type: 'cloud-provider', 
                config: { region: 'us-east-1' },
                enabled: true
              }
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: '2',
            name: 'Kubernetes Scaling Agent',
            type: 'kubernetes',
            enabled: true,
            automationLevel: 'full-auto',
            thresholds: { cpu: 70, memory: 80 },
            approvalRequired: false,
            integrations: [
              { 
                id: 'k8s-integration-1',
                name: 'Kubernetes', 
                type: 'orchestrator', 
                config: { namespace: 'default' },
                enabled: true
              }
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: '3',
            name: 'Cost Optimization Agent',
            type: 'cost-optimization',
            enabled: true,
            automationLevel: 'manual',
            thresholds: { costIncrease: 20 },
            approvalRequired: true,
            integrations: [
              { 
                id: 'cost-integration-1',
                name: 'AWS Cost Explorer', 
                type: 'cost-monitoring', 
                config: {},
                enabled: true
              }
            ],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ];
        return { configurations: mockConfigurations, totalCount: mockConfigurations.length };
      }
      
      throw new AppError('Failed to retrieve configurations', 500);
    }
  }

  // Get specific agent configuration by ID
  async getConfigurationById(id: string): Promise<AgentConfig | null> {
    try {
      const result = await db.query('SELECT * FROM agent_configs WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const configuration = this.mapRowToAgentConfig(result.rows[0]);
      
      logger.info('Retrieved agent configuration', { configId: id });
      return configuration;
    } catch (error) {
      logger.error('Failed to retrieve agent configuration', { 
        configId: id, 
        error: (error as Error).message 
      });
      throw new AppError('Failed to retrieve configuration', 500);
    }
  }

  // Create new agent configuration
  async createConfiguration(configData: Partial<AgentConfig>, userId: string): Promise<AgentConfig> {
    try {
      // Validate input data
      const { error, value } = agentConfigSchema.validate(configData);
      if (error) {
        throw new AppError(`Validation error: ${error.details[0].message}`, 400);
      }

      const {
        name,
        type,
        enabled,
        automationLevel,
        thresholds,
        approvalRequired,
        integrations
      } = value;

      // Check for duplicate names
      const existingConfig = await db.query(
        'SELECT id FROM agent_configs WHERE name = $1',
        [name]
      );

      if (existingConfig.rows.length > 0) {
        throw new AppError('Configuration with this name already exists', 409);
      }

      const result = await db.query(`
        INSERT INTO agent_configs (
          name, type, enabled, automation_level, thresholds, 
          approval_required, integrations, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *
      `, [
        name,
        type,
        enabled,
        automationLevel,
        JSON.stringify(thresholds),
        approvalRequired,
        JSON.stringify(integrations)
      ]);

      const newConfiguration = this.mapRowToAgentConfig(result.rows[0]);

      // Create configuration version entry
      await this.createConfigurationVersion(newConfiguration.id, newConfiguration, userId, 'Created');

      logger.info('Created agent configuration', {
        configId: newConfiguration.id,
        name: newConfiguration.name,
        type: newConfiguration.type,
        userId
      });

      return newConfiguration;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to create agent configuration', { 
        error: (error as Error).message,
        userId
      });
      throw new AppError('Failed to create configuration', 500);
    }
  }

  // Update agent configuration
  async updateConfiguration(id: string, updates: Partial<AgentConfig>, userId: string): Promise<AgentConfig> {
    try {
      // Validate input data
      const { error, value } = updateAgentConfigSchema.validate(updates);
      if (error) {
        throw new AppError(`Validation error: ${error.details[0].message}`, 400);
      }

      // Get current configuration for versioning
      const currentConfig = await this.getConfigurationById(id);
      if (!currentConfig) {
        throw new AppError('Configuration not found', 404);
      }

      // Check for name conflicts if name is being updated
      if (value.name && value.name !== currentConfig.name) {
        const existingConfig = await db.query(
          'SELECT id FROM agent_configs WHERE name = $1 AND id != $2',
          [value.name, id]
        );

        if (existingConfig.rows.length > 0) {
          throw new AppError('Configuration with this name already exists', 409);
        }
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      Object.entries(value).forEach(([key, val]) => {
        if (val !== undefined) {
          const dbField = this.camelToSnakeCase(key);
          if (['thresholds', 'integrations'].includes(key)) {
            updateFields.push(`${dbField} = $${paramIndex++}`);
            params.push(JSON.stringify(val));
          } else {
            updateFields.push(`${dbField} = $${paramIndex++}`);
            params.push(val);
          }
        }
      });

      updateFields.push(`updated_at = NOW()`);
      params.push(id);

      const query = `
        UPDATE agent_configs 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await db.query(query, params);
      const updatedConfiguration = this.mapRowToAgentConfig(result.rows[0]);

      // Create configuration version entry
      await this.createConfigurationVersion(id, updatedConfiguration, userId, 'Updated', value);

      logger.info('Updated agent configuration', {
        configId: id,
        changes: Object.keys(value),
        userId
      });

      return updatedConfiguration;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to update agent configuration', { 
        configId: id,
        error: (error as Error).message,
        userId
      });
      throw new AppError('Failed to update configuration', 500);
    }
  }

  // Delete agent configuration
  async deleteConfiguration(id: string, userId: string): Promise<void> {
    try {
      // Check if configuration exists
      const existingConfig = await this.getConfigurationById(id);
      if (!existingConfig) {
        throw new AppError('Configuration not found', 404);
      }

      // Check if configuration is currently in use by running agents
      // TODO: Implement check with agent orchestrator service

      await db.query('DELETE FROM agent_configs WHERE id = $1', [id]);

      // Create configuration version entry for deletion
      await this.createConfigurationVersion(id, existingConfig, userId, 'Deleted');

      logger.info('Deleted agent configuration', {
        configId: id,
        name: existingConfig.name,
        userId
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to delete agent configuration', { 
        configId: id,
        error: (error as Error).message,
        userId
      });
      throw new AppError('Failed to delete configuration', 500);
    }
  }

  // Validate configuration
  async validateConfiguration(configData: Partial<AgentConfig>): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  }> {
    const result = {
      valid: true,
      errors: [] as string[],
      warnings: [] as string[],
      suggestions: [] as string[]
    };

    try {
      // Schema validation
      const { error } = agentConfigSchema.validate(configData);
      if (error) {
        result.valid = false;
        result.errors.push(...error.details.map(detail => detail.message));
      }

      // Business logic validation
      if (configData.automationLevel === 'full-auto' && configData.approvalRequired) {
        result.warnings.push('Full automation with approval required may cause delays');
      }

      if (configData.automationLevel === 'full-auto' && !configData.thresholds) {
        result.errors.push('Full automation requires threshold configuration');
        result.valid = false;
      }

      // Type-specific validation
      if (configData.type === 'terraform') {
        if (!configData.thresholds?.driftThreshold) {
          result.suggestions.push('Consider setting a drift threshold for Terraform agents');
        }
      }

      if (configData.type === 'kubernetes') {
        if (!configData.thresholds?.cpuThreshold && !configData.thresholds?.memoryThreshold) {
          result.suggestions.push('Consider setting CPU and memory thresholds for Kubernetes agents');
        }
      }

      // Integration validation
      if (configData.integrations && configData.integrations.length === 0) {
        result.suggestions.push('Consider adding integrations for better functionality');
      }

      return result;
    } catch (error) {
      logger.error('Configuration validation failed', { error: (error as Error).message });
      return {
        valid: false,
        errors: ['Validation process failed'],
        warnings: [],
        suggestions: []
      };
    }
  }

  // Helper method to create configuration version entries
  private async createConfigurationVersion(
    configId: string,
    configuration: AgentConfig,
    userId: string,
    action: string,
    changes?: any
  ): Promise<void> {
    try {
      // Get the next version number
      const versionResult = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM agent_config_versions WHERE config_id = $1',
        [configId]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Insert version record
      await db.query(`
        INSERT INTO agent_config_versions (
          config_id, version_number, configuration, changes, action, changed_by, changed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [
        configId,
        nextVersion,
        JSON.stringify(configuration),
        changes ? JSON.stringify(changes) : null,
        action,
        userId
      ]);

      logger.info('Configuration version created', {
        configId,
        version: nextVersion,
        action,
        userId,
        changes: changes ? Object.keys(changes) : undefined
      });
    } catch (error) {
      logger.error('Failed to create configuration version', {
        configId,
        error: (error as Error).message
      });
      // Don't throw error as this is not critical for the main operation
    }
  }

  // Helper method to map database row to AgentConfig interface
  private mapRowToAgentConfig(row: any): AgentConfig {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      enabled: row.enabled,
      automationLevel: row.automation_level,
      thresholds: row.thresholds || {},
      approvalRequired: row.approval_required,
      integrations: row.integrations || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // Get configuration history/versions
  async getConfigurationHistory(configId: string, limit: number = 20, offset: number = 0): Promise<{
    history: any[];
    totalVersions: number;
  }> {
    try {
      // Get total count
      const countResult = await db.query(
        'SELECT COUNT(*) FROM agent_config_versions WHERE config_id = $1',
        [configId]
      );
      const totalVersions = parseInt(countResult.rows[0].count);

      // Get history with pagination
      const result = await db.query(`
        SELECT version_number, changes, action, changed_by, changed_at, reason
        FROM agent_config_versions 
        WHERE config_id = $1 
        ORDER BY version_number DESC 
        LIMIT $2 OFFSET $3
      `, [configId, limit, offset]);

      const history = result.rows.map((row: any) => ({
        version: row.version_number,
        changes: row.changes,
        action: row.action,
        changedBy: row.changed_by,
        changedAt: row.changed_at,
        reason: row.reason
      }));

      logger.info('Retrieved configuration history', {
        configId,
        versionsReturned: history.length,
        totalVersions
      });

      return { history, totalVersions };
    } catch (error) {
      logger.error('Failed to retrieve configuration history', {
        configId,
        error: (error as Error).message
      });
      throw new AppError('Failed to retrieve configuration history', 500);
    }
  }

  // Rollback configuration to a specific version
  async rollbackConfiguration(configId: string, targetVersion: number, userId: string, reason?: string): Promise<AgentConfig> {
    try {
      // Get the target version configuration
      const versionResult = await db.query(
        'SELECT configuration FROM agent_config_versions WHERE config_id = $1 AND version_number = $2',
        [configId, targetVersion]
      );

      if (versionResult.rows.length === 0) {
        throw new AppError('Target version not found', 404);
      }

      const targetConfiguration = versionResult.rows[0].configuration;

      // Update the current configuration with the target version data
      const updateResult = await db.query(`
        UPDATE agent_configs 
        SET 
          name = $2,
          type = $3,
          enabled = $4,
          automation_level = $5,
          thresholds = $6,
          approval_required = $7,
          integrations = $8,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [
        configId,
        targetConfiguration.name,
        targetConfiguration.type,
        targetConfiguration.enabled,
        targetConfiguration.automationLevel,
        JSON.stringify(targetConfiguration.thresholds),
        targetConfiguration.approvalRequired,
        JSON.stringify(targetConfiguration.integrations)
      ]);

      if (updateResult.rows.length === 0) {
        throw new AppError('Configuration not found', 404);
      }

      const rolledBackConfiguration = this.mapRowToAgentConfig(updateResult.rows[0]);

      // Create version entry for rollback
      await this.createConfigurationVersion(
        configId, 
        rolledBackConfiguration, 
        userId, 
        'Rollback',
        { rolledBackToVersion: targetVersion, reason }
      );

      logger.info('Configuration rolled back', {
        configId,
        targetVersion,
        userId,
        reason
      });

      return rolledBackConfiguration;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Failed to rollback configuration', {
        configId,
        targetVersion,
        error: (error as Error).message,
        userId
      });
      throw new AppError('Failed to rollback configuration', 500);
    }
  }

  // Template Management Methods

  // Get all configuration templates
  async getAllTemplates(filters: {
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ templates: any[]; totalCount: number }> {
    try {
      // For now, return built-in templates as we don't have a templates table yet
      const builtInTemplates = [
        {
          id: 'terraform-basic',
          name: 'Basic Terraform Agent',
          description: 'Standard Terraform agent with drift detection and semi-automatic mode',
          agentType: 'terraform',
          config: {
            automationLevel: 'semi-auto',
            approvalRequired: true,
            thresholds: {
              driftCheckInterval: 30,
              maxDriftResolution: 5
            },
            integrations: []
          },
          isBuiltIn: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'kubernetes-autoscaler',
          name: 'Kubernetes Autoscaler',
          description: 'Kubernetes agent optimized for automatic scaling based on resource usage',
          agentType: 'kubernetes',
          config: {
            automationLevel: 'full-auto',
            approvalRequired: false,
            thresholds: {
              cpuThreshold: 70,
              memoryThreshold: 80,
              scaleUpThreshold: 85,
              scaleDownThreshold: 30
            },
            integrations: []
          },
          isBuiltIn: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'incident-response-basic',
          name: 'Basic Incident Response',
          description: 'Incident response agent with standard escalation policies',
          agentType: 'incident-response',
          config: {
            automationLevel: 'semi-auto',
            approvalRequired: true,
            thresholds: {
              responseTimeThreshold: 15,
              escalationThreshold: 60,
              autoResolveThreshold: 5
            },
            integrations: []
          },
          isBuiltIn: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'cost-optimization-conservative',
          name: 'Conservative Cost Optimization',
          description: 'Cost optimization agent with conservative thresholds and manual approval',
          agentType: 'cost-optimization',
          config: {
            automationLevel: 'manual',
            approvalRequired: true,
            thresholds: {
              costThreshold: 100,
              utilizationThreshold: 20,
              savingsThreshold: 50
            },
            integrations: []
          },
          isBuiltIn: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      let filteredTemplates = builtInTemplates;
      
      if (filters.type) {
        filteredTemplates = builtInTemplates.filter(t => t.agentType === filters.type);
      }

      const totalCount = filteredTemplates.length;
      
      if (filters.offset) {
        filteredTemplates = filteredTemplates.slice(filters.offset);
      }
      
      if (filters.limit) {
        filteredTemplates = filteredTemplates.slice(0, filters.limit);
      }

      logger.info('Retrieved configuration templates', {
        count: filteredTemplates.length,
        totalCount,
        filters
      });

      return { templates: filteredTemplates, totalCount };
    } catch (error) {
      logger.error('Failed to retrieve configuration templates', { error: (error as Error).message });
      throw new AppError('Failed to retrieve templates', 500);
    }
  }

  // Create configuration template (placeholder - would need templates table)
  async createTemplate(templateData: any, userId: string): Promise<any> {
    logger.info('Template creation requested', { templateData, userId });
    throw new AppError('Template creation not yet implemented - using built-in templates only', 501);
  }

  // Update configuration template (placeholder - would need templates table)
  async updateTemplate(templateId: string, updates: any, userId: string): Promise<any> {
    logger.info('Template update requested', { templateId, updates, userId });
    throw new AppError('Template updates not yet implemented - using built-in templates only', 501);
  }

  // Delete configuration template (placeholder - would need templates table)
  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    logger.info('Template deletion requested', { templateId, userId });
    throw new AppError('Template deletion not yet implemented - using built-in templates only', 501);
  }

  // Approval Workflow Methods

  // Get pending approvals
  async getPendingApprovals(filters: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ approvals: any[]; totalCount: number }> {
    try {
      // Mock pending approvals for development
      const mockApprovals = [
        {
          id: 'approval-1',
          configId: '1',
          agentName: 'Terraform Infrastructure Agent',
          changes: {
            automationLevel: 'full-auto',
            thresholds: { driftCheckInterval: 15 }
          },
          requestedBy: 'john.doe@company.com',
          requestedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          riskLevel: 'high' as const,
          reason: 'Enabling full automation for faster drift resolution',
          currentConfig: {
            id: '1',
            name: 'Terraform Infrastructure Agent',
            type: 'terraform' as const,
            enabled: true,
            automationLevel: 'semi-auto' as const,
            thresholds: { driftCheckInterval: 30 },
            approvalRequired: true,
            integrations: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        },
        {
          id: 'approval-2',
          configId: '3',
          agentName: 'Cost Optimization Agent',
          changes: {
            enabled: true,
            thresholds: { costThreshold: 50 }
          },
          requestedBy: 'jane.smith@company.com',
          requestedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          riskLevel: 'medium' as const,
          reason: 'Lowering cost threshold for more aggressive optimization',
          currentConfig: {
            id: '3',
            name: 'Cost Optimization Agent',
            type: 'cost-optimization' as const,
            enabled: false,
            automationLevel: 'manual' as const,
            thresholds: { costThreshold: 100 },
            approvalRequired: true,
            integrations: [],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      ];

      let filteredApprovals = mockApprovals;
      
      if (filters.status && filters.status !== 'pending') {
        filteredApprovals = [];
      }

      const totalCount = filteredApprovals.length;
      
      if (filters.offset) {
        filteredApprovals = filteredApprovals.slice(filters.offset);
      }
      
      if (filters.limit) {
        filteredApprovals = filteredApprovals.slice(0, filters.limit);
      }

      logger.info('Retrieved pending approvals', {
        count: filteredApprovals.length,
        totalCount,
        filters
      });

      return { approvals: filteredApprovals, totalCount };
    } catch (error) {
      logger.error('Failed to retrieve pending approvals', { error: (error as Error).message });
      throw new AppError('Failed to retrieve pending approvals', 500);
    }
  }

  // Approve configuration change
  async approveConfigurationChange(approvalId: string, userId: string, reason?: string): Promise<any> {
    try {
      logger.info('Configuration change approved', {
        approvalId,
        userId,
        reason
      });

      // In a real implementation, this would:
      // 1. Get the pending approval from database
      // 2. Apply the changes to the configuration
      // 3. Update the approval status
      // 4. Create audit log entry

      return {
        id: approvalId,
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
        reason
      };
    } catch (error) {
      logger.error('Failed to approve configuration change', {
        approvalId,
        error: (error as Error).message,
        userId
      });
      throw new AppError('Failed to approve configuration change', 500);
    }
  }

  // Reject configuration change
  async rejectConfigurationChange(approvalId: string, userId: string, reason: string): Promise<any> {
    try {
      logger.info('Configuration change rejected', {
        approvalId,
        userId,
        reason
      });

      // In a real implementation, this would:
      // 1. Get the pending approval from database
      // 2. Update the approval status to rejected
      // 3. Create audit log entry
      // 4. Notify the requester

      return {
        id: approvalId,
        status: 'rejected',
        rejectedBy: userId,
        rejectedAt: new Date().toISOString(),
        reason
      };
    } catch (error) {
      logger.error('Failed to reject configuration change', {
        approvalId,
        error: (error as Error).message,
        userId
      });
      throw new AppError('Failed to reject configuration change', 500);
    }
  }

  // Helper method to convert camelCase to snake_case
  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

// Export singleton instance
export const configurationService = new ConfigurationService();
export default ConfigurationService;