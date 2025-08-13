import { AWSIntegration, AWSCredentials } from '../awsIntegration';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-ec2');
jest.mock('@aws-sdk/client-ecs');
jest.mock('@aws-sdk/client-lambda');
jest.mock('@aws-sdk/client-cloudwatch');
jest.mock('@aws-sdk/client-cost-explorer');

describe('AWSIntegration', () => {
  const mockCredentials: AWSCredentials = {
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret'
  };

  let awsIntegration: AWSIntegration;

  beforeEach(() => {
    awsIntegration = new AWSIntegration(mockCredentials);
  });

  describe('constructor', () => {
    it('should create AWS integration with credentials', () => {
      expect(awsIntegration).toBeInstanceOf(AWSIntegration);
    });

    it('should handle profile-based credentials', () => {
      const profileCredentials: AWSCredentials = {
        region: 'us-west-2',
        profile: 'test-profile'
      };
      
      const integration = new AWSIntegration(profileCredentials);
      expect(integration).toBeInstanceOf(AWSIntegration);
    });
  });

  describe('getEC2Instances', () => {
    it('should return empty array when no instances exist', async () => {
      // Mock EC2 client response
      const mockSend = jest.fn().mockResolvedValue({
        Reservations: []
      });
      
      (awsIntegration as any).ec2Client.send = mockSend;

      const instances = await awsIntegration.getEC2Instances();
      expect(instances).toEqual([]);
    });

    it('should handle EC2 client errors', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('AWS Error'));
      (awsIntegration as any).ec2Client.send = mockSend;

      await expect(awsIntegration.getEC2Instances()).rejects.toThrow('Failed to fetch EC2 instances');
    });
  });

  describe('getECSServices', () => {
    it('should return empty array when no services exist', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        clusterArns: []
      });
      
      (awsIntegration as any).ecsClient.send = mockSend;

      const services = await awsIntegration.getECSServices();
      expect(services).toEqual([]);
    });
  });

  describe('getLambdaFunctions', () => {
    it('should return empty array when no functions exist', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Functions: []
      });
      
      (awsIntegration as any).lambdaClient.send = mockSend;

      const functions = await awsIntegration.getLambdaFunctions();
      expect(functions).toEqual([]);
    });
  });

  describe('getCloudWatchMetrics', () => {
    it('should return empty array when no metrics exist', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Datapoints: []
      });
      
      (awsIntegration as any).cloudWatchClient.send = mockSend;

      const metrics = await awsIntegration.getCloudWatchMetrics('AWS/EC2', 'CPUUtilization');
      expect(metrics).toEqual([]);
    });
  });

  describe('getCostAndUsage', () => {
    it('should return empty array when no cost data exists', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        ResultsByTime: []
      });
      
      (awsIntegration as any).costExplorerClient.send = mockSend;

      const costData = await awsIntegration.getCostAndUsage('2024-01-01', '2024-01-31');
      expect(costData).toEqual([]);
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        Metrics: []
      });
      
      (awsIntegration as any).cloudWatchClient.send = mockSend;

      const result = await awsIntegration.testConnection();
      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      const mockSend = jest.fn().mockRejectedValue(new Error('Connection failed'));
      (awsIntegration as any).cloudWatchClient.send = mockSend;

      const result = await awsIntegration.testConnection();
      expect(result).toBe(false);
    });
  });
});