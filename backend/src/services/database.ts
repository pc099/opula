import { Pool, PoolClient } from 'pg';
import { logger } from '../middleware/requestLogger';

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password', // Use 'password' as default to match docker-compose
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased to 10 seconds
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err.message });
    });

    // Don't test connection on startup - let it be lazy-loaded
    logger.info('Database service initialized - connection will be established on first use');
  }

  private async testConnection(): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await this.pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        logger.info('Database connection established successfully');
        return;
      } catch (error) {
        logger.warn(`Database connection attempt ${attempt}/${maxRetries} failed`, { 
          error: (error as Error).message 
        });
        
        if (attempt === maxRetries) {
          logger.warn('Failed to connect to database after all retries - continuing without database', { 
            error: (error as Error).message 
          });
          // Don't throw error - just log and continue
          return;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Database query executed', {
        query: text,
        duration: `${duration}ms`,
        rows: result.rowCount
      });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text,
        duration: `${duration}ms`,
        error: (error as Error).message
      });
      
      // For development, return empty result instead of throwing
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Returning empty result due to database error in development mode');
        return { rows: [], rowCount: 0 };
      }
      
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database connection pool closed');
  }

  // Initialize database connection (can be called explicitly)
  async initialize(): Promise<void> {
    await this.testConnection();
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; responseTime: string; lastChecked: string }> {
    const start = Date.now();
    try {
      await this.query('SELECT 1');
      const responseTime = Date.now() - start;
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: 'N/A',
        lastChecked: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
export const db = new DatabaseService();

// Export pool for backward compatibility
export const pool = {
  connect: () => db.getClient(),
  query: (text: string, params?: any[]) => db.query(text, params),
  end: () => db.close()
};

// Export initialize method
export const initializeDatabase = () => db.initialize();

export default DatabaseService;