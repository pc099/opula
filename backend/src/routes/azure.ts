import { Router, Request, Response } from 'express';
import { azureService } from '../integrations/azure';
import { azureCredentialManager } from '../integrations/azure';

const router = Router();

// Get all Azure resources
router.get('/resources', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const useCache = req.query.useCache !== 'false';
    const withMetrics = req.query.withMetrics === 'true';

    let resources;
    if (withMetrics) {
      resources = await azureService.getResourcesWithMetrics(credentialsId, useCache);
    } else {
      resources = await azureService.getAllResources(credentialsId, useCache);
    }

    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    console.error('Error fetching Azure resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Azure resources',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Azure resources by type
router.get('/resources/type/:resourceType', async (req: Request, res: Response) => {
  try {
    const { resourceType } = req.params;
    const credentialsId = req.query.credentialsId as string || 'default';

    const resources = await azureService.getResourcesByType(resourceType, credentialsId);

    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    console.error('Error fetching Azure resources by type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Azure resources by type',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Azure resources by resource group
router.get('/resources/resource-group/:resourceGroup', async (req: Request, res: Response) => {
  try {
    const { resourceGroup } = req.params;
    const credentialsId = req.query.credentialsId as string || 'default';

    const resources = await azureService.getResourcesByResourceGroup(resourceGroup, credentialsId);

    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    console.error('Error fetching Azure resources by resource group:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Azure resources by resource group',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Azure metrics summary
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const useCache = req.query.useCache !== 'false';

    const metrics = await azureService.getMetricsSummary(credentialsId, startDate, endDate, useCache);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching Azure metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Azure metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get cost analysis
router.get('/cost-analysis', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const days = parseInt(req.query.days as string) || 30;

    const costAnalysis = await azureService.getCostAnalysis(credentialsId, days);

    res.json({
      success: true,
      data: costAnalysis
    });
  } catch (error) {
    console.error('Error fetching Azure cost analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Azure cost analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test Azure connection
router.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.body.credentialsId || 'default';
    const isConnected = await azureService.testConnection(credentialsId);

    res.json({
      success: true,
      data: {
        connected: isConnected,
        credentialsId
      }
    });
  } catch (error) {
    console.error('Error testing Azure connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test Azure connection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear cache
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string;
    azureService.clearCache(credentialsId);

    res.json({
      success: true,
      message: credentialsId ? `Cache cleared for ${credentialsId}` : 'All cache cleared'
    });
  } catch (error) {
    console.error('Error clearing Azure cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear Azure cache',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Credentials management routes
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const credentials = azureService.getAvailableCredentials();
    res.json({
      success: true,
      data: credentials
    });
  } catch (error) {
    console.error('Error fetching Azure credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Azure credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/credentials', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      subscriptionId, 
      tenantId, 
      clientId, 
      clientSecret, 
      useDefaultCredential = false,
      useCLI = false,
      isActive = true 
    } = req.body;

    if (!name || !subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Name and subscription ID are required'
      });
    }

    const credentials = {
      name,
      description,
      subscriptionId,
      tenantId,
      clientId,
      clientSecret,
      useDefaultCredential,
      useCLI,
      isActive
    };

    if (!azureCredentialManager.validateCredentials(credentials)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials: must provide valid authentication method'
      });
    }

    const id = azureCredentialManager.addCredentials(credentials);

    res.status(201).json({
      success: true,
      data: {
        id,
        message: 'Azure credentials added successfully'
      }
    });
  } catch (error) {
    console.error('Error adding Azure credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add Azure credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.put('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = azureCredentialManager.updateCredentials(id, updates);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Credentials not found'
      });
    }

    res.json({
      success: true,
      message: 'Azure credentials updated successfully'
    });
  } catch (error) {
    console.error('Error updating Azure credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update Azure credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.delete('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const success = azureCredentialManager.deleteCredentials(id);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Credentials not found or cannot be deleted'
      });
    }

    // Clear cache for deleted credentials
    azureService.clearCache(id);

    res.json({
      success: true,
      message: 'Azure credentials deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Azure credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete Azure credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;