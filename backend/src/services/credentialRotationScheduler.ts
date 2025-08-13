import { VaultService } from './vaultService';
import { CredentialInjectionService } from './credentialInjectionService';
import { auditService } from './auditService';
import { pool } from './database';
import { logger } from '../middleware/requestLogger';

export interface RotationJob {
  id: string;
  secretPath: string;
  policyId?: string;
  scheduledAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook';
  target: string;
  enabled: boolean;
}

export class CredentialRotationScheduler {
  private vaultService: VaultService;
  private credentialService: CredentialInjectionService;
  private auditService = auditService;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private readonly checkInterval: number = 60000; // 1 minute

  constructor(
    vaultService?: VaultService,
    credentialService?: CredentialInjectionService
  ) {
    this.vaultService = vaultService || new VaultService();
    this.credentialService = credentialService || new CredentialInjectionService(this.vaultService);
  }

  async initialize(): Promise<void> {
    try {
      await this.vaultService.initialize();
      await this.credentialService.initialize();
      
      // Create rotation jobs table if it doesn't exist
      await this.createRotationJobsTable();
      
      logger.info('Credential rotation scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize credential rotation scheduler', {
        error: (error as Error).message
      });
      throw error;
    }
  }

  private async createRotationJobsTable(): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS credential_rotation_jobs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          secret_path VARCHAR(500) NOT NULL,
          policy_id UUID,
          scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          max_attempts INTEGER DEFAULT 3,
          last_error TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          FOREIGN KEY (policy_id) REFERENCES credential_rotation_policies(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_rotation_jobs_status ON credential_rotation_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_rotation_jobs_scheduled_at ON credential_rotation_jobs(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_rotation_jobs_secret_path ON credential_rotation_jobs(secret_path);
      `);
    } finally {
      client.release();
    }
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('Credential rotation scheduler is already running');
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.processRotationJobs().catch(error => {
        logger.error('Error processing rotation jobs', {
          error: (error as Error).message
        });
      });
    }, this.checkInterval);

    logger.info('Credential rotation scheduler started', {
      checkInterval: this.checkInterval
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('Credential rotation scheduler stopped');
  }

  async scheduleRotation(secretPath: string, scheduledAt: Date, policyId?: string): Promise<RotationJob> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        INSERT INTO credential_rotation_jobs (secret_path, policy_id, scheduled_at)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [secretPath, policyId, scheduledAt]);

      const job = this.mapRowToRotationJob(result.rows[0]);

      logger.info('Rotation job scheduled', {
        jobId: job.id,
        secretPath,
        scheduledAt,
        policyId
      });

      return job;
    } finally {
      client.release();
    }
  }

  async scheduleRotationsFromPolicies(): Promise<void> {
    const client = await pool.connect();
    
    try {
      // Get active rotation policies
      const policiesResult = await client.query(`
        SELECT * FROM credential_rotation_policies 
        WHERE is_active = true
      `);

      for (const policy of policiesResult.rows) {
        const secretPaths = JSON.parse(policy.secret_paths);
        
        for (const secretPath of secretPaths) {
          // Check if secret exists and needs rotation
          const secretResult = await client.query(`
            SELECT * FROM secret_metadata 
            WHERE path = $1 AND rotation_enabled = true 
            AND (next_rotation_at IS NULL OR next_rotation_at <= NOW())
          `, [secretPath]);

          if (secretResult.rows.length > 0) {
            // Check if rotation job already exists
            const existingJobResult = await client.query(`
              SELECT id FROM credential_rotation_jobs 
              WHERE secret_path = $1 AND status IN ('pending', 'running')
            `, [secretPath]);

            if (existingJobResult.rows.length === 0) {
              // Schedule rotation
              await this.scheduleRotation(secretPath, new Date(), policy.id);
            }
          }
        }
      }
    } finally {
      client.release();
    }
  }

  private async processRotationJobs(): Promise<void> {
    const client = await pool.connect();
    
    try {
      // Get pending jobs that are due
      const result = await client.query(`
        SELECT * FROM credential_rotation_jobs 
        WHERE status = 'pending' 
        AND scheduled_at <= NOW()
        AND attempts < max_attempts
        ORDER BY scheduled_at ASC
        LIMIT 10
      `);

      for (const jobRow of result.rows) {
        const job = this.mapRowToRotationJob(jobRow);
        await this.processRotationJob(job);
      }

      // Schedule new rotations from policies
      await this.scheduleRotationsFromPolicies();
    } finally {
      client.release();
    }
  }

  private async processRotationJob(job: RotationJob): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update job status to running
      await client.query(`
        UPDATE credential_rotation_jobs 
        SET status = 'running', attempts = attempts + 1, updated_at = NOW()
        WHERE id = $1
      `, [job.id]);

      logger.info('Processing rotation job', {
        jobId: job.id,
        secretPath: job.secretPath,
        attempt: job.attempts + 1
      });

      // Perform the rotation
      await this.vaultService.rotateSecret(job.secretPath, 'system');

      // Update job status to completed
      await client.query(`
        UPDATE credential_rotation_jobs 
        SET status = 'completed', updated_at = NOW()
        WHERE id = $1
      `, [job.id]);

      // Log rotation in history
      await client.query(`
        INSERT INTO credential_rotation_history (
          secret_path, rotation_policy_id, rotated_by, rotation_type, success
        ) VALUES ($1, $2, $3, 'automatic', true)
      `, [job.secretPath, job.policyId, null]);

      await client.query('COMMIT');

      // Send notifications
      await this.sendRotationNotification(job, 'success');

      logger.info('Rotation job completed successfully', {
        jobId: job.id,
        secretPath: job.secretPath
      });

    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = (error as Error).message;
      
      // Update job with error
      await client.query(`
        UPDATE credential_rotation_jobs 
        SET status = CASE 
          WHEN attempts >= max_attempts THEN 'failed'
          ELSE 'pending'
        END,
        last_error = $1,
        updated_at = NOW()
        WHERE id = $2
      `, [errorMessage, job.id]);

      // Log failed rotation in history
      await client.query(`
        INSERT INTO credential_rotation_history (
          secret_path, rotation_policy_id, rotated_by, rotation_type, success, error_message
        ) VALUES ($1, $2, $3, 'automatic', false, $4)
      `, [job.secretPath, job.policyId, null, errorMessage]);

      // Send failure notification
      await this.sendRotationNotification(job, 'failure', errorMessage);

      logger.error('Rotation job failed', {
        jobId: job.id,
        secretPath: job.secretPath,
        attempt: job.attempts + 1,
        error: errorMessage
      });
    } finally {
      client.release();
    }
  }

  private async sendRotationNotification(
    job: RotationJob, 
    status: 'success' | 'failure', 
    error?: string
  ): Promise<void> {
    try {
      if (!job.policyId) {
        return;
      }

      const client = await pool.connect();
      
      try {
        // Get notification channels from policy
        const policyResult = await client.query(`
          SELECT notification_channels FROM credential_rotation_policies 
          WHERE id = $1
        `, [job.policyId]);

        if (policyResult.rows.length === 0) {
          return;
        }

        const notificationChannels = JSON.parse(policyResult.rows[0].notification_channels || '[]');
        
        for (const channel of notificationChannels) {
          await this.sendNotification(channel, {
            secretPath: job.secretPath,
            status,
            error,
            timestamp: new Date()
          });
        }
      } finally {
        client.release();
      }
    } catch (notificationError) {
      logger.error('Failed to send rotation notification', {
        jobId: job.id,
        error: (notificationError as Error).message
      });
    }
  }

  private async sendNotification(channel: string, data: any): Promise<void> {
    // Parse channel format: "type:target"
    const [type, target] = channel.split(':', 2);
    
    switch (type) {
      case 'email':
        await this.sendEmailNotification(target, data);
        break;
      case 'slack':
        await this.sendSlackNotification(target, data);
        break;
      case 'webhook':
        await this.sendWebhookNotification(target, data);
        break;
      default:
        logger.warn('Unknown notification channel type', { type, channel });
    }
  }

  private async sendEmailNotification(email: string, data: any): Promise<void> {
    // Email notification implementation would go here
    // For now, just log the notification
    logger.info('Email notification sent', {
      email,
      subject: `Credential Rotation ${data.status === 'success' ? 'Completed' : 'Failed'}`,
      secretPath: data.secretPath,
      status: data.status
    });
  }

  private async sendSlackNotification(channel: string, data: any): Promise<void> {
    // Slack notification implementation would go here
    // For now, just log the notification
    logger.info('Slack notification sent', {
      channel,
      message: `Credential rotation for ${data.secretPath} ${data.status === 'success' ? 'completed successfully' : 'failed'}`,
      status: data.status
    });
  }

  private async sendWebhookNotification(url: string, data: any): Promise<void> {
    try {
      const axios = require('axios');
      await axios.post(url, {
        event: 'credential_rotation',
        secretPath: data.secretPath,
        status: data.status,
        error: data.error,
        timestamp: data.timestamp
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AIOps-Platform-Credential-Rotator/1.0'
        }
      });

      logger.info('Webhook notification sent', {
        url,
        secretPath: data.secretPath,
        status: data.status
      });
    } catch (error) {
      logger.error('Failed to send webhook notification', {
        url,
        error: (error as Error).message
      });
    }
  }

  async getRotationJobs(status?: string, limit: number = 50): Promise<RotationJob[]> {
    const client = await pool.connect();
    
    try {
      let query = 'SELECT * FROM credential_rotation_jobs';
      const params: any[] = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await client.query(query, params);
      return result.rows.map(row => this.mapRowToRotationJob(row));
    } finally {
      client.release();
    }
  }

  async getRotationHistory(secretPath?: string, limit: number = 50): Promise<any[]> {
    const client = await pool.connect();
    
    try {
      let query = `
        SELECT crh.*, crp.name as policy_name, u.email as rotated_by_email
        FROM credential_rotation_history crh
        LEFT JOIN credential_rotation_policies crp ON crh.rotation_policy_id = crp.id
        LEFT JOIN users u ON crh.rotated_by = u.id
      `;
      const params: any[] = [];

      if (secretPath) {
        query += ' WHERE crh.secret_path = $1';
        params.push(secretPath);
      }

      query += ' ORDER BY crh.rotated_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async cancelRotationJob(jobId: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        UPDATE credential_rotation_jobs 
        SET status = 'failed', last_error = 'Cancelled by user', updated_at = NOW()
        WHERE id = $1 AND status IN ('pending', 'running')
        RETURNING *
      `, [jobId]);

      if (result.rows.length === 0) {
        throw new Error('Rotation job not found or cannot be cancelled');
      }

      logger.info('Rotation job cancelled', { jobId });
    } finally {
      client.release();
    }
  }

  private mapRowToRotationJob(row: any): RotationJob {
    return {
      id: row.id,
      secretPath: row.secret_path,
      policyId: row.policy_id,
      scheduledAt: row.scheduled_at,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getRotationMetrics(timeRange: string = '30d'): Promise<{
    totalRotations: number;
    successfulRotations: number;
    failedRotations: number;
    averageRotationTime: number;
    rotationsByStatus: Record<string, number>;
    rotationsBySecretType: Record<string, number>;
  }> {
    const client = await pool.connect();
    
    try {
      const timeRangeStart = this.getTimeRangeStart(timeRange);

      // Get rotation statistics
      const statsResult = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN success = true THEN 1 END) as successful,
          COUNT(CASE WHEN success = false THEN 1 END) as failed
        FROM credential_rotation_history
        WHERE rotated_at >= $1
      `, [timeRangeStart]);

      // Get rotations by status
      const statusResult = await client.query(`
        SELECT status, COUNT(*) as count
        FROM credential_rotation_jobs
        WHERE created_at >= $1
        GROUP BY status
      `, [timeRangeStart]);

      // Get rotations by secret type (based on path patterns)
      const typeResult = await client.query(`
        SELECT 
          CASE 
            WHEN secret_path LIKE 'aws/%' THEN 'aws'
            WHEN secret_path LIKE 'azure/%' THEN 'azure'
            WHEN secret_path LIKE 'gcp/%' THEN 'gcp'
            WHEN secret_path LIKE 'kubernetes/%' THEN 'kubernetes'
            WHEN secret_path LIKE 'database/%' THEN 'database'
            ELSE 'other'
          END as secret_type,
          COUNT(*) as count
        FROM credential_rotation_history
        WHERE rotated_at >= $1
        GROUP BY secret_type
      `, [timeRangeStart]);

      const stats = statsResult.rows[0];
      const rotationsByStatus: Record<string, number> = {};
      const rotationsBySecretType: Record<string, number> = {};

      statusResult.rows.forEach(row => {
        rotationsByStatus[row.status] = parseInt(row.count);
      });

      typeResult.rows.forEach(row => {
        rotationsBySecretType[row.secret_type] = parseInt(row.count);
      });

      return {
        totalRotations: parseInt(stats.total),
        successfulRotations: parseInt(stats.successful),
        failedRotations: parseInt(stats.failed),
        averageRotationTime: 0, // Would need to track rotation duration
        rotationsByStatus,
        rotationsBySecretType
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