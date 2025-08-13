// @ts-nocheck
import express from 'express';
import { AuthService, CreateUserRequest, LoginRequest } from '../services/authService';
import { RBACService } from '../services/rbacService';
import { OAuthService } from '../services/oauthService';
import { authMiddleware, requireRole, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { auditContextMiddleware, auditRequestMiddleware } from '../middleware/auditMiddleware';

const router = express.Router();
const authService = new AuthService();
const rbacService = new RBACService();
const oauthService = new OAuthService();

// Public routes
router.post('/login', auditRequestMiddleware, async (req, res) => {
  try {
    const { email, password }: LoginRequest = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
        timestamp: new Date().toISOString()
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const userAgent = req.get('User-Agent') || '';

    const result = await authService.authenticateUser(
      { email, password },
      ipAddress,
      userAgent
    );

    res.json({
      user: result.user,
      tokens: result.tokens,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(401).json({
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Authentication failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required',
        timestamp: new Date().toISOString()
      });
    }

    const tokens = await authService.refreshTokens(refreshToken);

    res.json({
      tokens,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(401).json({
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Token refresh failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }

    res.json({
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed',
      timestamp: new Date().toISOString()
    });
  }
});

// OAuth routes
router.get('/oauth/:provider/authorize', async (req, res) => {
  try {
    const { provider } = req.params;
    const { redirect_uri } = req.query;
    
    if (!redirect_uri) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'redirect_uri parameter is required',
        timestamp: new Date().toISOString()
      });
    }

    const state = require('crypto').randomBytes(32).toString('hex');
    const authUrl = await oauthService.getAuthorizationUrl(
      provider,
      state,
      redirect_uri as string
    );

    // Store state in session or cache for validation
    // For simplicity, we'll include it in the response
    res.json({
      authUrl,
      state,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'OAuth authorization failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/oauth/:provider/callback', auditRequestMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, redirect_uri } = req.body;
    
    if (!code || !redirect_uri) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'code and redirect_uri are required',
        timestamp: new Date().toISOString()
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const userAgent = req.get('User-Agent') || '';

    const result = await oauthService.handleCallback(
      provider,
      code,
      redirect_uri,
      ipAddress,
      userAgent
    );

    res.json({
      user: result.user,
      tokens: result.tokens,
      isNewUser: result.isNewUser,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'OAuth callback failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Protected routes
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user) {
      const permissions = await rbacService.getUserPermissions(req.user.id);
      
      res.json({
        user: req.user,
        permissions,
        timestamp: new Date().toISOString()
      });
    } else if (req.apiKey) {
      res.json({
        apiKey: req.apiKey,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user information',
      timestamp: new Date().toISOString()
    });
  }
});

// User management routes (admin only)
router.post('/users', authMiddleware, requireRole(['admin']), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userData: CreateUserRequest = req.body;
    
    if (!userData.email || !userData.password || !userData.firstName || !userData.lastName || !userData.role) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'All user fields are required',
        timestamp: new Date().toISOString()
      });
    }

    const user = await authService.createUser(userData, req.user!.id);

    res.status(201).json({
      user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'User creation failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API Key management routes
router.post('/api-keys', authMiddleware, requirePermission('api_keys:create'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, permissions, expiresAt } = req.body;
    
    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name and permissions array are required',
        timestamp: new Date().toISOString()
      });
    }

    const result = await authService.createApiKey(
      name,
      permissions,
      req.user!.id,
      expiresAt ? new Date(expiresAt) : undefined
    );

    res.status(201).json({
      apiKey: result.apiKey,
      key: result.key,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'API key creation failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/api-keys/:keyId', authMiddleware, requirePermission('api_keys:delete'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { keyId } = req.params;
    
    await authService.revokeApiKey(keyId, req.user!.id);

    res.json({
      message: 'API key revoked successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'API key revocation failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Role management routes
router.get('/roles', authMiddleware, requirePermission('roles:read'), async (req, res) => {
  try {
    const roles = await rbacService.getAllRoles();

    res.json({
      roles,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get roles',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/roles', authMiddleware, requirePermission('roles:create'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description, permissions } = req.body;
    
    if (!name || !description || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'name, description, and permissions array are required',
        timestamp: new Date().toISOString()
      });
    }

    const role = await rbacService.createRole(name, description, permissions, req.user!.id);

    res.status(201).json({
      role,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Role creation failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/permissions', authMiddleware, requirePermission('permissions:read'), async (req, res) => {
  try {
    const permissions = await rbacService.getAllPermissions();

    res.json({
      permissions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get permissions',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/users/:userId/roles', authMiddleware, requirePermission('users:assign_role'), auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { roleId } = req.body;
    
    if (!roleId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'roleId is required',
        timestamp: new Date().toISOString()
      });
    }

    await rbacService.assignRoleToUser(userId, roleId, req.user!.id);

    res.json({
      message: 'Role assigned successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'Role assignment failed',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/oauth/:provider', authMiddleware, auditRequestMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { provider } = req.params;
    
    await oauthService.unlinkOAuthAccount(req.user!.id, provider, req.user!.id);

    res.json({
      message: 'OAuth account unlinked successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Bad Request',
      message: error instanceof Error ? error.message : 'OAuth account unlinking failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;