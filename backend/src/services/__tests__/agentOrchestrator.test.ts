import { AgentOrchestrator } from '../agentOrchestrator';
import { EventBus } from '../eventBus';
import { AgentConfig, SystemEvent, AgentAction } from '../../types';

// Mock EventBus
jest.mock('../eventBus', () => ({
  EventBus: jest.fn().mockImplementation(() => ({
    isHealthy: jest.fn().mockReturnValue(true),
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    emit: jest.fn(),
  })),
  eventBus: {
    isHealthy: jest.fn().mockReturnValue(true),
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    emit: jest.fn(),
  }
}));

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let mockEventBus: jest.Mocked<EventBus>;

  beforeEach(() => {
    mockEventBus = new EventBus() as jest.Mocked<EventBus>;
    orchestrator = new AgentOrchestrator(mockEventBus);
  });

  afterEach(async () => {
    if (orchestrator.isHealthy()) {
      await orchestrator.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.isHealthy()).toBe(false); // Not started yet
    });

    it('should initialize with custom configuration', () => {
      const customOrchestrator = new AgentOrchestrator(mockEventBus, {
        maxConcurrentActions: 5,
        actionTimeoutMs: 60000,
        autoApprovalEnabled: true
      });
      expect(customOrchestrator).toBeDefined();
    });
  });

  describe('Agent Registration', () => {
    const mockAgentConfig: AgentConfig = {
      id: 'test-agent-1',
      name: 'Test Agent',
      type: 'terraform',
      enabled: true,
      automationLevel: 'semi-auto',
      thresholds: { cpu: 80, memory: 90 },
      approvalRequired: false,
      integrations: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should register an agent successfully', async () => {
      await orchestrator.registerAgent(mockAgentConfig);
      
      const agents = orchestrator.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('test-agent-1');
      expect(agents[0].config.type).toBe('terraform');
      expect(agents[0].status).toBe('running');
    });

    it('should unregister an agent successfully', async () => {
      await orchestrator.registerAgent(mockAgentConfig);
      await orchestrator.unregisterAgent('test-agent-1');
      
      const agents = orchestrator.getAgents();
      expect(agents).toHaveLength(0);
    });

    it('should throw error when unregistering non-existent agent', async () => {
      await expect(orchestrator.unregisterAgent('non-existent')).rejects.toThrow('Agent not found: non-existent');
    });
  });

  describe('Event Routing', () => {
    const mockEvent: SystemEvent = {
      id: 'event-1',
      type: 'infrastructure-change',
      source: 'terraform',
      severity: 'medium',
      data: { component: 'terraform', change: 'drift-detected' },
      timestamp: new Date()
    };

    beforeEach(async () => {
      const agentConfig: AgentConfig = {
        id: 'terraform-agent',
        name: 'Terraform Agent',
        type: 'terraform',
        enabled: true,
        automationLevel: 'full-auto',
        thresholds: {},
        approvalRequired: false,
        integrations: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await orchestrator.registerAgent(agentConfig);
    });

    it('should route events to relevant agents', async () => {
      await orchestrator.routeEvent(mockEvent);
      
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'infrastructure-change',
          source: 'orchestrator-to-terraform-agent',
          data: expect.objectContaining({
            originalEventId: 'event-1',
            routedTo: 'terraform-agent'
          })
        })
      );
    });

    it('should not route events when no relevant agents', async () => {
      // Clear any previous calls from agent registration
      mockEventBus.publish.mockClear();
      
      const costEvent: SystemEvent = {
        id: 'cost-event-1',
        type: 'cost-anomaly',
        source: 'billing',
        severity: 'low',
        data: { anomaly: 'spike' },
        timestamp: new Date()
      };

      await orchestrator.routeEvent(costEvent);
      
      // Should not publish since no cost-optimization agent is registered
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('Policy Enforcement', () => {
    const mockAction: AgentAction = {
      id: 'action-1',
      agentId: 'test-agent',
      type: 'apply-terraform',
      description: 'Apply terraform changes',
      targetResources: ['vpc-123', 'subnet-456'],
      riskLevel: 'medium',
      estimatedImpact: 'Medium impact on infrastructure',
      status: 'pending'
    };

    it('should allow low-risk actions', async () => {
      const lowRiskAction = { ...mockAction, riskLevel: 'low' as const };
      const result = await orchestrator.enforcePolicy(lowRiskAction);
      expect(result).toBe(true);
    });

    it('should require approval for high-risk actions', async () => {
      const highRiskAction = { ...mockAction, riskLevel: 'high' as const };
      const result = await orchestrator.enforcePolicy(highRiskAction);
      expect(result).toBe(false);
      
      const pendingApprovals = orchestrator.getPendingApprovals();
      expect(pendingApprovals).toHaveLength(1);
    });

    it('should require approval for production resources', async () => {
      const prodAction = { 
        ...mockAction, 
        targetResources: ['prod-vpc-123', 'prod-subnet-456'],
        riskLevel: 'low' as const
      };
      const result = await orchestrator.enforcePolicy(prodAction);
      expect(result).toBe(false);
    });

    it('should require approval for destructive actions', async () => {
      const destructiveAction = { 
        ...mockAction, 
        description: 'Delete old resources',
        riskLevel: 'low' as const
      };
      const result = await orchestrator.enforcePolicy(destructiveAction);
      expect(result).toBe(false);
    });
  });

  describe('Approval Management', () => {
    const mockHighRiskAction: AgentAction = {
      id: 'high-risk-action',
      agentId: 'test-agent',
      type: 'restart-service',
      description: 'Restart production service',
      targetResources: ['prod-service-1'],
      riskLevel: 'high',
      estimatedImpact: 'High impact on production',
      status: 'pending'
    };

    beforeEach(async () => {
      // Trigger policy enforcement to add action to pending approvals
      await orchestrator.enforcePolicy(mockHighRiskAction);
    });

    it('should approve action successfully', async () => {
      await orchestrator.approveAction('high-risk-action', 'admin-user', 'Approved for maintenance');
      
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'action_approved',
            actionId: 'high-risk-action',
            approvedBy: 'admin-user'
          })
        })
      );
    });

    it('should reject action successfully', async () => {
      await orchestrator.rejectAction('high-risk-action', 'admin-user', 'Too risky');
      
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'action_rejected',
            actionId: 'high-risk-action',
            rejectedBy: 'admin-user'
          })
        })
      );
    });

    it('should throw error for non-existent approval', async () => {
      await expect(orchestrator.approveAction('non-existent', 'admin')).rejects.toThrow('No pending approval found');
    });
  });

  describe('Conflict Resolution', () => {
    const conflictingActions: AgentAction[] = [
      {
        id: 'action-1',
        agentId: 'agent-1',
        type: 'scale-pods',
        description: 'Scale up pods',
        targetResources: ['deployment-1'],
        riskLevel: 'low',
        estimatedImpact: 'Low impact',
        status: 'pending',
        executedAt: new Date('2023-01-01T10:00:00Z')
      },
      {
        id: 'action-2',
        agentId: 'agent-2',
        type: 'scale-pods',
        description: 'Scale down pods',
        targetResources: ['deployment-1'],
        riskLevel: 'high',
        estimatedImpact: 'High impact',
        status: 'pending',
        executedAt: new Date('2023-01-01T10:01:00Z')
      }
    ];

    it('should resolve priority conflicts correctly', async () => {
      const resolved = await orchestrator.resolveConflicts(conflictingActions);
      
      expect(resolved).toHaveLength(1);
      expect(resolved[0].id).toBe('action-2'); // High risk wins
    });

    it('should return single action when no conflicts', async () => {
      const singleAction = [conflictingActions[0]];
      const resolved = await orchestrator.resolveConflicts(singleAction);
      
      expect(resolved).toEqual(singleAction);
    });
  });

  describe('Lifecycle Management', () => {
    it('should start orchestrator successfully', async () => {
      await orchestrator.start();
      
      expect(orchestrator.isHealthy()).toBe(true);
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(7); // All event subscriptions
    });

    it('should stop orchestrator successfully', async () => {
      await orchestrator.start();
      await orchestrator.stop();
      
      expect(mockEventBus.unsubscribe).toHaveBeenCalledTimes(7); // All event unsubscriptions
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy when running and event bus is healthy', async () => {
      await orchestrator.start();
      expect(orchestrator.isHealthy()).toBe(true);
    });

    it('should report unhealthy when not running', () => {
      expect(orchestrator.isHealthy()).toBe(false);
    });
  });
}); 