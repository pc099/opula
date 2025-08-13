import { AgentOrchestrator } from '../agentOrchestrator';
import { EventBus } from '../eventBus';
import { AgentConfig } from '../../types';

// Simple test to verify agent orchestrator functionality
describe('AgentOrchestrator Simple Tests', () => {
  let orchestrator: AgentOrchestrator;
  let mockEventBus: any;

  beforeEach(() => {
    // Create a simple mock event bus
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

  it('should initialize successfully', () => {
    expect(orchestrator).toBeDefined();
    expect(orchestrator.getAgents()).toHaveLength(0);
  });

  it('should register an agent', async () => {
    const agentConfig: AgentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
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
    
    const agents = orchestrator.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('test-agent');
  });

  it('should have default policies loaded', () => {
    const policies = orchestrator.getPolicies();
    expect(policies.length).toBeGreaterThan(0);
    
    // Check for expected default policies
    const policyNames = policies.map(p => p.name);
    expect(policyNames).toContain('High Risk Actions Require Approval');
    expect(policyNames).toContain('Production Environment Protection');
  });
});