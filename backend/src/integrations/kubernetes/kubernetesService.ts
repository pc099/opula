import { KubernetesIntegration } from './kubernetesIntegration';
import { HelmIntegration } from './helmIntegration';
import {
  KubernetesConfig,
  KubernetesCluster,
  KubernetesPod,
  KubernetesService as K8sService,
  KubernetesDeployment,
  KubernetesNode,
  KubernetesCustomResource,
  KubernetesCustomResourceDefinition,
  KubernetesMetrics,
  HelmChart,
  HelmRepository
} from './types';

export class KubernetesService {
  private k8sIntegration: KubernetesIntegration;
  private helmIntegration: HelmIntegration;
  private config: KubernetesConfig;

  constructor(config: KubernetesConfig = {}) {
    this.config = config;
    this.k8sIntegration = new KubernetesIntegration(config);
    this.helmIntegration = new HelmIntegration(
      'helm',
      config.kubeconfig,
      config.context
    );
  }

  // Cluster Discovery and Management

  /**
   * Discover available Kubernetes clusters
   */
  async discoverClusters(): Promise<KubernetesCluster[]> {
    return await this.k8sIntegration.discoverClusters();
  }

  /**
   * Get cluster metrics and health status
   */
  async getClusterMetrics(): Promise<KubernetesMetrics> {
    return await this.k8sIntegration.getClusterMetrics();
  }

  /**
   * Get cluster nodes
   */
  async getNodes(): Promise<KubernetesNode[]> {
    return await this.k8sIntegration.listNodes();
  }

  // Pod Management

  /**
   * List pods in a namespace or across all namespaces
   */
  async listPods(namespace?: string): Promise<KubernetesPod[]> {
    return await this.k8sIntegration.listPods(namespace);
  }

  /**
   * Get a specific pod
   */
  async getPod(name: string, namespace: string): Promise<KubernetesPod> {
    return await this.k8sIntegration.getPod(name, namespace);
  }

  /**
   * Delete a pod
   */
  async deletePod(name: string, namespace: string): Promise<void> {
    await this.k8sIntegration.deletePod(name, namespace);
  }

  /**
   * Watch for pod changes
   */
  async watchPods(
    callback: (type: string, pod: KubernetesPod) => void,
    namespace?: string
  ): Promise<() => void> {
    return await this.k8sIntegration.watchPods(callback, namespace);
  }

  // Service Management

  /**
   * List services in a namespace or across all namespaces
   */
  async listServices(namespace?: string): Promise<K8sService[]> {
    return await this.k8sIntegration.listServices(namespace);
  }

  /**
   * Get a specific service
   */
  async getService(name: string, namespace: string): Promise<K8sService> {
    return await this.k8sIntegration.getService(name, namespace);
  }

  // Deployment Management

  /**
   * List deployments in a namespace or across all namespaces
   */
  async listDeployments(namespace?: string): Promise<KubernetesDeployment[]> {
    return await this.k8sIntegration.listDeployments(namespace);
  }

  /**
   * Get a specific deployment
   */
  async getDeployment(name: string, namespace: string): Promise<KubernetesDeployment> {
    return await this.k8sIntegration.getDeployment(name, namespace);
  }

  /**
   * Scale a deployment
   */
  async scaleDeployment(name: string, namespace: string, replicas: number): Promise<KubernetesDeployment> {
    return await this.k8sIntegration.scaleDeployment(name, namespace, replicas);
  }

  // Custom Resource Management

  /**
   * List Custom Resource Definitions
   */
  async listCustomResourceDefinitions(): Promise<KubernetesCustomResourceDefinition[]> {
    return await this.k8sIntegration.listCustomResourceDefinitions();
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
    return await this.k8sIntegration.listCustomResources(group, version, plural, namespace);
  }

  // Helm Chart Management

  /**
   * List installed Helm releases
   */
  async listHelmReleases(namespace?: string): Promise<HelmChart[]> {
    return await this.helmIntegration.listReleases(namespace);
  }

  /**
   * Get details of a specific Helm release
   */
  async getHelmRelease(name: string, namespace?: string): Promise<HelmChart> {
    return await this.helmIntegration.getRelease(name, namespace);
  }

  /**
   * Install a Helm chart
   */
  async installHelmChart(
    releaseName: string,
    chartName: string,
    options: {
      namespace?: string;
      createNamespace?: boolean;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
      wait?: boolean;
      timeout?: string;
    } = {}
  ): Promise<HelmChart> {
    return await this.helmIntegration.installChart(releaseName, chartName, options);
  }

  /**
   * Upgrade a Helm release
   */
  async upgradeHelmRelease(
    releaseName: string,
    chartName: string,
    options: {
      namespace?: string;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
      wait?: boolean;
      timeout?: string;
      resetValues?: boolean;
      reuseValues?: boolean;
    } = {}
  ): Promise<HelmChart> {
    return await this.helmIntegration.upgradeRelease(releaseName, chartName, options);
  }

  /**
   * Uninstall a Helm release
   */
  async uninstallHelmRelease(releaseName: string, namespace?: string): Promise<void> {
    await this.helmIntegration.uninstallRelease(releaseName, namespace);
  }

  /**
   * Rollback a Helm release
   */
  async rollbackHelmRelease(
    releaseName: string,
    revision?: number,
    options: {
      namespace?: string;
      wait?: boolean;
      timeout?: string;
    } = {}
  ): Promise<HelmChart> {
    return await this.helmIntegration.rollbackRelease(releaseName, revision, options);
  }

  /**
   * Get Helm release history
   */
  async getHelmReleaseHistory(releaseName: string, namespace?: string): Promise<any[]> {
    return await this.helmIntegration.getReleaseHistory(releaseName, namespace);
  }

  // Helm Repository Management

  /**
   * Add a Helm repository
   */
  async addHelmRepository(repo: HelmRepository): Promise<void> {
    await this.helmIntegration.addRepository(repo);
  }

  /**
   * Update Helm repositories
   */
  async updateHelmRepositories(): Promise<void> {
    await this.helmIntegration.updateRepositories();
  }

  /**
   * List Helm repositories
   */
  async listHelmRepositories(): Promise<HelmRepository[]> {
    return await this.helmIntegration.listRepositories();
  }

  /**
   * Search for Helm charts
   */
  async searchHelmCharts(keyword: string, options: { version?: string; versions?: boolean } = {}): Promise<any[]> {
    return await this.helmIntegration.searchCharts(keyword, options);
  }

  /**
   * Get Helm chart values
   */
  async getHelmChartValues(chartName: string, version?: string): Promise<Record<string, any>> {
    return await this.helmIntegration.getChartValues(chartName, version);
  }

  /**
   * Validate a Helm chart
   */
  async validateHelmChart(chartPath: string): Promise<{ valid: boolean; errors: string[] }> {
    return await this.helmIntegration.validateChart(chartPath);
  }

  /**
   * Template a Helm chart (dry-run)
   */
  async templateHelmChart(
    releaseName: string,
    chartName: string,
    options: {
      namespace?: string;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
    } = {}
  ): Promise<string> {
    return await this.helmIntegration.templateChart(releaseName, chartName, options);
  }

  // Advanced Operations

  /**
   * Perform automated scaling based on metrics
   */
  async performAutomatedScaling(options: {
    targetCpuUtilization?: number;
    targetMemoryUtilization?: number;
    minReplicas?: number;
    maxReplicas?: number;
    namespace?: string;
  } = {}): Promise<{
    scaledDeployments: Array<{
      name: string;
      namespace: string;
      oldReplicas: number;
      newReplicas: number;
      reason: string;
    }>;
    recommendations: string[];
  }> {
    const deployments = await this.listDeployments(options.namespace);
    const scaledDeployments: Array<{
      name: string;
      namespace: string;
      oldReplicas: number;
      newReplicas: number;
      reason: string;
    }> = [];
    const recommendations: string[] = [];

    // This is a simplified scaling algorithm
    // In a real implementation, this would use metrics from Prometheus or similar
    for (const deployment of deployments) {
      const currentReplicas = deployment.spec.replicas || 1;
      const readyReplicas = deployment.status?.readyReplicas || 0;
      const availableReplicas = deployment.status?.availableReplicas || 0;

      // Simple scaling logic based on replica availability
      if (readyReplicas < currentReplicas && availableReplicas === 0) {
        // Scale up if no replicas are available
        const newReplicas = Math.min(currentReplicas + 1, options.maxReplicas || 10);
        if (newReplicas > currentReplicas) {
          await this.scaleDeployment(deployment.metadata.name, deployment.metadata.namespace, newReplicas);
          scaledDeployments.push({
            name: deployment.metadata.name,
            namespace: deployment.metadata.namespace,
            oldReplicas: currentReplicas,
            newReplicas,
            reason: 'No available replicas detected'
          });
        }
      } else if (readyReplicas > currentReplicas * 0.8 && currentReplicas > (options.minReplicas || 1)) {
        // Scale down if we have excess capacity
        const newReplicas = Math.max(currentReplicas - 1, options.minReplicas || 1);
        if (newReplicas < currentReplicas) {
          recommendations.push(
            `Consider scaling down ${deployment.metadata.name} from ${currentReplicas} to ${newReplicas} replicas`
          );
        }
      }
    }

    return { scaledDeployments, recommendations };
  }

  /**
   * Analyze resource utilization and provide optimization recommendations
   */
  async analyzeResourceUtilization(): Promise<{
    underutilizedResources: Array<{
      type: 'pod' | 'deployment' | 'service';
      name: string;
      namespace: string;
      reason: string;
      recommendation: string;
    }>;
    overutilizedResources: Array<{
      type: 'pod' | 'deployment' | 'service';
      name: string;
      namespace: string;
      reason: string;
      recommendation: string;
    }>;
    costOptimizations: string[];
  }> {
    const [pods, deployments, services] = await Promise.all([
      this.listPods(),
      this.listDeployments(),
      this.listServices()
    ]);

    const underutilizedResources: any[] = [];
    const overutilizedResources: any[] = [];
    const costOptimizations: string[] = [];

    // Analyze pods
    const failedPods = pods.filter(p => p.status.phase === 'Failed');
    const pendingPods = pods.filter(p => p.status.phase === 'Pending');

    failedPods.forEach(pod => {
      underutilizedResources.push({
        type: 'pod',
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        reason: 'Pod is in Failed state',
        recommendation: 'Investigate and restart or delete the pod'
      });
    });

    pendingPods.forEach(pod => {
      overutilizedResources.push({
        type: 'pod',
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
        reason: 'Pod is stuck in Pending state',
        recommendation: 'Check resource constraints and node capacity'
      });
    });

    // Analyze deployments
    deployments.forEach(deployment => {
      const replicas = deployment.spec.replicas || 1;
      const readyReplicas = deployment.status?.readyReplicas || 0;
      const availableReplicas = deployment.status?.availableReplicas || 0;

      if (readyReplicas === 0 && replicas > 0) {
        underutilizedResources.push({
          type: 'deployment',
          name: deployment.metadata.name,
          namespace: deployment.metadata.namespace,
          reason: 'No ready replicas available',
          recommendation: 'Check deployment configuration and resource requirements'
        });
      }

      if (replicas > 5 && availableReplicas === replicas) {
        costOptimizations.push(
          `Deployment ${deployment.metadata.name} has ${replicas} replicas - consider if all are needed`
        );
      }
    });

    // Analyze services
    const loadBalancerServices = services.filter(s => s.spec.type === 'LoadBalancer');
    if (loadBalancerServices.length > 3) {
      costOptimizations.push(
        `${loadBalancerServices.length} LoadBalancer services detected - consider using Ingress for cost optimization`
      );
    }

    return {
      underutilizedResources,
      overutilizedResources,
      costOptimizations
    };
  }

  /**
   * Health check for the Kubernetes cluster
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      component: string;
      message: string;
      recommendation?: string;
    }>;
    summary: {
      totalNodes: number;
      healthyNodes: number;
      totalPods: number;
      runningPods: number;
      failedPods: number;
    };
  }> {
    try {
      const [nodes, pods, metrics] = await Promise.all([
        this.getNodes(),
        this.listPods(),
        this.getClusterMetrics()
      ]);

      const issues: any[] = [];
      let healthy = true;

      // Check node health
      const unhealthyNodes = nodes.filter(node => 
        !node.status.conditions.some(c => c.type === 'Ready' && c.status === 'True')
      );

      unhealthyNodes.forEach(node => {
        issues.push({
          severity: 'high' as const,
          component: 'node',
          message: `Node ${node.metadata.name} is not ready`,
          recommendation: 'Check node status and system resources'
        });
        healthy = false;
      });

      // Check for failed pods
      const failedPods = pods.filter(p => p.status.phase === 'Failed');
      if (failedPods.length > 0) {
        issues.push({
          severity: 'medium' as const,
          component: 'pods',
          message: `${failedPods.length} pods are in Failed state`,
          recommendation: 'Investigate failed pods and restart if necessary'
        });
      }

      // Check for pending pods
      const pendingPods = pods.filter(p => p.status.phase === 'Pending');
      if (pendingPods.length > 5) {
        issues.push({
          severity: 'high' as const,
          component: 'pods',
          message: `${pendingPods.length} pods are stuck in Pending state`,
          recommendation: 'Check resource availability and scheduling constraints'
        });
        healthy = false;
      }

      // Check resource utilization
      if (metrics.nodes.notReady > 0) {
        issues.push({
          severity: 'critical' as const,
          component: 'cluster',
          message: `${metrics.nodes.notReady} nodes are not ready`,
          recommendation: 'Immediate attention required for cluster stability'
        });
        healthy = false;
      }

      return {
        healthy,
        issues,
        summary: {
          totalNodes: nodes.length,
          healthyNodes: nodes.length - unhealthyNodes.length,
          totalPods: pods.length,
          runningPods: pods.filter(p => p.status.phase === 'Running').length,
          failedPods: failedPods.length
        }
      };
    } catch (error) {
      return {
        healthy: false,
        issues: [{
          severity: 'critical',
          component: 'cluster',
          message: `Failed to perform health check: ${error.message}`,
          recommendation: 'Check cluster connectivity and authentication'
        }],
        summary: {
          totalNodes: 0,
          healthyNodes: 0,
          totalPods: 0,
          runningPods: 0,
          failedPods: 0
        }
      };
    }
  }
}