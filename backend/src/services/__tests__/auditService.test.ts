import { auditService, AuditContext, AuditAction } from '../auditService';
import { elasticsearchService, AuditLogEntry } from '../elasticsearchService';
import { logger } from '../../middleware/requestLogger';
import { AppError } from '../../middleware/errorHandler';

// Mock dependencies
jest.mock('../elasticsearchService');
jest.mock('../../middleware/requestLogger');

const mockElasticsearchService = elasticsearchService as jest.Mocked<typeof elasticsearchService>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('AuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // Fixed timestamp for consistent tests
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logEvent', () => {
    it('should log authentication event successfully', async () => {
      const event = {
        action: 'user.login',
        userId: 'user123',
        targetUserId: 'user123',
        details: { method: 'password' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logEvent(event);

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          action: 'user.login',
          resource: 'user123',
          resourceType: 'authentication',
          details: { method: 'password' },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          severity: 'low',
          outcome: 'success'
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Auth audit event logged',
        expect.objectContaining({
          action: 'user.login',
          userId: 'user123'
        })
      );
    });

    it('should handle missing userId gracefully', async () => {
      const event = {
        action: 'system.startup',
        details: { version: '1.0.0' },
        ipAddress: '127.0.0.1',
        userAgent: 'System'
      };

      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logEvent(event);

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
          userEmail: 'system@aiops.local',
          resource: 'auth'
        })
      );
    });

    it('should not throw error when elasticsearch fails', async () => {
      const event = {
        action: 'user.login',
        userId: 'user123',
        details: {},
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      mockElasticsearchService.indexAuditLog.mockRejectedValue(new Error('ES connection failed'));

      await expect(auditService.logEvent(event)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log auth audit event',
        expect.objectContaining({
          action: 'user.login',
          error: 'ES connection failed'
        })
      );
    });
  });

  describe('logAuditEvent', () => {
    const mockContext: AuditContext = {
      userId: 'user123',
      userEmail: 'user@example.com',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      correlationId: 'corr-123'
    };

    const mockAction: AuditAction = {
      action: 'agent.config.update',
      resource: 'terraform-agent',
      resourceType: 'agent',
      details: { configVersion: '1.2.0' },
      severity: 'medium'
    };

    it('should log audit event successfully', async () => {
      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logAuditEvent(mockContext, mockAction, 'success');

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          userEmail: 'user@example.com',
          action: 'agent.config.update',
          resource: 'terraform-agent',
          resourceType: 'agent',
          details: { configVersion: '1.2.0' },
          severity: 'medium',
          outcome: 'success',
          correlationId: 'corr-123'
        })
      );
    });

    it('should determine severity automatically when not provided', async () => {
      const actionWithoutSeverity: AuditAction = {
        action: 'agent.config.delete',
        resource: 'terraform-agent',
        resourceType: 'agent',
        details: {}
      };

      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logAuditEvent(mockContext, actionWithoutSeverity);

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'high' // Should be determined as high risk
        })
      );
    });

    it('should handle elasticsearch failure gracefully', async () => {
      mockElasticsearchService.indexAuditLog.mockRejectedValue(new Error('ES error'));

      await expect(auditService.logAuditEvent(mockContext, mockAction)).resolves.not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log audit event',
        expect.objectContaining({
          action: 'agent.config.update',
          resource: 'terraform-agent',
          error: 'ES error'
        })
      );
    });
  });

  describe('searchAuditLogs', () => {
    it('should search audit logs successfully', async () => {
      const mockSearchResult = {
        logs: [
          {
            id: 'log1',
            timestamp: new Date(),
            userId: 'user123',
            action: 'test.action'
          } as AuditLogEntry
        ],
        totalCount: 1,
        searchTime: '50ms'
      };

      mockElasticsearchService.searchAuditLogs.mockResolvedValue(mockSearchResult);

      const searchQuery = {
        filters: { userId: 'user123' },
        limit: 10,
        offset: 0
      };

      const result = await auditService.searchAuditLogs(searchQuery);

      expect(result).toEqual(mockSearchResult);
      expect(mockElasticsearchService.searchAuditLogs).toHaveBeenCalledWith(searchQuery);
    });

    it('should throw AppError when search fails', async () => {
      mockElasticsearchService.searchAuditLogs.mockRejectedValue(new Error('Search failed'));

      const searchQuery = {
        filters: {},
        limit: 10,
        offset: 0
      };

      await expect(auditService.searchAuditLogs(searchQuery)).rejects.toThrow(AppError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Audit log search failed',
        { error: 'Search failed' }
      );
    });
  });

  describe('getAuditStatistics', () => {
    it('should get audit statistics successfully', async () => {
      const mockStats = {
        totalActions: 100,
        actionsBySeverity: { low: 60, medium: 30, high: 10 },
        actionsByUser: { user1: 50, user2: 50 }
      };

      mockElasticsearchService.getAuditStatistics.mockResolvedValue(mockStats);

      const result = await auditService.getAuditStatistics('24h');

      expect(result).toEqual(mockStats);
      expect(mockElasticsearchService.getAuditStatistics).toHaveBeenCalledWith('24h');
    });

    it('should throw AppError when statistics retrieval fails', async () => {
      mockElasticsearchService.getAuditStatistics.mockRejectedValue(new Error('Stats failed'));

      await expect(auditService.getAuditStatistics()).rejects.toThrow(AppError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get audit statistics',
        { error: 'Stats failed' }
      );
    });
  });

  describe('generateComplianceReport', () => {
    beforeEach(() => {
      const mockLogs = [
        {
          id: 'log1',
          timestamp: new Date('2024-01-01'),
          userId: 'user1',
          userEmail: 'user1@example.com',
          action: 'agent.config.update',
          resource: 'terraform-agent',
          resourceType: 'agent',
          severity: 'medium',
          outcome: 'success'
        },
        {
          id: 'log2',
          timestamp: new Date('2024-01-02'),
          userId: 'system',
          userEmail: 'system@aiops.local',
          action: 'automated.scaling',
          resource: 'k8s-cluster',
          resourceType: 'cluster',
          severity: 'low',
          outcome: 'success'
        }
      ] as AuditLogEntry[];

      const mockSearchResult = {
        logs: mockLogs,
        totalCount: 2,
        searchTime: '100ms'
      };

      const mockStats = {
        totalActions: 100,
        failedActions: 5,
        actionsBySeverity: { low: 60, medium: 30, high: 10 },
        actionsByUser: { user1: 50, system: 50 }
      };

      mockElasticsearchService.searchAuditLogs.mockResolvedValue(mockSearchResult);
      mockElasticsearchService.getAuditStatistics.mockResolvedValue(mockStats);
    });

    it('should generate compliance report successfully', async () => {
      const report = await auditService.generateComplianceReport(
        '2024-01-01',
        '2024-01-31',
        'full',
        true
      );

      expect(report).toMatchObject({
        type: 'full',
        period: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31')
        },
        summary: {
          totalActions: 2,
          automatedActions: 1,
          manualActions: 1,
          failedActions: 0,
          highRiskActions: 0
        },
        sections: {
          accessControl: expect.any(Object),
          dataIntegrity: expect.any(Object),
          auditTrail: expect.any(Object)
        },
        recommendations: expect.any(Array),
        status: 'completed'
      });

      expect(report.summary.complianceScore).toBeGreaterThan(90);
    });

    it('should handle report generation failure', async () => {
      mockElasticsearchService.searchAuditLogs.mockRejectedValue(new Error('Search failed'));

      await expect(auditService.generateComplianceReport('2024-01-01', '2024-01-31'))
        .rejects.toThrow(AppError);
    });
  });

  describe('getUserActivitySummary', () => {
    it('should generate user activity summary successfully', async () => {
      const mockLogs = [
        {
          id: 'log1',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          userId: 'user123',
          action: 'agent.config.update',
          resource: 'terraform-agent',
          outcome: 'success',
          severity: 'medium'
        },
        {
          id: 'log2',
          timestamp: new Date('2024-01-01T11:00:00Z'),
          userId: 'user123',
          action: 'incident.resolve',
          resource: 'incident-456',
          outcome: 'success',
          severity: 'high'
        }
      ] as AuditLogEntry[];

      const mockSearchResult = {
        logs: mockLogs,
        totalCount: 2,
        searchTime: '50ms'
      };

      mockElasticsearchService.searchAuditLogs.mockResolvedValue(mockSearchResult);

      const summary = await auditService.getUserActivitySummary('user123', '7d');

      expect(summary).toMatchObject({
        userId: 'user123',
        timeRange: '7d',
        summary: {
          totalActions: 2,
          lastActivity: new Date('2024-01-01T10:00:00Z'),
          averageActionsPerDay: expect.any(Number)
        },
        actionBreakdown: {
          'agent.config.update': 1,
          'incident.resolve': 1
        },
        riskProfile: {
          highRiskActions: 1,
          approvalRate: expect.any(Number)
        },
        recentActions: expect.any(Array)
      });
    });

    it('should handle user with no activity', async () => {
      const mockSearchResult = {
        logs: [],
        totalCount: 0,
        searchTime: '10ms'
      };

      mockElasticsearchService.searchAuditLogs.mockResolvedValue(mockSearchResult);

      const summary = await auditService.getUserActivitySummary('inactive-user', '7d');

      expect(summary).toMatchObject({
        userId: 'inactive-user',
        summary: {
          totalActions: 0,
          lastActivity: null,
          mostActiveDay: null,
          averageActionsPerDay: 0
        },
        actionBreakdown: {},
        riskProfile: {
          highRiskActions: 0,
          approvalRate: 0
        },
        recentActions: []
      });
    });

    it('should handle service failure', async () => {
      mockElasticsearchService.searchAuditLogs.mockRejectedValue(new Error('Service error'));

      await expect(auditService.getUserActivitySummary('user123'))
        .rejects.toThrow(AppError);
    });
  });

  describe('severity determination', () => {
    it('should classify high-risk actions correctly', async () => {
      const highRiskAction: AuditAction = {
        action: 'agent.config.delete',
        resource: 'terraform-agent',
        resourceType: 'agent',
        details: {}
      };

      const context: AuditContext = {
        userId: 'user123',
        userEmail: 'user@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        correlationId: 'corr-123'
      };

      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logAuditEvent(context, highRiskAction);

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'high'
        })
      );
    });

    it('should classify medium-risk actions correctly', async () => {
      const mediumRiskAction: AuditAction = {
        action: 'agent.config.update',
        resource: 'terraform-agent',
        resourceType: 'agent',
        details: {}
      };

      const context: AuditContext = {
        userId: 'user123',
        userEmail: 'user@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        correlationId: 'corr-123'
      };

      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logAuditEvent(context, mediumRiskAction);

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'medium'
        })
      );
    });

    it('should classify low-risk actions correctly', async () => {
      const lowRiskAction: AuditAction = {
        action: 'dashboard.view',
        resource: 'dashboard',
        resourceType: 'ui',
        details: {}
      };

      const context: AuditContext = {
        userId: 'user123',
        userEmail: 'user@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        correlationId: 'corr-123'
      };

      mockElasticsearchService.indexAuditLog.mockResolvedValue(undefined);

      await auditService.logAuditEvent(context, lowRiskAction);

      expect(mockElasticsearchService.indexAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'low'
        })
      );
    });
  });
});