-- AWS Integration Foundation Migration
-- Enhanced AWS account data models and database schema

-- AWS accounts table with comprehensive fields
CREATE TABLE IF NOT EXISTS aws_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    account_id VARCHAR(12) NOT NULL UNIQUE, -- AWS account ID (12 digits)
    credential_type VARCHAR(50) NOT NULL CHECK (credential_type IN ('access_key', 'iam_role', 'instance_profile')),
    regions TEXT[] NOT NULL DEFAULT '{}', -- Available regions
    default_region VARCHAR(50) NOT NULL DEFAULT 'us-east-1',
    role_arn VARCHAR(2048), -- For cross-account role assumption
    external_id VARCHAR(1024), -- External ID for role assumption
    session_duration INTEGER DEFAULT 3600, -- Session duration in seconds (1-12 hours)
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'validating')),
    last_validated_at TIMESTAMP WITH TIME ZONE,
    validation_error TEXT,
    tags JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}', -- Additional account metadata
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- AWS permissions table for granular permission tracking
CREATE TABLE IF NOT EXISTS aws_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL,
    service VARCHAR(100) NOT NULL, -- AWS service name (ec2, s3, rds, etc.)
    actions TEXT[] NOT NULL DEFAULT '{}', -- Allowed actions for this service
    resources TEXT[] NOT NULL DEFAULT '{}', -- Resource ARN patterns
    conditions JSONB DEFAULT '{}', -- IAM conditions
    effect VARCHAR(10) NOT NULL DEFAULT 'Allow' CHECK (effect IN ('Allow', 'Deny')),
    policy_source VARCHAR(100), -- Source policy name/ARN
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (account_id) REFERENCES aws_accounts(id) ON DELETE CASCADE
);

-- Cross-account roles table for role assumption management
CREATE TABLE IF NOT EXISTS aws_cross_account_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL,
    role_name VARCHAR(255) NOT NULL,
    role_arn VARCHAR(2048) NOT NULL,
    external_id VARCHAR(1024) NOT NULL,
    trust_policy JSONB NOT NULL, -- Trust relationship policy document
    permission_boundary VARCHAR(2048), -- Permission boundary ARN if applicable
    session_duration INTEGER DEFAULT 3600,
    max_session_duration INTEGER DEFAULT 43200, -- Maximum session duration (12 hours)
    conditions JSONB DEFAULT '{}', -- Additional assume role conditions
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_assumed_at TIMESTAMP WITH TIME ZONE,
    assumption_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, role_name),
    FOREIGN KEY (account_id) REFERENCES aws_accounts(id) ON DELETE CASCADE
);

-- AWS service capabilities table for tracking what services are available
CREATE TABLE IF NOT EXISTS aws_service_capabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL,
    region VARCHAR(50) NOT NULL,
    service VARCHAR(100) NOT NULL,
    available BOOLEAN NOT NULL DEFAULT true,
    endpoints JSONB DEFAULT '{}', -- Service endpoints
    features JSONB DEFAULT '{}', -- Available features for this service
    quotas JSONB DEFAULT '{}', -- Service quotas and limits
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (account_id) REFERENCES aws_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, region, service)
);

-- AWS credential validation history
CREATE TABLE IF NOT EXISTS aws_credential_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL,
    validation_type VARCHAR(50) NOT NULL, -- 'credential_test', 'permission_check', 'role_assumption'
    success BOOLEAN NOT NULL,
    error_message TEXT,
    response_data JSONB DEFAULT '{}',
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (account_id) REFERENCES aws_accounts(id) ON DELETE CASCADE
);

-- AWS resource discovery cache
CREATE TABLE IF NOT EXISTS aws_resource_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL,
    region VARCHAR(50) NOT NULL,
    service VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(500) NOT NULL,
    resource_arn VARCHAR(2048),
    resource_name VARCHAR(500),
    resource_data JSONB NOT NULL DEFAULT '{}',
    tags JSONB DEFAULT '{}',
    relationships JSONB DEFAULT '[]', -- Related resource ARNs
    cost_data JSONB DEFAULT '{}', -- Cost information if available
    compliance_status JSONB DEFAULT '{}', -- Compliance check results
    last_discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ttl_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '5 minutes'),
    FOREIGN KEY (account_id) REFERENCES aws_accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, region, service, resource_type, resource_id)
);

-- Performance optimization indexes
CREATE INDEX IF NOT EXISTS idx_aws_accounts_account_id ON aws_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_status ON aws_accounts(status);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_created_by ON aws_accounts(created_by);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_last_validated ON aws_accounts(last_validated_at);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_credential_type ON aws_accounts(credential_type);

CREATE INDEX IF NOT EXISTS idx_aws_permissions_account_id ON aws_permissions(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_service ON aws_permissions(service);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_account_service ON aws_permissions(account_id, service);

CREATE INDEX IF NOT EXISTS idx_aws_cross_account_roles_account_id ON aws_cross_account_roles(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_cross_account_roles_status ON aws_cross_account_roles(status);
CREATE INDEX IF NOT EXISTS idx_aws_cross_account_roles_role_arn ON aws_cross_account_roles(role_arn);

CREATE INDEX IF NOT EXISTS idx_aws_service_capabilities_account_region ON aws_service_capabilities(account_id, region);
CREATE INDEX IF NOT EXISTS idx_aws_service_capabilities_service ON aws_service_capabilities(service);
CREATE INDEX IF NOT EXISTS idx_aws_service_capabilities_available ON aws_service_capabilities(available);

CREATE INDEX IF NOT EXISTS idx_aws_credential_validations_account_id ON aws_credential_validations(account_id);
CREATE INDEX IF NOT EXISTS idx_aws_credential_validations_type ON aws_credential_validations(validation_type);
CREATE INDEX IF NOT EXISTS idx_aws_credential_validations_validated_at ON aws_credential_validations(validated_at);

CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_account_region ON aws_resource_cache(account_id, region);
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_service_type ON aws_resource_cache(service, resource_type);
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_resource_arn ON aws_resource_cache(resource_arn);
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_ttl ON aws_resource_cache(ttl_expires_at);
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_last_discovered ON aws_resource_cache(last_discovered_at);

-- GIN indexes for JSONB columns for better query performance
CREATE INDEX IF NOT EXISTS idx_aws_accounts_tags_gin ON aws_accounts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_aws_accounts_metadata_gin ON aws_accounts USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_aws_permissions_conditions_gin ON aws_permissions USING GIN (conditions);
CREATE INDEX IF NOT EXISTS idx_aws_cross_account_roles_trust_policy_gin ON aws_cross_account_roles USING GIN (trust_policy);
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_data_gin ON aws_resource_cache USING GIN (resource_data);
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_tags_gin ON aws_resource_cache USING GIN (tags);

-- Partial indexes for better performance on common queries
CREATE INDEX IF NOT EXISTS idx_aws_accounts_active ON aws_accounts(id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_aws_resource_cache_valid ON aws_resource_cache(account_id, region, service) WHERE ttl_expires_at > NOW();

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_aws_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_aws_accounts_updated_at BEFORE UPDATE ON aws_accounts FOR EACH ROW EXECUTE FUNCTION update_aws_updated_at_column();
CREATE TRIGGER update_aws_permissions_updated_at BEFORE UPDATE ON aws_permissions FOR EACH ROW EXECUTE FUNCTION update_aws_updated_at_column();
CREATE TRIGGER update_aws_cross_account_roles_updated_at BEFORE UPDATE ON aws_cross_account_roles FOR EACH ROW EXECUTE FUNCTION update_aws_updated_at_column();

-- Function to clean up expired resource cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_aws_resource_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM aws_resource_cache WHERE ttl_expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Sample data for development (only insert if no AWS accounts exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM aws_accounts LIMIT 1) THEN
        -- Insert sample AWS account (using admin user if exists)
        INSERT INTO aws_accounts (name, account_id, credential_type, regions, default_region, status, created_by)
        SELECT 
            'Development AWS Account',
            '123456789012',
            'access_key',
            ARRAY['us-east-1', 'us-west-2', 'eu-west-1'],
            'us-east-1',
            'active',
            u.id
        FROM users u WHERE u.email = 'admin@aiops.local' LIMIT 1;

        -- Insert sample permissions for the account
        INSERT INTO aws_permissions (account_id, service, actions, resources)
        SELECT 
            a.id,
            'ec2',
            ARRAY['ec2:DescribeInstances', 'ec2:DescribeImages', 'ec2:StartInstances', 'ec2:StopInstances'],
            ARRAY['arn:aws:ec2:*:123456789012:instance/*']
        FROM aws_accounts a WHERE a.account_id = '123456789012';

        INSERT INTO aws_permissions (account_id, service, actions, resources)
        SELECT 
            a.id,
            's3',
            ARRAY['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
            ARRAY['arn:aws:s3:::my-bucket/*']
        FROM aws_accounts a WHERE a.account_id = '123456789012';

        -- Insert sample service capabilities
        INSERT INTO aws_service_capabilities (account_id, region, service, available)
        SELECT 
            a.id,
            'us-east-1',
            'ec2',
            true
        FROM aws_accounts a WHERE a.account_id = '123456789012';

        INSERT INTO aws_service_capabilities (account_id, region, service, available)
        SELECT 
            a.id,
            'us-east-1',
            's3',
            true
        FROM aws_accounts a WHERE a.account_id = '123456789012';
    END IF;
END $$;