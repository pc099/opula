// @ts-nocheck
import { InstancesClient } from '@google-cloud/compute';
import { ClusterManagerClient } from '@google-cloud/container';
import { MetricServiceClient } from '@google-cloud/monitoring';
import { CloudBillingClient } from '@google-cloud/billing';
import { GoogleAuth } from 'google-auth-library';

export interface GCPCredentials {
  projectId: string;
  keyFilename?: string;
  credentials?: object;
  useApplicationDefault?: boolean;
}

export interface GCPInstance {
  id: string;
  name: string;
  zone: string;
  machineType: string;
  status: string;
  creationTimestamp?: string;
  labels: Record<string, string>;
  monitoring: {
    cpuUtilization?: number;
    memoryUtilization?: number;
    networkIn?: number;
    networkOut?: number;
  };
}

export interface GKECluster {
  name: string;
  location: string;
  status: string;
  nodeCount: number;
  currentMasterVersion: string;
  endpoint: string;
  labels: Record<string, string>;
}

export interface GCPMetric {
  metricType: string;
  resourceType: string;
  value: number;
  timestamp: Date;
  unit: string;
  labels: Record<string, string>;
}

export interface GCPCostData {
  service: string;
  sku: string;
  amount: number;
  currency: string;
  period: {
    start: string;
    end: string;
  };
}

export class GCPIntegration {
  private compute: InstancesClient;
  private container: ClusterManagerClient;
  private monitoring: MetricServiceClient;
  private billing: CloudBillingClient;
  private credentials: GCPCredentials;
  private auth: GoogleAuth;

  constructor(credentials: GCPCredentials) {
    this.credentials = credentials;
    
    const authOptions: any = {
      projectId: credentials.projectId
    };

    if (credentials.keyFilename) {
      authOptions.keyFilename = credentials.keyFilename;
    } else if (credentials.credentials) {
      authOptions.credentials = credentials.credentials;
    } else if (!credentials.useApplicationDefault) {
      throw new Error('Invalid GCP credentials configuration');
    }

    this.auth = new GoogleAuth(authOptions);
    
    this.compute = new InstancesClient({
      projectId: credentials.projectId,
      auth: this.auth
    });
    
    this.container = new ClusterManagerClient({
      projectId: credentials.projectId,
      auth: this.auth
    });
    
    this.monitoring = new MetricServiceClient({
      projectId: credentials.projectId,
      auth: this.auth
    });
    
    this.billing = new CloudBillingClient({
      projectId: credentials.projectId,
      auth: this.auth
    });
  }

  async getComputeInstances(): Promise<GCPInstance[]> {
    try {
      const instances: GCPInstance[] = [];
      
      const [vms] = await this.compute.list({
        project: this.credentials.projectId,
        zone: 'us-central1-a' // Default zone, should be configurable
      });
      
      for (const vm of vms) {
        const metadata = vm as any; // Type assertion for now
        const zone = metadata.zone ? metadata.zone.split('/').pop() : 'unknown';
        const machineType = metadata.machineType ? metadata.machineType.split('/').pop() : 'unknown';
        
        instances.push({
          id: metadata.id?.toString() || '',
          name: metadata.name || '',
          zone,
          machineType,
          status: metadata.status || 'unknown',
          creationTimestamp: metadata.creationTimestamp,
          labels: metadata.labels || {},
          monitoring: {}
        });
      }
      
      return instances;
    } catch (error) {
      console.error('Error fetching GCP instances:', error);
      throw new Error(`Failed to fetch GCP instances: ${error}`);
    }
  }

  async getGKEClusters(): Promise<GKECluster[]> {
    try {
      const clusters: GKECluster[] = [];
      
      const [clusterList] = await this.container.listClusters({
        parent: `projects/${this.credentials.projectId}/locations/-`
      });
      
      for (const cluster of clusterList.clusters || []) {
        clusters.push({
          name: cluster.name || '',
          location: cluster.location || '',
          status: cluster.status || 'unknown',
          nodeCount: cluster.currentNodeCount || 0,
          currentMasterVersion: cluster.currentMasterVersion || '',
          endpoint: cluster.endpoint || '',
          labels: cluster.resourceLabels || {}
        });
      }
      
      return clusters;
    } catch (error) {
      console.error('Error fetching GKE clusters:', error);
      throw new Error(`Failed to fetch GKE clusters: ${error}`);
    }
  } 
 async getMetrics(
    metricType: string,
    resourceType: string,
    resourceLabels: Record<string, string> = {},
    startTime: Date = new Date(Date.now() - 3600000), // 1 hour ago
    endTime: Date = new Date()
  ): Promise<GCPMetric[]> {
    try {
      const request = {
        name: `projects/${this.credentials.projectId}`,
        filter: `metric.type="${metricType}" AND resource.type="${resourceType}"`,
        interval: {
          startTime: {
            seconds: Math.floor(startTime.getTime() / 1000)
          },
          endTime: {
            seconds: Math.floor(endTime.getTime() / 1000)
          }
        },
        aggregation: {
          alignmentPeriod: {
            seconds: 300 // 5 minutes
          },
          perSeriesAligner: 'ALIGN_MEAN'
        }
      };

      const [timeSeries] = await this.monitoring.listTimeSeries({
        ...request,
        aggregation: {
          ...request.aggregation,
          perSeriesAligner: 'ALIGN_MEAN' as any
        }
      });
      const metrics: GCPMetric[] = [];

      for (const series of timeSeries) {
        if (series.points) {
          for (const point of series.points) {
            if (point.value?.doubleValue !== undefined && point.interval?.endTime) {
              metrics.push({
                metricType,
                resourceType,
                value: point.value.doubleValue,
                timestamp: new Date(
                  (Number(point.interval.endTime.seconds) || 0) * 1000 + 
                  (point.interval.endTime.nanos || 0) / 1000000
                ),
                unit: series.unit || '',
                labels: {
                  ...series.resource?.labels,
                  ...series.metric?.labels
                }
              });
            }
          }
        }
      }

      return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error('Error fetching GCP metrics:', error);
      throw new Error(`Failed to fetch GCP metrics: ${error}`);
    }
  }

  async getBillingData(
    startDate: string,
    endDate: string
  ): Promise<GCPCostData[]> {
    try {
      // Note: This is a simplified implementation
      // Real GCP billing requires proper billing account setup and permissions
      const costData: GCPCostData[] = [];
      
      try {
        // This would require proper billing API setup
        // For now, return empty array as billing API requires special permissions
        console.warn('GCP Billing API requires special setup and permissions');
      } catch (error) {
        console.warn('GCP billing data not available:', error);
      }

      return costData;
    } catch (error) {
      console.error('Error fetching GCP billing data:', error);
      throw new Error(`Failed to fetch GCP billing data: ${error}`);
    }
  }

  async enrichInstancesWithMetrics(instances: GCPInstance[]): Promise<GCPInstance[]> {
    const enrichedInstances = [...instances];
    
    for (const instance of enrichedInstances) {
      try {
        // Get CPU utilization
        const cpuMetrics = await this.getMetrics(
          'compute.googleapis.com/instance/cpu/utilization',
          'gce_instance',
          { instance_name: instance.name }
        );
        
        if (cpuMetrics.length > 0) {
          instance.monitoring.cpuUtilization = cpuMetrics[cpuMetrics.length - 1].value * 100; // Convert to percentage
        }

        // Get network metrics
        const networkInMetrics = await this.getMetrics(
          'compute.googleapis.com/instance/network/received_bytes_count',
          'gce_instance',
          { instance_name: instance.name }
        );
        
        if (networkInMetrics.length > 0) {
          instance.monitoring.networkIn = networkInMetrics[networkInMetrics.length - 1].value;
        }

        const networkOutMetrics = await this.getMetrics(
          'compute.googleapis.com/instance/network/sent_bytes_count',
          'gce_instance',
          { instance_name: instance.name }
        );
        
        if (networkOutMetrics.length > 0) {
          instance.monitoring.networkOut = networkOutMetrics[networkOutMetrics.length - 1].value;
        }
      } catch (error) {
        console.warn(`Failed to fetch metrics for instance ${instance.name}:`, error);
      }
    }
    
    return enrichedInstances;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test to verify credentials and connectivity
      // Test connection by listing instances
      await this.compute.list({
        project: this.credentials.projectId,
        zone: 'us-central1-a'
      });
      return true;
    } catch (error) {
      console.error('GCP connection test failed:', error);
      return false;
    }
  }

  async getZones(): Promise<string[]> {
    try {
      // For now, return common zones - this should be replaced with proper zones client
      return ['us-central1-a', 'us-central1-b', 'us-central1-c', 'us-east1-a', 'us-west1-a'];
    } catch (error) {
      console.error('Error fetching GCP zones:', error);
      throw new Error(`Failed to fetch GCP zones: ${error}`);
    }
  }

  async getRegions(): Promise<string[]> {
    try {
      // For now, return common regions - this should be replaced with proper regions client
      return ['us-central1', 'us-east1', 'us-west1', 'europe-west1', 'asia-east1'];
    } catch (error) {
      console.error('Error fetching GCP regions:', error);
      throw new Error(`Failed to fetch GCP regions: ${error}`);
    }
  }

  async getInstancesByZone(zone: string): Promise<GCPInstance[]> {
    try {
      const instances: GCPInstance[] = [];
      
      const [vms] = await this.compute.list({
        project: this.credentials.projectId,
        zone: zone,
        filter: `zone eq .*/${zone}`
      });
      
      for (const vm of vms) {
        const metadata = vm as any; // Type assertion for now
        const vmZone = metadata.zone ? metadata.zone.split('/').pop() : 'unknown';
        const machineType = metadata.machineType ? metadata.machineType.split('/').pop() : 'unknown';
        
        instances.push({
          id: metadata.id?.toString() || '',
          name: metadata.name || '',
          zone: vmZone,
          machineType,
          status: metadata.status || 'unknown',
          creationTimestamp: metadata.creationTimestamp,
          labels: metadata.labels || {},
          monitoring: {}
        });
      }
      
      return instances;
    } catch (error) {
      console.error(`Error fetching GCP instances for zone ${zone}:`, error);
      throw new Error(`Failed to fetch GCP instances for zone ${zone}: ${error}`);
    }
  }

  async getGKEClustersByLocation(location: string): Promise<GKECluster[]> {
    try {
      const clusters: GKECluster[] = [];
      
      const [clusterList] = await this.container.listClusters({
        parent: `projects/${this.credentials.projectId}/locations/${location}`
      });
      
      for (const cluster of clusterList.clusters || []) {
        clusters.push({
          name: cluster.name || '',
          location: cluster.location || '',
          status: cluster.status || 'unknown',
          nodeCount: cluster.currentNodeCount || 0,
          currentMasterVersion: cluster.currentMasterVersion || '',
          endpoint: cluster.endpoint || '',
          labels: cluster.resourceLabels || {}
        });
      }
      
      return clusters;
    } catch (error) {
      console.error(`Error fetching GKE clusters for location ${location}:`, error);
      throw new Error(`Failed to fetch GKE clusters for location ${location}: ${error}`);
    }
  }
}