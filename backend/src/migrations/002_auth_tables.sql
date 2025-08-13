-- Authentication and Authorization Tables Migration

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT true,
    oauth_only BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT
);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_built_in BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User roles table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_by UUID NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
);

-- OAuth providers table
CREATE TABLE IF NOT EXISTS oauth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    auth_url VARCHAR(500) NOT NULL,
    token_url VARCHAR(500) NOT NULL,
    user_info_url VARCHAR(500) NOT NULL,
    scope VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth accounts table
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    provider VARCHAR(100) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(100) NOT NULL,
    user_id UUID,
    target_user_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON api_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Insert default permissions
INSERT INTO permissions (id, name, resource, action, description) VALUES
-- Agent management
('agents:read', 'Read Agents', 'agents', 'read', 'View agent status and information'),
('agents:write', 'Write Agents', 'agents', 'write', 'Create and update agent configurations'),
('agents:delete', 'Delete Agents', 'agents', 'delete', 'Delete agent configurations'),
('agents:execute', 'Execute Agent Actions', 'agents', 'execute', 'Execute agent actions and workflows'),

-- Configuration management
('config:read', 'Read Configuration', 'config', 'read', 'View system and agent configurations'),
('config:write', 'Write Configuration', 'config', 'write', 'Create and update configurations'),
('config:delete', 'Delete Configuration', 'config', 'delete', 'Delete configurations'),
('config:approve', 'Approve Configuration', 'config', 'approve', 'Approve high-risk configuration changes'),

-- Incident management
('incidents:read', 'Read Incidents', 'incidents', 'read', 'View incident information'),
('incidents:write', 'Write Incidents', 'incidents', 'write', 'Create and update incidents'),
('incidents:resolve', 'Resolve Incidents', 'incidents', 'resolve', 'Resolve and close incidents'),

-- Cost optimization
('cost:read', 'Read Cost Data', 'cost', 'read', 'View cost optimization reports'),
('cost:optimize', 'Execute Cost Optimization', 'cost', 'optimize', 'Execute cost optimization actions'),

-- User management
('users:read', 'Read Users', 'users', 'read', 'View user information'),
('users:write', 'Write Users', 'users', 'write', 'Create and update users'),
('users:delete', 'Delete Users', 'users', 'delete', 'Delete users'),
('users:assign_role', 'Assign User Roles', 'users', 'assign_role', 'Assign roles to users'),

-- Role management
('roles:read', 'Read Roles', 'roles', 'read', 'View role information'),
('roles:write', 'Write Roles', 'roles', 'write', 'Create and update roles'),
('roles:delete', 'Delete Roles', 'roles', 'delete', 'Delete roles'),

-- Permission management
('permissions:read', 'Read Permissions', 'permissions', 'read', 'View permission information'),

-- API key management
('api_keys:create', 'Create API Keys', 'api_keys', 'create', 'Create API keys'),
('api_keys:read', 'Read API Keys', 'api_keys', 'read', 'View API key information'),
('api_keys:delete', 'Delete API Keys', 'api_keys', 'delete', 'Revoke API keys'),

-- Credential management
('credentials:read', 'Read Credentials', 'credentials', 'read', 'View credential metadata'),
('credentials:write', 'Write Credentials', 'credentials', 'write', 'Create and update credentials'),
('credentials:delete', 'Delete Credentials', 'credentials', 'delete', 'Delete credentials'),
('credentials:rotate', 'Rotate Credentials', 'credentials', 'rotate', 'Rotate credential values'),
('credentials:manage_policies', 'Manage Rotation Policies', 'credentials', 'manage_policies', 'Create and manage credential rotation policies'),

-- Audit logs
('audit:read', 'Read Audit Logs', 'audit', 'read', 'View audit logs and compliance reports'),

-- System administration
('system:admin', 'System Administration', 'system', 'admin', 'Full system administration access')

ON CONFLICT (id) DO NOTHING;

-- Insert default roles
INSERT INTO roles (id, name, description, permissions, is_built_in) VALUES
(uuid_generate_v4(), 'admin', 'System Administrator', '["*"]', true),
(uuid_generate_v4(), 'operator', 'DevOps Operator', '[
    "agents:read", "agents:write", "agents:execute",
    "config:read", "config:write", "config:approve",
    "incidents:read", "incidents:write", "incidents:resolve",
    "cost:read", "cost:optimize",
    "credentials:read", "credentials:write", "credentials:rotate",
    "audit:read"
]', true),
(uuid_generate_v4(), 'viewer', 'Read-Only Viewer', '[
    "agents:read",
    "config:read",
    "incidents:read",
    "cost:read"
]', true),
(uuid_generate_v4(), 'incident_responder', 'Incident Response Specialist', '[
    "agents:read",
    "incidents:read", "incidents:write", "incidents:resolve",
    "config:read",
    "audit:read"
]', true)

ON CONFLICT (name) DO NOTHING;

-- Insert default admin user (password: admin123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active) VALUES
(uuid_generate_v4(), 'admin@aiops.local', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm', 'System', 'Administrator', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- Assign admin role to default admin user
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.email = 'admin@aiops.local' AND r.name = 'admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Insert sample OAuth providers (disabled by default)
INSERT INTO oauth_providers (name, client_id, client_secret, auth_url, token_url, user_info_url, scope, is_active) VALUES
('google', 'your-google-client-id', 'your-google-client-secret', 
 'https://accounts.google.com/o/oauth2/v2/auth', 
 'https://oauth2.googleapis.com/token',
 'https://www.googleapis.com/oauth2/v2/userinfo',
 'openid email profile', false),
('github', 'your-github-client-id', 'your-github-client-secret',
 'https://github.com/login/oauth/authorize',
 'https://github.com/login/oauth/access_token',
 'https://api.github.com/user',
 'user:email', false),
('microsoft', 'your-microsoft-client-id', 'your-microsoft-client-secret',
 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
 'https://graph.microsoft.com/v1.0/me',
 'openid email profile', false)
ON CONFLICT (name) DO NOTHING;