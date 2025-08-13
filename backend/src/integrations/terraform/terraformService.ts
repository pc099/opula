import { TerraformIntegration } from './terraformIntegration';
import { TerraformCloudService } from './terraformCloudService';
import { TerraformStateAnalyzer } from './stateAnalyzer';
import { TerraformVersionManager } from './versionManager';
import { 
  TerraformConfig, 
  TerraformPlan, 
  TerraformState, 
  TerraformDriftDetection,
  TerraformCloudConfig 
} from './types';

export class TerraformService {
  private integration: TerraformIntegration;
  private cloudService?: TerraformCloudService;
  private stateAnalyzer: TerraformStateAnalyzer;
  private versionManager: TerraformVersionManager;
  private config: TerraformConfig;

  constructor(config: TerraformConfig) {
    this.config = config;
    this.stateAnalyzer = new TerraformStateAnalyzer();
    this.versionManager = new TerraformVersionManager();
    
    this.initializeIntegration();
  }

  private async initializeIntegration(): Promise<void> {
    // Get the appropriate Terraform binary
    const terraformPath = await this.versionManager.getTerraformBinary(this.config.version);
    
    // Initialize the integration
    this.integration = new TerraformIntegration(
      terraformPath,
      this.config.workingDirectory,
      this.config.cloudConfig
    );

    // Initialize cloud service if configured
    if (this.config.cloudConfig) {
      this.cloudService = new TerraformCloudService(this.config.cloudConfig);
    }
  }

  /**
   * Initialize Terraform working directory
   */
  async initialize(): Promise<void> {
    await this.integration.init({ upgrade: true });
  }

  /**
   * Validate Terraform configuration
   */
  async validate(): Promise<{ valid: boolean; diagnostics: any[] }> {
    return await this.integration.validate();
  }

  /**
   * Generate and analyze a Terraform plan
   */
  async plan(options: {
    varFile?: string;
    target?: string[];
    destroy?: boolean;
  } = {}): Promise<TerraformPlan> {
    return await this.integration.plan(options);
  }

  /**
   * Apply Terraform changes
   */
  async apply(planFile?: string, autoApprove: boolean = false): Promise<{ success: boolean; output: string }> {
    return await this.integration.apply(planFile, autoApprove);
  }

  /**
   * Get current Terraform state
   */
  async getState(): Promise<TerraformState> {
    return await this.integration.getState();
  }

  /**
   * Detect configuration drift
   */
  async detectDrift(previousStatePath?: string): Promise<TerraformDriftDetection> {
    const currentState = await this.getState();
    
    if (previousStatePath) {
      const previousState = await this.stateAnalyzer.parseStateFile(previousStatePath);
      return this.stateAnalyzer.compareStates(currentState, previousState);
    }

    // If no previous state provided, compare with last known good state
    // This would typically be stored in a database or file system
    throw new Error('Previous state required for drift detection');
  }

  /**
   * Analyze resource utilization and costs
   */
  async analyzeResources(): Promise<{
    resourceCounts: Record<string, number>;
    estimatedCosts: Record<string, number>;
    recommendations: string[];
  }> {
    const state = await this.getState();
    return this.stateAnalyzer.analyzeResourceUtilization(state);
  }

  /**
   * Get resource dependencies
   */
  async getResourceDependencies(): Promise<Map<string, string[]>> {
    const state = await this.getState();
    return this.stateAnalyzer.getResourceDependencies(state);
  }

  /**
   * Get Terraform version information
   */
  async getVersion(): Promise<{ terraform_version: string; provider_selections: Record<string, string> }> {
    return await this.integration.version();
  }

  /**
   * List available Terraform versions
   */
  async listAvailableVersions(): Promise<string[]> {
    return await this.versionManager.listAvailableVersions();
  }

  /**
   * List installed Terraform versions
   */
  async listInstalledVersions(): Promise<any[]> {
    return await this.versionManager.listInstalledVersions();
  }

  /**
   * Install a specific Terraform version
   */
  async installVersion(version: string): Promise<void> {
    await this.versionManager.installVersion(version);
  }

  // Terraform Cloud specific methods
  
  /**
   * List Terraform Cloud workspaces
   */
  async listCloudWorkspaces(): Promise<any[]> {
    if (!this.cloudService) {
      throw new Error('Terraform Cloud not configured');
    }
    return await this.cloudService.listWorkspaces();
  }

  /**
   * Create a Terraform Cloud run
   */
  async createCloudRun(workspaceId: string, options: {
    message?: string;
    isDestroy?: boolean;
    planOnly?: boolean;
    targetAddrs?: string[];
  } = {}): Promise<any> {
    if (!this.cloudService) {
      throw new Error('Terraform Cloud not configured');
    }
    return await this.cloudService.createRun(workspaceId, options);
  }

  /**
   * Get Terraform Cloud run details
   */
  async getCloudRun(runId: string): Promise<any> {
    if (!this.cloudService) {
      throw new Error('Terraform Cloud not configured');
    }
    return await this.cloudService.getRun(runId);
  }

  /**
   * Apply a Terraform Cloud run
   */
  async applyCloudRun(runId: string, comment?: string): Promise<void> {
    if (!this.cloudService) {
      throw new Error('Terraform Cloud not configured');
    }
    await this.cloudService.applyRun(runId, comment);
  }

  /**
   * Get plan logs from Terraform Cloud
   */
  async getCloudPlanLogs(planId: string): Promise<string> {
    if (!this.cloudService) {
      throw new Error('Terraform Cloud not configured');
    }
    return await this.cloudService.getPlanLogs(planId);
  }

  /**
   * Perform automated drift remediation
   */
  async remediateDrift(driftDetection: TerraformDriftDetection, options: {
    autoApprove?: boolean;
    dryRun?: boolean;
  } = {}): Promise<{ success: boolean; actions: string[]; output?: string }> {
    const actions: string[] = [];

    if (!driftDetection.hasDrift) {
      return { success: true, actions: ['No drift detected'] };
    }

    // Analyze drift and determine remediation strategy
    for (const driftedResource of driftDetection.driftedResources) {
      switch (driftedResource.drift_type) {
        case 'configuration':
          actions.push(`Update configuration for ${driftedResource.address}`);
          break;
        case 'external_change':
          actions.push(`Refresh state for ${driftedResource.address}`);
          break;
        case 'missing':
          actions.push(`Recreate missing resource ${driftedResource.address}`);
          break;
      }
    }

    if (options.dryRun) {
      return { success: true, actions };
    }

    // Execute remediation plan
    try {
      const plan = await this.plan();
      if (plan.changes.add > 0 || plan.changes.change > 0 || plan.changes.destroy > 0) {
        const result = await this.apply(undefined, options.autoApprove);
        return {
          success: result.success,
          actions,
          output: result.output
        };
      }
      
      return { success: true, actions: ['No changes required'] };
    } catch (error) {
      return {
        success: false,
        actions,
        output: error.message
      };
    }
  }
}