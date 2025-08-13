import { TerraformIntegration } from '../terraformIntegration';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('TerraformIntegration', () => {
  let terraformIntegration: TerraformIntegration;
  let mockProcess: any;

  beforeEach(() => {
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(mockProcess as any);

    terraformIntegration = new TerraformIntegration('terraform', '/test/dir');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('plan', () => {
    it('should execute terraform plan and return parsed output', async () => {
      const mockPlanOutput = `
        {"type":"planned_change","change":{"action":["create"],"resource":{"addr":"aws_instance.example","resource_type":"aws_instance","resource_name":"example"}}}
        {"type":"planned_change","change":{"action":["update"],"resource":{"addr":"aws_s3_bucket.example","resource_type":"aws_s3_bucket","resource_name":"example"}}}
      `;

      const planPromise = terraformIntegration.plan();

      // Simulate successful terraform plan execution
      setTimeout(() => {
        mockProcess.stdout.emit('data', mockPlanOutput);
        mockProcess.emit('close', 0);
      }, 10);

      const result = await planPromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', ['plan', '-json', '-no-color'], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      expect(result).toEqual({
        changes: {
          add: 1,
          change: 1,
          destroy: 0
        },
        resources: [
          {
            address: 'aws_instance.example',
            action: ['create'],
            resource_type: 'aws_instance',
            resource_name: 'example'
          },
          {
            address: 'aws_s3_bucket.example',
            action: ['update'],
            resource_type: 'aws_s3_bucket',
            resource_name: 'example'
          }
        ],
        raw_output: mockPlanOutput
      });
    });

    it('should handle terraform plan with options', async () => {
      const planPromise = terraformIntegration.plan({
        varFile: 'vars.tfvars',
        target: ['aws_instance.example'],
        destroy: true
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', '');
        mockProcess.emit('close', 0);
      }, 10);

      await planPromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', [
        'plan', '-json', '-no-color',
        '-var-file', 'vars.tfvars',
        '-target', 'aws_instance.example',
        '-destroy'
      ], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should handle terraform plan failure', async () => {
      const planPromise = terraformIntegration.plan();

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Error: Invalid configuration');
        mockProcess.emit('close', 1);
      }, 10);

      await expect(planPromise).rejects.toThrow('Terraform command failed with code 1: Error: Invalid configuration');
    });
  });

  describe('apply', () => {
    it('should execute terraform apply successfully', async () => {
      const applyPromise = terraformIntegration.apply(undefined, true);

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Apply complete!');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await applyPromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', ['apply', '-json', '-no-color', '-auto-approve'], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      expect(result).toEqual({
        success: true,
        output: 'Apply complete!'
      });
    });

    it('should handle terraform apply failure', async () => {
      const applyPromise = terraformIntegration.apply();

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Error: Apply failed');
        mockProcess.emit('close', 1);
      }, 10);

      const result = await applyPromise;

      expect(result).toEqual({
        success: false,
        output: 'Terraform command failed with code 1: Error: Apply failed'
      });
    });
  });

  describe('getState', () => {
    it('should return parsed terraform state', async () => {
      const mockState = {
        format_version: '1.0',
        terraform_version: '1.5.0',
        values: {
          root_module: {
            resources: []
          }
        }
      };

      const statePromise = terraformIntegration.getState();

      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(mockState));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await statePromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', ['show', '-json'], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      expect(result).toEqual(mockState);
    });
  });

  describe('validate', () => {
    it('should return validation results', async () => {
      const mockValidation = {
        valid: true,
        diagnostics: []
      };

      const validatePromise = terraformIntegration.validate();

      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(mockValidation));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await validatePromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', ['validate', '-json'], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      expect(result).toEqual(mockValidation);
    });

    it('should handle validation errors', async () => {
      const validatePromise = terraformIntegration.validate();

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Validation error');
        mockProcess.emit('close', 1);
      }, 10);

      const result = await validatePromise;

      expect(result).toEqual({
        valid: false,
        diagnostics: [{ severity: 'error', summary: 'Terraform command failed with code 1: Validation error' }]
      });
    });
  });

  describe('version', () => {
    it('should return terraform version information', async () => {
      const mockVersion = {
        terraform_version: '1.5.0',
        provider_selections: {
          'registry.terraform.io/hashicorp/aws': '5.0.0'
        }
      };

      const versionPromise = terraformIntegration.version();

      setTimeout(() => {
        mockProcess.stdout.emit('data', JSON.stringify(mockVersion));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await versionPromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', ['version', '-json'], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      expect(result).toEqual(mockVersion);
    });
  });

  describe('init', () => {
    it('should initialize terraform with options', async () => {
      const initPromise = terraformIntegration.init({ upgrade: true, reconfigure: true });

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Terraform initialized');
        mockProcess.emit('close', 0);
      }, 10);

      await initPromise;

      expect(mockSpawn).toHaveBeenCalledWith('terraform', ['init', '-no-color', '-upgrade', '-reconfigure'], {
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });
  });
});