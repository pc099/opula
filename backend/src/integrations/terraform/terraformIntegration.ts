import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { TerraformConfig, TerraformPlan, TerraformState, TerraformCloudConfig } from './types';

export class TerraformIntegration {
  private terraformPath: string;
  private workingDirectory: string;
  private cloudConfig?: TerraformCloudConfig;

  constructor(
    terraformPath: string = 'terraform',
    workingDirectory: string = process.cwd(),
    cloudConfig?: TerraformCloudConfig
  ) {
    this.terraformPath = terraformPath;
    this.workingDirectory = workingDirectory;
    this.cloudConfig = cloudConfig;
  }

  /**
   * Execute terraform plan and return the plan output
   */
  async plan(options: { varFile?: string; target?: string[]; destroy?: boolean } = {}): Promise<TerraformPlan> {
    const args = ['plan', '-json', '-no-color'];
    
    if (options.varFile) {
      args.push('-var-file', options.varFile);
    }
    
    if (options.target) {
      options.target.forEach(target => {
        args.push('-target', target);
      });
    }
    
    if (options.destroy) {
      args.push('-destroy');
    }

    const result = await this.executeTerraformCommand(args);
    return this.parsePlanOutput(result.stdout);
  }

  /**
   * Execute terraform apply
   */
  async apply(planFile?: string, autoApprove: boolean = false): Promise<{ success: boolean; output: string }> {
    const args = ['apply', '-json', '-no-color'];
    
    if (autoApprove) {
      args.push('-auto-approve');
    }
    
    if (planFile) {
      args.push(planFile);
    }

    try {
      const result = await this.executeTerraformCommand(args);
      return { success: true, output: result.stdout };
    } catch (error) {
      return { success: false, output: error.message };
    }
  }

  /**
   * Get current terraform state
   */
  async getState(): Promise<TerraformState> {
    const result = await this.executeTerraformCommand(['show', '-json']);
    return JSON.parse(result.stdout);
  }

  /**
   * Initialize terraform working directory
   */
  async init(options: { upgrade?: boolean; reconfigure?: boolean } = {}): Promise<void> {
    const args = ['init', '-no-color'];
    
    if (options.upgrade) {
      args.push('-upgrade');
    }
    
    if (options.reconfigure) {
      args.push('-reconfigure');
    }

    await this.executeTerraformCommand(args);
  }

  /**
   * Validate terraform configuration
   */
  async validate(): Promise<{ valid: boolean; diagnostics: any[] }> {
    try {
      const result = await this.executeTerraformCommand(['validate', '-json']);
      const validation = JSON.parse(result.stdout);
      return {
        valid: validation.valid,
        diagnostics: validation.diagnostics || []
      };
    } catch (error) {
      return {
        valid: false,
        diagnostics: [{ severity: 'error', summary: error.message }]
      };
    }
  }

  /**
   * Get terraform version information
   */
  async version(): Promise<{ terraform_version: string; provider_selections: Record<string, string> }> {
    const result = await this.executeTerraformCommand(['version', '-json']);
    return JSON.parse(result.stdout);
  }

  private async executeTerraformCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.terraformPath, args, {
        cwd: this.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Terraform command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private parsePlanOutput(output: string): TerraformPlan {
    const lines = output.split('\n').filter(line => line.trim());
    const changes = {
      add: 0,
      change: 0,
      destroy: 0
    };
    const resources: any[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'planned_change') {
          const action = parsed.change?.action;
          if (action) {
            if (action.includes('create')) changes.add++;
            if (action.includes('update')) changes.change++;
            if (action.includes('delete')) changes.destroy++;
            
            resources.push({
              address: parsed.change.resource.addr,
              action: action,
              resource_type: parsed.change.resource.resource_type,
              resource_name: parsed.change.resource.resource_name
            });
          }
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }

    return {
      changes,
      resources,
      raw_output: output
    };
  }
}