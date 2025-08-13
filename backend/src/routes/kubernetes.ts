import { Router, Request, Response } from 'express';
import { KubernetesService } from '../integrations/kubernetes/kubernetesService';
import { KubernetesConfig } from '../integrations/kubernetes/types';

const router = Router();

// Store active Kubernetes services (in production, this would be in a database)
const kubernetesServices = new Map<string, KubernetesService>();

/**
 * Initialize Kubernetes service for a cluster
 */
router.post('/clusters/:clusterId/init', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const config: KubernetesConfig = req.body;

    const service = new KubernetesService(config);
    kubernetesServices.set(clusterId, service);

    res.json({
      success: true,
      message: 'Kubernetes service initialized successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Discover available clusters
 */
router.get('/clusters/discover', async (req: Request, res: Response) => {
  try {
    const service = new KubernetesService();
    const clusters = await service.discoverClusters();
    
    res.json({
      success: true,
      data: clusters
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cluster metrics
 */
router.get('/clusters/:clusterId/metrics', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const metrics = await service.getClusterMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Perform cluster health check
 */
router.get('/clusters/:clusterId/health', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const healthCheck = await service.performHealthCheck();
    res.json({
      success: true,
      data: healthCheck
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cluster nodes
 */
router.get('/clusters/:clusterId/nodes', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const nodes = await service.getNodes();
    res.json({
      success: true,
      data: nodes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pod Management Routes

/**
 * List pods
 */
router.get('/clusters/:clusterId/pods', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const pods = await service.listPods(namespace as string);
    res.json({
      success: true,
      data: pods
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific pod
 */
router.get('/clusters/:clusterId/pods/:namespace/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, namespace, name } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const pod = await service.getPod(name, namespace);
    res.json({
      success: true,
      data: pod
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete pod
 */
router.delete('/clusters/:clusterId/pods/:namespace/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, namespace, name } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    await service.deletePod(name, namespace);
    res.json({
      success: true,
      message: 'Pod deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Service Management Routes

/**
 * List services
 */
router.get('/clusters/:clusterId/services', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const services = await service.listServices(namespace as string);
    res.json({
      success: true,
      data: services
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific service
 */
router.get('/clusters/:clusterId/services/:namespace/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, namespace, name } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const k8sService = await service.getService(name, namespace);
    res.json({
      success: true,
      data: k8sService
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Deployment Management Routes

/**
 * List deployments
 */
router.get('/clusters/:clusterId/deployments', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const deployments = await service.listDeployments(namespace as string);
    res.json({
      success: true,
      data: deployments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific deployment
 */
router.get('/clusters/:clusterId/deployments/:namespace/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, namespace, name } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const deployment = await service.getDeployment(name, namespace);
    res.json({
      success: true,
      data: deployment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Scale deployment
 */
router.patch('/clusters/:clusterId/deployments/:namespace/:name/scale', async (req: Request, res: Response) => {
  try {
    const { clusterId, namespace, name } = req.params;
    const { replicas } = req.body;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    if (typeof replicas !== 'number' || replicas < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid replicas count'
      });
    }

    const deployment = await service.scaleDeployment(name, namespace, replicas);
    res.json({
      success: true,
      data: deployment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Custom Resource Management Routes

/**
 * List Custom Resource Definitions
 */
router.get('/clusters/:clusterId/crds', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const crds = await service.listCustomResourceDefinitions();
    res.json({
      success: true,
      data: crds
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List custom resources
 */
router.get('/clusters/:clusterId/custom-resources/:group/:version/:plural', async (req: Request, res: Response) => {
  try {
    const { clusterId, group, version, plural } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const customResources = await service.listCustomResources(group, version, plural, namespace as string);
    res.json({
      success: true,
      data: customResources
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helm Management Routes

/**
 * List Helm releases
 */
router.get('/clusters/:clusterId/helm/releases', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const releases = await service.listHelmReleases(namespace as string);
    res.json({
      success: true,
      data: releases
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Helm release
 */
router.get('/clusters/:clusterId/helm/releases/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, name } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const release = await service.getHelmRelease(name, namespace as string);
    res.json({
      success: true,
      data: release
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Install Helm chart
 */
router.post('/clusters/:clusterId/helm/install', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const { releaseName, chartName, ...options } = req.body;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const release = await service.installHelmChart(releaseName, chartName, options);
    res.json({
      success: true,
      data: release
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Upgrade Helm release
 */
router.put('/clusters/:clusterId/helm/releases/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, name } = req.params;
    const { chartName, ...options } = req.body;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const release = await service.upgradeHelmRelease(name, chartName, options);
    res.json({
      success: true,
      data: release
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Uninstall Helm release
 */
router.delete('/clusters/:clusterId/helm/releases/:name', async (req: Request, res: Response) => {
  try {
    const { clusterId, name } = req.params;
    const { namespace } = req.query;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    await service.uninstallHelmRelease(name, namespace as string);
    res.json({
      success: true,
      message: 'Helm release uninstalled successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Rollback Helm release
 */
router.post('/clusters/:clusterId/helm/releases/:name/rollback', async (req: Request, res: Response) => {
  try {
    const { clusterId, name } = req.params;
    const { revision, ...options } = req.body;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const release = await service.rollbackHelmRelease(name, revision, options);
    res.json({
      success: true,
      data: release
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helm Repository Management

/**
 * List Helm repositories
 */
router.get('/helm/repositories', async (req: Request, res: Response) => {
  try {
    const service = new KubernetesService();
    const repositories = await service.listHelmRepositories();
    res.json({
      success: true,
      data: repositories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add Helm repository
 */
router.post('/helm/repositories', async (req: Request, res: Response) => {
  try {
    const repository = req.body;
    const service = new KubernetesService();
    await service.addHelmRepository(repository);
    res.json({
      success: true,
      message: 'Helm repository added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update Helm repositories
 */
router.post('/helm/repositories/update', async (req: Request, res: Response) => {
  try {
    const service = new KubernetesService();
    await service.updateHelmRepositories();
    res.json({
      success: true,
      message: 'Helm repositories updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Search Helm charts
 */
router.get('/helm/charts/search', async (req: Request, res: Response) => {
  try {
    const { keyword, version, versions } = req.query;
    const service = new KubernetesService();
    const charts = await service.searchHelmCharts(keyword as string, {
      version: version as string,
      versions: versions === 'true'
    });
    res.json({
      success: true,
      data: charts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Advanced Operations

/**
 * Perform automated scaling
 */
router.post('/clusters/:clusterId/autoscale', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const options = req.body;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const result = await service.performAutomatedScaling(options);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Analyze resource utilization
 */
router.get('/clusters/:clusterId/analyze', async (req: Request, res: Response) => {
  try {
    const { clusterId } = req.params;
    const service = kubernetesServices.get(clusterId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Kubernetes cluster not found'
      });
    }

    const analysis = await service.analyzeResourceUtilization();
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;