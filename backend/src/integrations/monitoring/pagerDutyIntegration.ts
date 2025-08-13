import axios, { AxiosInstance } from 'axios';
import {
  PagerDutyConfig,
  PagerDutyIncident,
  PagerDutyService,
  PagerDutyUser
} from './types';

export class PagerDutyIntegration {
  private client: AxiosInstance;
  private eventsClient: AxiosInstance;
  private config: PagerDutyConfig;

  constructor(config: PagerDutyConfig) {
    this.config = config;
    
    // API client for management operations
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.pagerduty.com',
      timeout: 30000,
      headers: {
        'Authorization': `Token token=${config.apiKey}`,
        'Accept': 'application/vnd.pagerduty+json;version=2',
        'Content-Type': 'application/json'
      }
    });

    // Events client for incident management
    this.eventsClient = axios.create({
      baseURL: 'https://events.pagerduty.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Trigger an incident
   */
  async triggerIncident(incident: PagerDutyIncident): Promise<{ status: string; message: string; dedup_key?: string }> {
    try {
      const payload = {
        routing_key: this.config.routingKey,
        event_action: incident.event_type,
        dedup_key: incident.incident_key,
        payload: {
          summary: incident.description,
          source: incident.client || 'AIOps Platform',
          severity: incident.severity || 'error',
          component: incident.component,
          group: incident.group,
          class: incident.class,
          custom_details: incident.details
        },
        client: incident.client || 'AIOps Platform',
        client_url: incident.client_url,
        links: incident.contexts?.filter(ctx => ctx.type === 'link').map(ctx => ({
          href: ctx.href,
          text: ctx.text
        })),
        images: incident.contexts?.filter(ctx => ctx.type === 'image').map(ctx => ({
          src: ctx.src,
          href: ctx.href,
          alt: ctx.alt
        }))
      };

      const response = await this.eventsClient.post('/v2/enqueue', payload);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to trigger PagerDuty incident: ${error.message}`);
    }
  }

  /**
   * Acknowledge an incident
   */
  async acknowledgeIncident(incidentKey: string, details?: Record<string, any>): Promise<{ status: string; message: string }> {
    return this.triggerIncident({
      incident_key: incidentKey,
      event_type: 'acknowledge',
      description: 'Incident acknowledged by AIOps Platform',
      details
    });
  }

  /**
   * Resolve an incident
   */
  async resolveIncident(incidentKey: string, details?: Record<string, any>): Promise<{ status: string; message: string }> {
    return this.triggerIncident({
      incident_key: incidentKey,
      event_type: 'resolve',
      description: 'Incident resolved by AIOps Platform',
      details
    });
  }

  /**
   * Get all services
   */
  async getServices(): Promise<PagerDutyService[]> {
    try {
      const response = await this.client.get('/services');
      return response.data.services || [];
    } catch (error: any) {
      throw new Error(`Failed to get PagerDuty services: ${error.message}`);
    }
  }

  /**
   * Get a specific service
   */
  async getService(serviceId: string): Promise<PagerDutyService> {
    try {
      const response = await this.client.get(`/services/${serviceId}`);
      return response.data.service;
    } catch (error: any) {
      throw new Error(`Failed to get PagerDuty service ${serviceId}: ${error.message}`);
    }
  }

  /**
   * Get all incidents
   */
  async getIncidents(params?: {
    status?: string[];
    incident_key?: string;
    service_ids?: string[];
    team_ids?: string[];
    user_ids?: string[];
    urgencies?: string[];
    time_zone?: string;
    since?: string;
    until?: string;
    date_range?: 'all';
    sort_by?: 'incident_number' | 'created_at' | 'resolved_at' | 'urgency';
    include?: string[];
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    try {
      const queryParams = new URLSearchParams();
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(`${key}[]`, v));
          } else if (value !== undefined) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const response = await this.client.get(`/incidents?${queryParams.toString()}`);
      return response.data.incidents || [];
    } catch (error: any) {
      throw new Error(`Failed to get PagerDuty incidents: ${error.message}`);
    }
  }

  /**
   * Get a specific incident
   */
  async getIncident(incidentId: string): Promise<any> {
    try {
      const response = await this.client.get(`/incidents/${incidentId}`);
      return response.data.incident;
    } catch (error: any) {
      throw new Error(`Failed to get PagerDuty incident ${incidentId}: ${error.message}`);
    }
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<PagerDutyUser[]> {
    try {
      const response = await this.client.get('/users');
      return response.data.users || [];
    } catch (error: any) {
      throw new Error(`Failed to get PagerDuty users: ${error.message}`);
    }
  }

  /**
   * Get a specific user
   */
  async getUser(userId: string): Promise<PagerDutyUser> {
    try {
      const response = await this.client.get(`/users/${userId}`);
      return response.data.user;
    } catch (error: any) {
      throw new Error(`Failed to get PagerDuty user ${userId}: ${error.message}`);
    }
  }

  /**
   * Get escalation policies
   */
  async getEscalationPolicies(): Promise<any[]> {
    try {
      const response = await this.client.get('/escalation_policies');
      return response.data.escalation_policies || [];
    } catch (error: any) {
      throw new Error(`Failed to get escalation policies: ${error.message}`);
    }
  }

  /**
   * Get on-call users for a service
   */
  async getOnCallUsers(serviceId: string): Promise<PagerDutyUser[]> {
    try {
      const response = await this.client.get(`/oncalls?service_ids[]=${serviceId}`);
      const oncalls = response.data.oncalls || [];
      return oncalls.map((oncall: any) => oncall.user);
    } catch (error: any) {
      throw new Error(`Failed to get on-call users for service ${serviceId}: ${error.message}`);
    }
  }

  /**
   * Create a maintenance window
   */
  async createMaintenanceWindow(params: {
    type: 'maintenance_window';
    start_time: string;
    end_time: string;
    description: string;
    services: Array<{ id: string; type: 'service_reference' }>;
  }): Promise<any> {
    try {
      const payload = {
        maintenance_window: params
      };

      const response = await this.client.post('/maintenance_windows', payload);
      return response.data.maintenance_window;
    } catch (error: any) {
      throw new Error(`Failed to create maintenance window: ${error.message}`);
    }
  }

  /**
   * Get maintenance windows
   */
  async getMaintenanceWindows(params?: {
    query?: string;
    includes?: string[];
    service_ids?: string[];
    team_ids?: string[];
    filter?: 'past' | 'future' | 'ongoing';
  }): Promise<any[]> {
    try {
      const queryParams = new URLSearchParams();
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(`${key}[]`, v));
          } else if (value !== undefined) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const response = await this.client.get(`/maintenance_windows?${queryParams.toString()}`);
      return response.data.maintenance_windows || [];
    } catch (error: any) {
      throw new Error(`Failed to get maintenance windows: ${error.message}`);
    }
  }

  /**
   * Test the PagerDuty integration
   */
  async testIntegration(): Promise<{ success: boolean; message: string }> {
    try {
      // Test API connectivity by getting services
      await this.getServices();
      
      // Test events API by sending a test event
      const testResult = await this.triggerIncident({
        incident_key: `test-${Date.now()}`,
        event_type: 'trigger',
        description: 'AIOps Platform Integration Test',
        severity: 'info',
        client: 'AIOps Platform Test',
        details: {
          test: true,
          timestamp: new Date().toISOString()
        }
      });

      // Immediately resolve the test incident
      await this.resolveIncident(`test-${Date.now()}`, {
        test_resolved: true,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: 'PagerDuty integration test successful'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `PagerDuty integration test failed: ${error.message}`
      };
    }
  }

  /**
   * Create an incident for AIOps platform alerts
   */
  async createAIOpsIncident(params: {
    title: string;
    description: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    source: string;
    component?: string;
    affectedResources?: string[];
    details?: Record<string, any>;
  }): Promise<{ status: string; message: string; dedup_key?: string }> {
    const incidentKey = `aiops-${params.source}-${Date.now()}`;
    
    return this.triggerIncident({
      incident_key: incidentKey,
      event_type: 'trigger',
      description: params.title,
      severity: params.severity,
      component: params.component || params.source,
      group: 'AIOps Platform',
      class: 'Infrastructure',
      client: 'AIOps Platform',
      details: {
        description: params.description,
        affected_resources: params.affectedResources,
        timestamp: new Date().toISOString(),
        ...params.details
      },
      contexts: [
        {
          type: 'link',
          href: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/incidents`,
          text: 'View in AIOps Dashboard'
        }
      ]
    });
  }

  /**
   * Get incident analytics
   */
  async getIncidentAnalytics(params?: {
    since?: string;
    until?: string;
    service_ids?: string[];
    team_ids?: string[];
  }): Promise<any> {
    try {
      const queryParams = new URLSearchParams();
      
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => queryParams.append(`${key}[]`, v));
          } else if (value !== undefined) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const response = await this.client.get(`/analytics/metrics/incidents/all?${queryParams.toString()}`);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get incident analytics: ${error.message}`);
    }
  }
}