import { Router, Request, Response } from 'express';
import { TerraformService } from '../integrations/terraform/terraformService';
import { TerraformConfig } from '../integrations/terraform/types';

const router = Router();

// Store active Terraform services (in production, this would be in a database)
const terraformServices = new Map<string, TerraformService>();

/**
 * Initialize Terraform service for a workspace
 */
router.post('/workspaces/:workspaceId/init', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const config: TerraformConfig = req.body;

    const service = new TerraformService(config);
    await service.initialize();
    
    terraformServices.set(workspaceId, service);

    res.json({
      success: true,
      message: 'Terraform workspace initialized successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Validate Terraform configuration
 */
router.post('/workspaces/:workspaceId/validate', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const validation = await service.validate();
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generate Terraform plan
 */
router.post('/workspaces/:workspaceId/plan', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { varFile, target, destroy } = req.body;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const plan = await service.plan({ varFile, target, destroy });
    res.json({
      success: true,
      data: plan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Apply Terraform changes
 */
router.post('/workspaces/:workspaceId/apply', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { planFile, autoApprove } = req.body;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const result = await service.apply(planFile, autoApprove);
    res.json({
      success: result.success,
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
 * Get Terraform state
 */
router.get('/workspaces/:workspaceId/state', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const state = await service.getState();
    res.json({
      success: true,
      data: state
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Detect configuration drift
 */
router.post('/workspaces/:workspaceId/drift-detection', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { previousStatePath } = req.body;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const driftDetection = await service.detectDrift(previousStatePath);
    res.json({
      success: true,
      data: driftDetection
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Remediate configuration drift
 */
router.post('/workspaces/:workspaceId/remediate-drift', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { driftDetection, autoApprove, dryRun } = req.body;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const result = await service.remediateDrift(driftDetection, { autoApprove, dryRun });
    res.json({
      success: result.success,
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
 * Analyze resources
 */
router.get('/workspaces/:workspaceId/analyze', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const analysis = await service.analyzeResources();
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

/**
 * Get resource dependencies
 */
router.get('/workspaces/:workspaceId/dependencies', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const dependencies = await service.getResourceDependencies();
    res.json({
      success: true,
      data: Object.fromEntries(dependencies)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Terraform version
 */
router.get('/workspaces/:workspaceId/version', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const service = terraformServices.get(workspaceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Terraform workspace not found'
      });
    }

    const version = await service.getVersion();
    res.json({
      success: true,
      data: version
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List available Terraform versions
 */
router.get('/versions/available', async (req: Request, res: Response) => {
  try {
    const service = new TerraformService({ workingDirectory: process.cwd() });
    const versions = await service.listAvailableVersions();
    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List installed Terraform versions
 */
router.get('/versions/installed', async (req: Request, res: Response) => {
  try {
    const service = new TerraformService({ workingDirectory: process.cwd() });
    const versions = await service.listInstalledVersions();
    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Install Terraform version
 */
router.post('/versions/:version/install', async (req: Request, res: Response) => {
  try {
    const { version } = req.params;
    const service = new TerraformService({ workingDirectory: process.cwd() });
    await service.installVersion(version);
    res.json({
      success: true,
      message: `Terraform ${version} installed successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Terraform Cloud specific routes

/**
 * List Terraform Cloud workspaces
 */
router.get('/cloud/workspaces', async (req: Request, res: Response) => {
  try {
    const { organization, token } = req.query;
    
    if (!organization || !token) {
      return res.status(400).json({
        success: false,
        error: 'Organization and token are required'
      });
    }

    const config = {
      workingDirectory: process.cwd(),
      cloudConfig: {
        organization: organization as string,
        token: token as string
      }
    };

    const service = new TerraformService(config);
    const workspaces = await service.listCloudWorkspaces();
    
    res.json({
      success: true,
      data: workspaces
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create Terraform Cloud run
 */
router.post('/cloud/workspaces/:workspaceId/runs', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { message, isDestroy, planOnly, targetAddrs, organization, token } = req.body;

    const config = {
      workingDirectory: process.cwd(),
      cloudConfig: {
        organization,
        token
      }
    };

    const service = new TerraformService(config);
    const run = await service.createCloudRun(workspaceId, {
      message,
      isDestroy,
      planOnly,
      targetAddrs
    });

    res.json({
      success: true,
      data: run
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Terraform Cloud run
 */
router.get('/cloud/runs/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { organization, token } = req.query;

    const config = {
      workingDirectory: process.cwd(),
      cloudConfig: {
        organization: organization as string,
        token: token as string
      }
    };

    const service = new TerraformService(config);
    const run = await service.getCloudRun(runId);

    res.json({
      success: true,
      data: run
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Apply Terraform Cloud run
 */
router.post('/cloud/runs/:runId/apply', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { comment, organization, token } = req.body;

    const config = {
      workingDirectory: process.cwd(),
      cloudConfig: {
        organization,
        token
      }
    };

    const service = new TerraformService(config);
    await service.applyCloudRun(runId, comment);

    res.json({
      success: true,
      message: 'Run applied successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;