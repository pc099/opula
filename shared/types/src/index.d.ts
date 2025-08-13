export type AgentType = 'terraform' | 'kubernetes' | 'incident-response' | 'cost-optimization';
export type EventType = 'infrastructure-change' | 'alert' | 'metric-threshold' | 'cost-anomaly' | 'drift-detected';
export type ActionType = 'scale-pods' | 'apply-terraform' | 'restart-service' | 'optimize-resources' | 'resolve-incident';
export type AutomationLevel = 'manual' | 'semi-auto' | 'full-auto';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ActionStatus = 'pending' | 'approved' | 'executing' | 'completed' | 'failed';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';
export interface Integration {
    id: string;
    name: string;
    type: string;
    config: Record<string, any>;
    enabled: boolean;
}
export interface AgentConfig {
    id: string;
    name: string;
    type: AgentType;
    enabled: boolean;
    automationLevel: AutomationLevel;
    thresholds: Record<string, number>;
    approvalRequired: boolean;
    integrations: Integration[];
    createdAt: Date;
    updatedAt: Date;
}
export interface SystemEvent {
    id: string;
    type: EventType;
    source: string;
    severity: Severity;
    data: Record<string, any>;
    timestamp: Date;
    correlationId?: string;
}
export interface ActionResult {
    success: boolean;
    message: string;
    data?: Record<string, any>;
    errors?: string[];
}
export interface AgentAction {
    id: string;
    agentId: string;
    type: ActionType;
    description: string;
    targetResources: string[];
    riskLevel: RiskLevel;
    estimatedImpact: string;
    status: ActionStatus;
    executedAt?: Date;
    result?: ActionResult;
}
export interface Incident {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    status: IncidentStatus;
    affectedResources: string[];
    detectedAt: Date;
    resolvedAt?: Date;
    resolutionSteps: string[];
    automatedResolution: boolean;
}
export interface Agent {
    id: string;
    config: AgentConfig;
    status: 'running' | 'stopped' | 'error';
    lastHeartbeat: Date;
}
export interface HighRiskAction extends AgentAction {
    approvalRequired: true;
    riskLevel: 'high';
    approvalRequestedAt: Date;
    approvedBy?: string;
    approvedAt?: Date;
}
export interface ApprovalResult {
    approved: boolean;
    approvedBy: string;
    approvedAt: Date;
    reason?: string;
}
