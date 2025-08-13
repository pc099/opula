import { GCPIntegration, GCPInstance, GKECluster, GCPMetric, GCPCostData } from './gcpIntegration';
import { gcpCredentialManager } from './credentialManager';

export interface GCPResourceSummary {
  computeInstances: GCPInstance[];
  gkeClusters: GKECluster[];
  totalResources: number;
  lastUpdated: Date;
}

export interface GCPMetricsSummary {
  instanceMetrics: GCPMetric[];
  costData: GCPCostData[];
  totalCost: number;
  lastUpdated: Date;
}

export class GCPService {
  private integrations: Map<string, GCPIntegration> = new Map();
  private resourceCache: Map<string, GCPResourceSummary> = new Map();
  private metricsCache: Map<string, GCPMetricsSummary> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  async getIntegration(credentialsId: string = 'default'): Promise<GCPIntegration> {
    if (this.integrations.has(credentialsId)) {
      return this.integrations.get(credentialsId)!;
    }

    const credentials = gcpCredentialManager.getCredentialsForIntegration(credentialsId);
    if (!credentials) {
      throw new Error(`GCP credentials not found for ID: ${credentialsId}`);
    }

    const integration = new GCPIntegration(credentials);
    
    // Test connection before caching
    const isConnected = await integration.testConnection();
    if (!isConnected) {
      throw new Error(`Failed to connect to GCP with credentials ID: ${credentialsId}`);
    }

    this.integrations.set(credentialsId, integration);
    return integration;
  }

  async getAllResources(credentialsId: string = 'default', useCache: boolean = true): Promise<GCPResourceSummary> {
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
      const [computeInstances, gkeClusters] = await Promise.all([
        integration.getComputeInstances(),
        integration.getGKEClusters()
      ]);

      const summary: GCPResourceSummary = {
        computeInstances,
        gkeClusters,
        totalResources: computeInstances.length + gkeClusters.length,
        lastUpdated: new Date()
      };

      this.resourceCache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error(`Error fetching GCP resources for ${credentialsId}:`, error);
      throw error;
    }
  }

  async getResourcesWithMetrics(credentialsId: string = 'default', useCache: boolean = true): Promise<GCPResourceSummary> {
    const resources = await this.getAllResources(credentialsId, useCache);
    const integration = await this.getIntegration(credentialsId);

    try {
      const enrichedInstances = await integration.enrichInstancesWithMetrics(resources.computeInstances);

      return {
        ...resources,
        computeInstances: enrichedInstances,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`Error enriching GCP resources with metrics for ${credentialsId}:`, error);
      // Return resources without metrics if enrichment fails
      return resources;
    }
  }

  async getMetricsSummary(
    credentialsId: string = 'default',
    startDate?: string,
    endDate?: string,
    useCache: boolean = true
  ): Promise<GCPMetricsSummary> {
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
      
      const costData = await integration.getBillingData(defaultStartDate, defaultEndDate);
      const totalCost = costData.reduce((sum, cost) => sum + cost.amount, 0);

      // Get instance metrics for all compute instances
      const instanceMetrics: GCPMetric[] = [];
      for (const instance of resources.computeInstances) {
        try {
          const metrics = await integration.getMetrics(
            'compute.googleapis.com/instance/cpu/utilization',
            'gce_instance',
            { instance_name: instance.name }
          );
          instanceMetrics.push(...metrics);
        } catch (error) {
          console.warn(`Failed to fetch metrics for instance ${instance.name}`);
        }
      }

      const summary: GCPMetricsSummary = {
        instanceMetrics,
        costData,
        totalCost,
        lastUpdated: new Date()
      };

      this.metricsCache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error(`Error fetching GCP metrics summary for ${credentialsId}:`, error);
      throw error;
    }
  }

  async getCostAnalysis(
    credentialsId: string = 'default',
    days: number = 30
  ): Promise<{ daily: GCPCostData[], total: number, trend: 'increasing' | 'decreasing' | 'stable' }> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const integration = await this.getIntegration(credentialsId);
    const costData = await integration.getBillingData(startDate, endDate);
    
    const total = costData.reduce((sum, cost) => sum + cost.amount, 0);
    
    // Calculate trend (simplified since GCP billing data structure may vary)
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (costData.length > 1) {
      const midPoint = Math.floor(costData.length / 2);
      const firstHalf = costData.slice(0, midPoint);
      const secondHalf = costData.slice(midPoint);
      
      const firstHalfAvg = firstHalf.reduce((sum, cost) => sum + cost.amount, 0) / (firstHalf.length || 1);
      const secondHalfAvg = secondHalf.reduce((sum, cost) => sum + cost.amount, 0) / (secondHalf.length || 1);
      
      if (firstHalfAvg > 0) {
        const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
        
        if (changePercent > 5) {
          trend = 'increasing';
        } else if (changePercent < -5) {
          trend = 'decreasing';
        }
      }
    }

    return {
      daily: costData,
      total,
      trend
    };
  }

  async getInstancesByZone(
    zone: string,
    credentialsId: string = 'default'
  ): Promise<GCPInstance[]> {
    const integration = await this.getIntegration(credentialsId);
    return await integration.getInstancesByZone(zone);
  }

  async getGKEClustersByLocation(
    location: string,
    credentialsId: string = 'default'
  ): Promise<GKECluster[]> {
    const integration = await this.getIntegration(credentialsId);
    return await integration.getGKEClustersByLocation(location);
  }

  async getZones(credentialsId: string = 'default'): Promise<string[]> {
    const integration = await this.getIntegration(credentialsId);
    return await integration.getZones();
  }

  async getRegions(credentialsId: string = 'default'): Promise<string[]> {
    const integration = await this.getIntegration(credentialsId);
    return await integration.getRegions();
  }

  async testConnection(credentialsId: string = 'default'): Promise<boolean> {
    try {
      const integration = await this.getIntegration(credentialsId);
      return await integration.testConnection();
    } catch (error) {
      console.error(`GCP connection test failed for ${credentialsId}:`, error);
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
    return gcpCredentialManager.getAllCredentials().map(cred => gcpCredentialManager.maskCredentials(cred));
  }
}

// Singleton instance
export const gcpService = new GCPService();