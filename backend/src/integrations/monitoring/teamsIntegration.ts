import axios, { AxiosInstance } from 'axios';
import {
  TeamsConfig,
  TeamsMessage,
  TeamsSection,
  TeamsAction
} from './types';

export class TeamsIntegration {
  private client: AxiosInstance;
  private config: TeamsConfig;

  constructor(config: TeamsConfig) {
    this.config = config;
    
    this.client = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send a message to Teams via webhook
   */
  async sendMessage(message: TeamsMessage): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.client.post(this.config.webhookUrl, message);
      
      if (response.status === 200) {
        return { success: true };
      } else {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      return { success: false, error: `Failed to send Teams message: ${error.message}` };
    }
  }

  /**
   * Test the Teams integration
   */
  async testIntegration(): Promise<{ success: boolean; message: string }> {
    const testMessage: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: '0076D7',
      summary: 'AIOps Platform Integration Test',
      sections: [
        {
          activityTitle: 'Integration Test',
          activitySubtitle: 'AIOps Platform',
          facts: [
            {
              name: 'Status',
              value: 'Testing connection'
            },
            {
              name: 'Timestamp',
              value: new Date().toISOString()
            }
          ],
          markdown: true
        }
      ]
    };

    const result = await this.sendMessage(testMessage);
    
    if (result.success) {
      return {
        success: true,
        message: 'Teams integration test successful'
      };
    } else {
      return {
        success: false,
        message: `Teams integration test failed: ${result.error}`
      };
    }
  }

  /**
   * Send an AIOps alert notification
   */
  async sendAIOpsAlert(params: {
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    source: string;
    affectedResources?: string[];
    dashboardUrl?: string;
    incidentId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const severityColors = {
      critical: 'FF0000',
      high: 'FF6600',
      medium: 'FFCC00',
      low: '00CC00',
      info: '0066CC'
    };

    const severityEmojis = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️',
      info: '📊'
    };

    const sections: TeamsSection[] = [
      {
        activityTitle: `${severityEmojis[params.severity]} ${params.title}`,
        activitySubtitle: `AIOps Platform Alert - ${params.severity.toUpperCase()}`,
        facts: [
          {
            name: 'Severity',
            value: params.severity.toUpperCase()
          },
          {
            name: 'Source',
            value: params.source
          },
          {
            name: 'Time',
            value: new Date().toLocaleString()
          }
        ],
        markdown: true
      },
      {
        text: `**Description:** ${params.description}`,
        markdown: true
      }
    ];

    if (params.incidentId) {
      sections[0].facts!.push({
        name: 'Incident ID',
        value: params.incidentId
      });
    }

    if (params.affectedResources && params.affectedResources.length > 0) {
      sections.push({
        text: `**Affected Resources:**\n${params.affectedResources.map(r => `- ${r}`).join('\n')}`,
        markdown: true
      });
    }

    const actions: TeamsAction[] = [];

    if (params.dashboardUrl) {
      actions.push({
        '@type': 'OpenUri',
        name: 'View Dashboard',
        targets: [
          {
            os: 'default',
            uri: params.dashboardUrl
          }
        ]
      });
    }

    const message: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: severityColors[params.severity],
      summary: `${params.severity.toUpperCase()}: ${params.title}`,
      sections,
      potentialAction: actions.length > 0 ? actions : undefined
    };

    return this.sendMessage(message);
  }

  /**
   * Send a resolution notification
   */
  async sendResolutionNotification(params: {
    incidentId: string;
    title: string;
    resolutionTime: string;
    resolvedBy: string;
    dashboardUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const sections: TeamsSection[] = [
      {
        activityTitle: `✅ Incident Resolved: ${params.title}`,
        activitySubtitle: 'AIOps Platform',
        facts: [
          {
            name: 'Incident ID',
            value: params.incidentId
          },
          {
            name: 'Resolved By',
            value: params.resolvedBy
          },
          {
            name: 'Resolution Time',
            value: params.resolutionTime
          },
          {
            name: 'Status',
            value: 'RESOLVED'
          }
        ],
        markdown: true
      }
    ];

    const actions: TeamsAction[] = [];

    if (params.dashboardUrl) {
      actions.push({
        '@type': 'OpenUri',
        name: 'View Dashboard',
        targets: [
          {
            os: 'default',
            uri: params.dashboardUrl
          }
        ]
      });
    }

    const message: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: '00CC00',
      summary: `RESOLVED: ${params.title}`,
      sections,
      potentialAction: actions.length > 0 ? actions : undefined
    };

    return this.sendMessage(message);
  }

  /**
   * Send a maintenance notification
   */
  async sendMaintenanceNotification(params: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    affectedServices: string[];
    dashboardUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const sections: TeamsSection[] = [
      {
        activityTitle: `🔧 Scheduled Maintenance: ${params.title}`,
        activitySubtitle: 'AIOps Platform',
        facts: [
          {
            name: 'Start Time',
            value: params.startTime
          },
          {
            name: 'End Time',
            value: params.endTime
          },
          {
            name: 'Duration',
            value: this.calculateDuration(params.startTime, params.endTime)
          }
        ],
        markdown: true
      },
      {
        text: `**Description:** ${params.description}`,
        markdown: true
      }
    ];

    if (params.affectedServices.length > 0) {
      sections.push({
        text: `**Affected Services:**\n${params.affectedServices.map(s => `- ${s}`).join('\n')}`,
        markdown: true
      });
    }

    const actions: TeamsAction[] = [];

    if (params.dashboardUrl) {
      actions.push({
        '@type': 'OpenUri',
        name: 'View Dashboard',
        targets: [
          {
            os: 'default',
            uri: params.dashboardUrl
          }
        ]
      });
    }

    const message: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: 'FFCC00',
      summary: `Maintenance: ${params.title}`,
      sections,
      potentialAction: actions.length > 0 ? actions : undefined
    };

    return this.sendMessage(message);
  }

  /**
   * Send a performance report
   */
  async sendPerformanceReport(params: {
    period: string;
    metrics: {
      totalIncidents: number;
      resolvedIncidents: number;
      averageResolutionTime: string;
      uptime: string;
      costSavings?: string;
    };
    dashboardUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const sections: TeamsSection[] = [
      {
        activityTitle: `📊 AIOps Performance Report`,
        activitySubtitle: `Period: ${params.period}`,
        facts: [
          {
            name: 'Total Incidents',
            value: params.metrics.totalIncidents.toString()
          },
          {
            name: 'Resolved Incidents',
            value: params.metrics.resolvedIncidents.toString()
          },
          {
            name: 'Average Resolution Time',
            value: params.metrics.averageResolutionTime
          },
          {
            name: 'System Uptime',
            value: params.metrics.uptime
          }
        ],
        markdown: true
      }
    ];

    if (params.metrics.costSavings) {
      sections.push({
        text: `💰 **Cost Savings:** ${params.metrics.costSavings}`,
        markdown: true
      });
    }

    const actions: TeamsAction[] = [];

    if (params.dashboardUrl) {
      actions.push({
        '@type': 'OpenUri',
        name: 'View Full Report',
        targets: [
          {
            os: 'default',
            uri: params.dashboardUrl
          }
        ]
      });
    }

    const message: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: '00CC00',
      summary: `Performance Report - ${params.period}`,
      sections,
      potentialAction: actions.length > 0 ? actions : undefined
    };

    return this.sendMessage(message);
  }

  /**
   * Send a deployment notification
   */
  async sendDeploymentNotification(params: {
    application: string;
    version: string;
    environment: string;
    status: 'started' | 'completed' | 'failed';
    deployedBy: string;
    changes?: string[];
    dashboardUrl?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const statusColors = {
      started: '0066CC',
      completed: '00CC00',
      failed: 'FF0000'
    };

    const statusEmojis = {
      started: '🚀',
      completed: '✅',
      failed: '❌'
    };

    const sections: TeamsSection[] = [
      {
        activityTitle: `${statusEmojis[params.status]} Deployment ${params.status.toUpperCase()}`,
        activitySubtitle: `${params.application} v${params.version}`,
        facts: [
          {
            name: 'Application',
            value: params.application
          },
          {
            name: 'Version',
            value: params.version
          },
          {
            name: 'Environment',
            value: params.environment
          },
          {
            name: 'Deployed By',
            value: params.deployedBy
          },
          {
            name: 'Status',
            value: params.status.toUpperCase()
          },
          {
            name: 'Time',
            value: new Date().toLocaleString()
          }
        ],
        markdown: true
      }
    ];

    if (params.changes && params.changes.length > 0) {
      sections.push({
        text: `**Changes:**\n${params.changes.map(c => `- ${c}`).join('\n')}`,
        markdown: true
      });
    }

    const actions: TeamsAction[] = [];

    if (params.dashboardUrl) {
      actions.push({
        '@type': 'OpenUri',
        name: 'View Dashboard',
        targets: [
          {
            os: 'default',
            uri: params.dashboardUrl
          }
        ]
      });
    }

    const message: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: statusColors[params.status],
      summary: `Deployment ${params.status}: ${params.application} v${params.version}`,
      sections,
      potentialAction: actions.length > 0 ? actions : undefined
    };

    return this.sendMessage(message);
  }

  /**
   * Send a custom notification
   */
  async sendCustomNotification(params: {
    title: string;
    subtitle?: string;
    message: string;
    color?: string;
    facts?: Array<{ name: string; value: string }>;
    actions?: Array<{ name: string; url: string }>;
  }): Promise<{ success: boolean; error?: string }> {
    const sections: TeamsSection[] = [
      {
        activityTitle: params.title,
        activitySubtitle: params.subtitle || 'AIOps Platform',
        facts: params.facts,
        markdown: true
      }
    ];

    if (params.message) {
      sections.push({
        text: params.message,
        markdown: true
      });
    }

    const actions: TeamsAction[] = [];

    if (params.actions) {
      params.actions.forEach(action => {
        actions.push({
          '@type': 'OpenUri',
          name: action.name,
          targets: [
            {
              os: 'default',
              uri: action.url
            }
          ]
        });
      });
    }

    const message: TeamsMessage = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: params.color || '0066CC',
      summary: params.title,
      sections,
      potentialAction: actions.length > 0 ? actions : undefined
    };

    return this.sendMessage(message);
  }

  /**
   * Calculate duration between two timestamps
   */
  private calculateDuration(startTime: string, endTime: string): string {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const diffMs = end.getTime() - start.getTime();
      
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    } catch (error) {
      return 'Unknown';
    }
  }
}