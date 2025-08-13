import { Router, Request, Response } from 'express';
import { MonitoringService, MonitoringServiceConfig } from '../integrations/monitoring';

const router = Router();

// Initialize monitoring service (this would typically be done in a service layer)
let monitoringService: MonitoringService | null = null;

/**
 * Initialize monitoring service with configuration
 */
router.post('/config', async (req: Request, res: Response) => {
  try {
    const config: MonitoringServiceConfig = req.body;
    
    // Validate configuration
    if (!config.prometheus && !config.grafana && !config.pagerduty && !config.slack && !config.teams) {
      return res.status(400).json({
        error: 'At least one monitoring integration must be configured'
      });
    }

    monitoringService = new MonitoringService(config);
    
    // Test all configured integrations
    const testResults = await monitoringService.testAllIntegrations();
    
    res.json({
      message: 'Monitoring service configured successfully',
      integrations: monitoringService.getIntegrationStatus(),
      testResults
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to configure monitoring service',
      details: error.message
    });
  }
});

/**
 * Get monitoring service status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const integrations = monitoringService.getIntegrationStatus();
    const testResults = await monitoringService.testAllIntegrations();

    res.json({
      configured: true,
      integrations,
      testResults
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get monitoring status',
      details: error.message
    });
  }
});

/**
 * Test all monitoring integrations
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const testResults = await monitoringService.testAllIntegrations();
    
    res.json({
      message: 'Integration tests completed',
      results: testResults
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to test integrations',
      details: error.message
    });
  }
});

/**
 * Get system metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const metrics = await monitoringService.getSystemMetrics();
    
    res.json({
      timestamp: new Date().toISOString(),
      metrics
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get system metrics',
      details: error.message
    });
  }
});

/**
 * Get current alerts
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const alerts = await monitoringService.getCurrentAlerts();
    
    res.json({
      timestamp: new Date().toISOString(),
      alerts
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get current alerts',
      details: error.message
    });
  }
});

/**
 * Send alert notification
 */
router.post('/alerts/notify', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const { alert, channels } = req.body;
    
    if (!alert || !alert.title || !alert.description || !alert.severity || !alert.source) {
      return res.status(400).json({
        error: 'Alert must include title, description, severity, and source'
      });
    }

    const results = await monitoringService.sendAlertNotification(alert, channels);
    
    res.json({
      message: 'Alert notification sent',
      results
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to send alert notification',
      details: error.message
    });
  }
});

/**
 * Send resolution notification
 */
router.post('/alerts/resolve', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const { incident, channels } = req.body;
    
    if (!incident || !incident.incidentId || !incident.title || !incident.resolutionTime || !incident.resolvedBy) {
      return res.status(400).json({
        error: 'Incident must include incidentId, title, resolutionTime, and resolvedBy'
      });
    }

    const results = await monitoringService.sendResolutionNotification(incident, channels);
    
    res.json({
      message: 'Resolution notification sent',
      results
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to send resolution notification',
      details: error.message
    });
  }
});

/**
 * Send maintenance notification
 */
router.post('/maintenance/notify', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const { maintenance, channels } = req.body;
    
    if (!maintenance || !maintenance.title || !maintenance.description || !maintenance.startTime || !maintenance.endTime) {
      return res.status(400).json({
        error: 'Maintenance must include title, description, startTime, and endTime'
      });
    }

    const results = await monitoringService.sendMaintenanceNotification(maintenance, channels);
    
    res.json({
      message: 'Maintenance notification sent',
      results
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to send maintenance notification',
      details: error.message
    });
  }
});

/**
 * Query custom metrics
 */
router.post('/metrics/query', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const { query, timeRange } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Query parameter is required'
      });
    }

    const metrics = await monitoringService.queryMetrics(query, timeRange);
    
    res.json({
      query,
      timeRange,
      timestamp: new Date().toISOString(),
      metrics
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to query metrics',
      details: error.message
    });
  }
});

/**
 * Get available metrics
 */
router.get('/metrics/available', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const metrics = await monitoringService.getAvailableMetrics();
    
    res.json({
      timestamp: new Date().toISOString(),
      metrics
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get available metrics',
      details: error.message
    });
  }
});

/**
 * Create monitoring dashboard
 */
router.post('/dashboard/create', async (req: Request, res: Response) => {
  try {
    if (!monitoringService) {
      return res.status(404).json({
        error: 'Monitoring service not configured'
      });
    }

    const result = await monitoringService.createMonitoringDashboard();
    
    if (result.success) {
      res.json({
        message: 'Monitoring dashboard created successfully',
        dashboardUrl: result.dashboardUrl
      });
    } else {
      res.status(500).json({
        error: 'Failed to create monitoring dashboard',
        details: result.error
      });
    }
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to create monitoring dashboard',
      details: error.message
    });
  }
});

export default router;