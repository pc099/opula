// AWS Account Configuration Validation Schemas

import { z } from 'zod';
import { CredentialType, AccountStatus } from '../types/aws';

// AWS Account ID validation (12 digits)
const AWS_ACCOUNT_ID_REGEX = /^\d{12}$/;

// AWS ARN validation pattern
const AWS_ARN_REGEX = /^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:[a-zA-Z0-9-\/\*]+$/;

// AWS Region validation (standard AWS region format)
const AWS_REGION_REGEX = /^[a-z]{2}-[a-z]+-\d{1}$/;

// Valid AWS regions (commonly used ones)
const VALID_AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'ca-central-1', 'sa-east-1'
];

// AWS Access Key ID pattern (20 characters, starts with AKIA)
const AWS_ACCESS_KEY_ID_REGEX = /^AKIA[0-9A-Z]{16}$/;

// AWS Secret Access Key pattern (40 characters, base64-like)
const AWS_SECRET_ACCESS_KEY_REGEX = /^[A-Za-z0-9/+=]{40}$/;

// External ID validation (1-1224 characters, alphanumeric and specific symbols)
const EXTERNAL_ID_REGEX = /^[a-zA-Z0-9+=,.@:/-]{1,1224}$/;

// AWS Account Configuration Schema
export const AWSAccountConfigSchema = z.object({
  name: z.string()
    .min(1, 'Account name is required')
    .max(255, 'Account name must be less than 255 characters')
    .regex(/^[a-zA-Z0-9\s\-_\.]+$/, 'Account name contains invalid characters'),
  
  accountId: z.string()
    .regex(AWS_ACCOUNT_ID_REGEX, 'AWS Account ID must be exactly 12 digits'),
  
  credentialType: z.enum(['access_key', 'iam_role', 'instance_profile'] as const),
  
  regions: z.array(z.string().regex(AWS_REGION_REGEX, 'Invalid AWS region format'))
    .min(1, 'At least one region must be specified')
    .refine(
      (regions) => regions.every(region => VALID_AWS_REGIONS.includes(region)),
      'All regions must be valid AWS regions'
    ),
  
  defaultRegion: z.string()
    .regex(AWS_REGION_REGEX, 'Invalid default region format')
    .refine(
      (region) => VALID_AWS_REGIONS.includes(region),
      'Default region must be a valid AWS region'
    ),
  
  roleArn: z.string()
    .regex(AWS_ARN_REGEX, 'Invalid AWS role ARN format')
    .optional(),
  
  externalId: z.string()
    .regex(EXTERNAL_ID_REGEX, 'Invalid external ID format')
    .optional(),
  
  sessionDuration: z.number()
    .min(900, 'Session duration must be at least 15 minutes (900 seconds)')
    .max(43200, 'Session duration cannot exceed 12 hours (43200 seconds)')
    .default(3600),
  
  tags: z.record(z.string(), z.string()).default({}),
  
  metadata: z.record(z.string(), z.any()).default({})
}).refine(
  (data) => {
    // If credential type is iam_role, roleArn is required
    if (data.credentialType === 'iam_role' && !data.roleArn) {
      return false;
    }
    return true;
  },
  {
    message: 'Role ARN is required when credential type is iam_role',
    path: ['roleArn']
  }
).refine(
  (data) => {
    // If roleArn is provided, externalId should be provided for security
    if (data.roleArn && !data.externalId) {
      return false;
    }
    return true;
  },
  {
    message: 'External ID is recommended when using cross-account roles',
    path: ['externalId']
  }
).refine(
  (data) => {
    // Default region must be in the regions array
    return data.regions.includes(data.defaultRegion);
  },
  {
    message: 'Default region must be included in the regions array',
    path: ['defaultRegion']
  }
);

// AWS Account Validation Request Schema
export const AWSAccountValidationRequestSchema = z.object({
  accountId: z.string().regex(AWS_ACCOUNT_ID_REGEX, 'Invalid AWS Account ID'),
  
  credentialType: z.enum(['access_key', 'iam_role', 'instance_profile'] as const),
  
  accessKeyId: z.string()
    .regex(AWS_ACCESS_KEY_ID_REGEX, 'Invalid AWS Access Key ID format')
    .optional(),
  
  secretAccessKey: z.string()
    .regex(AWS_SECRET_ACCESS_KEY_REGEX, 'Invalid AWS Secret Access Key format')
    .optional(),
  
  roleArn: z.string()
    .regex(AWS_ARN_REGEX, 'Invalid AWS role ARN format')
    .optional(),
  
  externalId: z.string()
    .regex(EXTERNAL_ID_REGEX, 'Invalid external ID format')
    .optional(),
  
  region: z.string()
    .regex(AWS_REGION_REGEX, 'Invalid AWS region format')
    .refine(region => VALID_AWS_REGIONS.includes(region), 'Invalid AWS region')
    .default('us-east-1')
}).refine(
  (data) => {
    // For access_key type, both accessKeyId and secretAccessKey are required
    if (data.credentialType === 'access_key') {
      return data.accessKeyId && data.secretAccessKey;
    }
    return true;
  },
  {
    message: 'Access Key ID and Secret Access Key are required for access_key credential type',
    path: ['accessKeyId']
  }
).refine(
  (data) => {
    // For iam_role type, roleArn is required
    if (data.credentialType === 'iam_role') {
      return data.roleArn;
    }
    return true;
  },
  {
    message: 'Role ARN is required for iam_role credential type',
    path: ['roleArn']
  }
);

// AWS Permission Schema
export const AWSPermissionSchema = z.object({
  service: z.string()
    .min(1, 'Service name is required')
    .max(100, 'Service name must be less than 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Service name must contain only lowercase letters, numbers, and hyphens'),
  
  actions: z.array(z.string().min(1, 'Action cannot be empty'))
    .min(1, 'At least one action must be specified'),
  
  resources: z.array(z.string().min(1, 'Resource cannot be empty'))
    .min(1, 'At least one resource must be specified'),
  
  conditions: z.record(z.string(), z.any()).default({}),
  
  effect: z.enum(['Allow', 'Deny'] as const).default('Allow'),
  
  policySource: z.string().max(100).optional()
});

// Cross-Account Role Schema
export const CrossAccountRoleSchema = z.object({
  roleName: z.string()
    .min(1, 'Role name is required')
    .max(255, 'Role name must be less than 255 characters')
    .regex(/^[a-zA-Z0-9+=,.@_-]+$/, 'Role name contains invalid characters'),
  
  roleArn: z.string()
    .regex(AWS_ARN_REGEX, 'Invalid AWS role ARN format'),
  
  externalId: z.string()
    .regex(EXTERNAL_ID_REGEX, 'Invalid external ID format'),
  
  trustPolicy: z.object({
    Version: z.string().default('2012-10-17'),
    Statement: z.array(z.object({
      Sid: z.string().optional(),
      Effect: z.enum(['Allow', 'Deny']),
      Principal: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
      Action: z.union([z.string(), z.array(z.string())]).optional(),
      Resource: z.union([z.string(), z.array(z.string())]).optional(),
      Condition: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.array(z.string())]))).optional()
    })).min(1, 'Trust policy must have at least one statement')
  }),
  
  permissionBoundary: z.string()
    .regex(AWS_ARN_REGEX, 'Invalid permission boundary ARN format')
    .optional(),
  
  sessionDuration: z.number()
    .min(900, 'Session duration must be at least 15 minutes')
    .max(43200, 'Session duration cannot exceed 12 hours')
    .default(3600),
  
  maxSessionDuration: z.number()
    .min(3600, 'Maximum session duration must be at least 1 hour')
    .max(43200, 'Maximum session duration cannot exceed 12 hours')
    .default(43200),
  
  conditions: z.record(z.string(), z.any()).default({})
}).refine(
  (data) => {
    // Session duration cannot exceed max session duration
    return data.sessionDuration <= data.maxSessionDuration;
  },
  {
    message: 'Session duration cannot exceed maximum session duration',
    path: ['sessionDuration']
  }
);

// AWS Resource Discovery Request Schema
export const AWSResourceDiscoveryRequestSchema = z.object({
  accountId: z.string().regex(AWS_ACCOUNT_ID_REGEX, 'Invalid AWS Account ID'),
  
  regions: z.array(z.string().regex(AWS_REGION_REGEX, 'Invalid AWS region format'))
    .refine(
      (regions) => regions.every(region => VALID_AWS_REGIONS.includes(region)),
      'All regions must be valid AWS regions'
    )
    .optional(),
  
  services: z.array(z.string().min(1, 'Service name cannot be empty'))
    .optional(),
  
  resourceTypes: z.array(z.string().min(1, 'Resource type cannot be empty'))
    .optional(),
  
  forceRefresh: z.boolean().default(false)
});

// AWS Cost Analysis Request Schema
export const AWSCostAnalysisRequestSchema = z.object({
  accountId: z.string().regex(AWS_ACCOUNT_ID_REGEX, 'Invalid AWS Account ID'),
  
  startDate: z.date()
    .refine(date => date <= new Date(), 'Start date cannot be in the future'),
  
  endDate: z.date()
    .refine(date => date <= new Date(), 'End date cannot be in the future'),
  
  granularity: z.enum(['DAILY', 'MONTHLY'] as const).default('DAILY'),
  
  groupBy: z.array(z.string().min(1, 'Group by dimension cannot be empty'))
    .optional(),
  
  filters: z.record(z.string(), z.array(z.string()))
    .optional()
}).refine(
  (data) => {
    // End date must be after start date
    return data.endDate > data.startDate;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate']
  }
).refine(
  (data) => {
    // Date range cannot exceed 1 year
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    return (data.endDate.getTime() - data.startDate.getTime()) <= oneYearMs;
  },
  {
    message: 'Date range cannot exceed 1 year',
    path: ['endDate']
  }
);

// Validation helper functions
export const validateAWSAccountId = (accountId: string): boolean => {
  return AWS_ACCOUNT_ID_REGEX.test(accountId);
};

export const validateAWSRegion = (region: string): boolean => {
  return AWS_REGION_REGEX.test(region) && VALID_AWS_REGIONS.includes(region);
};

export const validateAWSArn = (arn: string): boolean => {
  return AWS_ARN_REGEX.test(arn);
};

export const validateAWSAccessKeyId = (accessKeyId: string): boolean => {
  return AWS_ACCESS_KEY_ID_REGEX.test(accessKeyId);
};

export const validateAWSSecretAccessKey = (secretAccessKey: string): boolean => {
  return AWS_SECRET_ACCESS_KEY_REGEX.test(secretAccessKey);
};

export const validateExternalId = (externalId: string): boolean => {
  return EXTERNAL_ID_REGEX.test(externalId);
};

// Type exports for the schemas
export type AWSAccountConfigInput = z.infer<typeof AWSAccountConfigSchema>;
export type AWSAccountValidationRequestInput = z.infer<typeof AWSAccountValidationRequestSchema>;
export type AWSPermissionInput = z.infer<typeof AWSPermissionSchema>;
export type CrossAccountRoleInput = z.infer<typeof CrossAccountRoleSchema>;
export type AWSResourceDiscoveryRequestInput = z.infer<typeof AWSResourceDiscoveryRequestSchema>;
export type AWSCostAnalysisRequestInput = z.infer<typeof AWSCostAnalysisRequestSchema>;