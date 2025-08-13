import { AuthService } from '../authService';
import { pool } from '../database';

// Mock the database pool
jest.mock('../database', () => ({
  pool: {
    connect: jest.fn()
  }
}));

// Mock the audit service
jest.mock('../auditService', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    logEvent: jest.fn()
  }))
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockClient: any;

  beforeEach(() => {
    authService = new AuthService();
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      // Mock database responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ // Create user
          rows: [{
            id: 'user-123',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            role: 'viewer',
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          }]
        });

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        role: 'viewer'
      };

      const result = await authService.createUser(userData, 'admin-123');

      expect(result).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'viewer',
        isActive: true
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw error if user already exists', async () => {
      // Mock existing user
      mockClient.query.mockResolvedValueOnce({ 
        rows: [{ id: 'existing-user' }] 
      });

      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        role: 'viewer'
      };

      await expect(authService.createUser(userData, 'admin-123'))
        .rejects.toThrow('User with this email already exists');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct API key', async () => {
      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key_hash: '$2a$10$hashedkey',
        permissions: '["agents:read", "config:read"]',
        is_active: true,
        expires_at: null,
        last_used_at: null,
        created_by: 'admin-123',
        created_at: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockApiKey] });

      // Mock bcrypt compare
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await authService.validateApiKey('test-api-key');

      expect(result).toMatchObject({
        id: 'key-123',
        name: 'Test Key',
        permissions: ['agents:read', 'config:read'],
        isActive: true
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
        ['key-123']
      );
    });

    it('should return null for invalid API key', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await authService.validateApiKey('invalid-key');

      expect(result).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'viewer',
        is_active: true,
        last_login_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await authService.getUserById('user-123');

      expect(result).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'viewer',
        isActive: true
      });
    });

    it('should return null for non-existent user', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await authService.getUserById('non-existent');

      expect(result).toBeNull();
    });
  });
});