// @ts-nocheck
import express from 'express';
import { VaultService } from '../services/vaultService';
import { CredentialInjectionService } from '../services/credentialInjectionService';
import { authMiddleware, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { auditRequestMiddleware } from '../middleware/auditMiddleware';

const router = express.Router();
const vaultService = new VaultService();
const credentialService = new CredentialInjectionService(vaultService);

// Initialize services
let servicesInitialized = false;
const initializeServices = async () => {
  if (!servicesInitialized) {
    try {
      await credentialService.initialize();
      servicesInitialized = true;
    } catch (error) {
      console.warn('Vault service not available, credential management will be limited');
    }
  }
};

// Middleware to ensure services are initialized
router.use(async (req, res, next) => {
  await initializeServices();
  next();
});

// Get credential templates
router.get('/templates', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const templates = await credentialService.getCredentialTemplates();

    res.json({
      templates,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get credential templates',
      timestamp: new Date().toISOString()
    });
  }
});

// Get all secret metadata
router.get('/secrets', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const { path } = req.query;
    const secrets = await vaultService.getSecretMetadata(path as string);

    res.json({
      secrets,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get secrets',
      timestamp: new Date().toISOString()
    });
  }
});

// Store a new secret
router.post('/secrets', authMiddleware, requirePermission('credentials:write'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { path, data, metadata, templateType } = req.body;

    if (!path || !data) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'path and data are required',
        timestamp: new Date().toISOString()
      });
    }

    let result;
    if (templateType) {
      // Create from template
      await credentialService.createCredentialFromTemplate(
        templateType,
        path,
        data,
        metadata || {},
        req.user!.id
      );
      result = { message: 'Secret created from template successfully' };
    } else {
      // Create directly
      result = await vaultService.storeSecret(path, data, metadata || {}, req.user!.id);
    }

    res.status(201).json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to store secret',
      timestamp: new Date().toISOString()
    });
  }
});

// Get a secret (returns metadata only for security)
router.get('/secrets/:path(*)', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const path = req.params.path;
    const secrets = await vaultService.getSecretMetadata(path);

    if (secrets.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Secret not found',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      secret: secrets[0],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get secret',
      timestamp: new Date().toISOString()
    });
  }
});

// Update a secret
router.put('/secrets/:path(*)', authMiddleware, requirePermission('credentials:write'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const path = req.params.path;
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'data is required',
        timestamp: new Date().toISOString()
      });
    }

    await vaultService.updateSecret(path, data, req.user!.id);

    res.json({
      message: 'Secret updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to update secret',
      timestamp: new Date().toISOString()
    });
  }
});

// Delete a secret
router.delete('/secrets/:path(*)', authMiddleware, requirePermission('credentials:delete'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const path = req.params.path;
    await vaultService.deleteSecret(path, req.user!.id);

    res.json({
      message: 'Secret deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to delete secret',
      timestamp: new Date().toISOString()
    });
  }
});

// Rotate a secret
router.post('/secrets/:path(*)/rotate', authMiddleware, requirePermission('credentials:rotate'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const path = req.params.path;
    await vaultService.rotateSecret(path, req.user!.id);

    res.json({
      message: 'Secret rotated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to rotate secret',
      timestamp: new Date().toISOString()
    });
  }
});

// Get secrets due for rotation
router.get('/rotation/due', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const secrets = await vaultService.getSecretsForRotation();

    res.json({
      secrets,
      count: secrets.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get secrets for rotation',
      timestamp: new Date().toISOString()
    });
  }
});

// Create rotation policy
router.post('/rotation/policies', authMiddleware, requirePermission('credentials:manage_policies'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description, secretPaths, rotationInterval, rotationScript, notificationChannels, isActive } = req.body;

    if (!name || !secretPaths || !rotationInterval) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name, secretPaths, and rotationInterval are required',
        timestamp: new Date().toISOString()
      });
    }

    const policy = await vaultService.createRotationPolicy({
      name,
      description,
      secretPaths,
      rotationInterval,
      rotationScript,
      notificationChannels: notificationChannels || [],
      isActive: isActive !== false,
      createdBy: req.user!.id
    }, req.user!.id);

    res.status(201).json({
      policy,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to create rotation policy',
      timestamp: new Date().toISOString()
    });
  }
});

// Agent credential management routes

// Get agent credential mappings
router.get('/agents/:agentId/credentials', authMiddleware, requirePermission('agents:read'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const mappings = await credentialService.getAgentCredentialMappings(agentId);

    res.json({
      mappings,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get agent credentials',
      timestamp: new Date().toISOString()
    });
  }
});

// Map credential to agent
router.post('/agents/:agentId/credentials', authMiddleware, requirePermission('agents:write'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { agentId } = req.params;
    const { secretPath, credentialType } = req.body;

    if (!secretPath || !credentialType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'secretPath and credentialType are required',
        timestamp: new Date().toISOString()
      });
    }

    const mapping = await credentialService.mapCredentialToAgent(
      agentId,
      secretPath,
      credentialType,
      req.user!.id
    );

    res.status(201).json({
      mapping,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to map credential to agent',
      timestamp: new Date().toISOString()
    });
  }
});

// Unmap credential from agent
router.delete('/agents/:agentId/credentials/:secretPath(*)', authMiddleware, requirePermission('agents:write'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { agentId, secretPath } = req.params;
    
    await credentialService.unmapCredentialFromAgent(agentId, secretPath, req.user!.id);

    res.json({
      message: 'Credential unmapped from agent successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to unmap credential from agent',
      timestamp: new Date().toISOString()
    });
  }
});

// Validate agent credentials
router.get('/agents/:agentId/credentials/validate', authMiddleware, requirePermission('agents:read'), async (req, res) => {
  try {
    const { agentId } = req.params;
    const validation = await credentialService.validateAgentCredentials(agentId);

    res.json({
      validation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to validate agent credentials',
      timestamp: new Date().toISOString()
    });
  }
});

// Rotate agent credentials
router.post('/agents/:agentId/credentials/rotate', authMiddleware, requirePermission('credentials:rotate'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { agentId } = req.params;
    const result = await credentialService.rotateAgentCredentials(agentId, req.user!.id);

    res.json({
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to rotate agent credentials',
      timestamp: new Date().toISOString()
    });
  }
});

// Get credential usage report
router.get('/reports/usage', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const { timeRange } = req.query;
    const report = await credentialService.getCredentialUsageReport(timeRange as string);

    res.json({
      report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to generate usage report',
      timestamp: new Date().toISOString()
    });
  }
});

// Get rotation jobs
router.get('/rotation/jobs', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const { status, limit } = req.query;
    const { CredentialRotationScheduler } = await import('../services/credentialRotationScheduler');
    const scheduler = new CredentialRotationScheduler();
    
    const jobs = await scheduler.getRotationJobs(
      status as string,
      limit ? parseInt(limit as string) : undefined
    );

    res.json({
      jobs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get rotation jobs',
      timestamp: new Date().toISOString()
    });
  }
});

// Get rotation history
router.get('/rotation/history', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const { secretPath, limit } = req.query;
    const { CredentialRotationScheduler } = await import('../services/credentialRotationScheduler');
    const scheduler = new CredentialRotationScheduler();
    
    const history = await scheduler.getRotationHistory(
      secretPath as string,
      limit ? parseInt(limit as string) : undefined
    );

    res.json({
      history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get rotation history',
      timestamp: new Date().toISOString()
    });
  }
});

// Schedule manual rotation
router.post('/rotation/schedule', authMiddleware, requirePermission('credentials:rotate'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { secretPath, scheduledAt } = req.body;

    if (!secretPath) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'secretPath is required',
        timestamp: new Date().toISOString()
      });
    }

    const { CredentialRotationScheduler } = await import('../services/credentialRotationScheduler');
    const scheduler = new CredentialRotationScheduler();
    
    const job = await scheduler.scheduleRotation(
      secretPath,
      scheduledAt ? new Date(scheduledAt) : new Date()
    );

    res.status(201).json({
      job,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to schedule rotation',
      timestamp: new Date().toISOString()
    });
  }
});

// Cancel rotation job
router.delete('/rotation/jobs/:jobId', authMiddleware, requirePermission('credentials:rotate'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { jobId } = req.params;
    const { CredentialRotationScheduler } = await import('../services/credentialRotationScheduler');
    const scheduler = new CredentialRotationScheduler();
    
    await scheduler.cancelRotationJob(jobId);

    res.json({
      message: 'Rotation job cancelled successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Failed to cancel rotation job',
      timestamp: new Date().toISOString()
    });
  }
});

// Get rotation metrics
router.get('/rotation/metrics', authMiddleware, requirePermission('credentials:read'), async (req, res) => {
  try {
    const { timeRange } = req.query;
    const { CredentialRotationScheduler } = await import('../services/credentialRotationScheduler');
    const scheduler = new CredentialRotationScheduler();
    
    const metrics = await scheduler.getRotationMetrics(timeRange as string);

    res.json({
      metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to get rotation metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check for Vault connectivity
router.get('/health', authMiddleware, async (req, res) => {
  try {
    // Try to get a simple health check from Vault
    const health = await vaultService.getSecretMetadata();
    
    res.json({
      status: 'healthy',
      vault: 'connected',
      secretCount: health.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      vault: 'disconnected',
      error: error instanceof Error ? error.message : 'Vault connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;