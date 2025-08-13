import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService';
import { RBACService } from '../services/rbacService';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
  apiKey?: {
    id: string;
    name: string;
    permissions: string[];
  };
}

const authService = new AuthService();
const rbacService = new RBACService();

export const authMiddleware = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Skip authentication in development mode
  if (process.env.NODE_ENV === 'development') {
    req.user = {
      id: 'dev-user',
      email: 'dev@example.com',
      role: 'admin',
      firstName: 'Dev',
      lastName: 'User'
    };
    return next();
  }

  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authorization header is required',
        timestamp: new Date().toISOString()
      });
    }

    // Check for API key authentication
    if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.replace('ApiKey ', '');
      const apiKeyData = await authService.validateApiKey(apiKey);
      
      if (!apiKeyData) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Invalid API key',
          timestamp: new Date().toISOString()
        });
      }

      req.apiKey = {
        id: apiKeyData.id,
        name: apiKeyData.name,
        permissions: apiKeyData.permissions
      };
      
      return next();
    }

    // Check for Bearer token authentication
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      // Get user details
      const user = await authService.getUserById(decoded.id);
      if (!user || !user.isActive) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'User not found or inactive',
          timestamp: new Date().toISOString()
        });
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      };
      
      return next();
    }

    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid authorization format. Use "Bearer <token>" or "ApiKey <key>"',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authentication error',
      timestamp: new Date().toISOString()
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip role check in development mode
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (!req.user && !req.apiKey) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    // For API keys, check if they have admin permissions or specific role permissions
    if (req.apiKey) {
      const hasPermission = req.apiKey.permissions.includes('*') || 
                           roles.some(role => req.apiKey!.permissions.includes(`role:${role}`));
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'Insufficient API key permissions',
          timestamp: new Date().toISOString()
        });
      }
      
      return next();
    }

    // For users, check role
    if (req.user && !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Insufficient permissions',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

export const requirePermission = (permission: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip permission check in development mode
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (!req.user && !req.apiKey) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    try {
      // For API keys, check permissions directly
      if (req.apiKey) {
        const hasPermission = req.apiKey.permissions.includes('*') || 
                             req.apiKey.permissions.includes(permission);
        
        if (!hasPermission) {
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Insufficient API key permissions',
            timestamp: new Date().toISOString()
          });
        }
        
        return next();
      }

      // For users, check RBAC permissions
      if (req.user) {
        const hasPermission = await rbacService.hasPermission(req.user.id, permission);
        
        if (!hasPermission) {
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Insufficient permissions',
            timestamp: new Date().toISOString()
          });
        }
        
        return next();
      }
    } catch (error) {
      return res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Permission check error',
        timestamp: new Date().toISOString()
      });
    }
  };
};

export const requireAnyPermission = (permissions: string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Skip permission check in development mode
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (!req.user && !req.apiKey) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    try {
      // For API keys, check permissions directly
      if (req.apiKey) {
        const hasPermission = req.apiKey.permissions.includes('*') || 
                             permissions.some(perm => req.apiKey!.permissions.includes(perm));
        
        if (!hasPermission) {
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Insufficient API key permissions',
            timestamp: new Date().toISOString()
          });
        }
        
        return next();
      }

      // For users, check RBAC permissions
      if (req.user) {
        const hasPermission = await rbacService.hasAnyPermission(req.user.id, permissions);
        
        if (!hasPermission) {
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Insufficient permissions',
            timestamp: new Date().toISOString()
          });
        }
        
        return next();
      }
    } catch (error) {
      return res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Permission check error',
        timestamp: new Date().toISOString()
      });
    }
  };
};