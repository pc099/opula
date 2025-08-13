# Secure Credential Management System

This document describes the comprehensive secure credential management system implemented for the AIOps Platform, which provides encrypted credential storage using HashiCorp Vault, automated credential rotation, secure credential injection for agents, and comprehensive audit logging.

## Overview

The credential management system consists of several key components:

1. **VaultService** - Handles encrypted storage and retrieval of secrets using HashiCorp Vault
2. **CredentialInjectionService** - Manages secure credential injection for AI agents
3. **CredentialRotationScheduler** - Automates credential rotation based on policies
4. **Audit Logging** - Comprehensive logging of all credential access and operations

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Agents     │    │   Frontend      │    │   CLI Tools     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
    ┌─────▼──────────────────────▼──────────────────────▼─────┐
    │              Credential API Gateway                     │
    └─────┬───────────────────────────────────────────┬───────┘
          │                                           │
    ┌─────▼─────┐                               ┌─────▼─────┐
    │  Vault    │                               │ Rotation  │
    │ Service   │                               │Scheduler  │
    └─────┬─────┘                               └─────┬─────┘
          │                                           │
    ┌─────▼─────┐    ┌─────────────┐    ┌─────────────▼─────┐
    │ HashiCorp │    │ PostgreSQL  │    │   Audit Service   │
    │   Vault   │    │ (Metadata)  │    │  (Elasticsearch)  │
    └───────────┘    └─────────────┘    └───────────────────┘
```

## Features

### 1. Encrypted Credential Storage

- **HashiCorp Vault Integration**: All secrets are stored encrypted in Vault using KV v2 engine
- **Multiple Authentication Methods**: Supports token-based and AppRole authentication
- **Namespace Support**: Multi-tenant credential isolation
- **Secret Versioning**: Automatic versioning of secret changes

### 2. Credential Lifecycle Management

- **Automated Rotation**: Policy-based automatic credential rotation
- **Manual Rotation**: On-demand credential rotation via API or CLI
- **Expiration Management**: Automatic handling of credential expiration
- **Rollback Support**: Ability to rollback to previous credential versions

### 3. Secure Agent Injection

- **Type-Safe Injection**: Strongly typed credential injection for different agent types
- **Just-in-Time Access**: Credentials are fetched only when needed
- **Credential Mapping**: Flexible mapping of credentials to agents
- **Validation**: Automatic validation of credential integrity and expiration

### 4. Comprehensive Audit Logging

- **Access Logging**: Every credential access is logged with full context
- **Change Tracking**: All credential modifications are tracked
- **Compliance Reporting**: Generate compliance reports for audits
- **Real-time Monitoring**: Real-time alerts for suspicious access patterns

## API Endpoints

### Secret Management

```http
GET    /api/credentials/secrets              # List all secrets
POST   /api/credentials/secrets              # Create new secret
GET    /api/credentials/secrets/{path}       # Get secret metadata
PUT    /api/credentials/secrets/{path}       # Update secret
DELETE /api/credentials/secrets/{path}       # Delete secret
POST   /api/credentials/secrets/{path}/rotate # Rotate secret
```

### Agent Credential Management

```http
GET    /api/credentials/agents/{id}/credentials         # Get agent credentials
POST   /api/credentials/agents/{id}/credentials         # Map credential to agent
DELETE /api/credentials/agents/{id}/credentials/{path}  # Unmap credential
GET    /api/credentials/agents/{id}/credentials/validate # Validate credentials
POST   /api/credentials/agents/{id}/credentials/rotate  # Rotate agent credentials
```

### Rotation Management

```http
GET    /api/credentials/rotation/due         # Get secrets due for rotation
GET    /api/credentials/rotation/jobs        # List rotation jobs
POST   /api/credentials/rotation/schedule    # Schedule rotation
DELETE /api/credentials/rotation/jobs/{id}   # Cancel rotation job
GET    /api/credentials/rotation/history     # Get rotation history
GET    /api/credentials/rotation/metrics     # Get rotation metrics
POST   /api/credentials/rotation/policies    # Create rotation policy
```

### Reporting and Monitoring

```http
GET    /api/credentials/reports/usage        # Get usage report
GET    /api/credentials/health               # Health check
GET    /api/credentials/templates            # Get credential templates
```

## Credential Templates

The system supports predefined templates for common credential types:

### AWS Credentials
```json
{
  "type": "aws",
  "requiredFields": ["access_key_id", "secret_access_key"],
  "optionalFields": ["session_token", "region"],
  "rotationSupported": true,
  "defaultRotationInterval": 90
}
```

### Azure Credentials
```json
{
  "type": "azure",
  "requiredFields": ["client_id", "client_secret", "tenant_id"],
  "optionalFields": ["subscription_id"],
  "rotationSupported": true,
  "defaultRotationInterval": 90
}
```

### Kubernetes Credentials
```json
{
  "type": "kubernetes",
  "requiredFields": ["kubeconfig"],
  "optionalFields": ["namespace", "context"],
  "rotationSupported": false
}
```

## Configuration

### Environment Variables

```bash
# Vault Configuration
VAULT_URL=http://localhost:8200
VAULT_TOKEN=your-vault-token
VAULT_ROLE_ID=your-role-id
VAULT_SECRET_ID=your-secret-id
VAULT_NAMESPACE=your-namespace
VAULT_MOUNT_PATH=secret

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/aiops
REDIS_URL=redis://localhost:6379

# Elasticsearch Configuration
ELASTICSEARCH_URL=http://localhost:9200
```

### Vault Setup

1. **Enable KV v2 Engine**:
```bash
vault secrets enable -path=secret kv-v2
```

2. **Create AppRole**:
```bash
vault auth enable approle
vault write auth/approle/role/aiops-platform \
    token_policies="aiops-policy" \
    token_ttl=1h \
    token_max_ttl=4h
```

3. **Create Policy**:
```bash
vault policy write aiops-policy - <<EOF
path "secret/data/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
path "secret/metadata/*" {
  capabilities = ["list", "read", "delete"]
}
EOF
```

## Usage Examples

### Creating a Secret

```typescript
import { VaultService } from './services/vaultService';

const vaultService = new VaultService();
await vaultService.initialize();

const secretMetadata = await vaultService.storeSecret(
  'aws/production/access-key',
  {
    access_key_id: 'AKIA...',
    secret_access_key: 'secret...'
  },
  {
    name: 'AWS Production Access Key',
    description: 'AWS credentials for production environment',
    tags: ['aws', 'production'],
    rotationEnabled: true,
    rotationInterval: 90
  },
  'user-123'
);
```

### Injecting Credentials for Agent

```typescript
import { CredentialInjectionService } from './services/credentialInjectionService';

const credentialService = new CredentialInjectionService();
await credentialService.initialize();

// Map credential to agent
await credentialService.mapCredentialToAgent(
  'agent-123',
  'aws/production/access-key',
  'aws',
  'user-123'
);

// Inject credentials
const credentials = await credentialService.injectCredentialsForAgent('agent-123');
// Returns: { aws: { access_key_id: 'AKIA...', secret_access_key: 'secret...' } }
```

### Scheduling Rotation

```typescript
import { CredentialRotationScheduler } from './services/credentialRotationScheduler';

const scheduler = new CredentialRotationScheduler();
await scheduler.initialize();

// Schedule immediate rotation
const job = await scheduler.scheduleRotation(
  'aws/production/access-key',
  new Date()
);

// Start the scheduler
scheduler.start();
```

## CLI Usage

The system includes a comprehensive CLI tool for managing credentials:

### List Secrets
```bash
npm run credential-cli list-secrets
npm run credential-cli list-secrets --rotation-due
npm run credential-cli list-secrets --path "aws/*"
```

### Rotate Credentials
```bash
npm run credential-cli rotate-secret aws/production/access-key
npm run credential-cli rotate-secret aws/production/access-key --force
```

### Schedule Rotations
```bash
npm run credential-cli schedule-rotation aws/production/access-key
npm run credential-cli schedule-rotation aws/production/access-key --time "1h"
npm run credential-cli schedule-rotation aws/production/access-key --time "2024-12-01T10:00:00Z"
```

### Monitor Jobs
```bash
npm run credential-cli list-jobs
npm run credential-cli list-jobs --status pending
npm run credential-cli cancel-job job-123
```

### View History and Metrics
```bash
npm run credential-cli history
npm run credential-cli history --path "aws/*"
npm run credential-cli metrics --time-range 7d
```

### Validate Agent Credentials
```bash
npm run credential-cli validate-agent agent-123
```

### Health Check
```bash
npm run credential-cli health
```

## Security Considerations

### Access Control
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for credential operations
- **API Authentication**: JWT-based authentication for all API endpoints
- **Service-to-Service Authentication**: Secure authentication between services

### Encryption
- **Encryption at Rest**: All secrets encrypted in Vault using AES-256
- **Encryption in Transit**: TLS encryption for all communications
- **Key Management**: Vault handles encryption key lifecycle

### Audit and Compliance
- **Complete Audit Trail**: Every operation is logged with full context
- **Immutable Logs**: Audit logs stored in Elasticsearch with retention policies
- **Compliance Reporting**: Automated generation of compliance reports
- **Real-time Monitoring**: Alerts for suspicious activities

### Network Security
- **Network Isolation**: Vault and database isolated in secure networks
- **Firewall Rules**: Strict firewall rules limiting access
- **VPN Access**: Secure VPN access for administrative operations

## Monitoring and Alerting

### Metrics
- **Rotation Success Rate**: Track successful vs failed rotations
- **Access Patterns**: Monitor credential access patterns
- **Expiration Alerts**: Alerts for credentials nearing expiration
- **Failed Access Attempts**: Monitor and alert on failed access attempts

### Dashboards
- **Grafana Integration**: Pre-built dashboards for credential metrics
- **Real-time Status**: Live status of all credential operations
- **Historical Trends**: Long-term trends and patterns

### Notifications
- **Email Notifications**: Email alerts for critical events
- **Slack Integration**: Slack notifications for team channels
- **Webhook Support**: Custom webhook notifications
- **PagerDuty Integration**: Critical alerts to on-call teams

## Troubleshooting

### Common Issues

1. **Vault Connection Failed**
   - Check Vault URL and authentication credentials
   - Verify network connectivity to Vault
   - Check Vault service status

2. **Rotation Failed**
   - Check secret exists and rotation is enabled
   - Verify rotation policy configuration
   - Check agent permissions for secret access

3. **Agent Credential Injection Failed**
   - Verify credential mapping exists
   - Check credential expiration status
   - Validate agent permissions

### Debug Commands

```bash
# Check system health
npm run credential-cli health

# Validate specific agent credentials
npm run credential-cli validate-agent agent-123

# Check rotation job status
npm run credential-cli list-jobs --status failed

# View recent rotation history
npm run credential-cli history --limit 10
```

## Development

### Running Tests

```bash
# Run all credential management tests
npm test -- --testPathPattern=credential

# Run specific test suites
npm test -- credentialInjectionService.test.ts
npm test -- credentialRotationScheduler.test.ts
npm test -- vaultService.test.ts
```

### Adding New Credential Types

1. **Add Template**: Update `getCredentialTemplates()` in `CredentialInjectionService`
2. **Add Rotation Logic**: Update `generateRotatedSecret()` in `VaultService`
3. **Add Validation**: Update validation logic for the new credential type
4. **Add Tests**: Create comprehensive tests for the new credential type

### Contributing

1. Follow the existing code patterns and TypeScript types
2. Add comprehensive tests for new features
3. Update documentation for any API changes
4. Ensure all security considerations are addressed
5. Add appropriate audit logging for new operations

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the audit logs for detailed error information
- Use the CLI health check command to diagnose issues
- Contact the platform team for additional support