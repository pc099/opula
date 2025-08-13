import { AgentOrchestrator } from '../agentOrchestrator';
import { EventBus } from '../eventBus';
import { AgentConfig, SystemEvent, AgentAction } from '../../types';

describe('AgentOrchestrator Integration Tests', () => {
  let orchestrator: AgentOrchestrator;
  let mockEventBus: any;

  beforeEach(() => {
    mockEventBus = {
      isHealthy: jest.fn().mockReturnValue(true),
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      publish: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      emit: jest.fn(),
    };
    
    orchestrator = new AgentOrchestrator(mockEventBus);
  });

  afterEach(async () => {
    if (orchestrator.isHealthy()) {
      await orchestrator.stop();
    }
  });

  describe('Task 3.2 Requirements Verification', () => {
    describe('Agent Registration and Lifecycle Management', () => {
      it('should register agents successfully', async () => {
        const agentConfig: AgentConfig = {
          id: 'terraform-agent-1',
          name: 'Terraform Agent',
          type: 'terraform',
          enabled: true,
          automationLevel: 'semi-auto',
          thresholds: { driftThreshold: 0.1 },
          approvalRequired: false,
          integrations: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await orchestrator.registerAgent(agentConfig);
        
        const agents = orchestrator.getAgents();
        expect(agents).toHaveLength(1);
        expect(agents[0].id).toBe('terraform-agent-1');
        expect(agents[0].status).toBe('running');
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'infrastructure-change',
            data: expect.objectContaining({
              action: 'agent_registered',
              agentId: 'terraform-agent-1'
            })
          })
        );
      });

      it('should unregister agents and cancel their actions', async () => {
        const agentConfig: AgentConfig = {
          id: 'test-agent',
          name: 'Test Agent',
          type: 'kubernetes',
          enabled: true,
          automationLevel: 'full-auto',
          thresholds: {},
          approvalRequired: false,
          integrations: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await orchestrator.registerAgent(agentConfig);
        await orchestrator.unregisterAgent('test-agent');
        
        const agents = orchestrator.getAgents();
        expect(agents).toHaveLength(0);
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'agent_unregistered',
              agentId: 'test-agent'
            })
          })
        );
      });

      it('should start and stop orchestrator lifecycle', async () => {
        await orchestrator.start();
        expect(orchestrator.isHealthy()).toBe(true);
        expect(mockEventBus.subscribe).toHaveBeenCalledTimes(7);

        await orchestrator.stop();
        expect(mockEventBus.unsubscribe).toHaveBeenCalledTimes(7);
      });
    });

    describe('Event Routing and Distribution', () => {
      beforeEach(async () => {
        // Register test agents
        const terraformAgent: AgentConfig = {
          id: 'terraform-agent',
          name: 'Terraform Agent',
          type: 'terraform',
          enabled: true,
          automationLevel: 'semi-auto',
          thresholds: {},
          approvalRequired: false,
          integrations: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const k8sAgent: AgentConfig = {
          id: 'k8s-agent',
          name: 'Kubernetes Agent',
          type: 'kubernetes',
          enabled: true,
          automationLevel: 'full-auto',
          thresholds: {},
          approvalRequired: false,
          integrations: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await orchestrator.registerAgent(terraformAgent);
        await orchestrator.registerAgent(k8sAgent);
      });

      it('should route infrastructure-change events to terraform agents', async () => {
        const event: SystemEvent = {
          id: 'infra-event-1',
          type: 'infrastructure-change',
          source: 'terraform',
          severity: 'medium',
          data: { component: 'terraform', change: 'drift-detected' },
          timestamp: new Date()
        };

        await orchestrator.routeEvent(event);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'infrastructure-change',
            source: 'orchestrator-to-terraform-agent',
            data: expect.objectContaining({
              originalEventId: 'infra-event-1',
              routedTo: 'terraform-agent'
            })
          })
        );
      });

      it('should route metric-threshold events to kubernetes agents', async () => {
        const event: SystemEvent = {
          id: 'metric-event-1',
          type: 'metric-threshold',
          source: 'monitoring',
          severity: 'high',
          data: { metric: 'cpu_usage', value: 85 },
          timestamp: new Date()
        };

        await orchestrator.routeEvent(event);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'orchestrator-to-k8s-agent',
            data: expect.objectContaining({
              originalEventId: 'metric-event-1',
              routedTo: 'k8s-agent'
            })
          })
        );
      });

      it('should route alert events to incident-response agents', async () => {
        const incidentAgent: AgentConfig = {
          id: 'incident-agent',
          name: 'Incident Response Agent',
          type: 'incident-response',
          enabled: true,
          automationLevel: 'semi-auto',
          thresholds: {},
          approvalRequired: true,
          integrations: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await orchestrator.registerAgent(incidentAgent);

        const event: SystemEvent = {
          id: 'alert-event-1',
          type: 'alert',
          source: 'monitoring',
          severity: 'critical',
          data: { alert: 'service_down', service: 'web-api' },
          timestamp: new Date()
        };

        await orchestrator.routeEvent(event);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'orchestrator-to-incident-agent',
            data: expect.objectContaining({
              originalEventId: 'alert-event-1',
              routedTo: 'incident-agent'
            })
          })
        );
      });
    });

    describe('Policy Enforcement Engine', () => {
      it('should enforce high-risk action approval policy', async () => {
        const highRiskAction: AgentAction = {
          id: 'high-risk-1',
          agentId: 'test-agent',
          type: 'restart-service',
          description: 'Restart production service',
          targetResources: ['prod-service-1'],
          riskLevel: 'high',
          estimatedImpact: 'High impact on production',
          status: 'pending'
        };

        const allowed = await orchestrator.enforcePolicy(highRiskAction);
        
        expect(allowed).toBe(false);
        const pendingApprovals = orchestrator.getPendingApprovals();
        expect(pendingApprovals).toHaveLength(1);
        expect(pendingApprovals[0].id).toBe('high-risk-1');
      });

      it('should enforce production environment protection policy', async () => {
        const prodAction: AgentAction = {
          id: 'prod-action-1',
          agentId: 'test-agent',
          type: 'apply-terraform',
          description: 'Apply changes to production',
          targetResources: ['prod-vpc-123', 'prod-subnet-456'],
          riskLevel: 'low',
          estimatedImpact: 'Low impact',
          status: 'pending'
        };

        const allowed = await orchestrator.enforcePolicy(prodAction);
        
        expect(allowed).toBe(false);
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'approval_requested',
              actionId: 'prod-action-1'
            })
          })
        );
      });

      it('should allow low-risk actions automatically', async () => {
        const lowRiskAction: AgentAction = {
          id: 'low-risk-1',
          agentId: 'test-agent',
          type: 'scale-pods',
          description: 'Scale development pods',
          targetResources: ['dev-deployment-1'],
          riskLevel: 'low',
          estimatedImpact: 'Low impact',
          status: 'pending'
        };

        const allowed = await orchestrator.enforcePolicy(lowRiskAction);
        
        expect(allowed).toBe(true);
      });

      it('should manage policy CRUD operations', () => {
        const customPolicy = {
          id: 'custom-policy-1',
          name: 'Custom Test Policy',
          condition: (action: AgentAction) => action.description.includes('test'),
          effect: 'deny' as const,
          priority: 50,
          enabled: true
        };

        orchestrator.addPolicy(customPolicy);
        
        const policies = orchestrator.getPolicies();
        expect(policies.find(p => p.id === 'custom-policy-1')).toBeDefined();

        orchestrator.removePolicy('custom-policy-1');
        
        const updatedPolicies = orchestrator.getPolicies();
        expect(updatedPolicies.find(p => p.id === 'custom-policy-1')).toBeUndefined();
      });
    });

    describe('Conflict Resolution Logic', () => {
      it('should resolve priority-based conflicts correctly', async () => {
        const conflictingActions: AgentAction[] = [
          {
            id: 'action-low',
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
            id: 'action-high',
            agentId: 'agent-2',
            type: 'restart-service',
            description: 'Restart service',
            targetResources: ['deployment-1'],
            riskLevel: 'high',
            estimatedImpact: 'High impact',
            status: 'pending',
            executedAt: new Date('2023-01-01T10:01:00Z')
          },
          {
            id: 'action-medium',
            agentId: 'agent-3',
            type: 'apply-terraform',
            description: 'Apply terraform',
            targetResources: ['deployment-1'],
            riskLevel: 'medium',
            estimatedImpact: 'Medium impact',
            status: 'pending',
            executedAt: new Date('2023-01-01T10:02:00Z')
          }
        ];

        const resolved = await orchestrator.resolveConflicts(conflictingActions);
        
        expect(resolved).toHaveLength(1);
        expect(resolved[0].id).toBe('action-high'); // Highest risk wins
      });

      it('should handle first-wins conflict resolution', async () => {
        const customOrchestrator = new AgentOrchestrator(mockEventBus, {
          conflictResolutionStrategy: {
            type: 'first_wins',
            config: {}
          }
        });

        const conflictingActions: AgentAction[] = [
          {
            id: 'first-action',
            agentId: 'agent-1',
            type: 'scale-pods',
            description: 'First action',
            targetResources: ['deployment-1'],
            riskLevel: 'low',
            estimatedImpact: 'Low impact',
            status: 'pending'
          },
          {
            id: 'second-action',
            agentId: 'agent-2',
            type: 'scale-pods',
            description: 'Second action',
            targetResources: ['deployment-1'],
            riskLevel: 'high',
            estimatedImpact: 'High impact',
            status: 'pending'
          }
        ];

        const resolved = await customOrchestrator.resolveConflicts(conflictingActions);
        
        expect(resolved).toHaveLength(1);
        expect(resolved[0].id).toBe('first-action');
      });
    });

    describe('Approval Management', () => {
      let highRiskAction: AgentAction;

      beforeEach(async () => {
        highRiskAction = {
          id: 'approval-test-action',
          agentId: 'test-agent',
          type: 'restart-service',
          description: 'Restart production service',
          targetResources: ['prod-service-1'],
          riskLevel: 'high',
          estimatedImpact: 'High impact',
          status: 'pending'
        };

        // Trigger policy enforcement to add to pending approvals
        await orchestrator.enforcePolicy(highRiskAction);
      });

      it('should approve actions successfully', async () => {
        await orchestrator.approveAction('approval-test-action', 'admin@example.com', 'Approved for maintenance');

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'action_approved',
              actionId: 'approval-test-action',
              approvedBy: 'admin@example.com'
            })
          })
        );

        const pendingApprovals = orchestrator.getPendingApprovals();
        expect(pendingApprovals.find(a => a.id === 'approval-test-action')).toBeUndefined();
      });

      it('should reject actions successfully', async () => {
        await orchestrator.rejectAction('approval-test-action', 'admin@example.com', 'Too risky for current time');

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'action_rejected',
              actionId: 'approval-test-action',
              rejectedBy: 'admin@example.com'
            })
          })
        );
      });

      it('should throw error for non-existent approval requests', async () => {
        await expect(
          orchestrator.approveAction('non-existent-action', 'admin@example.com')
        ).rejects.toThrow('No pending approval found');
      });
    });

    describe('Health and Monitoring', () => {
      it('should report health status correctly', () => {
        expect(orchestrator.isHealthy()).toBe(false); // Not started
      });

      it('should track agent health via heartbeats', async () => {
        const agentConfig: AgentConfig = {
          id: 'health-test-agent',
          name: 'Health Test Agent',
          type: 'terraform',
          enabled: true,
          automationLevel: 'semi-auto',
          thresholds: {},
          approvalRequired: false,
          integrations: [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await orchestrator.registerAgent(agentConfig);
        
        const agent = orchestrator.getAgent('health-test-agent');
        expect(agent?.status).toBe('running');
        expect(agent?.lastHeartbeat).toBeInstanceOf(Date);
      });
    });
  });
});