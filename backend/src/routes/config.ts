// @ts-nocheck
import { Router, Response } from 'express';
import { AuthenticatedRequest, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { AgentConfig } from '../types';
import { configurationService } from '../services/configurationService';

const router = Router();

// Get all agent configurations
router.get('/agents', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { 
    type, 
    enabled, 
    limit = 50, 
    offset = 0 
  } = req.query;

  const filters = {
    type: type as string,
    enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
    limit: Number(limit),
    offset: Number(offset)
  };

  const result = await configurationService.getAllConfigurations(filters);

  res.json({
    ...result,
    filters: { type, enabled },
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// Get specific agent configuration
router.get('/agents/:agentId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  const configuration = await configurationService.getConfigurationById(agentId);
  
  if (!configuration) {
    throw new AppError('Configuration not found', 404);
  }

  res.json(configuration);
}));

// Create new agent configuration
router.post('/agents', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const configData = req.body;
  const userId = req.user?.id || 'unknown';

  const newConfiguration = await configurationService.createConfiguration(configData, userId);

  res.status(201).json({
    message: 'Agent configuration created successfully',
    configuration: newConfiguration,
    createdBy: req.user?.email,
    timestamp: new Date().toISOString()
  });
}));

// Update agent configuration
router.put('/agents/:agentId', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const updates = req.body;
  const userId = req.user?.id || 'unknown';

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  const updatedConfiguration = await configurationService.updateConfiguration(agentId, updates, userId);

  res.json({
    message: `Agent configuration ${agentId} updated successfully`,
    configuration: updatedConfiguration,
    updatedBy: req.user?.email,
    timestamp: new Date().toISOString()
  });
}));

// Delete agent configuration
router.delete('/agents/:agentId', requireRole(['admin']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const userId = req.user?.id || 'unknown';

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  await configurationService.deleteConfiguration(agentId, userId);

  res.json({
    message: `Agent configuration ${agentId} deleted successfully`,
    agentId,
    deletedBy: req.user?.email,
    timestamp: new Date().toISOString()
  });
}));

// Get configuration history/versions
router.get('/agents/:agentId/history', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId } = req.params;
  const { limit = 20, offset = 0 } = req.query;

  if (!agentId) {
    throw new AppError('Agent ID is required', 400);
  }

  const result = await configurationService.getConfigurationHistory(
    agentId, 
    Number(limit), 
    Number(offset)
  );

  res.json({
    agentId,
    ...result,
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// Rollback to previous configuration version
router.post('/agents/:agentId/rollback/:version', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { agentId, version } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id || 'unknown';

  if (!agentId || !version) {
    throw new AppError('Agent ID and version are required', 400);
  }

  const rolledBackConfiguration = await configurationService.rollbackConfiguration(
    agentId, 
    Number(version), 
    userId, 
    reason
  );

  res.json({
    message: `Agent configuration ${agentId} rolled back to version ${version}`,
    configuration: rolledBackConfiguration,
    agentId,
    version: Number(version),
    rolledBackBy: req.user?.email,
    reason,
    timestamp: new Date().toISOString()
  });
}));

// Validate configuration before applying
router.post('/agents/validate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const configuration = req.body;

  if (!configuration) {
    throw new AppError('Configuration is required', 400);
  }

  const validationResult = await configurationService.validateConfiguration(configuration);

  res.json({
    ...validationResult,
    timestamp: new Date().toISOString()
  });
}));

// Configuration Templates Routes

// Get all configuration templates
router.get('/templates', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, limit = 50, offset = 0 } = req.query;

  const filters = {
    type: type as string,
    limit: Number(limit),
    offset: Number(offset)
  };

  const result = await configurationService.getAllTemplates(filters);

  res.json({
    ...result,
    filters: { type },
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// Create new configuration template
router.post('/templates', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const templateData = req.body;
  const userId = req.user?.id || 'unknown';

  const newTemplate = await configurationService.createTemplate(templateData, userId);

  res.status(201).json({
    message: 'Configuration template created successfully',
    template: newTemplate,
    createdBy: req.user?.email,
    timestamp: new Date().toISOString()
  });
}));

// Update configuration template
router.put('/templates/:templateId', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { templateId } = req.params;
  const updates = req.body;
  const userId = req.user?.id || 'unknown';

  if (!templateId) {
    throw new AppError('Template ID is required', 400);
  }

  const updatedTemplate = await configurationService.updateTemplate(templateId, updates, userId);

  res.json({
    message: `Configuration template ${templateId} updated successfully`,
    template: updatedTemplate,
    updatedBy: req.user?.email,
    timestamp: new Date().toISOString()
  });
}));

// Delete configuration template
router.delete('/templates/:templateId', requireRole(['admin']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { templateId } = req.params;
  const userId = req.user?.id || 'unknown';

  if (!templateId) {
    throw new AppError('Template ID is required', 400);
  }

  await configurationService.deleteTemplate(templateId, userId);

  res.json({
    message: `Configuration template ${templateId} deleted successfully`,
    templateId,
    deletedBy: req.user?.email,
    timestamp: new Date().toISOString()
  });
}));

// Approval Workflow Routes

// Get pending approvals
router.get('/approvals', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status = 'pending', limit = 50, offset = 0 } = req.query;

  const filters = {
    status: status as string,
    limit: Number(limit),
    offset: Number(offset)
  };

  const result = await configurationService.getPendingApprovals(filters);

  res.json({
    ...result,
    filters: { status },
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// Approve configuration change
router.post('/approvals/:approvalId/approve', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { approvalId } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id || 'unknown';

  if (!approvalId) {
    throw new AppError('Approval ID is required', 400);
  }

  const result = await configurationService.approveConfigurationChange(approvalId, userId, reason);

  res.json({
    message: `Configuration change ${approvalId} approved successfully`,
    approval: result,
    approvedBy: req.user?.email,
    reason,
    timestamp: new Date().toISOString()
  });
}));

// Reject configuration change
router.post('/approvals/:approvalId/reject', requireRole(['admin', 'devops-lead']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { approvalId } = req.params;
  const { reason } = req.body;
  const userId = req.user?.id || 'unknown';

  if (!approvalId) {
    throw new AppError('Approval ID is required', 400);
  }

  if (!reason) {
    throw new AppError('Rejection reason is required', 400);
  }

  const result = await configurationService.rejectConfigurationChange(approvalId, userId, reason);

  res.json({
    message: `Configuration change ${approvalId} rejected successfully`,
    approval: result,
    rejectedBy: req.user?.email,
    reason,
    timestamp: new Date().toISOString()
  });
}));

export { router as configRoutes };