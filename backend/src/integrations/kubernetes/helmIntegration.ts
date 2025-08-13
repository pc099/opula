import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { HelmChart, HelmRepository } from './types';

export class HelmIntegration {
  private helmPath: string;
  private kubeconfig?: string;
  private context?: string;

  constructor(helmPath: string = 'helm', kubeconfig?: string, context?: string) {
    this.helmPath = helmPath;
    this.kubeconfig = kubeconfig;
    this.context = context;
  }

  /**
   * List installed Helm releases
   */
  async listReleases(namespace?: string): Promise<HelmChart[]> {
    const args = ['list', '--output', 'json'];
    
    if (namespace) {
      args.push('--namespace', namespace);
    } else {
      args.push('--all-namespaces');
    }

    try {
      const result = await this.executeHelmCommand(args);
      const releases = JSON.parse(result.stdout);
      
      return releases.map((release: any) => ({
        name: release.name,
        version: release.chart,
        repository: release.app_version || 'unknown',
        namespace: release.namespace,
        status: this.mapHelmStatus(release.status),
        revision: release.revision,
        updated: release.updated,
        notes: ''
      }));
    } catch (error) {
      throw new Error(`Failed to list Helm releases: ${error.message}`);
    }
  }

  /**
   * Get details of a specific Helm release
   */
  async getRelease(name: string, namespace?: string): Promise<HelmChart> {
    const args = ['get', 'all', name, '--output', 'json'];
    
    if (namespace) {
      args.push('--namespace', namespace);
    }

    try {
      const result = await this.executeHelmCommand(args);
      const release = JSON.parse(result.stdout);
      
      return {
        name: release.name,
        version: release.chart?.metadata?.version || 'unknown',
        repository: release.chart?.metadata?.appVersion || 'unknown',
        namespace: release.namespace,
        status: this.mapHelmStatus(release.info?.status),
        revision: release.version,
        updated: release.info?.last_deployed || '',
        notes: release.info?.notes || '',
        values: release.config
      };
    } catch (error) {
      throw new Error(`Failed to get Helm release ${name}: ${error.message}`);
    }
  }

  /**
   * Install a Helm chart
   */
  async installChart(
    releaseName: string,
    chartName: string,
    options: {
      namespace?: string;
      createNamespace?: boolean;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
      wait?: boolean;
      timeout?: string;
    } = {}
  ): Promise<HelmChart> {
    const args = ['install', releaseName, chartName];

    if (options.namespace) {
      args.push('--namespace', options.namespace);
    }

    if (options.createNamespace) {
      args.push('--create-namespace');
    }

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    if (options.valuesFile) {
      args.push('--values', options.valuesFile);
    }

    if (options.values) {
      // Create temporary values file
      const tempValuesFile = await this.createTempValuesFile(options.values);
      args.push('--values', tempValuesFile);
    }

    args.push('--output', 'json');

    try {
      const result = await this.executeHelmCommand(args);
      const release = JSON.parse(result.stdout);
      
      return {
        name: release.name,
        version: release.chart?.metadata?.version || 'unknown',
        repository: release.chart?.metadata?.appVersion || 'unknown',
        namespace: release.namespace,
        status: this.mapHelmStatus(release.info?.status),
        revision: release.version,
        updated: release.info?.last_deployed || '',
        notes: release.info?.notes || ''
      };
    } catch (error) {
      throw new Error(`Failed to install Helm chart ${chartName}: ${error.message}`);
    } finally {
      // Clean up temporary values file
      if (options.values) {
        // In a real implementation, you'd track and clean up temp files
      }
    }
  }

  /**
   * Upgrade a Helm release
   */
  async upgradeRelease(
    releaseName: string,
    chartName: string,
    options: {
      namespace?: string;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
      wait?: boolean;
      timeout?: string;
      resetValues?: boolean;
      reuseValues?: boolean;
    } = {}
  ): Promise<HelmChart> {
    const args = ['upgrade', releaseName, chartName];

    if (options.namespace) {
      args.push('--namespace', options.namespace);
    }

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    if (options.resetValues) {
      args.push('--reset-values');
    }

    if (options.reuseValues) {
      args.push('--reuse-values');
    }

    if (options.valuesFile) {
      args.push('--values', options.valuesFile);
    }

    if (options.values) {
      const tempValuesFile = await this.createTempValuesFile(options.values);
      args.push('--values', tempValuesFile);
    }

    args.push('--output', 'json');

    try {
      const result = await this.executeHelmCommand(args);
      const release = JSON.parse(result.stdout);
      
      return {
        name: release.name,
        version: release.chart?.metadata?.version || 'unknown',
        repository: release.chart?.metadata?.appVersion || 'unknown',
        namespace: release.namespace,
        status: this.mapHelmStatus(release.info?.status),
        revision: release.version,
        updated: release.info?.last_deployed || '',
        notes: release.info?.notes || ''
      };
    } catch (error) {
      throw new Error(`Failed to upgrade Helm release ${releaseName}: ${error.message}`);
    }
  }

  /**
   * Uninstall a Helm release
   */
  async uninstallRelease(releaseName: string, namespace?: string): Promise<void> {
    const args = ['uninstall', releaseName];

    if (namespace) {
      args.push('--namespace', namespace);
    }

    try {
      await this.executeHelmCommand(args);
    } catch (error) {
      throw new Error(`Failed to uninstall Helm release ${releaseName}: ${error.message}`);
    }
  }

  /**
   * Rollback a Helm release
   */
  async rollbackRelease(
    releaseName: string,
    revision?: number,
    options: {
      namespace?: string;
      wait?: boolean;
      timeout?: string;
    } = {}
  ): Promise<HelmChart> {
    const args = ['rollback', releaseName];

    if (revision) {
      args.push(revision.toString());
    }

    if (options.namespace) {
      args.push('--namespace', options.namespace);
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    try {
      await this.executeHelmCommand(args);
      return await this.getRelease(releaseName, options.namespace);
    } catch (error) {
      throw new Error(`Failed to rollback Helm release ${releaseName}: ${error.message}`);
    }
  }

  /**
   * Get release history
   */
  async getReleaseHistory(releaseName: string, namespace?: string): Promise<any[]> {
    const args = ['history', releaseName, '--output', 'json'];

    if (namespace) {
      args.push('--namespace', namespace);
    }

    try {
      const result = await this.executeHelmCommand(args);
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Failed to get release history for ${releaseName}: ${error.message}`);
    }
  }

  /**
   * Add a Helm repository
   */
  async addRepository(repo: HelmRepository): Promise<void> {
    const args = ['repo', 'add', repo.name, repo.url];

    if (repo.username && repo.password) {
      args.push('--username', repo.username, '--password', repo.password);
    }

    if (repo.certFile) {
      args.push('--cert-file', repo.certFile);
    }

    if (repo.keyFile) {
      args.push('--key-file', repo.keyFile);
    }

    if (repo.caFile) {
      args.push('--ca-file', repo.caFile);
    }

    if (repo.insecureSkipTlsVerify) {
      args.push('--insecure-skip-tls-verify');
    }

    try {
      await this.executeHelmCommand(args);
    } catch (error) {
      throw new Error(`Failed to add Helm repository ${repo.name}: ${error.message}`);
    }
  }

  /**
   * Update Helm repositories
   */
  async updateRepositories(): Promise<void> {
    try {
      await this.executeHelmCommand(['repo', 'update']);
    } catch (error) {
      throw new Error(`Failed to update Helm repositories: ${error.message}`);
    }
  }

  /**
   * List Helm repositories
   */
  async listRepositories(): Promise<HelmRepository[]> {
    try {
      const result = await this.executeHelmCommand(['repo', 'list', '--output', 'json']);
      const repos = JSON.parse(result.stdout);
      
      return repos.map((repo: any) => ({
        name: repo.name,
        url: repo.url
      }));
    } catch (error) {
      throw new Error(`Failed to list Helm repositories: ${error.message}`);
    }
  }

  /**
   * Search for charts in repositories
   */
  async searchCharts(keyword: string, options: { version?: string; versions?: boolean } = {}): Promise<any[]> {
    const args = ['search', 'repo', keyword, '--output', 'json'];

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.versions) {
      args.push('--versions');
    }

    try {
      const result = await this.executeHelmCommand(args);
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(`Failed to search for charts: ${error.message}`);
    }
  }

  /**
   * Get chart values
   */
  async getChartValues(chartName: string, version?: string): Promise<Record<string, any>> {
    const args = ['show', 'values', chartName];

    if (version) {
      args.push('--version', version);
    }

    try {
      const result = await this.executeHelmCommand(args);
      return yaml.load(result.stdout) as Record<string, any>;
    } catch (error) {
      throw new Error(`Failed to get chart values for ${chartName}: ${error.message}`);
    }
  }

  /**
   * Validate a chart
   */
  async validateChart(chartPath: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      await this.executeHelmCommand(['lint', chartPath]);
      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Template a chart (dry-run)
   */
  async templateChart(
    releaseName: string,
    chartName: string,
    options: {
      namespace?: string;
      values?: Record<string, any>;
      valuesFile?: string;
      version?: string;
    } = {}
  ): Promise<string> {
    const args = ['template', releaseName, chartName];

    if (options.namespace) {
      args.push('--namespace', options.namespace);
    }

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.valuesFile) {
      args.push('--values', options.valuesFile);
    }

    if (options.values) {
      const tempValuesFile = await this.createTempValuesFile(options.values);
      args.push('--values', tempValuesFile);
    }

    try {
      const result = await this.executeHelmCommand(args);
      return result.stdout;
    } catch (error) {
      throw new Error(`Failed to template chart ${chartName}: ${error.message}`);
    }
  }

  private async executeHelmCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    // Add global options
    const globalArgs = [...args];
    
    if (this.kubeconfig) {
      globalArgs.push('--kubeconfig', this.kubeconfig);
    }
    
    if (this.context) {
      globalArgs.push('--kube-context', this.context);
    }

    return new Promise((resolve, reject) => {
      const process = spawn(this.helmPath, globalArgs, {
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
          reject(new Error(`Helm command failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async createTempValuesFile(values: Record<string, any>): Promise<string> {
    const tempDir = '/tmp'; // In production, use proper temp directory
    const tempFile = path.join(tempDir, `helm-values-${Date.now()}.yaml`);
    const yamlContent = yaml.dump(values);
    
    await fs.writeFile(tempFile, yamlContent);
    return tempFile;
  }

  private mapHelmStatus(status: string): HelmChart['status'] {
    switch (status?.toLowerCase()) {
      case 'deployed': return 'deployed';
      case 'failed': return 'failed';
      case 'pending-install': return 'pending-install';
      case 'pending-upgrade': return 'pending-upgrade';
      case 'pending-rollback': return 'pending-rollback';
      default: return 'deployed';
    }
  }
}