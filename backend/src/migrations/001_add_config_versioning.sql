-- Configuration versioning table
CREATE TABLE IF NOT EXISTS agent_config_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    configuration JSONB NOT NULL,
    changes JSONB,
    action VARCHAR(50) NOT NULL, -- 'Created', 'Updated', 'Deleted', 'Rollback'
    changed_by VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agent_config_versions_config_id ON agent_config_versions(config_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_versions_version ON agent_config_versions(config_id, version_number);
CREATE INDEX IF NOT EXISTS idx_agent_config_versions_changed_at ON agent_config_versions(changed_at);

-- Create unique constraint to prevent duplicate version numbers for same config
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_config_versions_unique ON agent_config_versions(config_id, version_number);