import { CredentialRotationScheduler } from '../credentialRotationScheduler';
import { VaultService } from '../vaultService';
import { CredentialInjectionService } from '../credentialInjectionService';
import { pool } from '../database';

// Mock the database pool
jest.mock('../database', () => ({
  pool: {
    connect: jest.fn()
  }
}));

// Mock the vault service
jest.mock('../vaultService');

// Mock the credential injection service
jest.mock('../credentialInjectionService');

// Mock the audit service
jest.mock('../auditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    logEvent: jest.fn()
  }))
}));

describe('CredentialRotationScheduler', () => {
  let scheduler: CredentialRotationScheduler;
  let mockVaultService: jest.Mocked<VaultService>;
  let mockCredentialService: jest.Mocked<CredentialInjectionService>;
  let mockClient: any;

  beforeEach(() => {
    mockVaultService = new VaultService() as jest.Mocked<VaultService>;
    mockVaultService.initialize = jest.fn();
    mockVaultService.rotateSecret = jest.fn();

    mockCredentialService = new CredentialInjectionService() as jest.Mocked<CredentialInjectionService>;
    mockCredentialService.initialize = jest.fn();

    scheduler = new CredentialRotationScheduler(mockVaultService, mockCredentialService);
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
    scheduler.stop();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      mockVaultService.initialize.mockResolvedValueOnce(undefined);
      mockCredentialService.initialize.mockResolvedValueOnce(undefined);
      mockClient.query.mockResolvedValueOnce({}); // Table creation

      await scheduler.initialize();

      expect(mockVaultService.initialize).toHaveBeenCalled();
      expect(mockCredentialService.initialize).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS credential_rotation_jobs')
      );
    });

    it('should throw error if initialization fails', async () => {
      mockVaultService.initialize.mockRejectedValueOnce(new Error('Vault connection failed'));

      await expect(scheduler.initialize()).rejects.toThrow('Vault connection failed');
    });
  });

  describe('scheduleRotation', () => {
    it('should schedule a rotation job', async () => {
      const scheduledAt = new Date();
      const mockJob = {
        id: 'job-123',
        secret_path: 'aws/credentials',
        policy_id: null,
        scheduled_at: scheduledAt,
        status: 'pending',
        attempts: 0,
        max_attempts: 3,
        last_error: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockJob] });

      const result = await scheduler.scheduleRotation('aws/credentials', scheduledAt);

      expect(result).toMatchObject({
        id: 'job-123',
        secretPath: 'aws/credentials',
        scheduledAt,
        status: 'pending'
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO credential_rotation_jobs (secret_path, policy_id, scheduled_at)\n        VALUES ($1, $2, $3)\n        RETURNING *',
        ['aws/credentials', undefined, scheduledAt]
      );
    });
  });

  describe('scheduleRotationsFromPolicies', () => {
    it('should schedule rotations for active policies', async () => {
      const mockPolicy = {
        id: 'policy-123',
        secret_paths: '["aws/credentials", "azure/credentials"]',
        is_active: true
      };

      const mockSecret = {
        path: 'aws/credentials',
        rotation_enabled: true,
        next_rotation_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockPolicy] }) // Get policies
        .mockResolvedValueOnce({ rows: [mockSecret] }) // Check secret needs rotation
        .mockResolvedValueOnce({ rows: [] }) // No existing job
        .mockResolvedValueOnce({ rows: [{ id: 'job-123' }] }) // Schedule rotation
        .mockResolvedValueOnce({ rows: [] }) // Check azure secret (not found)
        .mockResolvedValueOnce({ rows: [] }); // No existing job for azure

      await scheduler.scheduleRotationsFromPolicies();

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM credential_rotation_policies \n        WHERE is_active = true'
      );
    });
  });

  describe('getRotationJobs', () => {
    it('should return rotation jobs', async () => {
      const mockJobs = [
        {
          id: 'job-123',
          secret_path: 'aws/credentials',
          policy_id: null,
          scheduled_at: new Date(),
          status: 'pending',
          attempts: 0,
          max_attempts: 3,
          last_error: null,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockJobs });

      const result = await scheduler.getRotationJobs('pending', 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'job-123',
        secretPath: 'aws/credentials',
        status: 'pending'
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM credential_rotation_jobs WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
        ['pending', 10]
      );
    });

    it('should return all jobs when no status filter', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await scheduler.getRotationJobs(undefined, 50);

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM credential_rotation_jobs ORDER BY created_at DESC LIMIT $1',
        [50]
      );
    });
  });

  describe('getRotationHistory', () => {
    it('should return rotation history', async () => {
      const mockHistory = [
        {
          secret_path: 'aws/credentials',
          rotation_policy_id: 'policy-123',
          rotated_by: 'user-123',
          rotation_type: 'automatic',
          success: true,
          rotated_at: new Date(),
          policy_name: 'AWS Rotation Policy',
          rotated_by_email: 'admin@example.com'
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockHistory });

      const result = await scheduler.getRotationHistory('aws/credentials', 10);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        secret_path: 'aws/credentials',
        success: true,
        policy_name: 'AWS Rotation Policy'
      });
    });
  });

  describe('cancelRotationJob', () => {
    it('should cancel a rotation job', async () => {
      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ id: 'job-123', status: 'failed' }] 
      });

      await scheduler.cancelRotationJob('job-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE credential_rotation_jobs'),
        ['Cancelled by user', 'job-123']
      );
    });

    it('should throw error if job cannot be cancelled', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(scheduler.cancelRotationJob('non-existent-job'))
        .rejects.toThrow('Rotation job not found or cannot be cancelled');
    });
  });

  describe('getRotationMetrics', () => {
    it('should return rotation metrics', async () => {
      mockClient.query
        .mockResolvedValueOnce({ 
          rows: [{ total: '10', successful: '8', failed: '2' }] 
        }) // Stats
        .mockResolvedValueOnce({ 
          rows: [
            { status: 'completed', count: '8' },
            { status: 'failed', count: '2' }
          ] 
        }) // By status
        .mockResolvedValueOnce({ 
          rows: [
            { secret_type: 'aws', count: '5' },
            { secret_type: 'azure', count: '3' }
          ] 
        }); // By type

      const result = await scheduler.getRotationMetrics('30d');

      expect(result).toEqual({
        totalRotations: 10,
        successfulRotations: 8,
        failedRotations: 2,
        averageRotationTime: 0,
        rotationsByStatus: {
          completed: 8,
          failed: 2
        },
        rotationsBySecretType: {
          aws: 5,
          azure: 3
        }
      });
    });
  });

  describe('start and stop', () => {
    it('should start and stop the scheduler', () => {
      expect(scheduler['isRunning']).toBe(false);

      scheduler.start();
      expect(scheduler['isRunning']).toBe(true);
      expect(scheduler['intervalId']).toBeDefined();

      scheduler.stop();
      expect(scheduler['isRunning']).toBe(false);
      expect(scheduler['intervalId']).toBeUndefined();
    });

    it('should not start if already running', () => {
      scheduler.start();
      const firstIntervalId = scheduler['intervalId'];

      scheduler.start(); // Try to start again
      expect(scheduler['intervalId']).toBe(firstIntervalId);
    });
  });
});