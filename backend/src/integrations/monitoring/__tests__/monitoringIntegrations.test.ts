import { PrometheusIntegration } from '../prometheusIntegration';
import { GrafanaIntegration } from '../grafanaIntegration';
import { PagerDutyIntegration } from '../pagerDutyIntegration';
import { SlackIntegration } from '../slackIntegration';
import { TeamsIntegration } from '../teamsIntegration';
import { MonitoringService } from '../monitoringService';

// Mock axios to avoid actual HTTP calls in tests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }))
}));

describe('Monitoring Integrations', () => {
  describe('PrometheusIntegration', () => {
    it('should create instance with config', () => {
      const config = {
        url: 'http://localhost:9090',
        username: 'admin',
        password: 'password'
      };
      
      const prometheus = new PrometheusIntegration(config);
      expect(prometheus).toBeInstanceOf(PrometheusIntegration);
    });

    it('should handle query method', async () => {
      const config = { url: 'http://localhost:9090' };
      const prometheus = new PrometheusIntegration(config);
      
      // Mock the axios client
      const mockClient = prometheus['client'];
      mockClient.get = jest.fn().mockResolvedValue({
        data: {
          status: 'success',
          data: {
            resultType: 'vector',
            result: []
          }
        }
      });

      const result = await prometheus.query({ query: 'up' });
      expect(result.status).toBe('success');
      expect(mockClient.get).toHaveBeenCalled();
    });
  });

  describe('GrafanaIntegration', () => {
    it('should create instance with config', () => {
      const config = {
        url: 'http://localhost:3000',
        apiKey: 'test-api-key'
      };
      
      const grafana = new GrafanaIntegration(config);
      expect(grafana).toBeInstanceOf(GrafanaIntegration);
    });
  });

  describe('PagerDutyIntegration', () => {
    it('should create instance with config', () => {
      const config = {
        apiKey: 'test-api-key',
        routingKey: 'test-routing-key'
      };
      
      const pagerduty = new PagerDutyIntegration(config);
      expect(pagerduty).toBeInstanceOf(PagerDutyIntegration);
    });

    it('should handle incident creation', async () => {
      const config = {
        apiKey: 'test-api-key',
        routingKey: 'test-routing-key'
      };
      
      const pagerduty = new PagerDutyIntegration(config);
      
      // Mock the events client
      const mockEventsClient = pagerduty['eventsClient'];
      mockEventsClient.post = jest.fn().mockResolvedValue({
        data: {
          status: 'success',
          message: 'Event processed',
          dedup_key: 'test-key'
        }
      });

      const result = await pagerduty.triggerIncident({
        event_type: 'trigger',
        description: 'Test incident'
      });

      expect(result.status).toBe('success');
      expect(mockEventsClient.post).toHaveBeenCalled();
    });
  });

  describe('SlackIntegration', () => {
    it('should create instance with config', () => {
      const config = {
        botToken: 'xoxb-test-token'
      };
      
      const slack = new SlackIntegration(config);
      expect(slack).toBeInstanceOf(SlackIntegration);
    });

    it('should handle message sending', async () => {
      const config = {
        botToken: 'xoxb-test-token'
      };
      
      const slack = new SlackIntegration(config);
      
      // Mock the client
      const mockClient = slack['client'];
      mockClient.post = jest.fn().mockResolvedValue({
        data: {
          ok: true,
          ts: '1234567890.123456'
        }
      });

      const result = await slack.sendMessage({
        channel: '#test',
        text: 'Test message'
      });

      expect(result.ok).toBe(true);
      expect(mockClient.post).toHaveBeenCalled();
    });
  });

  describe('TeamsIntegration', () => {
    it('should create instance with config', () => {
      const config = {
        webhookUrl: 'https://outlook.office.com/webhook/test'
      };
      
      const teams = new TeamsIntegration(config);
      expect(teams).toBeInstanceOf(TeamsIntegration);
    });

    it('should handle message sending', async () => {
      const config = {
        webhookUrl: 'https://outlook.office.com/webhook/test'
      };
      
      const teams = new TeamsIntegration(config);
      
      // Mock the client
      const mockClient = teams['client'];
      mockClient.post = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK'
      });

      const result = await teams.sendMessage({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        summary: 'Test message',
        sections: []
      });

      expect(result.success).toBe(true);
      expect(mockClient.post).toHaveBeenCalled();
    });
  });

  describe('MonitoringService', () => {
    it('should create instance with config', () => {
      const config = {
        prometheus: {
          url: 'http://localhost:9090'
        },
        grafana: {
          url: 'http://localhost:3000',
          apiKey: 'test-key'
        }
      };
      
      const service = new MonitoringService(config);
      expect(service).toBeInstanceOf(MonitoringService);
    });

    it('should return integration status', () => {
      const config = {
        prometheus: {
          url: 'http://localhost:9090'
        },
        slack: {
          botToken: 'xoxb-test-token'
        }
      };
      
      const service = new MonitoringService(config);
      const status = service.getIntegrationStatus();
      
      expect(status.prometheus).toBe(true);
      expect(status.slack).toBe(true);
      expect(status.grafana).toBe(false);
      expect(status.pagerduty).toBe(false);
      expect(status.teams).toBe(false);
    });
  });
});