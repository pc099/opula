import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  KubernetesConfig,
  KubernetesCluster,
  KubernetesPod,
  KubernetesService,
  KubernetesDeployment,
  KubernetesNode,
  KubernetesCustomResource,
  KubernetesCustomResourceDefinition,
  KubernetesMetrics
} from './types';

export class KubernetesIntegration {
  private kc: k8s.KubeConfig;
  private coreV1Api: k8s.CoreV1Api;
  private appsV1Api: k8s.AppsV1Api;
  private apiExtensionsV1Api: k8s.ApiextensionsV1Api;
  private customObjectsApi: k8s.CustomObjectsApi;
  private metricsApi: k8s.Metrics;
  private config: KubernetesConfig;

  constructor(config: KubernetesConfig = {}) {
    this.config = config;
    this.kc = new k8s.KubeConfig();
    this.initializeKubeConfig();
    
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    this.apiExtensionsV1Api = this.kc.makeApiClient(k8s.ApiextensionsV1Api);
    this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.metricsApi = new k8s.Metrics(this.kc);
  }

  private initializeKubeConfig(): void {
    if (this.config.kubeconfig) {
      // Load from specific kubeconfig file
      this.kc.loadFromFile(this.config.kubeconfig);
    } else if (process.env.KUBECONFIG) {
      // Load from KUBECONFIG environment variable
      this.kc.loadFromFile(process.env.KUBECONFIG);
    } else {
      try {
        // Try to load from default location
        this.kc.loadFromDefault();
      } catch (error) {
        // If running in cluster, load from service account
        try {
          this.kc.loadFromCluster();
        } catch (clusterError) {
          throw new Error(`Failed to load Kubernetes configuration: ${error.message}`);
        }
      }
    }

    // Set context if specified
    if (this.config.context) {
      this.kc.setCurrentContext(this.config.context);
    }
  }

  /**
   * Discover available Kubernetes clusters
   */
  async discoverClusters(): Promise<KubernetesCluster[]> {
    const clusters: KubernetesCluster[] = [];
    const contexts = this.kc.getContexts();

    for (const context of contexts) {
      try {
        // Temporarily switch to this context
        const originalContext = this.kc.getCurrentContext();
        this.kc.setCurrentContext(context.name);
        
        const tempCoreApi = this.kc.makeApiClient(k8s.CoreV1Api);
        
        // Get cluster info
        // Test connection by listing namespaces instead
        await tempCoreApi.listNamespace();
        const nodesResponse = await tempCoreApi.listNode();
        const namespacesResponse = await tempCoreApi.listNamespace();

        clusters.push({
          name: context.name,
          server: context.cluster,
          version: 'v1.0.0', // Placeholder since we removed versionResponse
          status: 'healthy',
          nodeCount: nodesResponse.body.items.length,
          namespaces: namespacesResponse.body.items.map(ns => ns.metadata?.name || '')
        });

        // Restore original context
        this.kc.setCurrentContext(originalContext);
      } catch (error) {
        clusters.push({
          name: context.name,
          server: context.cluster,
          version: 'unknown',
          status: 'unhealthy',
          nodeCount: 0,
          namespaces: []
        });
      }
    }

    return clusters;
  }

  /**
   * List all pods in a namespace or cluster
   */
  async listPods(namespace?: string): Promise<KubernetesPod[]> {
    try {
      const response = namespace 
        ? await this.coreV1Api.listNamespacedPod(namespace)
        : await this.coreV1Api.listPodForAllNamespaces();

      return response.body.items.map(this.transformPod);
    } catch (error) {
      throw new Error(`Failed to list pods: ${error.message}`);
    }
  }

  /**
   * Get a specific pod
   */
  async getPod(name: string, namespace: string): Promise<KubernetesPod> {
    try {
      const response = await this.coreV1Api.readNamespacedPod(name, namespace);
      return this.transformPod(response.body);
    } catch (error) {
      throw new Error(`Failed to get pod ${name}: ${error.message}`);
    }
  }

  /**
   * Delete a pod
   */
  async deletePod(name: string, namespace: string): Promise<void> {
    try {
      await this.coreV1Api.deleteNamespacedPod(name, namespace);
    } catch (error) {
      throw new Error(`Failed to delete pod ${name}: ${error.message}`);
    }
  }

  /**
   * List all services in a namespace or cluster
   */
  async listServices(namespace?: string): Promise<KubernetesService[]> {
    try {
      const response = namespace
        ? await this.coreV1Api.listNamespacedService(namespace)
        : await this.coreV1Api.listServiceForAllNamespaces();

      return response.body.items.map(this.transformService);
    } catch (error) {
      throw new Error(`Failed to list services: ${error.message}`);
    }
  }

  /**
   * Get a specific service
   */
  async getService(name: string, namespace: string): Promise<KubernetesService> {
    try {
      const response = await this.coreV1Api.readNamespacedService(name, namespace);
      return this.transformService(response.body);
    } catch (error) {
      throw new Error(`Failed to get service ${name}: ${error.message}`);
    }
  }

  /**
   * List all deployments in a namespace or cluster
   */
  async listDeployments(namespace?: string): Promise<KubernetesDeployment[]> {
    try {
      const response = namespace
        ? await this.appsV1Api.listNamespacedDeployment(namespace)
        : await this.appsV1Api.listDeploymentForAllNamespaces();

      return response.body.items.map(this.transformDeployment);
    } catch (error) {
      throw new Error(`Failed to list deployments: ${error.message}`);
    }
  }

  /**
   * Get a specific deployment
   */
  async getDeployment(name: string, namespace: string): Promise<KubernetesDeployment> {
    try {
      const response = await this.appsV1Api.readNamespacedDeployment(name, namespace);
      return this.transformDeployment(response.body);
    } catch (error) {
      throw new Error(`Failed to get deployment ${name}: ${error.message}`);
    }
  }

  /**
   * Scale a deployment
   */
  async scaleDeployment(name: string, namespace: string, replicas: number): Promise<KubernetesDeployment> {
    try {
      const patch = {
        spec: {
          replicas: replicas
        }
      };

      const response = await this.appsV1Api.patchNamespacedDeployment(
        name,
        namespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: {
            'Content-Type': 'application/merge-patch+json'
          }
        }
      );

      return this.transformDeployment(response.body);
    } catch (error) {
      throw new Error(`Failed to scale deployment ${name}: ${error.message}`);
    }
  }

  /**
   * List all nodes in the cluster
   */
  async listNodes(): Promise<KubernetesNode[]> {
    try {
      const response = await this.coreV1Api.listNode();
      return response.body.items.map(this.transformNode);
    } catch (error) {
      throw new Error(`Failed to list nodes: ${error.message}`);
    }
  }

  /**
   * Get cluster metrics
   */
  async getClusterMetrics(): Promise<KubernetesMetrics> {
    try {
      const [pods, nodes, services, deployments] = await Promise.all([
        this.listPods(),
        this.listNodes(),
        this.listServices(),
        this.listDeployments()
      ]);

      const podMetrics = {
        total: pods.length,
        running: pods.filter(p => p.status.phase === 'Running').length,
        pending: pods.filter(p => p.status.phase === 'Pending').length,
        failed: pods.filter(p => p.status.phase === 'Failed').length
      };

      const nodeMetrics = {
        total: nodes.length,
        ready: nodes.filter(n => 
          n.status.conditions.some(c => c.type === 'Ready' && c.status === 'True')
        ).length,
        notReady: nodes.filter(n => 
          !n.status.conditions.some(c => c.type === 'Ready' && c.status === 'True')
        ).length
      };

      const serviceMetrics = {
        total: services.length,
        loadBalancers: services.filter(s => s.spec.type === 'LoadBalancer').length,
        clusterIPs: services.filter(s => s.spec.type === 'ClusterIP').length
      };

      const deploymentMetrics = {
        total: deployments.length,
        available: deployments.filter(d => 
          (d.status?.availableReplicas || 0) === (d.spec.replicas || 0)
        ).length,
        unavailable: deployments.filter(d => 
          (d.status?.availableReplicas || 0) < (d.spec.replicas || 0)
        ).length
      };

      // Calculate resource usage
      const totalCapacity = nodes.reduce((acc, node) => {
        const cpu = this.parseResourceQuantity(node.status.capacity.cpu || '0');
        const memory = this.parseResourceQuantity(node.status.capacity.memory || '0');
        return {
          cpu: acc.cpu + cpu,
          memory: acc.memory + memory
        };
      }, { cpu: 0, memory: 0 });

      const totalAllocatable = nodes.reduce((acc, node) => {
        const cpu = this.parseResourceQuantity(node.status.allocatable.cpu || '0');
        const memory = this.parseResourceQuantity(node.status.allocatable.memory || '0');
        return {
          cpu: acc.cpu + cpu,
          memory: acc.memory + memory
        };
      }, { cpu: 0, memory: 0 });

      return {
        pods: podMetrics,
        nodes: nodeMetrics,
        services: serviceMetrics,
        deployments: deploymentMetrics,
        resourceUsage: {
          cpu: {
            requested: '0', // Would need metrics server for actual usage
            used: '0',
            capacity: `${totalCapacity.cpu}m`
          },
          memory: {
            requested: '0',
            used: '0',
            capacity: `${totalCapacity.memory}Mi`
          }
        }
      };
    } catch (error) {
      throw new Error(`Failed to get cluster metrics: ${error.message}`);
    }
  }

  /**
   * List Custom Resource Definitions
   */
  async listCustomResourceDefinitions(): Promise<KubernetesCustomResourceDefinition[]> {
    try {
      const response = await this.apiExtensionsV1Api.listCustomResourceDefinition();
      return response.body.items.map(crd => ({
        metadata: {
          name: crd.metadata?.name || ''
        },
        spec: {
          group: crd.spec.group,
          versions: crd.spec.versions.map(v => ({
            name: v.name,
            served: v.served,
            storage: v.storage,
            schema: v.schema?.openAPIV3Schema ? {
              openAPIV3Schema: v.schema.openAPIV3Schema as Record<string, any>
            } : undefined
          })),
          scope: crd.spec.scope,
          names: {
            plural: crd.spec.names.plural,
            singular: crd.spec.names.singular,
            kind: crd.spec.names.kind,
            shortNames: crd.spec.names.shortNames || []
          }
        }
      })) as any;
    } catch (error) {
      throw new Error(`Failed to list CRDs: ${error.message}`);
    }
  }

  /**
   * List custom resources of a specific type
   */
  async listCustomResources(
    group: string,
    version: string,
    plural: string,
    namespace?: string
  ): Promise<KubernetesCustomResource[]> {
    try {
      const response = namespace
        ? await this.customObjectsApi.listNamespacedCustomObject(group, version, namespace, plural)
        : await this.customObjectsApi.listClusterCustomObject(group, version, plural);

      const items = (response.body as any).items || [];
      return items.map((item: any) => ({
        apiVersion: item.apiVersion,
        kind: item.kind,
        metadata: {
          name: item.metadata?.name || '',
          namespace: item.metadata?.namespace,
          labels: item.metadata?.labels,
          annotations: item.metadata?.annotations
        },
        spec: item.spec,
        status: item.status
      }));
    } catch (error) {
      throw new Error(`Failed to list custom resources: ${error.message}`);
    }
  }

  /**
   * Watch for resource changes
   */
  async watchPods(callback: (type: string, pod: KubernetesPod) => void, namespace?: string): Promise<() => void> {
    const watch = new k8s.Watch(this.kc);
    
    const watchPath = namespace 
      ? `/api/v1/namespaces/${namespace}/pods`
      : '/api/v1/pods';

    const req = await watch.watch(
      watchPath,
      {},
      (type, apiObj) => {
        const pod = this.transformPod(apiObj);
        callback(type, pod);
      },
      (err) => {
        if (err) {
          console.error('Watch error:', err);
        }
      }
    );

    return () => {
      if (req) {
        req.destroy();
      }
    };
  }

  private transformPod(pod: k8s.V1Pod): KubernetesPod {
    return {
      metadata: {
        name: pod.metadata?.name || '',
        namespace: pod.metadata?.namespace || '',
        labels: pod.metadata?.labels,
        annotations: pod.metadata?.annotations,
        creationTimestamp: pod.metadata?.creationTimestamp?.toISOString() || '',
        uid: pod.metadata?.uid || ''
      },
      spec: {
        containers: pod.spec?.containers?.map(c => ({
          name: c.name,
          image: c.image,
          ports: c.ports?.map(p => ({
            name: p.name,
            containerPort: p.containerPort,
            protocol: p.protocol
          })),
          env: c.env?.map(e => ({
            name: e.name,
            value: e.value,
            valueFrom: e.valueFrom ? {
              secretKeyRef: e.valueFrom.secretKeyRef ? {
                name: e.valueFrom.secretKeyRef.name || '',
                key: e.valueFrom.secretKeyRef.key
              } : undefined,
              configMapKeyRef: e.valueFrom.configMapKeyRef ? {
                name: e.valueFrom.configMapKeyRef.name || '',
                key: e.valueFrom.configMapKeyRef.key
              } : undefined
            } : undefined
          })),
          resources: c.resources ? {
            requests: c.resources.requests,
            limits: c.resources.limits
          } : undefined
        })) || [],
        restartPolicy: pod.spec?.restartPolicy || '',
        nodeName: pod.spec?.nodeName
      },
      status: {
        phase: pod.status?.phase as any || 'Unknown',
        conditions: pod.status?.conditions?.map(c => ({
          type: c.type,
          status: c.status as any,
          lastTransitionTime: c.lastTransitionTime?.toISOString() || '',
          reason: c.reason,
          message: c.message
        })),
        containerStatuses: pod.status?.containerStatuses?.map(cs => ({
          name: cs.name,
          ready: cs.ready,
          restartCount: cs.restartCount,
          image: cs.image,
          imageID: cs.imageID,
          state: cs.state ? {
            running: cs.state.running ? {
              startedAt: cs.state.running.startedAt?.toISOString() || ''
            } : undefined,
            waiting: cs.state.waiting ? {
              reason: cs.state.waiting.reason || '',
              message: cs.state.waiting.message
            } : undefined,
            terminated: cs.state.terminated ? {
              exitCode: cs.state.terminated.exitCode,
              reason: cs.state.terminated.reason || '',
              startedAt: cs.state.terminated.startedAt?.toISOString() || '',
              finishedAt: cs.state.terminated.finishedAt?.toISOString() || ''
            } : undefined
          } : undefined
        })),
        podIP: pod.status?.podIP,
        hostIP: pod.status?.hostIP,
        startTime: pod.status?.startTime?.toISOString()
      }
    };
  }

  private transformService(service: k8s.V1Service): KubernetesService {
    return {
      metadata: {
        name: service.metadata?.name || '',
        namespace: service.metadata?.namespace || '',
        labels: service.metadata?.labels,
        annotations: service.metadata?.annotations
      },
      spec: {
        selector: service.spec?.selector,
        ports: service.spec?.ports?.map(p => ({
          name: p.name,
          port: p.port,
          targetPort: p.targetPort,
          protocol: p.protocol,
          nodePort: p.nodePort
        })) || [],
        type: service.spec?.type as any || 'ClusterIP',
        clusterIP: service.spec?.clusterIP,
        externalIPs: service.spec?.externalIPs
      },
      status: service.status ? {
        loadBalancer: service.status.loadBalancer ? {
          ingress: service.status.loadBalancer.ingress?.map(i => ({
            ip: i.ip,
            hostname: i.hostname
          }))
        } : undefined
      } : undefined
    };
  }

  private transformDeployment(deployment: k8s.V1Deployment): KubernetesDeployment {
    return {
      metadata: {
        name: deployment.metadata?.name || '',
        namespace: deployment.metadata?.namespace || '',
        labels: deployment.metadata?.labels,
        annotations: deployment.metadata?.annotations
      },
      spec: {
        replicas: deployment.spec?.replicas,
        selector: {
          matchLabels: deployment.spec?.selector?.matchLabels || {}
        },
        template: {
          metadata: {
            labels: deployment.spec?.template?.metadata?.labels || {}
          },
          spec: {
            containers: deployment.spec?.template?.spec?.containers?.map(c => ({
              name: c.name,
              image: c.image,
              ports: c.ports?.map(p => ({
                name: p.name,
                containerPort: p.containerPort,
                protocol: p.protocol
              })),
              env: c.env?.map(e => ({
                name: e.name,
                value: e.value
              })),
              resources: c.resources ? {
                requests: c.resources.requests,
                limits: c.resources.limits
              } : undefined
            })) || []
          }
        },
        strategy: deployment.spec?.strategy ? {
          type: deployment.spec.strategy.type as any || 'RollingUpdate',
          rollingUpdate: deployment.spec.strategy.rollingUpdate ? {
            maxUnavailable: deployment.spec.strategy.rollingUpdate.maxUnavailable,
            maxSurge: deployment.spec.strategy.rollingUpdate.maxSurge
          } : undefined
        } : undefined
      },
      status: deployment.status ? {
        replicas: deployment.status.replicas,
        readyReplicas: deployment.status.readyReplicas,
        availableReplicas: deployment.status.availableReplicas,
        unavailableReplicas: deployment.status.unavailableReplicas,
        conditions: deployment.status.conditions?.map(c => ({
          type: c.type,
          status: c.status as any,
          reason: c.reason,
          message: c.message
        }))
      } : undefined
    };
  }

  private transformNode(node: k8s.V1Node): KubernetesNode {
    return {
      metadata: {
        name: node.metadata?.name || '',
        labels: node.metadata?.labels,
        annotations: node.metadata?.annotations
      },
      spec: {
        podCIDR: node.spec?.podCIDR,
        unschedulable: node.spec?.unschedulable
      },
      status: {
        conditions: node.status?.conditions?.map(c => ({
          type: c.type,
          status: c.status as any,
          reason: c.reason,
          message: c.message
        })) || [],
        addresses: node.status?.addresses?.map(a => ({
          type: a.type as any,
          address: a.address
        })) || [],
        capacity: node.status?.capacity || {},
        allocatable: node.status?.allocatable || {},
        nodeInfo: {
          machineID: node.status?.nodeInfo?.machineID || '',
          systemUUID: node.status?.nodeInfo?.systemUUID || '',
          bootID: node.status?.nodeInfo?.bootID || '',
          kernelVersion: node.status?.nodeInfo?.kernelVersion || '',
          osImage: node.status?.nodeInfo?.osImage || '',
          containerRuntimeVersion: node.status?.nodeInfo?.containerRuntimeVersion || '',
          kubeletVersion: node.status?.nodeInfo?.kubeletVersion || '',
          kubeProxyVersion: node.status?.nodeInfo?.kubeProxyVersion || '',
          operatingSystem: node.status?.nodeInfo?.operatingSystem || '',
          architecture: node.status?.nodeInfo?.architecture || ''
        }
      }
    };
  }

  private parseResourceQuantity(quantity: string): number {
    // Simple parser for Kubernetes resource quantities
    const match = quantity.match(/^(\d+(?:\.\d+)?)(.*)?$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2] || '';

    switch (unit.toLowerCase()) {
      case 'ki': return value * 1024;
      case 'mi': return value * 1024 * 1024;
      case 'gi': return value * 1024 * 1024 * 1024;
      case 'ti': return value * 1024 * 1024 * 1024 * 1024;
      case 'k': return value * 1000;
      case 'm': return value * 1000 * 1000;
      case 'g': return value * 1000 * 1000 * 1000;
      case 't': return value * 1000 * 1000 * 1000 * 1000;
      case 'n': return value / 1000000000;
      case 'u': return value / 1000000;
      case 'mm': return value / 1000;
      default: return value;
    }
  }
}