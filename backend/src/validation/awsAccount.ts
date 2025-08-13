// AWS Account Validation Schemas
// Comprehensive validation for AWS account configuration data

import Joi from 'joi';
import { 
  AWS_REGIONS, 
  AWS_SERVICES, 
  CREDENTIAL_TYPES, 
  ACCOUNT_STATUSES, 
  ROLE_STATUSES 
} from '../types/aws';

// AWS Account ID validation (12 digits)
const awsAccountIdSchema = Joi.string()
  .pattern(/^\d{12}$/)
  .required()
  .messages({
    'string.pattern.base': 'AWS Account ID must be exactly 12 digits',
    'any.required': 'AWS Account ID is required'
  });

// AWS ARN validation
const awsArnSchema = Joi.string()
  .pattern(/^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:.+$/)
  .messages({
    'string.pattern.base': 'Invalid AWS ARN format'
  });

// External ID validation (1-1224 characters, alphanumeric and specific symbols)
const externalIdSchema = Joi.string()
  .min(1)
  .max(1224)
  .pattern(/^[a-zA-Z0-9+=,.@:/-]+$/)
  .messages({
    'string.min': 'External ID must be at least 1 character',
    'string.max': 'External ID cannot exceed 1224 characters',
    'string.pattern.base': 'External ID contains invalid characters'
  });

// Session duration validation (15 minutes to 12 hours)
const sessionDurationSchema = Joi.number()
  .integer()
  .min(900)
  .max(43200)
  .default(3600)
  .messages({
    'number.min': 'Session duration must be at least 900 seconds (15 minutes)',
    'number.max': 'Session duration cannot exceed 43200 seconds (12 hours)'
  });

// AWS Account creation/update schema
export const awsAccountSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(255)
    .required()
    .messages({
      'string.min': 'Account name must be at least 1 character',
      'string.max': 'Account name cannot exceed 255 characters',
      'any.required': 'Account name is required'
    }),

  accountId: awsAccountIdSchema,

  credentialType: Joi.string()
    .valid(...CREDENTIAL_TYPES)
    .required()
    .messages({
      'any.only': 'Credential type must be one of: access_key, iam_role, instance_profile',
      'any.required': 'Credential type is required'
    }),

  regions: Joi.array()
    .items(Joi.string().valid(...AWS_REGIONS))
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one region must be specified',
      'any.required': 'Regions are required'
    }),

  defaultRegion: Joi.string()
    .valid(...AWS_REGIONS)
    .required()
    .messages({
      'any.only': 'Default region must be a valid AWS region',
      'any.required': 'Default region is required'
    }),

  roleArn: Joi.when('credentialType', {
    is: 'iam_role',
    then: awsArnSchema.required(),
    otherwise: awsArnSchema.optional()
  }),

  externalId: Joi.when('credentialType', {
    is: 'iam_role',
    then: externalIdSchema.optional(),
    otherwise: Joi.forbidden()
  }),

  sessionDuration: sessionDurationSchema,

  tags: Joi.object()
    .pattern(
      Joi.string().max(128),
      Joi.string().max(256)
    )
    .max(50)
    .default({})
    .messages({
      'object.max': 'Cannot have more than 50 tags'
    }),

  metadata: Joi.object().default({})
});

// AWS Account update schema (all fields optional except ID)
export const awsAccountUpdateSchema = Joi.object({
  id: Joi.string().uuid().required(),
  name: Joi.string().min(1).max(255),
  regions: Joi.array().items(Joi.string().valid(...AWS_REGIONS)).min(1),
  defaultRegion: Joi.string().valid(...AWS_REGIONS),
  roleArn: awsArnSchema,
  externalId: externalIdSchema,
  sessionDuration: sessionDurationSchema,
  tags: Joi.object().pattern(Joi.string().max(128), Joi.string().max(256)).max(50),
  metadata: Joi.object()
});

// Cross Account Role schema
export const crossAccountRoleSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  
  roleName: Joi.string()
    .min(1)
    .max(64)
    .pattern(/^[a-zA-Z0-9+=,.@_-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Role name contains invalid characters',
      'string.max': 'Role name cannot exceed 64 characters'
    }),

  roleArn: awsArnSchema.required(),
  
  externalId: externalIdSchema.required(),
  
  trustPolicy: Joi.object({
    Version: Joi.string().valid('2012-10-17').required(),
    Statement: Joi.array().items(
      Joi.object({
        Sid: Joi.string().optional(),
        Effect: Joi.string().valid('Allow', 'Deny').required(),
        Principal: Joi.object().optional(),
        Action: Joi.alternatives().try(
          Joi.string(),
          Joi.array().items(Joi.string())
        ).optional(),
        Resource: Joi.alternatives().try(
          Joi.string(),
          Joi.array().items(Joi.string())
        ).optional(),
        Condition: Joi.object().optional()
      })
    ).min(1).required()
  }).required(),

  permissionBoundary: awsArnSchema.optional(),
  
  sessionDuration: sessionDurationSchema,
  
  maxSessionDuration: Joi.number()
    .integer()
    .min(3600)
    .max(43200)
    .default(3600),

  conditions: Joi.object().default({})
});

// AWS Permission schema
export const awsPermissionSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  
  service: Joi.string()
    .valid(...AWS_SERVICES)
    .required(),
    
  action: Joi.string()
    .pattern(/^[a-zA-Z0-9*:]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid AWS action format'
    }),
    
  resourceArn: awsArnSchema.optional(),
  
  effect: Joi.string()
    .valid('Allow', 'Deny')
    .required(),
    
  conditions: Joi.object().default({})
});

// AWS Account Health Check schema
export const awsAccountHealthSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  
  checkType: Joi.string()
    .valid(
      'credential_validation',
      'permission_check',
      'service_availability',
      'cost_monitoring',
      'security_compliance'
    )
    .required(),
    
  status: Joi.string()
    .valid('healthy', 'warning', 'error', 'unknown')
    .required(),
    
  message: Joi.string().max(1000).optional(),
  
  details: Joi.object().default({})
});

// AWS Service Capability schema
export const awsServiceCapabilitySchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  
  region: Joi.string()
    .valid(...AWS_REGIONS)
    .required(),
    
  service: Joi.string()
    .valid(...AWS_SERVICES)
    .required(),
    
  available: Joi.boolean().required(),
  
  permissions: Joi.array()
    .items(Joi.string())
    .default([]),
    
  limitations: Joi.object().default({})
});

// Query parameter schemas
export const awsAccountQuerySchema = Joi.object({
  id: Joi.string().uuid(),
  accountId: awsAccountIdSchema,
  status: Joi.string().valid(...ACCOUNT_STATUSES),
  credentialType: Joi.string().valid(...CREDENTIAL_TYPES),
  region: Joi.string().valid(...AWS_REGIONS),
  service: Joi.string().valid(...AWS_SERVICES),
  tags: Joi.object(),
  createdAfter: Joi.date().iso(),
  createdBefore: Joi.date().iso(),
  lastValidatedAfter: Joi.date().iso(),
  lastValidatedBefore: Joi.date().iso(),
  includePermissions: Joi.boolean().default(false),
  includeRoles: Joi.boolean().default(false),
  includeHealth: Joi.boolean().default(false),
  includeCapabilities: Joi.boolean().default(false)
});

export const awsAccountListOptionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('name', 'accountId', 'status', 'createdAt', 'lastValidated').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().max(255)
});

// Credential validation schemas
export const awsCredentialsSchema = Joi.object({
  accessKeyId: Joi.string()
    .pattern(/^AKIA[0-9A-Z]{16}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid AWS Access Key ID format'
    }),
    
  secretAccessKey: Joi.string()
    .min(40)
    .max(40)
    .required()
    .messages({
      'string.min': 'AWS Secret Access Key must be 40 characters',
      'string.max': 'AWS Secret Access Key must be 40 characters'
    }),
    
  sessionToken: Joi.string().optional(),
  
  expiration: Joi.date().optional()
});

// Custom validation functions
export const validateDefaultRegionInRegions = (value: any, helpers: any) => {
  const { defaultRegion, regions } = value;
  
  if (defaultRegion && regions && !regions.includes(defaultRegion)) {
    return helpers.error('custom.defaultRegionNotInRegions');
  }
  
  return value;
};

// Add custom validation to account schema
export const awsAccountSchemaWithCustomValidation = awsAccountSchema.custom(validateDefaultRegionInRegions).messages({
  'custom.defaultRegionNotInRegions': 'Default region must be included in the regions list'
});

// Validation helper functions
export const validateAWSAccountId = (accountId: string): boolean => {
  return /^\d{12}$/.test(accountId);
};

export const validateAWSArn = (arn: string): boolean => {
  return /^arn:aws:[a-zA-Z0-9-]+:[a-zA-Z0-9-]*:\d{12}:.+$/.test(arn);
};

export const validateExternalId = (externalId: string): boolean => {
  return /^[a-zA-Z0-9+=,.@:/-]+$/.test(externalId) && 
         externalId.length >= 1 && 
         externalId.length <= 1224;
};

export const validateSessionDuration = (duration: number): boolean => {
  return Number.isInteger(duration) && duration >= 900 && duration <= 43200;
};

// Error messages
export const AWS_VALIDATION_ERRORS = {
  INVALID_ACCOUNT_ID: 'AWS Account ID must be exactly 12 digits',
  INVALID_ARN: 'Invalid AWS ARN format',
  INVALID_EXTERNAL_ID: 'External ID contains invalid characters or invalid length',
  INVALID_SESSION_DURATION: 'Session duration must be between 900 and 43200 seconds',
  INVALID_REGION: 'Invalid AWS region',
  INVALID_SERVICE: 'Invalid AWS service',
  INVALID_CREDENTIAL_TYPE: 'Invalid credential type',
  DEFAULT_REGION_NOT_IN_REGIONS: 'Default region must be included in regions list',
  ROLE_ARN_REQUIRED: 'Role ARN is required for IAM role credential type',
  EXTERNAL_ID_NOT_ALLOWED: 'External ID is only allowed for IAM role credential type'
} as const;