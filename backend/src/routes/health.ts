import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Basic health check
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  };

  res.status(200).json(healthCheck);
}));

// Detailed health check with service dependencies
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      database: await checkDatabaseHealth(),
      redis: await checkRedisHealth(),
      elasticsearch: await checkElasticsearchHealth(),
      aws: await checkAWSHealth()
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024)
    }
  };

  // Determine overall status based on service health
  const allServicesHealthy = Object.values(healthCheck.services).every(
    service => service.status === 'healthy'
  );

  if (!allServicesHealthy) {
    healthCheck.status = 'DEGRADED';
    return res.status(503).json(healthCheck);
  }

  res.status(200).json(healthCheck);
}));

// Readiness probe for Kubernetes
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  // Check if all critical services are available
  const services = {
    database: await checkDatabaseHealth(),
    redis: await checkRedisHealth()
  };

  const ready = Object.values(services).every(service => service.status === 'healthy');

  if (ready) {
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({
      status: 'not ready',
      services,
      timestamp: new Date().toISOString()
    });
  }
}));

// Liveness probe for Kubernetes
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}));

// Helper functions for service health checks
async function checkDatabaseHealth() {
  try {
    const { db } = await import('../services/database');
    return await db.healthCheck();
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: 'N/A',
      lastChecked: new Date().toISOString()
    };
  }
}

async function checkRedisHealth() {
  try {
    // TODO: Implement actual Redis connection check
    // For now, return healthy status
    return {
      status: 'healthy',
      responseTime: '< 50ms',
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: 'Redis connection failed',
      lastChecked: new Date().toISOString()
    };
  }
}

async function checkElasticsearchHealth() {
  try {
    const { elasticsearchService } = await import('../services/elasticsearchService');
    return await elasticsearchService.healthCheck();
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: 'N/A',
      lastChecked: new Date().toISOString()
    };
  }
}

async function checkAWSHealth() {
  try {
    const { awsCredentialManager } = await import('../integrations/aws/credentialManager');
    const { AWSIntegration } = await import('../integrations/aws/awsIntegration');

    const defaultCredentials = awsCredentialManager.getDefaultCredentials();
    if (!defaultCredentials) {
      return {
        status: 'not_configured',
        message: 'AWS credentials not configured',
        lastChecked: new Date().toISOString()
      };
    }

    const awsIntegration = new AWSIntegration({
      accessKeyId: defaultCredentials.accessKeyId,
      secretAccessKey: defaultCredentials.secretAccessKey,
      region: defaultCredentials.region,
      profile: defaultCredentials.profile
    });

    const startTime = Date.now();
    const isConnected = await awsIntegration.testConnection();
    const responseTime = Date.now() - startTime;

    return {
      status: isConnected ? 'healthy' : 'unhealthy',
      responseTime: `${responseTime}ms`,
      region: defaultCredentials.region,
      lastChecked: new Date().toISOString(),
      message: isConnected ? 'AWS connection successful' : 'AWS connection failed'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: `AWS health check failed: ${error}`,
      lastChecked: new Date().toISOString()
    };
  }
}

export { router as healthRoutes };