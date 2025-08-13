import { 
  ComputeManagementClient,
  VirtualMachine 
} from '@azure/arm-compute';
import { 
  ResourceManagementClient,
  Resource 
} from '@azure/arm-resources';
import { 
  MonitorClient,
  MetricValue 
} from '@azure/arm-monitor';
// import { 
//   CostManagementClient 
// } from '@azure/arm-costmanagement';
import { 
  DefaultAzureCredential,
  ClientSecretCredential,
  AzureCliCredential 
} from '@azure/identity';

export interface AzureCredentials {
  subscriptionId: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  useDefaultCredential?: boolean;
  useCLI?: boolean;
}

export interface AzureVirtualMachine {
  id: string;
  name: string;
  location: string;
  vmSize: string;
  powerState: string;
  resourceGroup: string;
  tags: Record<string, string>;
  monitoring: {
    cpuUtilization?: number;
    memoryUtilization?: number;
    networkIn?: number;
    networkOut?: number;
  };
}

export interface AzureResource {
  id: string;
  name: string;
  type: string;
  location: string;
  resourceGroup: string;
  tags: Record<string, string>;
}

export interface AzureMetric {
  metricName: string;
  resourceId: string;
  value: number;
  timestamp: Date;
  unit: string;
}

export interface AzureCostData {
  resourceGroup: string;
  service: string;
  amount: number;
  currency: string;
  period: {
    start: string;
    end: string;
  };
}

export class AzureIntegration {
  private computeClient: ComputeManagementClient;
  private resourceClient: ResourceManagementClient;
  private monitorClient: MonitorClient;
  // private costClient: CostManagementClient;
  private credentials: AzureCredentials;

  constructor(credentials: AzureCredentials) {
    this.credentials = credentials;
    
    let azureCredential;
    
    if (credentials.useDefaultCredential) {
      azureCredential = new DefaultAzureCredential();
    } else if (credentials.useCLI) {
      azureCredential = new AzureCliCredential();
    } else if (credentials.tenantId && credentials.clientId && credentials.clientSecret) {
      azureCredential = new ClientSecretCredential(
        credentials.tenantId,
        credentials.clientId,
        credentials.clientSecret
      );
    } else {
      throw new Error('Invalid Azure credentials configuration');
    }

    this.computeClient = new ComputeManagementClient(azureCredential, credentials.subscriptionId);
    this.resourceClient = new ResourceManagementClient(azureCredential, credentials.subscriptionId);
    this.monitorClient = new MonitorClient(azureCredential, credentials.subscriptionId);
    // this.costClient = new CostManagementClient(azureCredential);
  }

  async getVirtualMachines(): Promise<AzureVirtualMachine[]> {
    try {
      const vms: AzureVirtualMachine[] = [];
      
      for await (const vm of this.computeClient.virtualMachines.listAll()) {
        if (vm.id && vm.name && vm.location) {
          // Get instance view for power state
          const resourceGroup = this.extractResourceGroup(vm.id);
          let powerState = 'unknown';
          
          try {
            const instanceView = await this.computeClient.virtualMachines.instanceView(
              resourceGroup,
              vm.name
            );
            
            const powerStatus = instanceView.statuses?.find(
              status => status.code?.startsWith('PowerState/')
            );
            powerState = powerStatus?.displayStatus || 'unknown';
          } catch (error) {
            console.warn(`Failed to get power state for VM ${vm.name}`);
          }

          vms.push({
            id: vm.id,
            name: vm.name,
            location: vm.location,
            vmSize: vm.hardwareProfile?.vmSize || 'unknown',
            powerState,
            resourceGroup,
            tags: vm.tags || {},
            monitoring: {}
          });
        }
      }
      
      return vms;
    } catch (error) {
      console.error('Error fetching Azure VMs:', error);
      throw new Error(`Failed to fetch Azure VMs: ${error}`);
    }
  }

  async getAllResources(): Promise<AzureResource[]> {
    try {
      const resources: AzureResource[] = [];
      
      for await (const resource of this.resourceClient.resources.list()) {
        if (resource.id && resource.name && resource.type && resource.location) {
          resources.push({
            id: resource.id,
            name: resource.name,
            type: resource.type,
            location: resource.location,
            resourceGroup: this.extractResourceGroup(resource.id),
            tags: resource.tags || {}
          });
        }
      }
      
      return resources;
    } catch (error) {
      console.error('Error fetching Azure resources:', error);
      throw new Error(`Failed to fetch Azure resources: ${error}`);
    }
  }

  async getMetrics(
    resourceId: string,
    metricNames: string[],
    startTime: Date = new Date(Date.now() - 3600000), // 1 hour ago
    endTime: Date = new Date()
  ): Promise<AzureMetric[]> {
    try {
      const metrics: AzureMetric[] = [];
      
      const metricsResponse = await this.monitorClient.metrics.list(
        resourceId,
        {
          timespan: `${startTime.toISOString()}/${endTime.toISOString()}`,
          interval: 'PT5M', // 5 minutes
          metricnames: metricNames.join(','),
          aggregation: 'Average'
        }
      );

      if (metricsResponse.value) {
        for (const metric of metricsResponse.value) {
          if (metric.name?.value && metric.timeseries) {
            for (const timeseries of metric.timeseries) {
              if (timeseries.data) {
                for (const dataPoint of timeseries.data) {
                  if (dataPoint.average !== undefined && dataPoint.timeStamp) {
                    metrics.push({
                      metricName: metric.name.value,
                      resourceId,
                      value: dataPoint.average,
                      timestamp: dataPoint.timeStamp,
                      unit: metric.unit || ''
                    });
                  }
                }
              }
            }
          }
        }
      }

      return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error('Error fetching Azure metrics:', error);
      throw new Error(`Failed to fetch Azure metrics: ${error}`);
    }
  }

  async getCostData(
    startDate: string,
    endDate: string,
    granularity: 'Daily' | 'Monthly' = 'Daily'
  ): Promise<AzureCostData[]> {
    try {
      const scope = `/subscriptions/${this.credentials.subscriptionId}`;
      
      const queryDefinition = {
        type: 'Usage',
        timeframe: 'Custom',
        timePeriod: {
          from: new Date(startDate),
          to: new Date(endDate)
        },
        dataset: {
          granularity,
          aggregation: {
            totalCost: {
              name: 'Cost',
              function: 'Sum'
            }
          },
          grouping: [
            {
              type: 'Dimension',
              name: 'ResourceGroupName'
            },
            {
              type: 'Dimension',
              name: 'ServiceName'
            }
          ]
        }
      };

      const costData: AzureCostData[] = [];
      
      try {
        // const response = await this.costClient.query.usage(scope, queryDefinition);
        const response = { rows: [] }; // Placeholder until cost management is properly configured
        
        if (response.rows) {
          for (const row of response.rows) {
            if (row.length >= 4) {
              costData.push({
                resourceGroup: row[1] as string || 'Unknown',
                service: row[2] as string || 'Unknown',
                amount: parseFloat(row[0] as string) || 0,
                currency: 'USD', // Azure Cost Management typically returns USD
                period: {
                  start: startDate,
                  end: endDate
                }
              });
            }
          }
        }
      } catch (error) {
        console.warn('Cost data retrieval failed, returning empty array:', error);
        // Cost Management API might not be available or configured
      }

      return costData;
    } catch (error) {
      console.error('Error fetching Azure cost data:', error);
      throw new Error(`Failed to fetch Azure cost data: ${error}`);
    }
  }

  async enrichVMsWithMetrics(vms: AzureVirtualMachine[]): Promise<AzureVirtualMachine[]> {
    const enrichedVMs = [...vms];
    
    for (const vm of enrichedVMs) {
      try {
        // Get CPU utilization
        const cpuMetrics = await this.getMetrics(
          vm.id,
          ['Percentage CPU']
        );
        
        if (cpuMetrics.length > 0) {
          vm.monitoring.cpuUtilization = cpuMetrics[cpuMetrics.length - 1].value;
        }

        // Get network metrics
        const networkMetrics = await this.getMetrics(
          vm.id,
          ['Network In Total', 'Network Out Total']
        );
        
        const networkInMetric = networkMetrics.find(m => m.metricName === 'Network In Total');
        const networkOutMetric = networkMetrics.find(m => m.metricName === 'Network Out Total');
        
        if (networkInMetric) {
          vm.monitoring.networkIn = networkInMetric.value;
        }
        
        if (networkOutMetric) {
          vm.monitoring.networkOut = networkOutMetric.value;
        }
      } catch (error) {
        console.warn(`Failed to fetch metrics for VM ${vm.name}:`, error);
      }
    }
    
    return enrichedVMs;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test to verify credentials and connectivity
      const resourceGroups = this.resourceClient.resourceGroups.list();
      const iterator = resourceGroups[Symbol.asyncIterator]();
      await iterator.next(); // Try to get first resource group
      return true;
    } catch (error) {
      console.error('Azure connection test failed:', error);
      return false;
    }
  }

  private extractResourceGroup(resourceId: string): string {
    const match = resourceId.match(/\/resourceGroups\/([^\/]+)/);
    return match ? match[1] : 'unknown';
  }

  async getResourcesByType(resourceType: string): Promise<AzureResource[]> {
    try {
      const resources: AzureResource[] = [];
      
      for await (const resource of this.resourceClient.resources.list({
        filter: `resourceType eq '${resourceType}'`
      })) {
        if (resource.id && resource.name && resource.type && resource.location) {
          resources.push({
            id: resource.id,
            name: resource.name,
            type: resource.type,
            location: resource.location,
            resourceGroup: this.extractResourceGroup(resource.id),
            tags: resource.tags || {}
          });
        }
      }
      
      return resources;
    } catch (error) {
      console.error(`Error fetching Azure resources of type ${resourceType}:`, error);
      throw new Error(`Failed to fetch Azure resources of type ${resourceType}: ${error}`);
    }
  }

  async getResourcesByResourceGroup(resourceGroupName: string): Promise<AzureResource[]> {
    try {
      const resources: AzureResource[] = [];
      
      for await (const resource of this.resourceClient.resources.listByResourceGroup(resourceGroupName)) {
        if (resource.id && resource.name && resource.type && resource.location) {
          resources.push({
            id: resource.id,
            name: resource.name,
            type: resource.type,
            location: resource.location,
            resourceGroup: resourceGroupName,
            tags: resource.tags || {}
          });
        }
      }
      
      return resources;
    } catch (error) {
      console.error(`Error fetching Azure resources for resource group ${resourceGroupName}:`, error);
      throw new Error(`Failed to fetch Azure resources for resource group ${resourceGroupName}: ${error}`);
    }
  }
}