-- AIOps Platform Database Initialization

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agent configurations table
CREATE TABLE agent_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    automation_level VARCHAR(20) DEFAULT 'manual',
    thresholds JSONB DEFAULT '{}',
    approval_required BOOLEAN DEFAULT false,
    integrations JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System events table
CREATE TABLE system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    source VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    data JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    correlation_id UUID
);

-- Agent actions table
CREATE TABLE agent_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    target_resources TEXT[] DEFAULT '{}',
    risk_level VARCHAR(20) NOT NULL,
    estimated_impact TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    executed_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Incidents table
CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    affected_resources TEXT[] DEFAULT '{}',
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_steps TEXT[] DEFAULT '{}',
    automated_resolution BOOLEAN DEFAULT false
);

-- Create indexes for better performance
CREATE INDEX idx_agent_configs_type ON agent_configs(type);
CREATE INDEX idx_agent_configs_enabled ON agent_configs(enabled);
CREATE INDEX idx_system_events_type ON system_events(type);
CREATE INDEX idx_system_events_timestamp ON system_events(timestamp);
CREATE INDEX idx_system_events_correlation_id ON system_events(correlation_id);
CREATE INDEX idx_agent_actions_agent_id ON agent_actions(agent_id);
CREATE INDEX idx_agent_actions_status ON agent_actions(status);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_severity ON incidents(severity);

-- Agent configuration versions table for rollback functionality
CREATE TABLE agent_config_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    configuration JSONB NOT NULL,
    changes JSONB,
    action VARCHAR(50) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    FOREIGN KEY (config_id) REFERENCES agent_configs(id) ON DELETE CASCADE
);

-- Configuration templates table
CREATE TABLE config_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agent_type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    is_built_in BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Approval workflow table
CREATE TABLE config_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    changes JSONB NOT NULL,
    current_config JSONB NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    risk_level VARCHAR(20) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_reason TEXT,
    FOREIGN KEY (config_id) REFERENCES agent_configs(id) ON DELETE CASCADE
);

-- Create additional indexes
CREATE INDEX idx_agent_config_versions_config_id ON agent_config_versions(config_id);
CREATE INDEX idx_agent_config_versions_version ON agent_config_versions(config_id, version_number);
CREATE INDEX idx_config_templates_type ON config_templates(agent_type);
CREATE INDEX idx_config_approvals_status ON config_approvals(status);
CREATE INDEX idx_config_approvals_config_id ON config_approvals(config_id);

-- Insert sample data
INSERT INTO agent_configs (name, type, enabled, automation_level, approval_required, thresholds) VALUES
('Terraform Infrastructure Agent', 'terraform', true, 'semi-auto', true, '{"driftCheckInterval": 30}'),
('Kubernetes Scaling Agent', 'kubernetes', true, 'full-auto', false, '{"cpuThreshold": 70, "memoryThreshold": 80}'),
('Incident Response Agent', 'incident-response', true, 'semi-auto', false, '{"responseTimeThreshold": 15, "escalationThreshold": 60}'),
('Cost Optimization Agent', 'cost-optimization', true, 'manual', true, '{"costThreshold": 100, "utilizationThreshold": 20}');

-- Insert built-in configuration templates
INSERT INTO config_templates (name, description, agent_type, config, is_built_in) VALUES
('Basic Terraform Agent', 'Standard Terraform agent with drift detection and semi-automatic mode', 'terraform', 
 '{"automationLevel": "semi-auto", "approvalRequired": true, "thresholds": {"driftCheckInterval": 30, "maxDriftResolution": 5}, "integrations": []}', true),
('Kubernetes Autoscaler', 'Kubernetes agent optimized for automatic scaling based on resource usage', 'kubernetes',
 '{"automationLevel": "full-auto", "approvalRequired": false, "thresholds": {"cpuThreshold": 70, "memoryThreshold": 80, "scaleUpThreshold": 85, "scaleDownThreshold": 30}, "integrations": []}', true),
('Basic Incident Response', 'Incident response agent with standard escalation policies', 'incident-response',
 '{"automationLevel": "semi-auto", "approvalRequired": true, "thresholds": {"responseTimeThreshold": 15, "escalationThreshold": 60, "autoResolveThreshold": 5}, "integrations": []}', true),
('Conservative Cost Optimization', 'Cost optimization agent with conservative thresholds and manual approval', 'cost-optimization',
 '{"automationLevel": "manual", "approvalRequired": true, "thresholds": {"costThreshold": 100, "utilizationThreshold": 20, "savingsThreshold": 50}, "integrations": []}', true);