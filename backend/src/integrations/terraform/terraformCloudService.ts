import axios, { AxiosInstance } from 'axios';
import { TerraformCloudConfig } from './types';

export interface TerraformCloudWorkspace {
  id: string;
  type: string;
  attributes: {
    name: string;
    'auto-apply': boolean;
    'terraform-version': string;
    'working-directory': string;
    'execution-mode': string;
    'vcs-repo'?: {
      identifier: string;
      branch: string;
      'oauth-token-id': string;
    };
  };
}

export interface TerraformCloudRun {
  id: string;
  type: string;
  attributes: {
    status: string;
    'status-timestamps': Record<string, string>;
    message: string;
    'terraform-version': string;
    'plan-only': boolean;
    'is-destroy': boolean;
    'created-at': string;
  };
  relationships: {
    workspace: { data: { id: string; type: string } };
    plan: { data: { id: string; type: string } };
    apply?: { data: { id: string; type: string } };
  };
}

export interface TerraformCloudPlan {
  id: string;
  type: string;
  attributes: {
    status: string;
    'log-read-url': string;
    'resource-additions': number;
    'resource-changes': number;
    'resource-destructions': number;
    'has-changes': boolean;
  };
}

export class TerraformCloudService {
  private client: AxiosInstance;
  private config: TerraformCloudConfig;

  constructor(config: TerraformCloudConfig) {
    this.config = config;
    const baseURL = config.hostname ? `https://${config.hostname}` : 'https://app.terraform.io';
    
    this.client = axios.create({
      baseURL: `${baseURL}/api/v2`,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/vnd.api+json'
      }
    });
  }

  /**
   * List workspaces in the organization
   */
  async listWorkspaces(): Promise<TerraformCloudWorkspace[]> {
    const response = await this.client.get(`/organizations/${this.config.organization}/workspaces`);
    return response.data.data;
  }

  /**
   * Get a specific workspace
   */
  async getWorkspace(workspaceName: string): Promise<TerraformCloudWorkspace> {
    const response = await this.client.get(
      `/organizations/${this.config.organization}/workspaces/${workspaceName}`
    );
    return response.data.data;
  }

  /**
   * Create a new run (plan/apply)
   */
  async createRun(workspaceId: string, options: {
    message?: string;
    isDestroy?: boolean;
    planOnly?: boolean;
    targetAddrs?: string[];
  } = {}): Promise<TerraformCloudRun> {
    const payload = {
      data: {
        type: 'runs',
        attributes: {
          message: options.message || 'Triggered via API',
          'is-destroy': options.isDestroy || false,
          'plan-only': options.planOnly || false,
          ...(options.targetAddrs && { 'target-addrs': options.targetAddrs })
        },
        relationships: {
          workspace: {
            data: {
              type: 'workspaces',
              id: workspaceId
            }
          }
        }
      }
    };

    const response = await this.client.post('/runs', payload);
    return response.data.data;
  }

  /**
   * Get run details
   */
  async getRun(runId: string): Promise<TerraformCloudRun> {
    const response = await this.client.get(`/runs/${runId}`);
    return response.data.data;
  }

  /**
   * Get plan details
   */
  async getPlan(planId: string): Promise<TerraformCloudPlan> {
    const response = await this.client.get(`/plans/${planId}`);
    return response.data.data;
  }

  /**
   * Apply a run
   */
  async applyRun(runId: string, comment?: string): Promise<void> {
    const payload = {
      comment: comment || 'Applied via API'
    };

    await this.client.post(`/runs/${runId}/actions/apply`, payload);
  }

  /**
   * Discard a run
   */
  async discardRun(runId: string, comment?: string): Promise<void> {
    const payload = {
      comment: comment || 'Discarded via API'
    };

    await this.client.post(`/runs/${runId}/actions/discard`, payload);
  }

  /**
   * Get plan logs
   */
  async getPlanLogs(planId: string): Promise<string> {
    const plan = await this.getPlan(planId);
    if (plan.attributes['log-read-url']) {
      const response = await axios.get(plan.attributes['log-read-url']);
      return response.data;
    }
    return '';
  }

  /**
   * List runs for a workspace
   */
  async listRuns(workspaceId: string, options: {
    pageSize?: number;
    pageNumber?: number;
    status?: string;
  } = {}): Promise<TerraformCloudRun[]> {
    const params = new URLSearchParams();
    if (options.pageSize) params.append('page[size]', options.pageSize.toString());
    if (options.pageNumber) params.append('page[number]', options.pageNumber.toString());
    if (options.status) params.append('filter[status]', options.status);

    const response = await this.client.get(
      `/workspaces/${workspaceId}/runs?${params.toString()}`
    );
    return response.data.data;
  }

  /**
   * Get current state version for a workspace
   */
  async getCurrentStateVersion(workspaceId: string): Promise<any> {
    const response = await this.client.get(`/workspaces/${workspaceId}/current-state-version`);
    return response.data.data;
  }

  /**
   * Download state file
   */
  async downloadState(stateVersionId: string): Promise<any> {
    const response = await this.client.get(`/state-versions/${stateVersionId}/download`);
    return response.data;
  }
}