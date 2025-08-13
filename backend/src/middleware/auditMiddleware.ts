import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { auditService, AuditContext, AuditAction } from '../services/auditService';
import { logger } from './requestLogger';

// Extend the request interface to include audit context
export interface AuditableRequest extends AuthenticatedRequest {
  auditContext?: AuditContext;
}

// Middleware to set up audit context for authenticated requests
export const auditContextMiddleware = (req: AuditableRequest, res: Response, next: NextFunction) => {
  // Only set up audit context for authenticated requests
  if (req.user) {
    req.auditContext = {
      userId: req.user.id,
      userEmail: req.user.email,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      correlationId: (req as any).correlationId || 'unknown'
    };
  }
  
  next();
};

// Middleware to automatically audit API requests
export const auditRequestMiddleware = (req: AuditableRequest, res: Response, next: NextFunction) => {
  // Skip audit for certain endpoints
  const skipAuditPaths = ['/health', '/api/audit/logs', '/api/audit/search'];
  const shouldSkipAudit = skipAuditPaths.some(path => req.path.startsWith(path));
  
  if (shouldSkipAudit || !req.auditContext) {
    return next();
  }

  // Capture the original response methods
  const originalJson = res.json;
  const originalSend = res.send;
  const originalStatus = res.status;

  let responseBody: any;
  let statusCode = 200;

  // Override res.status to capture status code
  res.status = function(code: number) {
    statusCode = code;
    return originalStatus.call(this, code);
  };

  // Override res.json to capture response body
  res.json = function(body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Override res.send to capture response body
  res.send = function(body: any) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  // Log the audit event when the response finishes
  res.on('finish', async () => {
    try {
      const auditAction = createAuditActionFromRequest(req, statusCode, responseBody);
      const outcome = statusCode >= 200 && statusCode < 300 ? 'success' : 
                     statusCode >= 400 && statusCode < 500 ? 'failure' : 'partial';

      await auditService.logAuditEvent(req.auditContext!, auditAction, outcome);
    } catch (error) {
      logger.error('Failed to log audit event in middleware', {
        error: (error as Error).message,
        path: req.path,
        method: req.method
      });
    }
  });

  next();
};

// Helper function to create audit action from request
function createAuditActionFromRequest(
  req: AuditableRequest, 
  statusCode: number, 
  responseBody: any
): AuditAction {
  const method = req.method;
  const path = req.path;
  const resourceId = extractResourceId(req);
  
  // Determine action based on HTTP method and path
  let action = `${method.toLowerCase()}.${path.replace(/^\/api\//, '').replace(/\//g, '.')}`;
  
  // Simplify common patterns
  action = action
    .replace(/\.[a-f0-9-]{36}$/, '.{id}') // Replace UUIDs with {id}
    .replace(/\.\d+$/, '.{id}') // Replace numeric IDs with {id}
    .replace(/\.{id}\./, '.'); // Clean up double dots

  // Determine resource and resource type
  let resource = resourceId || path;
  let resourceType = 'api-endpoint';

  if (path.includes('/agents')) {
    resourceType = 'agent';
    resource = resourceId || 'agents';
  } else if (path.includes('/incidents')) {
    resourceType = 'incident';
    resource = resourceId || 'incidents';
  } else if (path.includes('/config')) {
    resourceType = 'configuration';
    resource = resourceId || 'configurations';
  } else if (path.includes('/audit')) {
    resourceType = 'audit';
    resource = 'audit-logs';
  } else if (path.includes('/cost')) {
    resourceType = 'cost-optimization';
    resource = resourceId || 'cost-reports';
  }

  // Prepare details object
  const details: Record<string, any> = {
    method,
    path,
    statusCode,
    requestSize: req.get('Content-Length') || 0,
    responseSize: responseBody ? JSON.stringify(responseBody).length : 0
  };

  // Add request body for write operations (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
    details.requestBody = sanitizeRequestBody(req.body);
  }

  // Add query parameters if present
  if (Object.keys(req.query).length > 0) {
    details.queryParams = req.query;
  }

  // Add response summary for successful operations
  if (statusCode >= 200 && statusCode < 300 && responseBody) {
    details.responseSummary = createResponseSummary(responseBody);
  }

  // Add error details for failed operations
  if (statusCode >= 400 && responseBody && responseBody.error) {
    details.errorType = responseBody.error;
    details.errorMessage = responseBody.message;
  }

  return {
    action,
    resource,
    resourceType,
    details,
    severity: determineSeverityFromRequest(method, path, statusCode)
  };
}

// Helper function to extract resource ID from request
function extractResourceId(req: Request): string | null {
  const pathParts = req.path.split('/');
  
  // Look for UUID or numeric ID in path
  for (const part of pathParts) {
    if (/^[a-f0-9-]{36}$/.test(part) || /^\d+$/.test(part)) {
      return part;
    }
  }
  
  return null;
}

// Helper function to sanitize request body (remove sensitive data)
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

// Helper function to create response summary
function createResponseSummary(responseBody: any): any {
  if (!responseBody || typeof responseBody !== 'object') {
    return { type: typeof responseBody };
  }

  const summary: any = {};

  // Common response patterns
  if (responseBody.message) {
    summary.message = responseBody.message;
  }

  if (responseBody.totalCount !== undefined) {
    summary.totalCount = responseBody.totalCount;
  }

  if (responseBody.configurations && Array.isArray(responseBody.configurations)) {
    summary.configurationsCount = responseBody.configurations.length;
  }

  if (responseBody.incidents && Array.isArray(responseBody.incidents)) {
    summary.incidentsCount = responseBody.incidents.length;
  }

  if (responseBody.agents && Array.isArray(responseBody.agents)) {
    summary.agentsCount = responseBody.agents.length;
  }

  if (responseBody.logs && Array.isArray(responseBody.logs)) {
    summary.logsCount = responseBody.logs.length;
  }

  return Object.keys(summary).length > 0 ? summary : { type: 'object' };
}

// Helper function to determine severity from request
function determineSeverityFromRequest(method: string, path: string, statusCode: number): 'low' | 'medium' | 'high' | 'critical' {
  // Critical operations
  if (method === 'DELETE' || path.includes('/rollback')) {
    return 'high';
  }

  // High-risk operations
  if (method === 'PUT' && path.includes('/config')) {
    return 'medium';
  }

  // Failed operations
  if (statusCode >= 400) {
    return statusCode >= 500 ? 'high' : 'medium';
  }

  // Default to low for read operations and successful writes
  return 'low';
}

// Utility function to manually log audit events from within route handlers
export async function logAuditEvent(
  req: AuditableRequest,
  action: string,
  resource: string,
  resourceType: string,
  details: Record<string, any> = {},
  outcome: 'success' | 'failure' | 'partial' = 'success',
  severity?: 'low' | 'medium' | 'high' | 'critical'
): Promise<void> {
  if (!req.auditContext) {
    logger.warn('Attempted to log audit event without audit context', { action, resource });
    return;
  }

  const auditAction: AuditAction = {
    action,
    resource,
    resourceType,
    details,
    severity
  };

  await auditService.logAuditEvent(req.auditContext, auditAction, outcome);
}