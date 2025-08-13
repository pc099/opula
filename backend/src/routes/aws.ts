import { Router, Request, Response } from 'express';
import { awsService } from '../integrations/aws';
import { awsCredentialManager } from '../integrations/aws';

const router = Router();

// Get all AWS resources
router.get('/resources', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const useCache = req.query.useCache !== 'false';
    const withMetrics = req.query.withMetrics === 'true';

    let resources;
    if (withMetrics) {
      resources = await awsService.getResourcesWithMetrics(credentialsId, useCache);
    } else {
      resources = await awsService.getAllResources(credentialsId, useCache);
    }

    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    console.error('Error fetching AWS resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AWS resources',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get AWS metrics summary
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const useCache = req.query.useCache !== 'false';

    const metrics = await awsService.getMetricsSummary(credentialsId, startDate, endDate, useCache);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching AWS metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AWS metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get cost analysis
router.get('/cost-analysis', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const days = parseInt(req.query.days as string) || 30;

    const costAnalysis = await awsService.getCostAnalysis(credentialsId, days);

    res.json({
      success: true,
      data: costAnalysis
    });
  } catch (error) {
    console.error('Error fetching AWS cost analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AWS cost analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test AWS connection
router.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.body.credentialsId || 'default';
    const isConnected = await awsService.testConnection(credentialsId);

    res.json({
      success: true,
      data: {
        connected: isConnected,
        credentialsId
      }
    });
  } catch (error) {
    console.error('Error testing AWS connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test AWS connection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear cache
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string;
    awsService.clearCache(credentialsId);

    res.json({
      success: true,
      message: credentialsId ? `Cache cleared for ${credentialsId}` : 'All cache cleared'
    });
  } catch (error) {
    console.error('Error clearing AWS cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear AWS cache',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Credentials management routes
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const credentials = awsService.getAvailableCredentials();
    res.json({
      success: true,
      data: credentials
    });
  } catch (error) {
    console.error('Error fetching AWS credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AWS credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/credentials', async (req: Request, res: Response) => {
  try {
    const { name, description, region, accessKeyId, secretAccessKey, profile, isActive = true } = req.body;

    if (!name || !region) {
      return res.status(400).json({
        success: false,
        error: 'Name and region are required'
      });
    }

    const credentials = {
      name,
      description,
      region,
      accessKeyId,
      secretAccessKey,
      profile,
      isActive
    };

    if (!awsCredentialManager.validateCredentials(credentials)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials: must provide either access keys or profile'
      });
    }

    const id = awsCredentialManager.addCredentials(credentials);

    res.status(201).json({
      success: true,
      data: {
        id,
        message: 'AWS credentials added successfully'
      }
    });
  } catch (error) {
    console.error('Error adding AWS credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add AWS credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.put('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = awsCredentialManager.updateCredentials(id, updates);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Credentials not found'
      });
    }

    res.json({
      success: true,
      message: 'AWS credentials updated successfully'
    });
  } catch (error) {
    console.error('Error updating AWS credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update AWS credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.delete('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const success = awsCredentialManager.deleteCredentials(id);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Credentials not found or cannot be deleted'
      });
    }

    // Clear cache for deleted credentials
    awsService.clearCache(id);

    res.json({
      success: true,
      message: 'AWS credentials deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting AWS credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete AWS credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;