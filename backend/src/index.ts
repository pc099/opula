import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';
import { auditContextMiddleware, auditRequestMiddleware } from './middleware/auditMiddleware';
import { agentRoutes } from './routes/agents';
import { incidentRoutes } from './routes/incidents';
import { costRoutes } from './routes/cost';
import { configRoutes } from './routes/config';
import { auditRoutes } from './routes/audit';
import { healthRoutes } from './routes/health';
import authRoutes from './routes/auth';
import credentialsRoutes from './routes/credentials';
import awsRoutes from './routes/aws';
import azureRoutes from './routes/azure';
import gcpRoutes from './routes/gcp';
import terraformRoutes from './routes/terraform';
import kubernetesRoutes from './routes/kubernetes';
import monitoringRoutes from './routes/monitoring';
import { agentOrchestrator } from './services/agentOrchestrator';
import { websocketService } from './services/websocketService';
import { CredentialRotationScheduler } from './services/credentialRotationScheduler';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use(requestLogger);

// Health check routes (no auth required)
app.use('/health', healthRoutes);

// Authentication routes (no auth required for login/register)
app.use('/auth', authRoutes);

// API routes with authentication and audit
app.use('/api/credentials', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, credentialsRoutes);
app.use('/api/agents', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, agentRoutes);
app.use('/api/incidents', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, incidentRoutes);
app.use('/api/cost-optimization', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, costRoutes);
app.use('/api/config', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, configRoutes);
app.use('/api/audit', authMiddleware as any, auditContextMiddleware as any, auditRoutes);
app.use('/api/aws', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, awsRoutes);
app.use('/api/azure', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, azureRoutes);
app.use('/api/gcp', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, gcpRoutes);
app.use('/api/terraform', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, terraformRoutes);
app.use('/api/kubernetes', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, kubernetesRoutes);
app.use('/api/monitoring', authMiddleware as any, auditContextMiddleware as any, auditRequestMiddleware as any, monitoringRoutes);

// Initialize WebSocket service
websocketService.initialize(io);

// Make io available to routes
app.set('io', io);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

server.listen(PORT, async () => {
  console.log(`AIOps Platform Backend API Gateway running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start the Agent Orchestrator (optional for development)
  try {
    await agentOrchestrator.start();
    console.log('Agent Orchestrator started successfully');
  } catch (error) {
    console.error('Failed to start Agent Orchestrator:', error);
    console.log('Continuing without Agent Orchestrator for development...');
    // Don't exit in development mode
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }

  // Start the Credential Rotation Scheduler
  try {
    const rotationScheduler = new CredentialRotationScheduler();
    await rotationScheduler.initialize();
    rotationScheduler.start();
    console.log('Credential Rotation Scheduler started successfully');
  } catch (error) {
    console.error('Failed to start Credential Rotation Scheduler:', error);
    console.log('Continuing without Credential Rotation Scheduler...');
  }
});