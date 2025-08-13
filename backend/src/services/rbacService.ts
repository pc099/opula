import { pool } from './database';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isBuiltIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: Date;
}

export class RBACService {
  
  async createRole(name: string, description: string, permissions: string[], createdBy: string): Promise<Role> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if role already exists
      const existingRole = await client.query(
        'SELECT id FROM roles WHERE name = $1',
        [name]
      );

      if (existingRole.rows.length > 0) {
        throw new Error('Role with this name already exists');
      }

      // Validate permissions exist
      const permissionCheck = await client.query(
        'SELECT id FROM permissions WHERE id = ANY($1)',
        [permissions]
      );

      if (permissionCheck.rows.length !== permissions.length) {
        throw new Error('One or more permissions do not exist');
      }

      // Create role
      const roleId = require('uuid').v4();
      const result = await client.query(`
        INSERT INTO roles (id, name, description, permissions, is_built_in)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, description, permissions, is_built_in, created_at, updated_at
      `, [roleId, name, description, JSON.stringify(permissions), false]);

      await client.query('COMMIT');

      const role = result.rows[0];
      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
        isBuiltIn: role.is_built_in,
        createdAt: role.created_at,
        updatedAt: role.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async assignRoleToUser(userId: string, roleId: string, assignedBy: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if user exists
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        throw new Error('User not found');
      }

      // Check if role exists
      const roleCheck = await client.query('SELECT id FROM roles WHERE id = $1', [roleId]);
      if (roleCheck.rows.length === 0) {
        throw new Error('Role not found');
      }

      // Remove existing role assignment
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

      // Assign new role
      await client.query(`
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES ($1, $2, $3)
      `, [userId, roleId, assignedBy]);

      // Update user's role field for quick access
      const roleResult = await client.query('SELECT name FROM roles WHERE id = $1', [roleId]);
      await client.query('UPDATE users SET role = $1 WHERE id = $2', [roleResult.rows[0].name, userId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT r.permissions
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return [];
      }

      return JSON.parse(result.rows[0].permissions);
    } finally {
      client.release();
    }
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permission) || permissions.includes('*');
  }

  async hasAnyPermission(userId: string, permissions: string[]): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    
    if (userPermissions.includes('*')) {
      return true;
    }

    return permissions.some(permission => userPermissions.includes(permission));
  }

  async getAllRoles(): Promise<Role[]> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT id, name, description, permissions, is_built_in, created_at, updated_at
        FROM roles
        ORDER BY name
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        permissions: JSON.parse(row.permissions),
        isBuiltIn: row.is_built_in,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } finally {
      client.release();
    }
  }

  async getAllPermissions(): Promise<Permission[]> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(`
        SELECT id, name, resource, action, description
        FROM permissions
        ORDER BY resource, action
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        resource: row.resource,
        action: row.action,
        description: row.description
      }));
    } finally {
      client.release();
    }
  }

  async updateRole(roleId: string, updates: Partial<Pick<Role, 'name' | 'description' | 'permissions'>>, updatedBy: string): Promise<Role> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if role exists and is not built-in
      const roleCheck = await client.query(
        'SELECT is_built_in FROM roles WHERE id = $1',
        [roleId]
      );

      if (roleCheck.rows.length === 0) {
        throw new Error('Role not found');
      }

      if (roleCheck.rows[0].is_built_in) {
        throw new Error('Cannot modify built-in roles');
      }

      // Build update query
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      if (updates.name) {
        updateFields.push(`name = $${paramCount++}`);
        values.push(updates.name);
      }

      if (updates.description) {
        updateFields.push(`description = $${paramCount++}`);
        values.push(updates.description);
      }

      if (updates.permissions) {
        // Validate permissions exist
        const permissionCheck = await client.query(
          'SELECT id FROM permissions WHERE id = ANY($1)',
          [updates.permissions]
        );

        if (permissionCheck.rows.length !== updates.permissions.length) {
          throw new Error('One or more permissions do not exist');
        }

        updateFields.push(`permissions = $${paramCount++}`);
        values.push(JSON.stringify(updates.permissions));
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(roleId);

      const result = await client.query(`
        UPDATE roles 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, name, description, permissions, is_built_in, created_at, updated_at
      `, values);

      await client.query('COMMIT');

      const role = result.rows[0];
      return {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: JSON.parse(role.permissions),
        isBuiltIn: role.is_built_in,
        createdAt: role.created_at,
        updatedAt: role.updated_at
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteRole(roleId: string, deletedBy: string): Promise<void> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Check if role exists and is not built-in
      const roleCheck = await client.query(
        'SELECT is_built_in, name FROM roles WHERE id = $1',
        [roleId]
      );

      if (roleCheck.rows.length === 0) {
        throw new Error('Role not found');
      }

      if (roleCheck.rows[0].is_built_in) {
        throw new Error('Cannot delete built-in roles');
      }

      // Check if role is assigned to any users
      const userCheck = await client.query(
        'SELECT COUNT(*) as count FROM user_roles WHERE role_id = $1',
        [roleId]
      );

      if (parseInt(userCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete role that is assigned to users');
      }

      // Delete role
      await client.query('DELETE FROM roles WHERE id = $1', [roleId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}