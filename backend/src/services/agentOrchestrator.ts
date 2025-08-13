import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { eventBus, EventBus } from './eventBus';
import { 
  Agent, 
  AgentAction, 
  SystemEvent, 
  HighRiskAction, 
  ApprovalResult,
  AgentConfig
} from '../types';
import { logger } from '../middleware/requestLogger';

export interface PolicyRule {
  id: string;
  name: string;
  condition: (action: AgentAction) => boolean;
  effect: 'allow' | 'deny' | 'require_approval';
  priority: number;
  enabled: boolean;
}

export interface ConflictResolutionStrategy {
  type: 'priority' | 'first_wins' | 'merge' | 'escalate';
  config: Record<string, any>;
}

export interface OrchestratorConfig {
  maxConcurrentActions: number;
  actionTimeoutMs: number;
  conflictResolutionStrategy: ConflictResolutionStrategy;
  autoApprovalEnabled: boolean;
  defaultPolicies: PolicyRule[];
}

export class AgentOrchestrator extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private activeActions: Map<string, AgentAction> = new Map();
  private pendingApprovals: Map<string, HighRiskAction> = new Map();
  private policies: Map<string, PolicyRule> = new Map();
  private eventBus: EventBus;
  private config: OrchestratorConfig;
  private isRunning: boolean = false;

  constructor(eventBus: EventBus, config: Partial<OrchestratorConfig> = {}) {
    super();
    this.eventBus = eventBus;
    this.config = {
      maxConcurrentActions: config.maxConcurrentActions || 10,
      actionTimeoutMs: config.actionTimeoutMs || 300000, // 5 minutes
      conflictResolutionStrategy: config.conflictResolutionStrategy || {
        type: 'priority',
        config: {}
      },
      autoApprovalEnabled: config.autoApprovalEnabled || false,
      defaultPolicies: config.defaultPolicies || this.getDefaultPolicies(),
      ...config
    };

    this.setupEventHandlers();
    this.loadDefaultPolicies();
  }

  private getDefaultPolicies(): PolicyRule[] {
    return [
      {
        id: 'high-risk-approval',
        name: 'High Risk Actions Require Approval',
        condition: (action) => action.riskLevel === 'high',
        effect: 'require_approval',
        priority: 100,
        enabled: true
      },
      {
        id: 'production-protection',
        name: 'Production Environment Protection',
        condition: (action) => action.targetResources.some(resource => 
          resource.includes('prod') || resource.includes('production')
        ),
        effect: 'require_approval',
        priority: 90,
        enabled: true
      },
      {
        id: 'destructive-actions',
        name: 'Destructive Actions Require Approval',
        condition: (action) => 
          action.type === 'restart-service' || 
          action.description.toLowerCase().includes('delete') ||
          action.description.toLowerCase().includes('destroy'),
        effect: 'require_approval',
        priority: 80,
        enabled: true
      },
      {
        id: 'low-risk-auto-approve',
        name: 'Auto-approve Low Risk Actions',
        condition: (action) => action.riskLevel === 'low',
        effect: 'allow',
        priority: 10,
        enabled: true
      }
    ];
  }

  private loadDefaultPolicies(): void {
    this.config.defaultPolicies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });
  }

  private setupEventHandlers(): void {
    this.eventBus.on('connected', () => {
      logger.info('Agent Orchestrator connected to Event Bus');
    });

    this.eventBus.on('error', (error) => {
      logger.error('Event Bus error in Agent Orchestrator:', error);
      this.emit('error', error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      // Connect to event bus if not already connected
      if (!this.eventBus.isHealthy()) {
        await this.eventBus.connect();
      }

      // Subscribe to agent events
      await this.eventBus.subscribe({
        topic: 'events:agent-registration',
        callback: this.handleAgentRegistration.bind(this)
      });

      await this.eventBus.subscribe({
        topic: 'events:agent-action',
        callback: this.handleAgentAction.bind(this)
      });

      await this.eventBus.subscribe({
        topic: 'events:agent-heartbeat',
        callback: this.handleAgentHeartbeat.bind(this)
      });

      // Subscribe to system events for routing
      await this.eventBus.subscribe({
        topic: 'events:infrastructure-change',
        callback: this.routeEvent.bind(this)
      });

      await this.eventBus.subscribe({
        topic: 'events:alert',
        callback: this.routeEvent.bind(this)
      });

      await this.eventBus.subscribe({
        topic: 'events:metric-threshold',
        callback: this.routeEvent.bind(this)
      });

      await this.eventBus.subscribe({
        topic: 'events:cost-anomaly',
        callback: this.routeEvent.bind(this)
      });

      this.isRunning = true;
      logger.info('Agent Orchestrator started successfully');
      this.emit('started');

      // Start periodic health checks
      this.startHealthChecks();

    } catch (error) {
      logger.error('Failed to start Agent Orchestrator:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Unsubscribe from all events
      await this.eventBus.unsubscribe('events:agent-registration');
      await this.eventBus.unsubscribe('events:agent-action');
      await this.eventBus.unsubscribe('events:agent-heartbeat');
      await this.eventBus.unsubscribe('events:infrastructure-change');
      await this.eventBus.unsubscribe('events:alert');
      await this.eventBus.unsubscribe('events:metric-threshold');
      await this.eventBus.unsubscribe('events:cost-anomaly');

      this.isRunning = false;
      logger.info('Agent Orchestrator stopped');
      this.emit('stopped');

    } catch (error) {
      logger.error('Error stopping Agent Orchestrator:', error);
      throw error;
    }
  }

  async registerAgent(agentConfig: AgentConfig): Promise<void> {
    const agent: Agent = {
      id: agentConfig.id,
      config: agentConfig,
      status: 'running',
      lastHeartbeat: new Date()
    };

    this.agents.set(agent.id, agent);
    
    logger.info(`Agent registered: ${agent.id} (${agent.config.type})`);
    
    // Publish agent registration event
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'infrastructure-change',
      source: 'orchestrator',
      severity: 'low',
      data: {
        action: 'agent_registered',
        agentId: agent.id,
        agentType: agent.config.type
      },
      timestamp: new Date()
    });

    this.emit('agentRegistered', agent);
    
    // Emit event for WebSocket service
    this.eventBus.emit('agent-registered', {
      agentId: agent.id,
      agent: this.serializeAgentForClient(agent)
    });
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Cancel any active actions by this agent
    const agentActions = Array.from(this.activeActions.values())
      .filter(action => action.agentId === agentId);

    for (const action of agentActions) {
      await this.cancelAction(action.id, 'Agent unregistered');
    }

    this.agents.delete(agentId);
    
    logger.info(`Agent unregistered: ${agentId}`);
    
    // Publish agent unregistration event
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'infrastructure-change',
      source: 'orchestrator',
      severity: 'medium',
      data: {
        action: 'agent_unregistered',
        agentId: agentId,
        agentType: agent.config.type
      },
      timestamp: new Date()
    });

    this.emit('agentUnregistered', agent);
    
    // Emit event for WebSocket service
    this.eventBus.emit('agent-unregistered', {
      agentId: agentId
    });
  }

  async routeEvent(event: SystemEvent): Promise<void> {
    logger.debug(`Routing event ${event.id} of type ${event.type}`);

    // Find agents that should handle this event type
    const relevantAgents = this.getRelevantAgents(event);
    
    if (relevantAgents.length === 0) {
      logger.warn(`No agents available to handle event ${event.id}`);
      return;
    }

    // Route event to relevant agents
    for (const agent of relevantAgents) {
      try {
        const routedEvent: SystemEvent = {
          ...event,
          id: uuidv4(), // New ID for routed event
          data: {
            ...event.data,
            originalEventId: event.id,
            routedTo: agent.id,
            routedAt: new Date().toISOString()
          }
        };

        // Publish to agent-specific topic
        await this.eventBus.publish({
          ...routedEvent,
          source: `orchestrator-to-${agent.id}`
        });

        logger.debug(`Event routed to agent ${agent.id}`);
      } catch (error) {
        logger.error(`Failed to route event to agent ${agent.id}:`, error);
      }
    }
  }

  private getRelevantAgents(event: SystemEvent): Agent[] {
    const relevantAgents: Agent[] = [];

    for (const agent of this.agents.values()) {
      if (agent.status !== 'running') {
        continue;
      }

      // Route based on event type and agent type
      const isRelevant = this.isEventRelevantForAgent(event, agent);
      if (isRelevant) {
        relevantAgents.push(agent);
      }
    }

    return relevantAgents;
  }

  private isEventRelevantForAgent(event: SystemEvent, agent: Agent): boolean {
    switch (agent.config.type) {
      case 'terraform':
        return event.type === 'infrastructure-change' || 
               (event.type === 'alert' && event.data.component === 'terraform');
      
      case 'kubernetes':
        return event.type === 'metric-threshold' || 
               (event.type === 'alert' && event.data.component === 'kubernetes');
      
      case 'incident-response':
        return event.type === 'alert' || event.severity === 'high' || event.severity === 'critical';
      
      case 'cost-optimization':
        return event.type === 'cost-anomaly' || 
               (event.type === 'metric-threshold' && event.data.metric?.includes('cost'));
      
      default:
        return false;
    }
  }

  async enforcePolicy(action: AgentAction): Promise<boolean> {
    logger.debug(`Enforcing policies for action ${action.id}`);

    // Get applicable policies sorted by priority (highest first)
    const applicablePolicies = Array.from(this.policies.values())
      .filter(policy => policy.enabled && policy.condition(action))
      .sort((a, b) => b.priority - a.priority);

    if (applicablePolicies.length === 0) {
      logger.debug(`No policies apply to action ${action.id}, allowing by default`);
      return true;
    }

    // Apply the highest priority policy
    const policy = applicablePolicies[0];
    logger.debug(`Applying policy ${policy.name} to action ${action.id}`);

    switch (policy.effect) {
      case 'allow':
        return true;
      
      case 'deny':
        logger.info(`Action ${action.id} denied by policy ${policy.name}`);
        return false;
      
      case 'require_approval':
        return await this.handleApprovalRequired(action, policy);
      
      default:
        logger.warn(`Unknown policy effect: ${policy.effect}`);
        return false;
    }
  }

  private async handleApprovalRequired(action: AgentAction, policy: PolicyRule): Promise<boolean> {
    // Check if auto-approval is enabled and conditions are met
    if (this.config.autoApprovalEnabled && this.canAutoApprove(action)) {
      logger.info(`Auto-approving action ${action.id}`);
      return true;
    }

    // Convert to high-risk action and add to pending approvals
    const highRiskAction: HighRiskAction = {
      ...action,
      approvalRequired: true,
      riskLevel: 'high',
      approvalRequestedAt: new Date()
    };

    this.pendingApprovals.set(action.id, highRiskAction);

    // Publish approval request event
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'infrastructure-change',
      source: 'orchestrator',
      severity: 'medium',
      data: {
        action: 'approval_requested',
        actionId: action.id,
        agentId: action.agentId,
        description: action.description,
        riskLevel: action.riskLevel,
        targetResources: action.targetResources,
        policyName: policy.name
      },
      timestamp: new Date()
    });

    logger.info(`Approval requested for action ${action.id} due to policy ${policy.name}`);
    this.emit('approvalRequested', highRiskAction);

    return false; // Action is blocked pending approval
  }

  private canAutoApprove(action: AgentAction): boolean {
    // Define conditions for auto-approval
    return action.riskLevel === 'low' || 
           (action.riskLevel === 'medium' && 
            !action.targetResources.some(resource => 
              resource.includes('prod') || resource.includes('production')
            ));
  }

  async requestApproval(action: HighRiskAction): Promise<ApprovalResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingApprovals.delete(action.id);
        reject(new Error(`Approval request timeout for action ${action.id}`));
      }, this.config.actionTimeoutMs);

      // Store resolver for when approval is received
      const approvalHandler = (result: ApprovalResult) => {
        clearTimeout(timeoutId);
        this.pendingApprovals.delete(action.id);
        resolve(result);
      };

      this.once(`approval:${action.id}`, approvalHandler);
    });
  }

  async approveAction(actionId: string, approvedBy: string, reason?: string): Promise<void> {
    const action = this.pendingApprovals.get(actionId);
    if (!action) {
      throw new Error(`No pending approval found for action ${actionId}`);
    }

    const result: ApprovalResult = {
      approved: true,
      approvedBy,
      approvedAt: new Date(),
      reason
    };

    // Update action with approval details
    action.approvedBy = approvedBy;
    action.approvedAt = new Date();

    // Remove from pending approvals
    this.pendingApprovals.delete(actionId);

    logger.info(`Action ${actionId} approved by ${approvedBy}`);

    // Publish approval event
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'infrastructure-change',
      source: 'orchestrator',
      severity: 'low',
      data: {
        action: 'action_approved',
        actionId,
        approvedBy,
        reason
      },
      timestamp: new Date()
    });

    this.emit(`approval:${actionId}`, result);
    this.emit('actionApproved', { action, result });
  }

  async rejectAction(actionId: string, rejectedBy: string, reason?: string): Promise<void> {
    const action = this.pendingApprovals.get(actionId);
    if (!action) {
      throw new Error(`No pending approval found for action ${actionId}`);
    }

    const result: ApprovalResult = {
      approved: false,
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      reason
    };

    // Remove from pending approvals
    this.pendingApprovals.delete(actionId);

    logger.info(`Action ${actionId} rejected by ${rejectedBy}: ${reason}`);

    // Publish rejection event
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'infrastructure-change',
      source: 'orchestrator',
      severity: 'low',
      data: {
        action: 'action_rejected',
        actionId,
        rejectedBy,
        reason
      },
      timestamp: new Date()
    });

    this.emit(`approval:${actionId}`, result);
    this.emit('actionRejected', { action, result });
  }

  async resolveConflicts(conflictingActions: AgentAction[]): Promise<AgentAction[]> {
    if (conflictingActions.length <= 1) {
      return conflictingActions;
    }

    logger.info(`Resolving conflicts between ${conflictingActions.length} actions`);

    switch (this.config.conflictResolutionStrategy.type) {
      case 'priority':
        return this.resolvePriorityConflict(conflictingActions);
      
      case 'first_wins':
        return [conflictingActions[0]];
      
      case 'merge':
        return this.resolveMergeConflict(conflictingActions);
      
      case 'escalate':
        return this.resolveEscalateConflict(conflictingActions);
      
      default:
        logger.warn(`Unknown conflict resolution strategy: ${this.config.conflictResolutionStrategy.type}`);
        return [conflictingActions[0]];
    }
  }

  private resolvePriorityConflict(actions: AgentAction[]): AgentAction[] {
    // Sort by risk level (high > medium > low) and then by timestamp
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    
    return actions.sort((a, b) => {
      const priorityDiff = priorityOrder[b.riskLevel] - priorityOrder[a.riskLevel];
      if (priorityDiff !== 0) return priorityDiff;
      
      // If same priority, earlier timestamp wins
      return (a.executedAt?.getTime() || 0) - (b.executedAt?.getTime() || 0);
    }).slice(0, 1);
  }

  private resolveMergeConflict(actions: AgentAction[]): AgentAction[] {
    // For now, just return the first action
    // In a real implementation, this would merge compatible actions
    logger.info('Merge conflict resolution not fully implemented, using first action');
    return [actions[0]];
  }

  private resolveEscalateConflict(actions: AgentAction[]): AgentAction[] {
    // Escalate to human approval
    logger.info('Escalating conflict to human approval');
    
    // Convert all actions to high-risk requiring approval
    actions.forEach(action => {
      action.riskLevel = 'high';
      this.handleApprovalRequired(action, {
        id: 'conflict-escalation',
        name: 'Conflict Escalation',
        condition: () => true,
        effect: 'require_approval',
        priority: 1000,
        enabled: true
      });
    });

    return []; // No actions proceed until approved
  }

  private async cancelAction(actionId: string, reason: string): Promise<void> {
    const action = this.activeActions.get(actionId);
    if (action) {
      action.status = 'failed';
      action.result = {
        success: false,
        message: `Action cancelled: ${reason}`,
        errors: [reason]
      };

      this.activeActions.delete(actionId);
      
      await this.eventBus.publish({
        id: uuidv4(),
        type: 'infrastructure-change',
        source: 'orchestrator',
        severity: 'medium',
        data: {
          action: 'action_cancelled',
          actionId,
          reason
        },
        timestamp: new Date()
      });

      logger.info(`Action ${actionId} cancelled: ${reason}`);
    }
  }

  private async handleAgentRegistration(event: SystemEvent): Promise<void> {
    try {
      const { agentConfig } = event.data;
      if (agentConfig) {
        await this.registerAgent(agentConfig);
      }
    } catch (error) {
      logger.error('Error handling agent registration:', error);
    }
  }

  private async handleAgentAction(event: SystemEvent): Promise<void> {
    try {
      const { action } = event.data;
      if (action) {
        // Enforce policies
        const allowed = await this.enforcePolicy(action);
        if (allowed) {
          this.activeActions.set(action.id, action);
          logger.debug(`Action ${action.id} allowed and tracked`);
        } else {
          logger.info(`Action ${action.id} blocked by policy`);
        }
      }
    } catch (error) {
      logger.error('Error handling agent action:', error);
    }
  }

  private async handleAgentHeartbeat(event: SystemEvent): Promise<void> {
    try {
      const { agentId } = event.data;
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.lastHeartbeat = new Date();
        agent.status = 'running';
      }
    } catch (error) {
      logger.error('Error handling agent heartbeat:', error);
    }
  }

  private startHealthChecks(): void {
    setInterval(() => {
      this.performHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  private performHealthCheck(): void {
    const now = new Date();
    const staleThreshold = 2 * 60 * 1000; // 2 minutes

    for (const [agentId, agent] of this.agents.entries()) {
      const timeSinceHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();
      const previousStatus = agent.status;
      const previousHealth = this.getAgentHealth(agent);
      
      if (timeSinceHeartbeat > staleThreshold && agent.status === 'running') {
        agent.status = 'error';
        logger.warn(`Agent ${agentId} marked as unhealthy (no heartbeat for ${timeSinceHeartbeat}ms)`);
        this.emit('agentUnhealthy', agent);
      }

      // Check if status or health changed and emit WebSocket event
      const currentHealth = this.getAgentHealth(agent);
      if (previousStatus !== agent.status || previousHealth !== currentHealth) {
        this.eventBus.emit('agent-status-changed', {
          agentId: agent.id,
          status: agent.status === 'running' ? 'active' : 'inactive',
          health: currentHealth,
          lastActivity: agent.lastHeartbeat.toISOString()
        });
      }

      // Emit periodic metrics update
      this.eventBus.emit('agent-metrics-updated', {
        agentId: agent.id,
        metrics: {
          actionsPerformed: 0, // TODO: Track this
          successRate: 95, // TODO: Calculate from action history
          avgResponseTime: 150 // TODO: Calculate from action history
        }
      });
    }
  }

  // Public getters
  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }



  getActiveActions(): AgentAction[] {
    return Array.from(this.activeActions.values());
  }

  getPendingApprovals(): HighRiskAction[] {
    return Array.from(this.pendingApprovals.values());
  }

  getPolicies(): PolicyRule[] {
    return Array.from(this.policies.values());
  }

  addPolicy(policy: PolicyRule): void {
    this.policies.set(policy.id, policy);
    logger.info(`Policy added: ${policy.name}`);
  }

  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
    logger.info(`Policy removed: ${policyId}`);
  }

  isHealthy(): boolean {
    return this.isRunning && this.eventBus.isHealthy();
  }

  private serializeAgentForClient(agent: Agent): any {
    return {
      id: agent.id,
      name: agent.config.name,
      type: agent.config.type,
      status: agent.status === 'running' ? 'active' : 'inactive',
      health: this.getAgentHealth(agent),
      lastActivity: agent.lastHeartbeat.toISOString(),
      metrics: {
        actionsPerformed: 0, // TODO: Track this
        successRate: 95, // TODO: Calculate from action history
        avgResponseTime: 150 // TODO: Calculate from action history
      }
    };
  }

  private getAgentHealth(agent: Agent): 'healthy' | 'warning' | 'critical' {
    const timeSinceHeartbeat = Date.now() - agent.lastHeartbeat.getTime();
    if (timeSinceHeartbeat > 300000) { // 5 minutes
      return 'critical';
    } else if (timeSinceHeartbeat > 120000) { // 2 minutes
      return 'warning';
    }
    return 'healthy';
  }

  async getAllAgents(): Promise<any[]> {
    return Array.from(this.agents.values()).map(agent => this.serializeAgentForClient(agent));
  }

  async getAgent(agentId: string): Promise<any | null> {
    const agent = this.agents.get(agentId);
    return agent ? this.serializeAgentForClient(agent) : null;
  }
}

// Singleton instance
export const agentOrchestrator = new AgentOrchestrator(eventBus);