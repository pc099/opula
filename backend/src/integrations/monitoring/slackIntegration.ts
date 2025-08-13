import axios, { AxiosInstance } from 'axios';
import {
  SlackConfig,
  SlackMessage,
  SlackChannel,
  SlackBlock,
  SlackAttachment
} from './types';

export class SlackIntegration {
  private client: AxiosInstance;
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: 'https://slack.com/api',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${config.botToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(message: SlackMessage): Promise<{ ok: boolean; ts?: string; error?: string }> {
    try {
      const response = await this.client.post('/chat.postMessage', message);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to send Slack message: ${error.message}`);
    }
  }

  /**
   * Update an existing message
   */
  async updateMessage(params: {
    channel: string;
    ts: string;
    text?: string;
    blocks?: SlackBlock[];
    attachments?: SlackAttachment[];
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post('/chat.update', params);
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to update Slack message: ${error.message}`);
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(channel: string, ts: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post('/chat.delete', { channel, ts });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to delete Slack message: ${error.message}`);
    }
  }

  /**
   * Get channel information
   */
  async getChannel(channelId: string): Promise<SlackChannel> {
    try {
      const response = await this.client.get(`/conversations.info?channel=${channelId}`);
      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
      return response.data.channel;
    } catch (error: any) {
      throw new Error(`Failed to get Slack channel info: ${error.message}`);
    }
  }

  /**
   * List channels
   */
  async listChannels(params?: {
    exclude_archived?: boolean;
    types?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ channels: SlackChannel[]; response_metadata?: { next_cursor: string } }> {
    try {
      const queryParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) {
            queryParams.append(key, value.toString());
          }
        });
      }

      const response = await this.client.get(`/conversations.list?${queryParams.toString()}`);
      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
      return {
        channels: response.data.channels || [],
        response_metadata: response.data.response_metadata
      };
    } catch (error: any) {
      throw new Error(`Failed to list Slack channels: ${error.message}`);
    }
  }

  /**
   * Join a channel
   */
  async joinChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await this.client.post('/conversations.join', { channel: channelId });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to join Slack channel: ${error.message}`);
    }
  }

  /**
   * Create a channel
   */
  async createChannel(name: string, isPrivate: boolean = false): Promise<{ ok: boolean; channel?: SlackChannel; error?: string }> {
    try {
      const response = await this.client.post('/conversations.create', {
        name,
        is_private: isPrivate
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to create Slack channel: ${error.message}`);
    }
  }

  /**
   * Get user information
   */
  async getUser(userId: string): Promise<any> {
    try {
      const response = await this.client.get(`/users.info?user=${userId}`);
      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
      return response.data.user;
    } catch (error: any) {
      throw new Error(`Failed to get Slack user info: ${error.message}`);
    }
  }

  /**
   * List users
   */
  async listUsers(): Promise<any[]> {
    try {
      const response = await this.client.get('/users.list');
      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
      return response.data.members || [];
    } catch (error: any) {
      throw new Error(`Failed to list Slack users: ${error.message}`);
    }
  }

  /**
   * Upload a file
   */
  async uploadFile(params: {
    channels?: string;
    content?: string;
    file?: Buffer;
    filename?: string;
    filetype?: string;
    initial_comment?: string;
    title?: string;
  }): Promise<{ ok: boolean; file?: any; error?: string }> {
    try {
      const formData = new FormData();
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'file' && Buffer.isBuffer(value)) {
            formData.append(key, new Blob([value]), params.filename || 'file');
          } else {
            formData.append(key, value.toString());
          }
        }
      });

      const response = await this.client.post('/files.upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to upload file to Slack: ${error.message}`);
    }
  }

  /**
   * Test the Slack integration
   */
  async testIntegration(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.get('/auth.test');
      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
      
      return {
        success: true,
        message: `Slack integration test successful. Connected as: ${response.data.user}`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Slack integration test failed: ${error.message}`
      };
    }
  }

  /**
   * Send an AIOps alert notification
   */
  async sendAIOpsAlert(params: {
    channel: string;
    title: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    source: string;
    affectedResources?: string[];
    dashboardUrl?: string;
    incidentId?: string;
  }): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const severityColors = {
      critical: '#FF0000',
      high: '#FF6600',
      medium: '#FFCC00',
      low: '#00CC00',
      info: '#0066CC'
    };

    const severityEmojis = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: 'ℹ️',
      info: '📊'
    };

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmojis[params.severity]} ${params.title}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Severity:* ${params.severity.toUpperCase()}`
          },
          {
            type: 'mrkdwn',
            text: `*Source:* ${params.source}`
          },
          {
            type: 'mrkdwn',
            text: `*Time:* ${new Date().toLocaleString()}`
          },
          {
            type: 'mrkdwn',
            text: `*Incident ID:* ${params.incidentId || 'N/A'}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description:*\n${params.description}`
        }
      }
    ];

    if (params.affectedResources && params.affectedResources.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Affected Resources:*\n${params.affectedResources.map(r => `• ${r}`).join('\n')}`
        }
      });
    }

    const actions: any[] = [];
    
    if (params.dashboardUrl) {
      actions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View Dashboard',
          emoji: true
        },
        url: params.dashboardUrl,
        action_id: 'view_dashboard'
      });
    }

    if (params.incidentId) {
      actions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Acknowledge',
          emoji: true
        },
        value: params.incidentId,
        action_id: 'acknowledge_incident'
      });
    }

    if (actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actions
      });
    }

    blocks.push({
      type: 'divider'
    });

    const message: SlackMessage = {
      channel: params.channel,
      blocks,
      attachments: [
        {
          color: severityColors[params.severity],
          footer: 'AIOps Platform',
          footer_icon: 'https://example.com/aiops-icon.png',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    return this.sendMessage(message);
  }

  /**
   * Send a resolution notification
   */
  async sendResolutionNotification(params: {
    channel: string;
    originalMessageTs: string;
    incidentId: string;
    title: string;
    resolutionTime: string;
    resolvedBy: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `✅ Incident Resolved: ${params.title}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Incident ID:* ${params.incidentId}`
          },
          {
            type: 'mrkdwn',
            text: `*Resolved By:* ${params.resolvedBy}`
          },
          {
            type: 'mrkdwn',
            text: `*Resolution Time:* ${params.resolutionTime}`
          },
          {
            type: 'mrkdwn',
            text: `*Status:* RESOLVED`
          }
        ]
      }
    ];

    return this.updateMessage({
      channel: params.channel,
      ts: params.originalMessageTs,
      blocks,
      attachments: [
        {
          color: 'good',
          footer: 'AIOps Platform',
          footer_icon: 'https://example.com/aiops-icon.png',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    });
  }

  /**
   * Send a maintenance notification
   */
  async sendMaintenanceNotification(params: {
    channel: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    affectedServices: string[];
  }): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🔧 Scheduled Maintenance: ${params.title}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Start Time:* ${params.startTime}`
          },
          {
            type: 'mrkdwn',
            text: `*End Time:* ${params.endTime}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description:*\n${params.description}`
        }
      }
    ];

    if (params.affectedServices.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Affected Services:*\n${params.affectedServices.map(s => `• ${s}`).join('\n')}`
        }
      });
    }

    const message: SlackMessage = {
      channel: params.channel,
      blocks,
      attachments: [
        {
          color: '#FFCC00',
          footer: 'AIOps Platform',
          footer_icon: 'https://example.com/aiops-icon.png',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    return this.sendMessage(message);
  }

  /**
   * Send a performance report
   */
  async sendPerformanceReport(params: {
    channel: string;
    period: string;
    metrics: {
      totalIncidents: number;
      resolvedIncidents: number;
      averageResolutionTime: string;
      uptime: string;
      costSavings?: string;
    };
    dashboardUrl?: string;
  }): Promise<{ ok: boolean; ts?: string; error?: string }> {
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📊 AIOps Performance Report - ${params.period}`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Incidents:* ${params.metrics.totalIncidents}`
          },
          {
            type: 'mrkdwn',
            text: `*Resolved:* ${params.metrics.resolvedIncidents}`
          },
          {
            type: 'mrkdwn',
            text: `*Avg Resolution Time:* ${params.metrics.averageResolutionTime}`
          },
          {
            type: 'mrkdwn',
            text: `*System Uptime:* ${params.metrics.uptime}`
          }
        ]
      }
    ];

    if (params.metrics.costSavings) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💰 *Cost Savings:* ${params.metrics.costSavings}`
        }
      });
    }

    if (params.dashboardUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Full Report',
              // emoji: true // Removed as not supported by type
            },
            url: params.dashboardUrl,
            action_id: 'view_report'
          }
        ]
      });
    }

    const message: SlackMessage = {
      channel: params.channel,
      blocks,
      attachments: [
        {
          color: 'good',
          footer: 'AIOps Platform',
          footer_icon: 'https://example.com/aiops-icon.png',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    return this.sendMessage(message);
  }
}