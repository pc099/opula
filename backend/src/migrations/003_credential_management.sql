-- Credential Management Tables Migration

-- Secret metadata table
CREATE TABLE IF NOT EXISTS secret_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    path VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    tags JSONB DEFAULT '[]',
    rotation_enabled BOOLEAN DEFAULT false,
    rotation_interval INTEGER, -- in days
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_rotated_at TIMESTAMP WITH TIME ZONE,
    next_rotation_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Credential rotation policies table
CREATE TABLE IF NOT EXISTS credential_rotation_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    secret_paths JSONB NOT NULL DEFAULT '[]',
    rotation_interval INTEGER NOT NULL, -- in days
    rotation_script TEXT,
    notification_channels JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Secret access logs table
CREATE TABLE IF NOT EXISTS secret_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    secret_path VARCHAR(500) NOT NULL,
    user_id UUID,
    service_id VARCHAR(255),
    action VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Agent credential mappings table
CREATE TABLE IF NOT EXISTS agent_credential_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    secret_path VARCHAR(500) NOT NULL,
    credential_type VARCHAR(100) NOT NULL, -- 'aws', 'azure', 'gcp', 'kubernetes', 'terraform', etc.
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_id, secret_path),
    FOREIGN KEY (agent_id) REFERENCES agent_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Credential rotation history table
CREATE TABLE IF NOT EXISTS credential_rotation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    secret_path VARCHAR(500) NOT NULL,
    rotation_policy_id UUID,
    rotated_by UUID,
    rotation_type VARCHAR(50) NOT NULL, -- 'manual', 'automatic', 'policy'
    success BOOLEAN NOT NULL,
    error_message TEXT,
    rotated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (rotation_policy_id) REFERENCES credential_rotation_policies(id) ON DELETE SET NULL,
    FOREIGN KEY (rotated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_secret_metadata_path ON secret_metadata(path);
CREATE INDEX IF NOT EXISTS idx_secret_metadata_created_by ON secret_metadata(created_by);
CREATE INDEX IF NOT EXISTS idx_secret_metadata_rotation ON secret_metadata(rotation_enabled, next_rotation_at);
CREATE INDEX IF NOT EXISTS idx_secret_metadata_expires_at ON secret_metadata(expires_at);

CREATE INDEX IF NOT EXISTS idx_rotation_policies_active ON credential_rotation_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_rotation_policies_created_by ON credential_rotation_policies(created_by);

CREATE INDEX IF NOT EXISTS idx_secret_access_logs_path ON secret_access_logs(secret_path);
CREATE INDEX IF NOT EXISTS idx_secret_access_logs_user_id ON secret_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_secret_access_logs_timestamp ON secret_access_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_secret_access_logs_action ON secret_access_logs(action);

CREATE INDEX IF NOT EXISTS idx_agent_credential_mappings_agent_id ON agent_credential_mappings(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_credential_mappings_type ON agent_credential_mappings(credential_type);
CREATE INDEX IF NOT EXISTS idx_agent_credential_mappings_active ON agent_credential_mappings(is_active);

CREATE INDEX IF NOT EXISTS idx_rotation_history_path ON credential_rotation_history(secret_path);
CREATE INDEX IF NOT EXISTS idx_rotation_history_policy_id ON credential_rotation_history(rotation_policy_id);
CREATE INDEX IF NOT EXISTS idx_rotation_history_rotated_at ON credential_rotation_history(rotated_at);

-- Insert sample credential rotation policies
INSERT INTO credential_rotation_policies (name, description, secret_paths, rotation_interval, notification_channels, is_active, created_by) 
SELECT 
    'AWS Credentials Rotation',
    'Automatic rotation of AWS access keys and secrets',
    '["aws/access-keys", "aws/service-accounts"]',
    90, -- 90 days
    '["email:admin@aiops.local", "slack:#security"]',
    true,
    u.id
FROM users u WHERE u.email = 'admin@aiops.local'
ON CONFLICT DO NOTHING;

INSERT INTO credential_rotation_policies (name, description, secret_paths, rotation_interval, notification_channels, is_active, created_by)
SELECT 
    'Database Credentials Rotation',
    'Automatic rotation of database passwords',
    '["database/postgres", "database/redis", "database/elasticsearch"]',
    60, -- 60 days
    '["email:admin@aiops.local"]',
    true,
    u.id
FROM users u WHERE u.email = 'admin@aiops.local'
ON CONFLICT DO NOTHING;

INSERT INTO credential_rotation_policies (name, description, secret_paths, rotation_interval, notification_channels, is_active, created_by)
SELECT 
    'API Keys Rotation',
    'Automatic rotation of third-party API keys',
    '["integrations/github", "integrations/slack", "integrations/pagerduty"]',
    30, -- 30 days
    '["email:admin@aiops.local", "slack:#integrations"]',
    true,
    u.id
FROM users u WHERE u.email = 'admin@aiops.local'
ON CONFLICT DO NOTHING;

-- Insert sample secret metadata (these would be created when secrets are actually stored)
INSERT INTO secret_metadata (name, path, description, tags, rotation_enabled, rotation_interval, created_by)
SELECT 
    'AWS Production Access Key',
    'aws/production/access-key',
    'AWS access key for production environment',
    '["aws", "production", "access-key"]',
    true,
    90,
    u.id
FROM users u WHERE u.email = 'admin@aiops.local'
ON CONFLICT (path) DO NOTHING;

INSERT INTO secret_metadata (name, path, description, tags, rotation_enabled, rotation_interval, created_by)
SELECT 
    'PostgreSQL Database Password',
    'database/postgres/password',
    'PostgreSQL database connection password',
    '["database", "postgres", "password"]',
    true,
    60,
    u.id
FROM users u WHERE u.email = 'admin@aiops.local'
ON CONFLICT (path) DO NOTHING;

INSERT INTO secret_metadata (name, path, description, tags, rotation_enabled, rotation_interval, created_by)
SELECT 
    'Kubernetes Service Account Token',
    'kubernetes/service-account/token',
    'Kubernetes service account token for agent access',
    '["kubernetes", "service-account", "token"]',
    false,
    null,
    u.id
FROM users u WHERE u.email = 'admin@aiops.local'
ON CONFLICT (path) DO NOTHING;

-- Insert sample agent credential mappings
INSERT INTO agent_credential_mappings (agent_id, secret_path, credential_type, created_by)
SELECT 
    ac.id,
    'aws/production/access-key',
    'aws',
    u.id
FROM agent_configs ac, users u 
WHERE ac.type = 'cost-optimization' AND u.email = 'admin@aiops.local'
ON CONFLICT (agent_id, secret_path) DO NOTHING;

INSERT INTO agent_credential_mappings (agent_id, secret_path, credential_type, created_by)
SELECT 
    ac.id,
    'kubernetes/service-account/token',
    'kubernetes',
    u.id
FROM agent_configs ac, users u 
WHERE ac.type = 'kubernetes' AND u.email = 'admin@aiops.local'
ON CONFLICT (agent_id, secret_path) DO NOTHING;

INSERT INTO agent_credential_mappings (agent_id, secret_path, credential_type, created_by)
SELECT 
    ac.id,
    'aws/production/access-key',
    'aws',
    u.id
FROM agent_configs ac, users u 
WHERE ac.type = 'terraform' AND u.email = 'admin@aiops.local'
ON CONFLICT (agent_id, secret_path) DO NOTHING;