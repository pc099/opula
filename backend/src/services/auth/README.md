# Authentication and Authorization System

This directory contains the authentication and authorization system for the AIOps Platform, implementing JWT-based authentication, role-based access control (RBAC), OAuth2 integration, and API key management.

## Components

### AuthService (`authService.ts`)
Handles user authentication, JWT token management, and API key operations.

**Key Features:**
- User registration and login
- JWT access and refresh token generation
- API key creation and validation
- Password hashing with bcrypt
- Audit logging for all authentication events

**Methods:**
- `createUser()` - Create new user account
- `authenticateUser()` - Login with email/password
- `refreshTokens()` - Refresh JWT tokens
- `createApiKey()` - Generate API keys for service-to-service auth
- `validateApiKey()` - Validate API key authentication
- `getUserById()` - Retrieve user information

### RBACService (`rbacService.ts`)
Implements role-based access control with granular permissions.

**Key Features:**
- Role creation and management
- Permission assignment to roles
- User role assignment
- Permission checking for authorization

**Methods:**
- `createRole()` - Create custom roles
- `assignRoleToUser()` - Assign roles to users
- `getUserPermissions()` - Get user's effective permissions
- `hasPermission()` - Check if user has specific permission
- `hasAnyPermission()` - Check if user has any of the specified permissions

### OAuthService (`oauthService.ts`)
Handles OAuth2 integration with external identity providers.

**Key Features:**
- OAuth2 authorization flow
- Support for Google, GitHub, Microsoft
- User account linking/unlinking
- Automatic user creation from OAuth profiles

**Methods:**
- `getAuthorizationUrl()` - Generate OAuth authorization URL
- `handleCallback()` - Process OAuth callback and create/login user
- `unlinkOAuthAccount()` - Remove OAuth account link
- `createOAuthProvider()` - Configure new OAuth provider

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
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
```

### Roles and Permissions
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_built_in BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE permissions (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT
);
```

### API Keys
```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Built-in Roles

### Admin
- Full system access (`*` permission)
- Can manage users, roles, and system configuration

### Operator
- Can manage agents and configurations
- Can respond to incidents
- Can execute cost optimizations
- Can approve configuration changes

### Viewer
- Read-only access to all resources
- Cannot make changes or execute actions

### Incident Responder
- Specialized role for incident management
- Can create, update, and resolve incidents
- Read access to agents and configurations

## API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh JWT tokens
- `POST /auth/logout` - User logout
- `GET /auth/me` - Get current user info

### User Management (Admin only)
- `POST /auth/users` - Create new user
- `POST /auth/users/:userId/roles` - Assign role to user

### API Key Management
- `POST /auth/api-keys` - Create API key
- `DELETE /auth/api-keys/:keyId` - Revoke API key

### Role Management
- `GET /auth/roles` - List all roles
- `POST /auth/roles` - Create custom role
- `GET /auth/permissions` - List all permissions

### OAuth2
- `GET /auth/oauth/:provider/authorize` - Get OAuth authorization URL
- `POST /auth/oauth/:provider/callback` - Handle OAuth callback
- `DELETE /auth/oauth/:provider` - Unlink OAuth account

## Authentication Methods

### 1. JWT Bearer Tokens
```http
Authorization: Bearer <jwt_access_token>
```

### 2. API Keys
```http
Authorization: ApiKey <api_key>
```

## Permission System

Permissions follow the format: `resource:action`

**Examples:**
- `agents:read` - View agent information
- `agents:write` - Create/update agents
- `config:approve` - Approve configuration changes
- `incidents:resolve` - Resolve incidents
- `*` - All permissions (admin only)

## Security Features

### Password Security
- Bcrypt hashing with salt rounds of 12
- Minimum password requirements enforced
- Password history tracking (future enhancement)

### JWT Security
- Short-lived access tokens (15 minutes)
- Long-lived refresh tokens (7 days)
- Secure token storage and rotation
- Token revocation support

### API Key Security
- Cryptographically secure key generation
- Hashed storage (never store plain text)
- Granular permission assignment
- Expiration date support
- Usage tracking

### OAuth2 Security
- State parameter for CSRF protection
- Secure token exchange
- Account linking validation
- Provider configuration validation

## Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# OAuth2 Providers (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

## Usage Examples

### Creating a User
```typescript
const authService = new AuthService();
const user = await authService.createUser({
  email: 'user@example.com',
  password: 'securePassword123',
  firstName: 'John',
  lastName: 'Doe',
  role: 'operator'
}, 'admin-user-id');
```

### Checking Permissions
```typescript
const rbacService = new RBACService();
const hasPermission = await rbacService.hasPermission(
  'user-id', 
  'agents:execute'
);
```

### Creating API Key
```typescript
const authService = new AuthService();
const { apiKey, key } = await authService.createApiKey(
  'CI/CD Pipeline',
  ['agents:read', 'config:read'],
  'admin-user-id'
);
```

## Middleware Usage

### Authentication Middleware
```typescript
import { authMiddleware } from '../middleware/auth';
app.use('/api', authMiddleware);
```

### Role-based Authorization
```typescript
import { requireRole } from '../middleware/auth';
app.use('/api/admin', requireRole(['admin']));
```

### Permission-based Authorization
```typescript
import { requirePermission } from '../middleware/auth';
app.use('/api/agents', requirePermission('agents:read'));
```

## Audit Logging

All authentication and authorization events are automatically logged:
- User login/logout
- Failed authentication attempts
- Role assignments
- Permission changes
- API key creation/revocation
- OAuth account linking/unlinking

## Testing

Run the authentication tests:
```bash
npm test -- authService.test.ts
```

## Migration

Run the authentication database migration:
```bash
npm run migrate
```

This will create all necessary tables and insert default roles and permissions.