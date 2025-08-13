// AWS Integration Types
// Comprehensive TypeScript interfaces for AWS account management

export interface AWSAccount {
  id: string;
  name: string;
  accountId: string;
  credentialType: 'access_key' | 'iam_role' | 'instance_profile';
  regions: string[];
  defaultRegion: string;
  roleArn?: string;
  externalId?: string;
  sessionDuration: number;
  status: 'active' | 'inactive' | 'error' | 'validating';
  lastValidated?: Date;
  tags: Record<string, string>;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  
  // Related data (populated via joins)
  permissions?: AWSPermission[];
  crossAccountRoles?: CrossAccountRole[];
  healthChecks?: AWSAccountHealth[];
  serviceCapabilities?: AWSServiceCapability[];
}

export interface AWSPermission {
  id: string;
  accountId: string;
  service: string;
  action: string;
  resourceArn?: string;
  effect: 'Allow' | 'Deny';
  conditions: Record<string, any>;
  discoveredAt: Date;
  lastVerified?: Date;
  createdAt: Date;
}

export interface CrossAccountRole {
  id: string;
  accountId: string;
  roleName: string;
  roleArn: string;
  externalId: string;
  trustPolicy: IAMPolicyDocument;
  permissionBoundary?: string;
  sessionDuration: number;
  maxSessionDuration: number;
  conditions: Record<string, any>;
  status: 'active' | 'inactive' | 'error' | 'testing';
  lastAssumed?: Date;
  assumeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AWSAccountHealth {
  id: string;
  accountId: string;
  checkType: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  message?: string;
  details: Record<string, any>;
  checkedAt: Date;
  resolvedAt?: Date;
}

export interface AWSServiceCapability {
  id: string;
  accountId: string;
  region: string;
  service: string;
  available: boolean;
  permissions: string[];
  limitations: Record<string, any>;
  lastChecked: Date;
}

// IAM Policy Document structure
export interface IAMPolicyDocument {
  Version: string;
  Statement: IAMStatement[];
}

export interface IAMStatement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Principal?: IAMPrincipal;
  Action?: string | string[];
  Resource?: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
}

export interface IAMPrincipal {
  AWS?: string | string[];
  Service?: string | string[];
  Federated?: string | string[];
  CanonicalUser?: string | string[];
}

// AWS Credential types
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

export interface AWSAssumeRoleCredentials extends AWSCredentials {
  roleArn: string;
  externalId?: string;
  sessionName: string;
  durationSeconds: number;
}

// Configuration interfaces
export interface AWSAccountConfig {
  name: string;
  accountId: string;
  credentialType: 'access_key' | 'iam_role' | 'instance_profile';
  regions: string[];
  defaultRegion: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    roleArn?: string;
    externalId?: string;
    sessionDuration?: number;
  };
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface CrossAccountRoleConfig {
  roleName: string;
  roleArn: string;
  externalId: string;
  trustPolicy: IAMPolicyDocument;
  permissionBoundary?: string;
  sessionDuration?: number;
  maxSessionDuration?: number;
  conditions?: Record<string, any>;
}

// Validation schemas
export interface AWSAccountValidation {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  permissions: AWSPermission[];
  regions: string[];
  services: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  details?: Record<string, any>;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
  recommendation?: string;
}

// Query and filter interfaces
export interface AWSAccountQuery {
  id?: string;
  accountId?: string;
  status?: AWSAccount['status'];
  credentialType?: AWSAccount['credentialType'];
  region?: string;
  service?: string;
  tags?: Record<string, string>;
  createdAfter?: Date;
  createdBefore?: Date;
  lastValidatedAfter?: Date;
  lastValidatedBefore?: Date;
  includePermissions?: boolean;
  includeRoles?: boolean;
  includeHealth?: boolean;
  includeCapabilities?: boolean;
}

export interface AWSAccountListOptions {
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'accountId' | 'status' | 'createdAt' | 'lastValidated';
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// Response interfaces
export interface AWSAccountListResponse {
  accounts: AWSAccount[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AWSAccountValidationResponse {
  accountId: string;
  isValid: boolean;
  status: 'success' | 'error' | 'warning';
  message: string;
  validation: AWSAccountValidation;
  timestamp: Date;
}

// Error types
export class AWSAccountError extends Error {
  constructor(
    message: string,
    public code: string,
    public accountId?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AWSAccountError';
  }
}

export class AWSCredentialError extends Error {
  constructor(
    message: string,
    public code: string,
    public accountId?: string,
    public credentialType?: string
  ) {
    super(message);
    this.name = 'AWSCredentialError';
  }
}

export class AWSPermissionError extends Error {
  constructor(
    message: string,
    public code: string,
    public accountId?: string,
    public service?: string,
    public action?: string
  ) {
    super(message);
    this.name = 'AWSPermissionError';
  }
}

// Constants
export const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'ca-central-1', 'sa-east-1'
] as const;

export const AWS_SERVICES = [
  'ec2', 's3', 'rds', 'lambda', 'cloudwatch', 'iam', 'sts', 'cloudformation',
  'cloudtrail', 'config', 'cost-explorer', 'organizations', 'support'
] as const;

export const CREDENTIAL_TYPES = ['access_key', 'iam_role', 'instance_profile'] as const;
export const ACCOUNT_STATUSES = ['active', 'inactive', 'error', 'validating'] as const;
export const ROLE_STATUSES = ['active', 'inactive', 'error', 'testing'] as const;
export const HEALTH_STATUSES = ['healthy', 'warning', 'error', 'unknown'] as const;

export type AWSRegion = typeof AWS_REGIONS[number];
export type AWSService = typeof AWS_SERVICES[number];
export type CredentialType = typeof CREDENTIAL_TYPES[number];
export type AccountStatus = typeof ACCOUNT_STATUSES[number];
export type RoleStatus = typeof ROLE_STATUSES[number];
export type HealthStatus = typeof HEALTH_STATUSES[number];