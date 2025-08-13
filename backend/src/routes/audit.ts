// @ts-nocheck
import { Router, Response } from 'express';
import { AuthenticatedRequest, requireRole } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { auditService } from '../services/auditService';
import { SearchQuery } from '../services/elasticsearchService';

const router = Router();

// Get audit logs
router.get('/logs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { 
    startDate,
    endDate,
    userId,
    action,
    resource,
    severity,
    outcome,
    limit = 100,
    offset = 0,
    sortBy = 'timestamp',
    sortOrder = 'desc'
  } = req.query;

  const searchQuery: SearchQuery = {
    filters: {
      startDate: startDate as string,
      endDate: endDate as string,
      userId: userId as string,
      action: action as string,
      resource: resource as string,
      severity: severity as string,
      outcome: outcome as string
    },
    limit: Number(limit),
    offset: Number(offset),
    sortBy: sortBy as string,
    sortOrder: sortOrder as 'asc' | 'desc'
  };

  const result = await auditService.searchAuditLogs(searchQuery);

  res.json({
    ...result,
    filters: { startDate, endDate, userId, action, resource, severity, outcome },
    limit: Number(limit),
    offset: Number(offset),
    timestamp: new Date().toISOString()
  });
}));

// Get audit statistics
router.get('/stats', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { timeRange = '24h' } = req.query;

  const stats = await auditService.getAuditStatistics(timeRange as string);

  res.json({
    timeRange,
    ...stats,
    timestamp: new Date().toISOString()
  });
}));

// Generate compliance report
router.post('/reports/compliance', requireRole(['admin', 'compliance-officer']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { 
    startDate, 
    endDate, 
    reportType = 'full',
    includeAutomatedActions = true 
  } = req.body;

  if (!startDate || !endDate) {
    throw new AppError('Start date and end date are required', 400);
  }

  const report = await auditService.generateComplianceReport(
    startDate,
    endDate,
    reportType,
    includeAutomatedActions
  );

  res.json({
    message: 'Compliance report generated successfully',
    report: {
      ...report,
      generatedBy: req.user?.email
    },
    downloadUrl: `/api/audit/reports/${report.reportId}/download`,
    timestamp: new Date().toISOString()
  });
}));

// Download compliance report
router.get('/reports/:reportId/download', requireRole(['admin', 'compliance-officer']), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { reportId } = req.params;
  const { format = 'pdf' } = req.query;

  if (!reportId) {
    throw new AppError('Report ID is required', 400);
  }

  // TODO: Implement actual report file generation and download
  console.log(`Compliance report ${reportId} download requested by ${req.user?.email} in ${format} format`);

  res.json({
    message: 'Report download will be available shortly',
    reportId,
    format,
    estimatedSize: '2.5 MB',
    downloadUrl: `https://reports.aiops.example.com/${reportId}.${format}`,
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    timestamp: new Date().toISOString()
  });
}));

// Get user activity summary
router.get('/users/:userId/activity', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  const { timeRange = '7d' } = req.query;

  if (!userId) {
    throw new AppError('User ID is required', 400);
  }

  const activity = await auditService.getUserActivitySummary(userId, timeRange as string);

  res.json({
    ...activity,
    timestamp: new Date().toISOString()
  });
}));

// Search audit logs
router.post('/search', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { 
    query,
    filters = {},
    limit = 50,
    offset = 0 
  } = req.body;

  if (!query) {
    throw new AppError('Search query is required', 400);
  }

  const searchQuery: SearchQuery = {
    query,
    filters,
    limit: Number(limit),
    offset: Number(offset)
  };

  const result = await auditService.searchAuditLogs(searchQuery);

  res.json({
    query,
    results: result.logs,
    totalCount: result.totalCount,
    limit: Number(limit),
    offset: Number(offset),
    searchTime: result.searchTime,
    timestamp: new Date().toISOString()
  });
}));

export { router as auditRoutes };