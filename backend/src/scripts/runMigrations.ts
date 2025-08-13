// Load environment variables FIRST, before any other imports
import dotenv from 'dotenv';
dotenv.config();

// Environment variables loaded successfully

// Now import other modules after env is loaded
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../services/database';
import { logger } from '../middleware/requestLogger';

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // List of migrations to run in order
    const migrations = [
      '001_add_config_versioning.sql',
      '002_auth_tables.sql',
      '003_credential_management.sql'
    ];

    for (const migrationFile of migrations) {
      try {
        const migrationPath = join(__dirname, '../migrations', migrationFile);
        const migrationSQL = readFileSync(migrationPath, 'utf8');

        await db.query(migrationSQL);

        logger.info(`Migration ${migrationFile} completed successfully`);
      } catch (error) {
        logger.error(`Migration ${migrationFile} failed`, { error: (error as Error).message });
        throw error;
      }
    }

    logger.info('All migrations completed successfully');

    process.exit(0);
  } catch (error) {
    logger.error('Migration failed', { error: (error as Error).message });
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };