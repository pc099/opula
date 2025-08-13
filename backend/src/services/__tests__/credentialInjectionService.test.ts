import { CredentialInjectionService } from '../credentialInjectionService';
import { VaultService } from '../vaultService';
import { pool } from '../database';

// Mock the database pool
jest.mock('../database', () => ({
  pool: {
    connect: jest.fn()
  }
}));

// Mock the vault service
jest.mock('../vaultService');

// Mock the audit service
jest.mock('../auditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    logEvent: jest.fn()
  }))
}));

describe('CredentialInjectionService', () => {
  let credentialService: CredentialInjectionService;
  let mockVaultService: jest.Mocked<VaultService>;
  let mockClient: any;

  beforeEach(() => {
    mockVaultService = new VaultService() as jest.Mocked<VaultService>;
    mockVaultService.initialize = jest.fn();
    mockVaultService.getSecret = jest.fn();
    mockVaultService.storeSecret = jest.fn();

    credentialService = new CredentialInjectionService(mockVaultService);
    
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCredentialTemplates', () => {
    it('should return available credential templates', async () => {
      const templates = await credentialService.getCredentialTemplates();

      expect(templates).toHaveLength(8);
      expect(templates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'aws',
            name: 'AWS Credentials',
            requiredFields: ['access_key_id', 'secret_access_key']
          }),
          expect.objectContaining({
            type: 'kubernetes',
            name: 'Kubernetes Credentials',
            requiredFields: ['kubeconfig']
          })
        ])
      );
    });
  });

  describe('mapCredentialToAgent', () => {
    it('should map credential to agent successfully', async () => {
      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'agent-123' }] }) // Agent exists
        .mockResolvedValueOnce({ rows: [{ id: 'secret-123' }] }) // Secret exists
        .mockResolvedValueOnce({ // Create mapping
          rows: [{
            id: 'mapping-123',
            agent_id: 'agent-123',
            secret_path: 'aws/credentials',
            credential_type: 'aws',
            is_active: true,
            created_by: 'user-123',
            created_at: new Date(),
            updated_at: new Date()
          }]
        });

      const result = await credentialService.mapCredentialToAgent(
        'agent-123',
        'aws/credentials',
        'aws',
        'user-123'
      );

      expect(result).toMatchObject({
        id: 'mapping-123',
        agentId: 'agent-123',
        secretPath: 'aws/credentials',
        credentialType: 'aws',
        isActive: true
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if agent not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Agent not found

      await expect(credentialService.mapCredentialToAgent(
        'non-existent-agent',
        'aws/credentials',
        'aws',
        'user-123'
      )).rejects.toThrow('Agent not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('injectCredentialsForAgent', () => {
    it('should inject credentials for agent', async () => {
      // Mock database response
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { secret_path: 'aws/credentials', credential_type: 'aws' },
          { secret_path: 'k8s/token', credential_type: 'kubernetes' }
        ]
      });

      // Mock vault responses
      mockVaultService.getSecret
        .mockResolvedValueOnce({ access_key_id: 'AKIA...', secret_access_key: 'secret...' })
        .mockResolvedValueOnce({ kubeconfig: 'apiVersion: v1...' });

      const result = await credentialService.injectCredentialsForAgent('agent-123');

      expect(result).toEqual({
        aws: { access_key_id: 'AKIA...', secret_access_key: 'secret...' },
        kubernetes: { kubeconfig: 'apiVersion: v1...' }
      });

      expect(mockVaultService.getSecret).toHaveBeenCalledTimes(2);
    });

    it('should continue with other credentials if one fails', async () => {
      // Mock database response
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { secret_path: 'aws/credentials', credential_type: 'aws' },
          { secret_path: 'invalid/path', credential_type: 'invalid' }
        ]
      });

      // Mock vault responses - one success, one failure
      mockVaultService.getSecret
        .mockResolvedValueOnce({ access_key_id: 'AKIA...', secret_access_key: 'secret...' })
        .mockRejectedValueOnce(new Error('Secret not found'));

      const result = await credentialService.injectCredentialsForAgent('agent-123');

      expect(result).toEqual({
        aws: { access_key_id: 'AKIA...', secret_access_key: 'secret...' }
      });

      expect(mockVaultService.getSecret).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateAgentCredentials', () => {
    it('should validate agent credentials successfully', async () => {
      // Mock database response
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { 
            secret_path: 'aws/credentials', 
            credential_type: 'aws',
            expires_at: null
          }
        ]
      });

      // Mock successful vault access
      mockVaultService.getSecret.mockResolvedValueOnce({ 
        access_key_id: 'AKIA...', 
        secret_access_key: 'secret...' 
      });

      const result = await credentialService.validateAgentCredentials('agent-123');

      expect(result).toEqual({
        valid: true,
        issues: [],
        credentialStatus: {
          aws: { valid: true }
        }
      });
    });

    it('should detect expired credentials', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      
      // Mock database response with expired credential
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { 
            secret_path: 'aws/credentials', 
            credential_type: 'aws',
            expires_at: expiredDate
          }
        ]
      });

      // Mock successful vault access
      mockVaultService.getSecret.mockResolvedValueOnce({ 
        access_key_id: 'AKIA...', 
        secret_access_key: 'secret...' 
      });

      const result = await credentialService.validateAgentCredentials('agent-123');

      expect(result).toEqual({
        valid: false,
        issues: ['aws credential has expired'],
        credentialStatus: {
          aws: { valid: false, error: 'Credential has expired' }
        }
      });
    });
  });

  describe('createCredentialFromTemplate', () => {
    it('should create credential from AWS template', async () => {
      const secretData = {
        access_key_id: 'AKIA123456789',
        secret_access_key: 'secret123456789'
      };

      const metadata = {
        name: 'AWS Production Credentials',
        description: 'AWS credentials for production environment',
        tags: ['production'],
        rotationEnabled: true
      };

      mockVaultService.storeSecret.mockResolvedValueOnce({
        id: 'secret-123',
        name: metadata.name,
        path: 'aws/production',
        description: metadata.description,
        tags: ['production', 'aws'],
        rotationEnabled: true,
        rotationInterval: 90,
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await credentialService.createCredentialFromTemplate(
        'aws',
        'aws/production',
        secretData,
        metadata,
        'user-123'
      );

      expect(mockVaultService.storeSecret).toHaveBeenCalledWith(
        'aws/production',
        secretData,
        expect.objectContaining({
          name: metadata.name,
          description: metadata.description,
          tags: ['production', 'aws'],
          rotationEnabled: true,
          rotationInterval: 90
        }),
        'user-123'
      );
    });

    it('should throw error for missing required fields', async () => {
      const secretData = {
        access_key_id: 'AKIA123456789'
        // Missing secret_access_key
      };

      await expect(credentialService.createCredentialFromTemplate(
        'aws',
        'aws/production',
        secretData,
        { name: 'Test' },
        'user-123'
      )).rejects.toThrow('Missing required field: secret_access_key');
    });

    it('should throw error for unknown template type', async () => {
      await expect(credentialService.createCredentialFromTemplate(
        'unknown',
        'path',
        {},
        { name: 'Test' },
        'user-123'
      )).rejects.toThrow('Unknown credential template type: unknown');
    });
  });
});