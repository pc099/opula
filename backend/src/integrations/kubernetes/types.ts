export interface KubernetesConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
  cluster?: {
    server: string;
    certificateAuthority?: string;
    insecureSkipTlsVerify?: boolean;
  };
  user?: {
    token?: string;
    username?: string;
    password?: string;
    clientCertificate?: string;
    clientKey?: string;
  };
}

export interface KubernetesCluster {
  name: string;
  server: string;
  version: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  nodeCount: number;
  namespaces: string[];
}

export interface KubernetesPod {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp: string;
    uid: string;
  };
  spec: {
    containers: KubernetesContainer[];
    restartPolicy: string;
    nodeName?: string;
  };
  status: {
    phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
    conditions?: KubernetesPodCondition[];
    containerStatuses?: KubernetesContainerStatus[];
    podIP?: string;
    hostIP?: string;
    startTime?: string;
  };
}

export interface KubernetesContainer {
  name: string;
  image: string;
  ports?: KubernetesContainerPort[];
  env?: KubernetesEnvVar[];
  resources?: {
    requests?: Record<string, string>;
    limits?: Record<string, string>;
  };
}

export interface KubernetesContainerPort {
  name?: string;
  containerPort: number;
  protocol?: string;
}

export interface KubernetesEnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    secretKeyRef?: { name: string; key: string };
    configMapKeyRef?: { name: string; key: string };
  };
}

export interface KubernetesPodCondition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

export interface KubernetesContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  image: string;
  imageID: string;
  state?: {
    running?: { startedAt: string };
    waiting?: { reason: string; message?: string };
    terminated?: { exitCode: number; reason: string; startedAt: string; finishedAt: string };
  };
}

export interface KubernetesService {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    selector?: Record<string, string>;
    ports: KubernetesServicePort[];
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName';
    clusterIP?: string;
    externalIPs?: string[];
  };
  status?: {
    loadBalancer?: {
      ingress?: Array<{ ip?: string; hostname?: string }>;
    };
  };
}

export interface KubernetesServicePort {
  name?: string;
  port: number;
  targetPort?: number | string;
  protocol?: string;
  nodePort?: number;
}

export interface KubernetesDeployment {
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    replicas?: number;
    selector: {
      matchLabels: Record<string, string>;
    };
    template: {
      metadata: {
        labels: Record<string, string>;
      };
      spec: {
        containers: KubernetesContainer[];
      };
    };
    strategy?: {
      type: 'RollingUpdate' | 'Recreate';
      rollingUpdate?: {
        maxUnavailable?: number | string;
        maxSurge?: number | string;
      };
    };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    unavailableReplicas?: number;
    conditions?: Array<{
      type: string;
      status: 'True' | 'False' | 'Unknown';
      reason?: string;
      message?: string;
    }>;
  };
}

export interface KubernetesNode {
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    podCIDR?: string;
    unschedulable?: boolean;
  };
  status: {
    conditions: Array<{
      type: string;
      status: 'True' | 'False' | 'Unknown';
      reason?: string;
      message?: string;
    }>;
    addresses: Array<{
      type: 'InternalIP' | 'ExternalIP' | 'Hostname';
      address: string;
    }>;
    capacity: Record<string, string>;
    allocatable: Record<string, string>;
    nodeInfo: {
      machineID: string;
      systemUUID: string;
      bootID: string;
      kernelVersion: string;
      osImage: string;
      containerRuntimeVersion: string;
      kubeletVersion: string;
      kubeProxyVersion: string;
      operatingSystem: string;
      architecture: string;
    };
  };
}

export interface KubernetesCustomResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, any>;
  status?: Record<string, any>;
}

export interface KubernetesCustomResourceDefinition {
  metadata: {
    name: string;
  };
  spec: {
    group: string;
    versions: Array<{
      name: string;
      served: boolean;
      storage: boolean;
      schema?: {
        openAPIV3Schema: Record<string, any>;
      };
    }>;
    scope: 'Namespaced' | 'Cluster';
    names: {
      plural: string;
      singular: string;
      kind: string;
      shortNames?: string[];
    };
  };
}

export interface HelmChart {
  name: string;
  version: string;
  repository: string;
  namespace: string;
  values?: Record<string, any>;
  status: 'deployed' | 'failed' | 'pending-install' | 'pending-upgrade' | 'pending-rollback';
  revision: number;
  updated: string;
  notes?: string;
}

export interface HelmRepository {
  name: string;
  url: string;
  username?: string;
  password?: string;
  certFile?: string;
  keyFile?: string;
  caFile?: string;
  insecureSkipTlsVerify?: boolean;
}

export interface KubernetesMetrics {
  pods: {
    total: number;
    running: number;
    pending: number;
    failed: number;
  };
  nodes: {
    total: number;
    ready: number;
    notReady: number;
  };
  services: {
    total: number;
    loadBalancers: number;
    clusterIPs: number;
  };
  deployments: {
    total: number;
    available: number;
    unavailable: number;
  };
  resourceUsage: {
    cpu: {
      requested: string;
      used: string;
      capacity: string;
    };
    memory: {
      requested: string;
      used: string;
      capacity: string;
    };
  };
}