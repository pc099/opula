import { 
  EC2Client, 
  DescribeInstancesCommand, 
  DescribeInstancesCommandOutput 
} from '@aws-sdk/client-ec2';
import { 
  ECSClient, 
  ListClustersCommand, 
  DescribeServicesCommand,
  ListServicesCommand 
} from '@aws-sdk/client-ecs';
import { 
  LambdaClient, 
  ListFunctionsCommand, 
  GetFunctionCommand 
} from '@aws-sdk/client-lambda';
import { 
  CloudWatchClient, 
  GetMetricStatisticsCommand, 
  ListMetricsCommand 
} from '@aws-sdk/client-cloudwatch';
import { 
  CostExplorerClient, 
  GetCostAndUsageCommand, 
  GetDimensionValuesCommand 
} from '@aws-sdk/client-cost-explorer';
import { fromIni, fromEnv } from '@aws-sdk/credential-providers';

export interface AWSCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  region: string;
  profile?: string;
}

export interface EC2Instance {
  instanceId: string;
  instanceType: string;
  state: string;
  launchTime?: Date;
  tags: Record<string, string>;
  monitoring: {
    cpuUtilization?: number;
    networkIn?: number;
    networkOut?: number;
  };
}

export interface ECSService {
  serviceName: string;
  clusterName: string;
  taskDefinition: string;
  runningCount: number;
  desiredCount: number;
  status: string;
}

export interface LambdaFunction {
  functionName: string;
  runtime: string;
  memorySize: number;
  timeout: number;
  lastModified: string;
  invocations?: number;
  errors?: number;
  duration?: number;
}

export interface CloudWatchMetric {
  metricName: string;
  namespace: string;
  dimensions: Record<string, string>;
  value: number;
  timestamp: Date;
  unit: string;
}

export interface CostData {
  service: string;
  amount: number;
  currency: string;
  period: {
    start: string;
    end: string;
  };
}

export class AWSIntegration {
  private ec2Client: EC2Client;
  private ecsClient: ECSClient;
  private lambdaClient: LambdaClient;
  private cloudWatchClient: CloudWatchClient;
  private costExplorerClient: CostExplorerClient;
  private credentials: AWSCredentials;

  constructor(credentials: AWSCredentials) {
    this.credentials = credentials;
    
    const clientConfig = {
      region: credentials.region,
      credentials: credentials.profile 
        ? fromIni({ profile: credentials.profile })
        : credentials.accessKeyId 
          ? { 
              accessKeyId: credentials.accessKeyId, 
              secretAccessKey: credentials.secretAccessKey! 
            }
          : fromEnv()
    };

    this.ec2Client = new EC2Client(clientConfig);
    this.ecsClient = new ECSClient(clientConfig);
    this.lambdaClient = new LambdaClient(clientConfig);
    this.cloudWatchClient = new CloudWatchClient(clientConfig);
    this.costExplorerClient = new CostExplorerClient(clientConfig);
  }

  async getEC2Instances(): Promise<EC2Instance[]> {
    try {
      const command = new DescribeInstancesCommand({});
      const response: DescribeInstancesCommandOutput = await this.ec2Client.send(command);
      
      const instances: EC2Instance[] = [];
      
      if (response.Reservations) {
        for (const reservation of response.Reservations) {
          if (reservation.Instances) {
            for (const instance of reservation.Instances) {
              const tags: Record<string, string> = {};
              if (instance.Tags) {
                for (const tag of instance.Tags) {
                  if (tag.Key && tag.Value) {
                    tags[tag.Key] = tag.Value;
                  }
                }
              }

              instances.push({
                instanceId: instance.InstanceId || '',
                instanceType: instance.InstanceType || '',
                state: instance.State?.Name || 'unknown',
                launchTime: instance.LaunchTime,
                tags,
                monitoring: {}
              });
            }
          }
        }
      }
      
      return instances;
    } catch (error) {
      console.error('Error fetching EC2 instances:', error);
      throw new Error(`Failed to fetch EC2 instances: ${error}`);
    }
  }  
async getECSServices(): Promise<ECSService[]> {
    try {
      const clustersCommand = new ListClustersCommand({});
      const clustersResponse = await this.ecsClient.send(clustersCommand);
      
      const services: ECSService[] = [];
      
      if (clustersResponse.clusterArns) {
        for (const clusterArn of clustersResponse.clusterArns) {
          const clusterName = clusterArn.split('/').pop() || '';
          
          const servicesCommand = new ListServicesCommand({
            cluster: clusterArn
          });
          const servicesResponse = await this.ecsClient.send(servicesCommand);
          
          if (servicesResponse.serviceArns) {
            const describeCommand = new DescribeServicesCommand({
              cluster: clusterArn,
              services: servicesResponse.serviceArns
            });
            const describeResponse = await this.ecsClient.send(describeCommand);
            
            if (describeResponse.services) {
              for (const service of describeResponse.services) {
                services.push({
                  serviceName: service.serviceName || '',
                  clusterName,
                  taskDefinition: service.taskDefinition || '',
                  runningCount: service.runningCount || 0,
                  desiredCount: service.desiredCount || 0,
                  status: service.status || 'unknown'
                });
              }
            }
          }
        }
      }
      
      return services;
    } catch (error) {
      console.error('Error fetching ECS services:', error);
      throw new Error(`Failed to fetch ECS services: ${error}`);
    }
  }

  async getLambdaFunctions(): Promise<LambdaFunction[]> {
    try {
      const command = new ListFunctionsCommand({});
      const response = await this.lambdaClient.send(command);
      
      const functions: LambdaFunction[] = [];
      
      if (response.Functions) {
        for (const func of response.Functions) {
          functions.push({
            functionName: func.FunctionName || '',
            runtime: func.Runtime || '',
            memorySize: func.MemorySize || 0,
            timeout: func.Timeout || 0,
            lastModified: func.LastModified || ''
          });
        }
      }
      
      return functions;
    } catch (error) {
      console.error('Error fetching Lambda functions:', error);
      throw new Error(`Failed to fetch Lambda functions: ${error}`);
    }
  }

  async getCloudWatchMetrics(
    namespace: string, 
    metricName: string, 
    dimensions: Record<string, string> = {},
    startTime: Date = new Date(Date.now() - 3600000), // 1 hour ago
    endTime: Date = new Date()
  ): Promise<CloudWatchMetric[]> {
    try {
      const dimensionArray = Object.entries(dimensions).map(([name, value]) => ({
        Name: name,
        Value: value
      }));

      const command = new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dimensionArray,
        StartTime: startTime,
        EndTime: endTime,
        Period: 300, // 5 minutes
        Statistics: ['Average', 'Maximum', 'Minimum']
      });

      const response = await this.cloudWatchClient.send(command);
      const metrics: CloudWatchMetric[] = [];

      if (response.Datapoints) {
        for (const datapoint of response.Datapoints) {
          if (datapoint.Average !== undefined && datapoint.Timestamp) {
            metrics.push({
              metricName,
              namespace,
              dimensions,
              value: datapoint.Average,
              timestamp: datapoint.Timestamp,
              unit: datapoint.Unit || ''
            });
          }
        }
      }

      return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      console.error('Error fetching CloudWatch metrics:', error);
      throw new Error(`Failed to fetch CloudWatch metrics: ${error}`);
    }
  }

  async getCostAndUsage(
    startDate: string,
    endDate: string,
    granularity: 'DAILY' | 'MONTHLY' = 'DAILY'
  ): Promise<CostData[]> {
    try {
      const command = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate,
          End: endDate
        },
        Granularity: granularity,
        Metrics: ['BlendedCost', 'UsageQuantity'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE'
          }
        ]
      });

      const response = await this.costExplorerClient.send(command);
      const costData: CostData[] = [];

      if (response.ResultsByTime) {
        for (const result of response.ResultsByTime) {
          if (result.Groups) {
            for (const group of result.Groups) {
              const service = group.Keys?.[0] || 'Unknown';
              const amount = parseFloat(group.Metrics?.BlendedCost?.Amount || '0');
              const currency = group.Metrics?.BlendedCost?.Unit || 'USD';

              costData.push({
                service,
                amount,
                currency,
                period: {
                  start: result.TimePeriod?.Start || startDate,
                  end: result.TimePeriod?.End || endDate
                }
              });
            }
          }
        }
      }

      return costData;
    } catch (error) {
      console.error('Error fetching cost data:', error);
      throw new Error(`Failed to fetch cost data: ${error}`);
    }
  }

  async enrichEC2InstancesWithMetrics(instances: EC2Instance[]): Promise<EC2Instance[]> {
    const enrichedInstances = [...instances];
    
    for (const instance of enrichedInstances) {
      try {
        // Get CPU utilization
        const cpuMetrics = await this.getCloudWatchMetrics(
          'AWS/EC2',
          'CPUUtilization',
          { InstanceId: instance.instanceId }
        );
        
        if (cpuMetrics.length > 0) {
          instance.monitoring.cpuUtilization = cpuMetrics[cpuMetrics.length - 1].value;
        }

        // Get network metrics
        const networkInMetrics = await this.getCloudWatchMetrics(
          'AWS/EC2',
          'NetworkIn',
          { InstanceId: instance.instanceId }
        );
        
        if (networkInMetrics.length > 0) {
          instance.monitoring.networkIn = networkInMetrics[networkInMetrics.length - 1].value;
        }

        const networkOutMetrics = await this.getCloudWatchMetrics(
          'AWS/EC2',
          'NetworkOut',
          { InstanceId: instance.instanceId }
        );
        
        if (networkOutMetrics.length > 0) {
          instance.monitoring.networkOut = networkOutMetrics[networkOutMetrics.length - 1].value;
        }
      } catch (error) {
        console.warn(`Failed to fetch metrics for instance ${instance.instanceId}:`, error);
      }
    }
    
    return enrichedInstances;
  }

  async enrichLambdaFunctionsWithMetrics(functions: LambdaFunction[]): Promise<LambdaFunction[]> {
    const enrichedFunctions = [...functions];
    
    for (const func of enrichedFunctions) {
      try {
        // Get invocation metrics
        const invocationMetrics = await this.getCloudWatchMetrics(
          'AWS/Lambda',
          'Invocations',
          { FunctionName: func.functionName }
        );
        
        if (invocationMetrics.length > 0) {
          func.invocations = invocationMetrics.reduce((sum, metric) => sum + metric.value, 0);
        }

        // Get error metrics
        const errorMetrics = await this.getCloudWatchMetrics(
          'AWS/Lambda',
          'Errors',
          { FunctionName: func.functionName }
        );
        
        if (errorMetrics.length > 0) {
          func.errors = errorMetrics.reduce((sum, metric) => sum + metric.value, 0);
        }

        // Get duration metrics
        const durationMetrics = await this.getCloudWatchMetrics(
          'AWS/Lambda',
          'Duration',
          { FunctionName: func.functionName }
        );
        
        if (durationMetrics.length > 0) {
          func.duration = durationMetrics[durationMetrics.length - 1].value;
        }
      } catch (error) {
        console.warn(`Failed to fetch metrics for function ${func.functionName}:`, error);
      }
    }
    
    return enrichedFunctions;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test to verify credentials and connectivity
      const command = new ListMetricsCommand({});
      await this.cloudWatchClient.send(command);
      return true;
    } catch (error) {
      console.error('AWS connection test failed:', error);
      return false;
    }
  }
}