import { AWSIntegration, EC2Instance, ECSService, LambdaFunction, CloudWatchMetric, CostData } from './awsIntegration';
import { awsCredentialManager } from './credentialManager';

export interface AWSResourceSummary {
  ec2Instances: EC2Instance[];
  ecsServices: ECSService[];
  lambdaFunctions: LambdaFunction[];
  totalResources: number;
  lastUpdated: Date;
}

export interface AWSMetricsSummary {
  ec2Metrics: CloudWatchMetric[];
  lambdaMetrics: CloudWatchMetric[];
  costData: CostData[];
  totalCost: number;
  lastUpdated: Date;
}

export class AWSService {
  private integrations: Map<string, AWSIntegration> = new Map();
  private resourceCache: Map<string, AWSResourceSummary> = new Map();
  private metricsCache: Map<string, AWSMetricsSummary> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  async getIntegration(credentialsId: string = 'default'): Promise<AWSIntegration> {
    if (this.integrations.has(credentialsId)) {
      return this.integrations.get(credentialsId)!;
    }

    const credentials = awsCredentialManager.getCredentialsForIntegration(credentialsId);
    if (!credentials) {
      throw new Error(`AWS credentials not found for ID: ${credentialsId}`);
    }

    const integration = new AWSIntegration(credentials);
    
    // Test connection before caching
    const isConnected = await integration.testConnection();
    if (!isConnected) {
      throw new Error(`Failed to connect to AWS with credentials ID: ${credentialsId}`);
    }

    this.integrations.set(credentialsId, integration);
    return integration;
  }

  async getAllResources(credentialsId: string = 'default', useCache: boolean = true): Promise<AWSResourceSummary> {
    const cacheKey = `resources-${credentialsId}`;
    
    if (useCache && this.resourceCache.has(cacheKey)) {
      const cached = this.resourceCache.get(cacheKey)!;
      const isExpired = Date.now() - cached.lastUpdated.getTime() > this.cacheTimeout;
      if (!isExpired) {
        return cached;
      }
    }

    const integration = await this.getIntegration(credentialsId);

    try {
      const [ec2Instances, ecsServices, lambdaFunctions] = await Promise.all([
        integration.getEC2Instances(),
        integration.getECSServices(),
        integration.getLambdaFunctions()
      ]);

      const summary: AWSResourceSummary = {
        ec2Instances,
        ecsServices,
        lambdaFunctions,
        totalResources: ec2Instances.length + ecsServices.length + lambdaFunctions.length,
        lastUpdated: new Date()
      };

      this.resourceCache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error(`Error fetching AWS resources for ${credentialsId}:`, error);
      throw error;
    }
  }

  async getResourcesWithMetrics(credentialsId: string = 'default', useCache: boolean = true): Promise<AWSResourceSummary> {
    const resources = await this.getAllResources(credentialsId, useCache);
    const integration = await this.getIntegration(credentialsId);

    try {
      const [enrichedEC2, enrichedLambda] = await Promise.all([
        integration.enrichEC2InstancesWithMetrics(resources.ec2Instances),
        integration.enrichLambdaFunctionsWithMetrics(resources.lambdaFunctions)
      ]);

      return {
        ...resources,
        ec2Instances: enrichedEC2,
        lambdaFunctions: enrichedLambda,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`Error enriching AWS resources with metrics for ${credentialsId}:`, error);
      // Return resources without metrics if enrichment fails
      return resources;
    }
  }

  async getMetricsSummary(
    credentialsId: string = 'default',
    startDate?: string,
    endDate?: string,
    useCache: boolean = true
  ): Promise<AWSMetricsSummary> {
    const cacheKey = `metrics-${credentialsId}-${startDate}-${endDate}`;
    
    if (useCache && this.metricsCache.has(cacheKey)) {
      const cached = this.metricsCache.get(cacheKey)!;
      const isExpired = Date.now() - cached.lastUpdated.getTime() > this.cacheTimeout;
      if (!isExpired) {
        return cached;
      }
    }

    const integration = await this.getIntegration(credentialsId);
    const resources = await this.getAllResources(credentialsId, useCache);

    try {
      // Get cost data
      const defaultStartDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const defaultEndDate = endDate || new Date().toISOString().split('T')[0];
      
      const costData = await integration.getCostAndUsage(defaultStartDate, defaultEndDate);
      const totalCost = costData.reduce((sum, cost) => sum + cost.amount, 0);

      // Get EC2 metrics for all instances
      const ec2Metrics: CloudWatchMetric[] = [];
      for (const instance of resources.ec2Instances) {
        try {
          const metrics = await integration.getCloudWatchMetrics(
            'AWS/EC2',
            'CPUUtilization',
            { InstanceId: instance.instanceId }
          );
          ec2Metrics.push(...metrics);
        } catch (error) {
          console.warn(`Failed to fetch metrics for EC2 instance ${instance.instanceId}`);
        }
      }

      // Get Lambda metrics for all functions
      const lambdaMetrics: CloudWatchMetric[] = [];
      for (const func of resources.lambdaFunctions) {
        try {
          const metrics = await integration.getCloudWatchMetrics(
            'AWS/Lambda',
            'Invocations',
            { FunctionName: func.functionName }
          );
          lambdaMetrics.push(...metrics);
        } catch (error) {
          console.warn(`Failed to fetch metrics for Lambda function ${func.functionName}`);
        }
      }

      const summary: AWSMetricsSummary = {
        ec2Metrics,
        lambdaMetrics,
        costData,
        totalCost,
        lastUpdated: new Date()
      };

      this.metricsCache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error(`Error fetching AWS metrics summary for ${credentialsId}:`, error);
      throw error;
    }
  }

  async getCostAnalysis(
    credentialsId: string = 'default',
    days: number = 30
  ): Promise<{ daily: CostData[], total: number, trend: 'increasing' | 'decreasing' | 'stable' }> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const integration = await this.getIntegration(credentialsId);
    const costData = await integration.getCostAndUsage(startDate, endDate, 'DAILY');
    
    const total = costData.reduce((sum, cost) => sum + cost.amount, 0);
    
    // Calculate trend
    const midPoint = Math.floor(costData.length / 2);
    const firstHalf = costData.slice(0, midPoint);
    const secondHalf = costData.slice(midPoint);
    
    const firstHalfAvg = firstHalf.reduce((sum, cost) => sum + cost.amount, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, cost) => sum + cost.amount, 0) / secondHalf.length;
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
    
    if (changePercent > 5) {
      trend = 'increasing';
    } else if (changePercent < -5) {
      trend = 'decreasing';
    }

    return {
      daily: costData,
      total,
      trend
    };
  }

  async testConnection(credentialsId: string = 'default'): Promise<boolean> {
    try {
      const integration = await this.getIntegration(credentialsId);
      return await integration.testConnection();
    } catch (error) {
      console.error(`AWS connection test failed for ${credentialsId}:`, error);
      return false;
    }
  }

  clearCache(credentialsId?: string): void {
    if (credentialsId) {
      // Clear cache for specific credentials
      const keysToDelete = Array.from(this.resourceCache.keys()).filter(key => key.includes(credentialsId));
      keysToDelete.forEach(key => this.resourceCache.delete(key));
      
      const metricsKeysToDelete = Array.from(this.metricsCache.keys()).filter(key => key.includes(credentialsId));
      metricsKeysToDelete.forEach(key => this.metricsCache.delete(key));
    } else {
      // Clear all cache
      this.resourceCache.clear();
      this.metricsCache.clear();
    }
  }

  getAvailableCredentials() {
    return awsCredentialManager.getAllCredentials().map(cred => awsCredentialManager.maskCredentials(cred));
  }
}

// Singleton instance
export const awsService = new AWSService();