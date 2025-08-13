#!/usr/bin/env ts-node

import { Command } from 'commander';
import { VaultService } from '../services/vaultService';
import { CredentialInjectionService } from '../services/credentialInjectionService';
import { CredentialRotationScheduler } from '../services/credentialRotationScheduler';
import { pool } from '../services/database';

const program = new Command();

program
  .name('credential-rotation-cli')
  .description('CLI tool for managing credential rotations')
  .version('1.0.0');

// Initialize services
let vaultService: VaultService;
let credentialService: CredentialInjectionService;
let scheduler: CredentialRotationScheduler;

async function initializeServices() {
  try {
    vaultService = new VaultService();
    credentialService = new CredentialInjectionService(vaultService);
    scheduler = new CredentialRotationScheduler(vaultService, credentialService);
    
    await scheduler.initialize();
    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', (error as Error).message);
    process.exit(1);
  }
}

// List secrets command
program
  .command('list-secrets')
  .description('List all secrets with their rotation status')
  .option('-p, --path <path>', 'Filter by secret path')
  .option('--rotation-due', 'Show only secrets due for rotation')
  .action(async (options) => {
    await initializeServices();
    
    try {
      let secrets;
      
      if (options.rotationDue) {
        secrets = await vaultService.getSecretsForRotation();
        console.log(`\nSecrets due for rotation (${secrets.length}):`);
      } else {
        secrets = await vaultService.getSecretMetadata(options.path);
        console.log(`\nSecrets (${secrets.length}):`);
      }
      
      if (secrets.length === 0) {
        console.log('No secrets found.');
        return;
      }
      
      console.table(secrets.map(secret => ({
        Path: secret.path,
        Name: secret.name,
        'Rotation Enabled': secret.rotationEnabled ? 'Yes' : 'No',
        'Next Rotation': secret.nextRotationAt ? secret.nextRotationAt.toISOString() : 'N/A',
        'Last Rotated': secret.lastRotatedAt ? secret.lastRotatedAt.toISOString() : 'Never',
        Tags: secret.tags.join(', ')
      })));
    } catch (error) {
      console.error('Error listing secrets:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Rotate secret command
program
  .command('rotate-secret <path>')
  .description('Manually rotate a specific secret')
  .option('--force', 'Force rotation even if not due')
  .action(async (path, options) => {
    await initializeServices();
    
    try {
      console.log(`Rotating secret: ${path}`);
      
      // Check if secret exists and rotation is enabled
      const secrets = await vaultService.getSecretMetadata(path);
      if (secrets.length === 0) {
        console.error(`Secret not found: ${path}`);
        process.exit(1);
      }
      
      const secret = secrets[0];
      if (!secret.rotationEnabled && !options.force) {
        console.error(`Rotation not enabled for secret: ${path}`);
        console.log('Use --force to rotate anyway');
        process.exit(1);
      }
      
      await vaultService.rotateSecret(path, 'cli-user');
      console.log(`✓ Secret rotated successfully: ${path}`);
    } catch (error) {
      console.error('Error rotating secret:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Schedule rotation command
program
  .command('schedule-rotation <path>')
  .description('Schedule a secret rotation')
  .option('-t, --time <time>', 'Schedule time (ISO string or relative like "1h", "1d")')
  .action(async (path, options) => {
    await initializeServices();
    
    try {
      let scheduledAt = new Date();
      
      if (options.time) {
        if (options.time.match(/^\d+[hmd]$/)) {
          // Relative time format
          const value = parseInt(options.time.slice(0, -1));
          const unit = options.time.slice(-1);
          
          switch (unit) {
            case 'h':
              scheduledAt = new Date(Date.now() + value * 60 * 60 * 1000);
              break;
            case 'd':
              scheduledAt = new Date(Date.now() + value * 24 * 60 * 60 * 1000);
              break;
            case 'm':
              scheduledAt = new Date(Date.now() + value * 60 * 1000);
              break;
          }
        } else {
          // ISO string format
          scheduledAt = new Date(options.time);
        }
      }
      
      const job = await scheduler.scheduleRotation(path, scheduledAt);
      console.log(`✓ Rotation scheduled successfully:`);
      console.log(`  Job ID: ${job.id}`);
      console.log(`  Secret Path: ${job.secretPath}`);
      console.log(`  Scheduled At: ${job.scheduledAt.toISOString()}`);
    } catch (error) {
      console.error('Error scheduling rotation:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// List rotation jobs command
program
  .command('list-jobs')
  .description('List rotation jobs')
  .option('-s, --status <status>', 'Filter by status (pending, running, completed, failed)')
  .option('-l, --limit <limit>', 'Limit number of results', '50')
  .action(async (options) => {
    await initializeServices();
    
    try {
      const jobs = await scheduler.getRotationJobs(options.status, parseInt(options.limit));
      
      console.log(`\nRotation Jobs (${jobs.length}):`);
      
      if (jobs.length === 0) {
        console.log('No rotation jobs found.');
        return;
      }
      
      console.table(jobs.map(job => ({
        'Job ID': job.id.substring(0, 8) + '...',
        'Secret Path': job.secretPath,
        Status: job.status,
        'Scheduled At': job.scheduledAt.toISOString(),
        Attempts: `${job.attempts}/${job.maxAttempts}`,
        'Last Error': job.lastError ? job.lastError.substring(0, 50) + '...' : 'None'
      })));
    } catch (error) {
      console.error('Error listing jobs:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Cancel job command
program
  .command('cancel-job <jobId>')
  .description('Cancel a rotation job')
  .action(async (jobId) => {
    await initializeServices();
    
    try {
      await scheduler.cancelRotationJob(jobId);
      console.log(`✓ Rotation job cancelled: ${jobId}`);
    } catch (error) {
      console.error('Error cancelling job:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Rotation history command
program
  .command('history')
  .description('Show rotation history')
  .option('-p, --path <path>', 'Filter by secret path')
  .option('-l, --limit <limit>', 'Limit number of results', '50')
  .action(async (options) => {
    await initializeServices();
    
    try {
      const history = await scheduler.getRotationHistory(options.path, parseInt(options.limit));
      
      console.log(`\nRotation History (${history.length}):`);
      
      if (history.length === 0) {
        console.log('No rotation history found.');
        return;
      }
      
      console.table(history.map(entry => ({
        'Secret Path': entry.secret_path,
        'Rotation Type': entry.rotation_type,
        Success: entry.success ? '✓' : '✗',
        'Rotated At': new Date(entry.rotated_at).toISOString(),
        'Rotated By': entry.rotated_by_email || 'System',
        Policy: entry.policy_name || 'Manual',
        Error: entry.error_message ? entry.error_message.substring(0, 50) + '...' : 'None'
      })));
    } catch (error) {
      console.error('Error getting history:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Metrics command
program
  .command('metrics')
  .description('Show rotation metrics')
  .option('-t, --time-range <range>', 'Time range (1h, 24h, 7d, 30d, 90d)', '30d')
  .action(async (options) => {
    await initializeServices();
    
    try {
      const metrics = await scheduler.getRotationMetrics(options.timeRange);
      
      console.log(`\nRotation Metrics (${options.timeRange}):`);
      console.log(`Total Rotations: ${metrics.totalRotations}`);
      console.log(`Successful: ${metrics.successfulRotations}`);
      console.log(`Failed: ${metrics.failedRotations}`);
      console.log(`Success Rate: ${metrics.totalRotations > 0 ? ((metrics.successfulRotations / metrics.totalRotations) * 100).toFixed(1) : 0}%`);
      
      console.log('\nRotations by Status:');
      Object.entries(metrics.rotationsByStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
      
      console.log('\nRotations by Secret Type:');
      Object.entries(metrics.rotationsBySecretType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    } catch (error) {
      console.error('Error getting metrics:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Validate credentials command
program
  .command('validate-agent <agentId>')
  .description('Validate credentials for a specific agent')
  .action(async (agentId) => {
    await initializeServices();
    
    try {
      const validation = await credentialService.validateAgentCredentials(agentId);
      
      console.log(`\nCredential Validation for Agent: ${agentId}`);
      console.log(`Overall Status: ${validation.valid ? '✓ Valid' : '✗ Invalid'}`);
      
      if (validation.issues.length > 0) {
        console.log('\nIssues:');
        validation.issues.forEach(issue => {
          console.log(`  • ${issue}`);
        });
      }
      
      console.log('\nCredential Status:');
      Object.entries(validation.credentialStatus).forEach(([type, status]) => {
        console.log(`  ${type}: ${status.valid ? '✓' : '✗'} ${status.error || ''}`);
      });
    } catch (error) {
      console.error('Error validating credentials:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Health check command
program
  .command('health')
  .description('Check system health')
  .action(async () => {
    await initializeServices();
    
    try {
      const secrets = await vaultService.getSecretMetadata();
      const jobs = await scheduler.getRotationJobs();
      const metrics = await scheduler.getRotationMetrics('24h');
      
      console.log('\n🏥 System Health Check:');
      console.log(`✓ Vault Connection: OK`);
      console.log(`✓ Database Connection: OK`);
      console.log(`📊 Total Secrets: ${secrets.length}`);
      console.log(`⚙️  Active Jobs: ${jobs.filter(j => j.status === 'pending' || j.status === 'running').length}`);
      console.log(`📈 Rotations (24h): ${metrics.totalRotations} (${metrics.successfulRotations} successful)`);
      
      const secretsDue = await vaultService.getSecretsForRotation();
      if (secretsDue.length > 0) {
        console.log(`⚠️  Secrets Due for Rotation: ${secretsDue.length}`);
      }
    } catch (error) {
      console.error('❌ Health check failed:', (error as Error).message);
      process.exit(1);
    } finally {
      await pool.end();
    }
  });

// Parse command line arguments
program.parse();