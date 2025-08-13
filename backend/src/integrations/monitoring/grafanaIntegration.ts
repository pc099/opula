import axios, { AxiosInstance } from 'axios';
import {
  GrafanaConfig,
  GrafanaDashboard,
  GrafanaDataSource,
  GrafanaAlert,
  MonitoringDashboard
} from './types';

export class GrafanaIntegration {
  private client: AxiosInstance;
  private config: GrafanaConfig;

  constructor(config: GrafanaConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get all dashboards
   */
  async getDashboards(): Promise<Array<{ id: number; uid: string; title: string; tags: string[]; uri: string }>> {
    try {
      const response = await this.client.get('/api/search?type=dash-db');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Grafana dashboards: ${error.message}`);
    }
  }

  /**
   * Get a specific dashboard by UID
   */
  async getDashboard(uid: string): Promise<GrafanaDashboard> {
    try {
      const response = await this.client.get(`/api/dashboards/uid/${uid}`);
      return response.data.dashboard;
    } catch (error) {
      throw new Error(`Failed to get Grafana dashboard ${uid}: ${error.message}`);
    }
  }

  /**
   * Create a new dashboard
   */
  async createDashboard(dashboard: GrafanaDashboard): Promise<{ id: number; uid: string; url: string; version: number }> {
    try {
      const payload = {
        dashboard: {
          ...dashboard,
          id: null // Ensure new dashboard
        },
        folderId: 0,
        overwrite: false
      };

      const response = await this.client.post('/api/dashboards/db', payload);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create Grafana dashboard: ${error.message}`);
    }
  }

  /**
   * Update an existing dashboard
   */
  async updateDashboard(dashboard: GrafanaDashboard): Promise<{ id: number; uid: string; url: string; version: number }> {
    try {
      const payload = {
        dashboard,
        overwrite: true
      };

      const response = await this.client.post('/api/dashboards/db', payload);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update Grafana dashboard: ${error.message}`);
    }
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(uid: string): Promise<void> {
    try {
      await this.client.delete(`/api/dashboards/uid/${uid}`);
    } catch (error) {
      throw new Error(`Failed to delete Grafana dashboard ${uid}: ${error.message}`);
    }
  }

  /**
   * Get all data sources
   */
  async getDataSources(): Promise<GrafanaDataSource[]> {
    try {
      const response = await this.client.get('/api/datasources');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Grafana data sources: ${error.message}`);
    }
  }

  /**
   * Get a specific data source
   */
  async getDataSource(id: number): Promise<GrafanaDataSource> {
    try {
      const response = await this.client.get(`/api/datasources/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Grafana data source ${id}: ${error.message}`);
    }
  }

  /**
   * Create a new data source
   */
  async createDataSource(dataSource: Omit<GrafanaDataSource, 'id'>): Promise<GrafanaDataSource> {
    try {
      const response = await this.client.post('/api/datasources', dataSource);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create Grafana data source: ${error.message}`);
    }
  }

  /**
   * Update a data source
   */
  async updateDataSource(id: number, dataSource: Partial<GrafanaDataSource>): Promise<GrafanaDataSource> {
    try {
      const response = await this.client.put(`/api/datasources/${id}`, dataSource);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update Grafana data source ${id}: ${error.message}`);
    }
  }

  /**
   * Delete a data source
   */
  async deleteDataSource(id: number): Promise<void> {
    try {
      await this.client.delete(`/api/datasources/${id}`);
    } catch (error) {
      throw new Error(`Failed to delete Grafana data source ${id}: ${error.message}`);
    }
  }

  /**
   * Test a data source connection
   */
  async testDataSource(dataSource: GrafanaDataSource): Promise<{ status: string; message: string }> {
    try {
      const response = await this.client.post('/api/datasources/proxy/test', dataSource);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to test Grafana data source: ${error.message}`);
    }
  }

  /**
   * Get alerts
   */
  async getAlerts(): Promise<GrafanaAlert[]> {
    try {
      const response = await this.client.get('/api/alerts');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Grafana alerts: ${error.message}`);
    }
  }

  /**
   * Pause/unpause an alert
   */
  async pauseAlert(alertId: number, paused: boolean): Promise<void> {
    try {
      await this.client.post(`/api/alerts/${alertId}/pause`, { paused });
    } catch (error) {
      throw new Error(`Failed to ${paused ? 'pause' : 'unpause'} alert ${alertId}: ${error.message}`);
    }
  }

  /**
   * Get alert notifications (channels)
   */
  async getNotificationChannels(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/alert-notifications');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get notification channels: ${error.message}`);
    }
  }

  /**
   * Create a notification channel
   */
  async createNotificationChannel(channel: {
    name: string;
    type: string;
    settings: Record<string, any>;
  }): Promise<any> {
    try {
      const response = await this.client.post('/api/alert-notifications', channel);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create notification channel: ${error.message}`);
    }
  }

  /**
   * Get organization information
   */
  async getOrganization(): Promise<any> {
    try {
      const response = await this.client.get('/api/org');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get organization info: ${error.message}`);
    }
  }

  /**
   * Get users in the organization
   */
  async getUsers(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/org/users');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get users: ${error.message}`);
    }
  }

  /**
   * Search for dashboards, folders, and data sources
   */
  async search(query?: string, tags?: string[], type?: 'dash-db' | 'dash-folder'): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (query) params.append('query', query);
      if (tags) tags.forEach(tag => params.append('tag', tag));
      if (type) params.append('type', type);

      const response = await this.client.get(`/api/search?${params.toString()}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to search Grafana: ${error.message}`);
    }
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<{ commit: string; database: string; version: string }> {
    try {
      const response = await this.client.get('/api/health');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get Grafana health: ${error.message}`);
    }
  }

  /**
   * Create a monitoring dashboard for AIOps platform
   */
  async createAIOpsMonitoringDashboard(): Promise<MonitoringDashboard> {
    const dashboard: GrafanaDashboard = {
      title: 'AIOps Platform Monitoring',
      tags: ['aiops', 'monitoring', 'infrastructure'],
      timezone: 'browser',
      refresh: '30s',
      time: {
        from: 'now-1h',
        to: 'now'
      },
      panels: [
        {
          id: 1,
          title: 'System CPU Usage',
          type: 'graph',
          targets: [
            {
              expr: '100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
              refId: 'A',
              legendFormat: '{{instance}}'
            }
          ],
          gridPos: { h: 8, w: 12, x: 0, y: 0 }
        },
        {
          id: 2,
          title: 'Memory Usage',
          type: 'graph',
          targets: [
            {
              expr: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
              refId: 'A',
              legendFormat: '{{instance}}'
            }
          ],
          gridPos: { h: 8, w: 12, x: 12, y: 0 }
        },
        {
          id: 3,
          title: 'Active Agents',
          type: 'singlestat',
          targets: [
            {
              expr: 'count(up{job="aiops-agents"})',
              refId: 'A'
            }
          ],
          gridPos: { h: 4, w: 6, x: 0, y: 8 }
        },
        {
          id: 4,
          title: 'API Request Rate',
          type: 'graph',
          targets: [
            {
              expr: 'sum(rate(http_requests_total{job="aiops-backend"}[5m]))',
              refId: 'A',
              legendFormat: 'Requests/sec'
            }
          ],
          gridPos: { h: 8, w: 18, x: 6, y: 8 }
        },
        {
          id: 5,
          title: 'Error Rate',
          type: 'graph',
          targets: [
            {
              expr: 'sum(rate(http_requests_total{job="aiops-backend",status=~"5.."}[5m]))',
              refId: 'A',
              legendFormat: 'Errors/sec'
            }
          ],
          gridPos: { h: 8, w: 12, x: 0, y: 16 }
        },
        {
          id: 6,
          title: 'Response Time P95',
          type: 'graph',
          targets: [
            {
              expr: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="aiops-backend"}[5m])) by (le))',
              refId: 'A',
              legendFormat: '95th percentile'
            }
          ],
          gridPos: { h: 8, w: 12, x: 12, y: 16 }
        }
      ]
    };

    const result = await this.createDashboard(dashboard);
    
    return {
      id: result.uid,
      title: dashboard.title,
      description: 'Monitoring dashboard for AIOps platform components',
      tags: dashboard.tags || [],
      panels: dashboard.panels.map(panel => ({
        id: panel.id.toString(),
        title: panel.title,
        type: (panel.type as 'logs' | 'graph' | 'singlestat' | 'table' | 'heatmap') || 'graph',
        queries: panel.targets?.map(target => target.expr) || []
      }))
    };
  }

  /**
   * Create Prometheus data source
   */
  async createPrometheusDataSource(prometheusUrl: string, name: string = 'Prometheus'): Promise<GrafanaDataSource> {
    const dataSource: Omit<GrafanaDataSource, 'id'> = {
      name,
      type: 'prometheus',
      url: prometheusUrl,
      access: 'proxy',
      basicAuth: false,
      jsonData: {
        httpMethod: 'POST',
        queryTimeout: '60s',
        timeInterval: '30s'
      }
    };

    return await this.createDataSource(dataSource);
  }

  /**
   * Export dashboard as JSON
   */
  async exportDashboard(uid: string): Promise<string> {
    try {
      const dashboard = await this.getDashboard(uid);
      return JSON.stringify(dashboard, null, 2);
    } catch (error) {
      throw new Error(`Failed to export dashboard ${uid}: ${error.message}`);
    }
  }

  /**
   * Import dashboard from JSON
   */
  async importDashboard(dashboardJson: string, overwrite: boolean = false): Promise<{ id: number; uid: string; url: string; version: number }> {
    try {
      const dashboard = JSON.parse(dashboardJson);
      
      const payload = {
        dashboard: {
          ...dashboard,
          id: overwrite ? dashboard.id : null
        },
        folderId: 0,
        overwrite
      };

      const response = await this.client.post('/api/dashboards/db', payload);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to import dashboard: ${error.message}`);
    }
  }
}