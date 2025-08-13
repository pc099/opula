-- Enhanced AWS Accounts Migration
-- This migration creates comprehensive tables for AWS account management

-- AWS Accounts table with comprehensive fields
CREATE TABLE IF NOT EXISTS aws_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    account_id VARCHAR(12) NOT NULL UNIQUE,
    credential_type VARCHAR(50) NOT NULL CHECK (credential_type IN ('access_key', 'iam_role', 'instance_profile')),
    regions TEXT[] NOT NULL DEFAULT '{}',
    default_region VARCHAR(50) NOT NULL DEFAULT 'us-east-1',
    role_arn VARCHAR(2048),
    external_id VARCHAR(1224),
    session_duration INTEGER DEFAULT 3600 CHECK (session_duration BETWEEN 900 AND 43200),
    status VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'validating')),
    last_validated TIMESTAMP WITH TIME ZONE,
    tags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- AWS Permissions table for granular permission tracking
CREATE TABLE IF NOT EXISTS aws_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES aws_accounts(id) ON DELETE CASCADE,
    service VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_arn VARCHAR(2048),
    effect VARCHAR(10) NOT NULL CHECK (effect IN ('Allow', 'Deny')),
    conditions JSONB DEFAULT '{}',
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_verified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cross Account Roles table for role assumption management
CREATE TABLE IF NOT EXISTS cross_account_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES aws_accounts(id) ON DELETE CASCADE,
    role_name VARCHAR(255) NOT NULL,
    role_arn VARCHAR(2048) NOT NULL,
    external_id VARCHAR(1224) NOT NULL,
    trust_policy JSONB NOT NULL,
    permission_boundary VARCHAR(2048),
    session_duration INTEGER DEFAULT 3600 CHECK (session_duration BETWEEN 900 AND 43200),
    max_session_duration INTEGER DEFAULT 3600,
    conditions JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'testing')),
    last_assumed TIMESTAMP WITH TIME ZONE,
    assume_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AWS Account Health table for monitoring
CREATE TABLE IF NOT EXISTS aws_account_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES aws_accounts(id) ON DELETE CASCADE,
    check_type VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'warning', 'error', 'unknown')),
    message TEXT,
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- AWS Service Capabilities table
CREATE TABLE IF NOT EXISTS aws_service_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES aws_accounts(id) ON DELETE CASCADE,
    region VARCHAR(50) NOT NULL,
    service VARCHAR(100) NOT NULL,
    available BOOLEAN NOT NULL DEFAULT false,
    permissions TEXT[] DEFAULT '{}',
    limitations JSONB DEFAULT '{}',
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, region, service)
);

-- Performance optimization indexes
CREATE INDEX IF NOT EXISTS idx_aws_accounts_account_id ON aws_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_status ON aws_accounts(status);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_credential_type ON aws_accounts(credential_type);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_created_at ON aws_accounts(created_at);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_last_validated ON aws_accounts(last_validated);

CREATE INDEX IF NOT EXISTS idx_aws_permissions_account_id ON aws_permissions(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_service ON aws_permissions(service);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_action ON aws_permissions(service, action);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_effect ON aws_permissions(effect);

CREATE INDEX IF NOT EXISTS idx_cross_account_roles_account_id ON cross_account_roles(account_id);
CREATE INDEX IF NOT EXISTS idx_cross_account_roles_status ON cross_account_roles(status);
CREATE INDEX IF NOT EXISTS idx_cross_account_roles_role_arn ON cross_account_roles(role_arn);

CREATE INDEX IF NOT EXISTS idx_aws_account_health_account_id ON aws_account_health(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_account_health_status ON aws_account_health(status);
CREATE INDEX IF NOT EXISTS idx_aws_account_health_check_type ON aws_account_health(check_type);
CREATE INDEX IF NOT EXISTS idx_aws_account_health_checked_at ON aws_account_health(checked_at);

CREATE INDEX IF NOT EXISTS idx_aws_service_capabilities_account_region ON aws_service_capabilities(account_id, region);
CREATE INDEX IF NOT EXISTS idx_aws_service_capabilities_service ON aws_service_capabilities(service);
CREATE INDEX IF NOT EXISTS idx_aws_service_capabilities_available ON aws_service_capabilities(available);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_aws_accounts_status_type ON aws_accounts(status, credential_type);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_account_service ON aws_permissions(account_id, service);
CREATE INDEX IF NOT EXISTS idx_aws_account_health_account_status ON aws_account_health(account_id, status);

-- Update trigger for aws_accounts
CREATE OR REPLACE FUNCTION update_aws_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_aws_accounts_updated_at
    BEFORE UPDATE ON aws_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_aws_accounts_updated_at();

-- Update trigger for cross_account_roles
CREATE OR REPLACE FUNCTION update_cross_account_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cross_account_roles_updated_at
    BEFORE UPDATE ON cross_account_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_cross_account_roles_updated_at();

-- Comments for documentation
COMMENT ON TABLE aws_accounts IS 'Stores AWS account connection information and metadata';
COMMENT ON TABLE aws_permissions IS 'Tracks discovered AWS permissions for each account';
COMMENT ON TABLE cross_account_roles IS 'Manages cross-account role assumption configurations';
COMMENT ON TABLE aws_account_health IS 'Monitors AWS account health and connectivity status';
COMMENT ON TABLE aws_service_capabilities IS 'Tracks available AWS services and capabilities per region';

COMMENT ON COLUMN aws_accounts.credential_type IS 'Type of AWS credentials: access_key, iam_role, or instance_profile';
COMMENT ON COLUMN aws_accounts.external_id IS 'External ID for cross-account role assumption security';
COMMENT ON COLUMN aws_accounts.session_duration IS 'Session duration in seconds (900-43200)';
COMMENT ON COLUMN cross_account_roles.trust_policy IS 'IAM trust policy document for role assumption';
COMMENT ON COLUMN cross_account_roles.permission_boundary IS 'ARN of permission boundary policy if applicable';