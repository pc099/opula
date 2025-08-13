import { Router, Request, Response } from 'express';
import { gcpService } from '../integrations/gcp';
import { gcpCredentialManager } from '../integrations/gcp';

const router = Router();

// Get all GCP resources
router.get('/resources', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const useCache = req.query.useCache !== 'false';
    const withMetrics = req.query.withMetrics === 'true';

    let resources;
    if (withMetrics) {
      resources = await gcpService.getResourcesWithMetrics(credentialsId, useCache);
    } else {
      resources = await gcpService.getAllResources(credentialsId, useCache);
    }

    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    console.error('Error fetching GCP resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP resources',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get GCP instances by zone
router.get('/instances/zone/:zone', async (req: Request, res: Response) => {
  try {
    const { zone } = req.params;
    const credentialsId = req.query.credentialsId as string || 'default';

    const instances = await gcpService.getInstancesByZone(zone, credentialsId);

    res.json({
      success: true,
      data: instances
    });
  } catch (error) {
    console.error('Error fetching GCP instances by zone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP instances by zone',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get GKE clusters by location
router.get('/clusters/location/:location', async (req: Request, res: Response) => {
  try {
    const { location } = req.params;
    const credentialsId = req.query.credentialsId as string || 'default';

    const clusters = await gcpService.getGKEClustersByLocation(location, credentialsId);

    res.json({
      success: true,
      data: clusters
    });
  } catch (error) {
    console.error('Error fetching GKE clusters by location:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GKE clusters by location',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get GCP zones
router.get('/zones', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const zones = await gcpService.getZones(credentialsId);

    res.json({
      success: true,
      data: zones
    });
  } catch (error) {
    console.error('Error fetching GCP zones:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP zones',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get GCP regions
router.get('/regions', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const regions = await gcpService.getRegions(credentialsId);

    res.json({
      success: true,
      data: regions
    });
  } catch (error) {
    console.error('Error fetching GCP regions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP regions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get GCP metrics summary
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const useCache = req.query.useCache !== 'false';

    const metrics = await gcpService.getMetricsSummary(credentialsId, startDate, endDate, useCache);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching GCP metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get cost analysis
router.get('/cost-analysis', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string || 'default';
    const days = parseInt(req.query.days as string) || 30;

    const costAnalysis = await gcpService.getCostAnalysis(credentialsId, days);

    res.json({
      success: true,
      data: costAnalysis
    });
  } catch (error) {
    console.error('Error fetching GCP cost analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP cost analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test GCP connection
router.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.body.credentialsId || 'default';
    const isConnected = await gcpService.testConnection(credentialsId);

    res.json({
      success: true,
      data: {
        connected: isConnected,
        credentialsId
      }
    });
  } catch (error) {
    console.error('Error testing GCP connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test GCP connection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear cache
router.delete('/cache', async (req: Request, res: Response) => {
  try {
    const credentialsId = req.query.credentialsId as string;
    gcpService.clearCache(credentialsId);

    res.json({
      success: true,
      message: credentialsId ? `Cache cleared for ${credentialsId}` : 'All cache cleared'
    });
  } catch (error) {
    console.error('Error clearing GCP cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear GCP cache',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Credentials management routes
router.get('/credentials', async (req: Request, res: Response) => {
  try {
    const credentials = gcpService.getAvailableCredentials();
    res.json({
      success: true,
      data: credentials
    });
  } catch (error) {
    console.error('Error fetching GCP credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch GCP credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.post('/credentials', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      projectId, 
      keyFilename, 
      credentials,
      useApplicationDefault = false,
      isActive = true 
    } = req.body;

    if (!name || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Name and project ID are required'
      });
    }

    const gcpCredentials = {
      name,
      description,
      projectId,
      keyFilename,
      credentials,
      useApplicationDefault,
      isActive
    };

    if (!gcpCredentialManager.validateCredentials(gcpCredentials)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credentials: must provide valid authentication method'
      });
    }

    const id = gcpCredentialManager.addCredentials(gcpCredentials);

    res.status(201).json({
      success: true,
      data: {
        id,
        message: 'GCP credentials added successfully'
      }
    });
  } catch (error) {
    console.error('Error adding GCP credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add GCP credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.put('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = gcpCredentialManager.updateCredentials(id, updates);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Credentials not found'
      });
    }

    res.json({
      success: true,
      message: 'GCP credentials updated successfully'
    });
  } catch (error) {
    console.error('Error updating GCP credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update GCP credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.delete('/credentials/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const success = gcpCredentialManager.deleteCredentials(id);
    
    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Credentials not found or cannot be deleted'
      });
    }

    // Clear cache for deleted credentials
    gcpService.clearCache(id);

    res.json({
      success: true,
      message: 'GCP credentials deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting GCP credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete GCP credentials',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;