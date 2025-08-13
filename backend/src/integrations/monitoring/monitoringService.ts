import { PrometheusIntegration } from './prometheusIntegration';
import { GrafanaIntegration } from './grafanaIntegration';
import { PagerDutyIntegration } from './pagerDutyIntegration';
import { SlackIntegration } from './slackIntegration';
import { TeamsIntegration } from './teamsIntegration';
import {
  PrometheusConfig,
  GrafanaConfig,
  PagerDutyConfig,
  SlackConfig,
  TeamsConfig,
  MonitoringAlert,
  MonitoringMetric,
  NotificationChannel,
  AlertRule
} from './types';

export interface MonitoringServiceConfig {
  prometheus?: PrometheusConfig;
  grafana?: GrafanaConfig;
  pagerduty?: PagerDutyConfig;
  slack?: SlackConfig;
  teams?: TeamsConfig;
}

export class MonitoringService {
  private prometheus?: PrometheusIntegration;
  private grafana?: GrafanaIntegration;
  private pagerduty?: PagerDutyIntegration;
  private slack?: SlackIntegration;
  private teams?: TeamsIntegration;

  constructor(config: MonitoringServiceConfig) {
    if (config.prometheus) {
      this.prometheus = new PrometheusIntegration(config.prometheus);
    }
    
    if (config.grafana) {
      this.grafana = new GrafanaIntegration(config.grafana);
    }
    
    if (config.pagerduty) {
      this.pagerduty = new PagerDutyIntegration(config.pagerduty);
    }
    
    if (config.slack) {
      this.slack = new SlackIntegration(config.slack);
    }
    
    if (config.teams) {
      this.teams = new TeamsIntegration(config.teams);
    }
  }

  /**
   * Test all configured integrations
   */
  async testAllIntegrations(): Promise<{
    prometheus?: { success: boolean; message: string };
    grafana?: { success: boolean; message: string };
    pagerduty?: { success: boolean; message: string };
    slack?: { success: boolean; message: string };
    teams?: { success: boolean; message: string };
  }> {
    const results: any = {};

    if (this.prometheus) {
      try {
        const health = await this.prometheus.checkHealth();
        results.prometheus = {
          success: health.healthy,
          message: health.message || 'Prometheus is healthy'
        };
      } catch (error: any) {
        results.prometheus = {
          success: false,
          message: `Prometheus test failed: ${error.message}`
        };
      }
    }

    if (this.grafana) {
      try {
        await this.grafana.getHealth();
        results.grafana = {
          success: true,
          message: 'Grafana is healthy'
        };
      } catch (error: any) {
        results.grafana = {
          success: false,
          message: `Grafana test failed: ${error.message}`
        };
      }
    }

    if (this.pagerduty) {
      results.pagerduty = await this.pagerduty.testIntegration();
    }

    if (this.slack) {
      results.slack = await this.slack.testIntegration();
    }

    if (this.teams) {
      results.teams = await this.teams.testIntegration();
    }

    return results;
  }

  /**
   * Get system metrics from Prometheus
   */
  async getSystemMetrics(): Promise<{
    infrastructure: {
      cpu: MonitoringMetric[];
      memory: MonitoringMetric[];
      disk: MonitoringMetric[];
      network: MonitoringMetric[];
    };
    applications?: {
      [appName: string]: {
        requests: MonitoringMetric[];
        errors: MonitoringMetric[];
        latency: MonitoringMetric[];
      };
    };
  }> {
    if (!this.prometheus) {
      throw new Error('Prometheus integration not configured');
    }

    const infrastructure = await this.prometheus.getInfrastructureMetrics();
    
    // Get application metrics for known applications
    const applications: any = {};
    const knownApps = ['aiops-backend', 'aiops-frontend', 'aiops-agents'];
    
    for (const app of knownApps) {
      try {
        applications[app] = await this.prometheus.getApplicationMetrics(app);
      } catch (error) {
        // App might not be instrumented or running
        console.warn(`Could not get metrics for ${app}:`, error);
      }
    }

    return {
      infrastructure,
      applications: Object.keys(applications).length > 0 ? applications : undefined
    };
  }

  /**
   * Get current alerts from Prometheus
   */
  async getCurrentAlerts(): Promise<MonitoringAlert[]> {
    if (!this.prometheus) {
      throw new Error('Prometheus integration not configured');
    }

    const prometheusAlerts = await this.prometheus.getAlerts();
    
    return prometheusAlerts.map(alert => ({
      id: `prometheus-${alert.labels.alertname || 'unknown'}`,
      name: alert.labels.alertname || 'Unknown Alert',
      description: alert.annotations.description || alert.annotations.summary || 'No description',
      severity: this.mapPrometheusAlertSeverity(alert.labels.severity),
      status: alert.state === 'firing' ? 'firing' : 'resolved',
      source: 'prometheus',
      labels: alert.labels,
      annotations: alert.annotations,
      startsAt: alert.activeAt || new Date().toISOString(),
      fingerprint: this.generateFingerprint(alert.labels)
    }));
  }

  /**
   * Send alert notifications to all configured channels
   */
  async sendAlertNotification(alert: {
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    source: string;
    affectedResources?: string[];
    incidentId?: string;
  }, channels?: {
    slack?: { channel: string };
    teams?: boolean;
    pagerduty?: boolean;
  }): Promise<{
    slack?: { success: boolean; error?: string };
    teams?: { success: boolean; error?: string };
    pagerduty?: { success: boolean; error?: string };
  }> {
    const results: any = {};
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/incidents`;

    // Send to Slack if configured and requested
    if (this.slack && channels?.slack) {
      try {
        const result = await this.slack.sendAIOpsAlert({
          channel: channels.slack.channel,
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
          source: alert.source,
          affectedResources: alert.affectedResources,
          dashboardUrl,
          incidentId: alert.incidentId
        });
        results.slack = { success: result.ok, error: result.error };
      } catch (error: any) {
        results.slack = { success: false, error: error.message };
      }
    }

    // Send to Teams if configured and requested
    if (this.teams && channels?.teams) {
      try {
        const result = await this.teams.sendAIOpsAlert({
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
          source: alert.source,
          affectedResources: alert.affectedResources,
          dashboardUrl,
          incidentId: alert.incidentId
        });
        results.teams = result;
      } catch (error: any) {
        results.teams = { success: false, error: error.message };
      }
    }

    // Send to PagerDuty if configured and requested
    if (this.pagerduty && channels?.pagerduty) {
      try {
        const result = await this.pagerduty.createAIOpsIncident({
          title: alert.title,
          description: alert.description,
          severity: alert.severity === 'low' ? 'info' : 
                   alert.severity === 'medium' ? 'warning' : 
                   alert.severity as 'critical' | 'error' | 'warning' | 'info',
          source: alert.source,
          affectedResources: alert.affectedResources,
          details: {
            incident_id: alert.incidentId,
            dashboard_url: dashboardUrl
          }
        });
        results.pagerduty = { success: result.status === 'success', error: result.message };
      } catch (error: any) {
        results.pagerduty = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Send resolution notifications
   */
  async sendResolutionNotification(params: {
    incidentId: string;
    title: string;
    resolutionTime: string;
    resolvedBy: string;
    originalMessageTs?: string;
  }, channels?: {
    slack?: { channel: string };
    teams?: boolean;
    pagerduty?: { incidentKey: string };
  }): Promise<{
    slack?: { success: boolean; error?: string };
    teams?: { success: boolean; error?: string };
    pagerduty?: { success: boolean; error?: string };
  }> {
    const results: any = {};
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/incidents`;

    // Send to Slack
    if (this.slack && channels?.slack) {
      try {
        if (params.originalMessageTs) {
          const result = await this.slack.sendResolutionNotification({
            channel: channels.slack.channel,
            originalMessageTs: params.originalMessageTs,
            incidentId: params.incidentId,
            title: params.title,
            resolutionTime: params.resolutionTime,
            resolvedBy: params.resolvedBy
          });
          results.slack = { success: result.ok, error: result.error };
        } else {
          // Send new message if we don't have original message timestamp
          const result = await this.slack.sendMessage({
            channel: channels.slack.channel,
            text: `✅ Incident Resolved: ${params.title}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Incident ${params.incidentId} has been resolved*\n*Resolution Time:* ${params.resolutionTime}\n*Resolved By:* ${params.resolvedBy}`
                }
              }
            ]
          });
          results.slack = { success: result.ok, error: result.error };
        }
      } catch (error: any) {
        results.slack = { success: false, error: error.message };
      }
    }

    // Send to Teams
    if (this.teams && channels?.teams) {
      try {
        const result = await this.teams.sendResolutionNotification({
          incidentId: params.incidentId,
          title: params.title,
          resolutionTime: params.resolutionTime,
          resolvedBy: params.resolvedBy,
          dashboardUrl
        });
        results.teams = result;
      } catch (error: any) {
        results.teams = { success: false, error: error.message };
      }
    }

    // Resolve in PagerDuty
    if (this.pagerduty && channels?.pagerduty) {
      try {
        const result = await this.pagerduty.resolveIncident(
          channels.pagerduty.incidentKey,
          {
            resolved_by: params.resolvedBy,
            resolution_time: params.resolutionTime,
            incident_id: params.incidentId
          }
        );
        results.pagerduty = { success: result.status === 'success', error: result.message };
      } catch (error: any) {
        results.pagerduty = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Create AIOps monitoring dashboard in Grafana
   */
  async createMonitoringDashboard(): Promise<{ success: boolean; dashboardUrl?: string; error?: string }> {
    if (!this.grafana) {
      return { success: false, error: 'Grafana integration not configured' };
    }

    try {
      const dashboard = await this.grafana.createAIOpsMonitoringDashboard();
      return {
        success: true,
        dashboardUrl: `${this.grafana['config'].url}/d/${dashboard.id}`
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Query custom metrics from Prometheus
   */
  async queryMetrics(query: string, timeRange?: { start: string; end: string; step: string }): Promise<MonitoringMetric[]> {
    if (!this.prometheus) {
      throw new Error('Prometheus integration not configured');
    }

    return this.prometheus.customQuery(query, timeRange);
  }

  /**
   * Get available metrics from Prometheus
   */
  async getAvailableMetrics(): Promise<string[]> {
    if (!this.prometheus) {
      throw new Error('Prometheus integration not configured');
    }

    return this.prometheus.getMetrics();
  }

  /**
   * Send maintenance notifications
   */
  async sendMaintenanceNotification(params: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    affectedServices: string[];
  }, channels?: {
    slack?: { channel: string };
    teams?: boolean;
    pagerduty?: { serviceIds: string[] };
  }): Promise<{
    slack?: { success: boolean; error?: string };
    teams?: { success: boolean; error?: string };
    pagerduty?: { success: boolean; error?: string };
  }> {
    const results: any = {};
    const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;

    // Send to Slack
    if (this.slack && channels?.slack) {
      try {
        const result = await this.slack.sendMaintenanceNotification({
          channel: channels.slack.channel,
          title: params.title,
          description: params.description,
          startTime: params.startTime,
          endTime: params.endTime,
          affectedServices: params.affectedServices
        });
        results.slack = { success: result.ok, error: result.error };
      } catch (error: any) {
        results.slack = { success: false, error: error.message };
      }
    }

    // Send to Teams
    if (this.teams && channels?.teams) {
      try {
        const result = await this.teams.sendMaintenanceNotification({
          title: params.title,
          description: params.description,
          startTime: params.startTime,
          endTime: params.endTime,
          affectedServices: params.affectedServices,
          dashboardUrl
        });
        results.teams = result;
      } catch (error: any) {
        results.teams = { success: false, error: error.message };
      }
    }

    // Create maintenance window in PagerDuty
    if (this.pagerduty && channels?.pagerduty) {
      try {
        const services = channels.pagerduty.serviceIds.map(id => ({
          id,
          type: 'service_reference' as const
        }));

        await this.pagerduty.createMaintenanceWindow({
          type: 'maintenance_window',
          start_time: params.startTime,
          end_time: params.endTime,
          description: `${params.title}: ${params.description}`,
          services
        });
        results.pagerduty = { success: true };
      } catch (error: any) {
        results.pagerduty = { success: false, error: error.message };
      }
    }

    return results;
  }

  /**
   * Map Prometheus alert severity to standard severity levels
   */
  private mapPrometheusAlertSeverity(severity?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (!severity) return 'medium';
    
    const severityLower = severity.toLowerCase();
    if (severityLower.includes('critical') || severityLower.includes('fatal')) return 'critical';
    if (severityLower.includes('high') || severityLower.includes('error')) return 'high';
    if (severityLower.includes('warning') || severityLower.includes('warn')) return 'medium';
    if (severityLower.includes('low') || severityLower.includes('minor')) return 'low';
    if (severityLower.includes('info') || severityLower.includes('debug')) return 'info';
    
    return 'medium';
  }

  /**
   * Generate a fingerprint for an alert based on its labels
   */
  private generateFingerprint(labels: Record<string, string>): string {
    const sortedLabels = Object.keys(labels)
      .sort()
      .map(key => `${key}=${labels[key]}`)
      .join(',');
    
    // Simple hash function for fingerprint
    let hash = 0;
    for (let i = 0; i < sortedLabels.length; i++) {
      const char = sortedLabels.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Get integration status
   */
  getIntegrationStatus(): {
    prometheus: boolean;
    grafana: boolean;
    pagerduty: boolean;
    slack: boolean;
    teams: boolean;
  } {
    return {
      prometheus: !!this.prometheus,
      grafana: !!this.grafana,
      pagerduty: !!this.pagerduty,
      slack: !!this.slack,
      teams: !!this.teams
    };
  }
}