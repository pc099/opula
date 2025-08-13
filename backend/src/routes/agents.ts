import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { Agent, AgentConfig, AgentAction, HighRiskAction } from '../types';
import { agentOrchestrator } from '../services/agentOrchestrator';

const router = Router();

// Get all agent statuses
router.get('/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agents = agentOrchestrator.getAgents();

  res.json({
    agents,
    totalCount: agents.length,
    timestamp: new Date().toISOString()
  });
}));

// Get specific agent details
router.get('/:agentId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  const agent = agentOrchestrator.getAgent(agentId);
  
  if (!agent) {
    throw new AppError(`Agent not found: ${agentId}`, 404);
  }

  res.json(agent);
}));

// Start an agent
router.post('/:agentId/start', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  // TODO: Implement actual agent start logic
  console.log(`Starting agent: ${agentId} by user: ${req.user?.email}`);

  res.json({
    message: `Agent ${agentId} start command sent`,
    agentId,
    status: 'starting',
    timestamp: new Date().toISOString()
  });
}));

// Stop an agent
router.post('/:agentId/stop', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  // TODO: Implement actual agent stop logic
  console.log(`Stopping agent: ${agentId} by user: ${req.user?.email}`);

  res.json({
    message: `Agent ${agentId} stop command sent`,
    agentId,
    status: 'stopping',
    timestamp: new Date().toISOString()
  });
}));

// Restart an agent
router.post('/:agentId/restart', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  // TODO: Implement actual agent restart logic
  console.log(`Restarting agent: ${agentId} by user: ${req.user?.email}`);

  res.json({
    message: `Agent ${agentId} restart command sent`,
    agentId,
    status: 'restarting',
    timestamp: new Date().toISOString()
  });
}));

// Get agent actions/history
router.get('/:agentId/actions', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  // Verify agent exists
  const agent = agentOrchestrator.getAgent(agentId);
  if (!agent) {
    throw new AppError(`Agent not found: ${agentId}`, 404);
  }

  // Get active actions for this agent
  const allActiveActions = agentOrchestrator.getActiveActions();
  const agentActions = allActiveActions.filter(action => action.agentId === agentId);

  // Apply pagination
  const startIndex = Number(offset);
  const endIndex = startIndex + Number(limit);
  const paginatedActions = agentActions.slice(startIndex, endIndex);

  res.json({
    actions: paginatedActions,
    totalCount: agentActions.length,
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// Get pending approvals
router.get('/approvals/pending', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const pendingApprovals = agentOrchestrator.getPendingApprovals();

  res.json({
    approvals: pendingApprovals,
    totalCount: pendingApprovals.length,
    timestamp: new Date().toISOString()
  });
}));

// Approve an action
router.post('/approvals/:actionId/approve', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { actionId } = req.params;
  const { reason } = req.body;

  if (!actionId) {
    throw new AppError('Action ID is required', 400);
  }

  if (!req.user?.email) {
    throw new AppError('User authentication required', 401);
  }

  await agentOrchestrator.approveAction(actionId, req.user.email, reason);

  res.json({
    message: `Action ${actionId} approved successfully`,
    actionId,
    approvedBy: req.user.email,
    timestamp: new Date().toISOString()
  });
}));

// Reject an action
router.post('/approvals/:actionId/reject', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { actionId } = req.params;
  const { reason } = req.body;

  if (!actionId) {
    throw new AppError('Action ID is required', 400);
  }

  if (!req.user?.email) {
    throw new AppError('User authentication required', 401);
  }

  if (!reason) {
    throw new AppError('Rejection reason is required', 400);
  }

  await agentOrchestrator.rejectAction(actionId, req.user.email, reason);

  res.json({
    message: `Action ${actionId} rejected successfully`,
    actionId,
    rejectedBy: req.user.email,
    reason,
    timestamp: new Date().toISOString()
  });
}));

// Get orchestrator policies
router.get('/policies', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const policies = agentOrchestrator.getPolicies();

  res.json({
    policies,
    totalCount: policies.length,
    timestamp: new Date().toISOString()
  });
}));

// Register a new agent
router.post('/register', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentConfig: AgentConfig = req.body;

  if (!agentConfig.id || !agentConfig.name || !agentConfig.type) {
    throw new AppError('Agent ID, name, and type are required', 400);
  }

  // Set timestamps
  agentConfig.createdAt = new Date();
  agentConfig.updatedAt = new Date();

  await agentOrchestrator.registerAgent(agentConfig);

  res.status(201).json({
    message: `Agent ${agentConfig.id} registered successfully`,
    agent: agentOrchestrator.getAgent(agentConfig.id),
    timestamp: new Date().toISOString()
  });
}));

// Unregister an agent
router.delete('/:agentId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  await agentOrchestrator.unregisterAgent(agentId);

  res.json({
    message: `Agent ${agentId} unregistered successfully`,
    agentId,
    timestamp: new Date().toISOString()
  });
}));

// Get orchestrator health status
router.get('/orchestrator/health', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const isHealthy = agentOrchestrator.isHealthy();
  const agents = agentOrchestrator.getAgents();
  const activeActions = agentOrchestrator.getActiveActions();
  const pendingApprovals = agentOrchestrator.getPendingApprovals();

  res.json({
    healthy: isHealthy,
    statistics: {
      totalAgents: agents.length,
      runningAgents: agents.filter(a => a.status === 'running').length,
      activeActions: activeActions.length,
      pendingApprovals: pendingApprovals.length
    },
    timestamp: new Date().toISOString()
  });
}));

export { router as agentRoutes };