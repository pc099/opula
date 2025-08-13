import { AzureIntegration, AzureVirtualMachine, AzureResource, AzureMetric, AzureCostData } from './azureIntegration';
import { azureCredentialManager } from './credentialManager';

export interface AzureResourceSummary {
  virtualMachines: AzureVirtualMachine[];
  allResources: AzureResource[];
  totalResources: number;
  lastUpdated: Date;
}

export interface AzureMetricsSummary {
  vmMetrics: AzureMetric[];
  costData: AzureCostData[];
  totalCost: number;
  lastUpdated: Date;
}

export class AzureService {
  private integrations: Map<string, AzureIntegration> = new Map();
  private resourceCache: Map<string, AzureResourceSummary> = new Map();
  private metricsCache: Map<string, AzureMetricsSummary> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  async getIntegration(credentialsId: string = 'default'): Promise<AzureIntegration> {
    if (this.integrations.has(credentialsId)) {
      return this.integrations.get(credentialsId)!;
    }

    const credentials = azureCredentialManager.getCredentialsForIntegration(credentialsId);
    if (!credentials) {
      throw new Error(`Azure credentials not found for ID: ${credentialsId}`);
    }

    const integration = new AzureIntegration(credentials);
    
    // Test connection before caching
    const isConnected = await integration.testConnection();
    if (!isConnected) {
      throw new Error(`Failed to connect to Azure with credentials ID: ${credentialsId}`);
    }

    this.integrations.set(credentialsId, integration);
    return integration;
  }

  async getAllResources(credentialsId: string = 'default', useCache: boolean = true): Promise<AzureResourceSummary> {
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
      const [virtualMachines, allResources] = await Promise.all([
        integration.getVirtualMachines(),
        integration.getAllResources()
      ]);

      const summary: AzureResourceSummary = {
        virtualMachines,
        allResources,
        totalResources: allResources.length,
        lastUpdated: new Date()
      };

      this.resourceCache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error(`Error fetching Azure resources for ${credentialsId}:`, error);
      throw error;
    }
  }

  async getResourcesWithMetrics(credentialsId: string = 'default', useCache: boolean = true): Promise<AzureResourceSummary> {
    const resources = await this.getAllResources(credentialsId, useCache);
    const integration = await this.getIntegration(credentialsId);

    try {
      const enrichedVMs = await integration.enrichVMsWithMetrics(resources.virtualMachines);

      return {
        ...resources,
        virtualMachines: enrichedVMs,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`Error enriching Azure resources with metrics for ${credentialsId}:`, error);
      // Return resources without metrics if enrichment fails
      return resources;
    }
  }

  async getMetricsSummary(
    credentialsId: string = 'default',
    startDate?: string,
    endDate?: string,
    useCache: boolean = true
  ): Promise<AzureMetricsSummary> {
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
      
      const costData = await integration.getCostData(defaultStartDate, defaultEndDate);
      const totalCost = costData.reduce((sum, cost) => sum + cost.amount, 0);

      // Get VM metrics for all virtual machines
      const vmMetrics: AzureMetric[] = [];
      for (const vm of resources.virtualMachines) {
        try {
          const metrics = await integration.getMetrics(
            vm.id,
            ['Percentage CPU']
          );
          vmMetrics.push(...metrics);
        } catch (error) {
          console.warn(`Failed to fetch metrics for VM ${vm.name}`);
        }
      }

      const summary: AzureMetricsSummary = {
        vmMetrics,
        costData,
        totalCost,
        lastUpdated: new Date()
      };

      this.metricsCache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error(`Error fetching Azure metrics summary for ${credentialsId}:`, error);
      throw error;
    }
  }

  async getCostAnalysis(
    credentialsId: string = 'default',
    days: number = 30
  ): Promise<{ daily: AzureCostData[], total: number, trend: 'increasing' | 'decreasing' | 'stable' }> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const integration = await this.getIntegration(credentialsId);
    const costData = await integration.getCostData(startDate, endDate, 'Daily');
    
    const total = costData.reduce((sum, cost) => sum + cost.amount, 0);
    
    // Calculate trend
    const midPoint = Math.floor(costData.length / 2);
    const firstHalf = costData.slice(0, midPoint);
    const secondHalf = costData.slice(midPoint);
    
    const firstHalfAvg = firstHalf.reduce((sum, cost) => sum + cost.amount, 0) / (firstHalf.length || 1);
    const secondHalfAvg = secondHalf.reduce((sum, cost) => sum + cost.amount, 0) / (secondHalf.length || 1);
    
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (firstHalfAvg > 0) {
      const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
      
      if (changePercent > 5) {
        trend = 'increasing';
      } else if (changePercent < -5) {
        trend = 'decreasing';
      }
    }

    return {
      daily: costData,
      total,
      trend
    };
  }

  async getResourcesByType(
    resourceType: string,
    credentialsId: string = 'default'
  ): Promise<AzureResource[]> {
    const integration = await this.getIntegration(credentialsId);
    return await integration.getResourcesByType(resourceType);
  }

  async getResourcesByResourceGroup(
    resourceGroupName: string,
    credentialsId: string = 'default'
  ): Promise<AzureResource[]> {
    const integration = await this.getIntegration(credentialsId);
    return await integration.getResourcesByResourceGroup(resourceGroupName);
  }

  async testConnection(credentialsId: string = 'default'): Promise<boolean> {
    try {
      const integration = await this.getIntegration(credentialsId);
      return await integration.testConnection();
    } catch (error) {
      console.error(`Azure connection test failed for ${credentialsId}:`, error);
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
    return azureCredentialManager.getAllCredentials().map(cred => azureCredentialManager.maskCredentials(cred));
  }
}

// Singleton instance
export const azureService = new AzureService();