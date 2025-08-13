# Monitoring System Integrations

This module provides comprehensive monitoring system integrations for the AIOps Platform, including metrics collection, alerting, and notification capabilities.

## Supported Integrations

### 1. Prometheus Integration
- **Purpose**: Metrics collection and querying
- **Features**:
  - Instant and range queries
  - Alert management
  - Metrics discovery
  - Health checks
  - Infrastructure and application metrics

### 2. Grafana Integration
- **Purpose**: Dashboard creation and visualization
- **Features**:
  - Dashboard management (CRUD operations)
  - Data source configuration
  - Alert management
  - User and organization management
  - Custom AIOps monitoring dashboards

### 3. PagerDuty Integration
- **Purpose**: Incident management and escalation
- **Features**:
  - Incident creation, acknowledgment, and resolution
  - Service and user management
  - Maintenance window creation
  - On-call scheduling
  - Analytics and reporting

### 4. Slack Integration
- **Purpose**: Team notifications and collaboration
- **Features**:
  - Message sending with rich formatting
  - Channel management
  - File uploads
  - Interactive notifications
  - Alert and resolution notifications

### 5. Microsoft Teams Integration
- **Purpose**: Enterprise team notifications
- **Features**:
  - Webhook-based messaging
  - Rich card formatting
  - Action buttons
  - Maintenance and deployment notifications

## Configuration

### Environment Variables

```bash
# Prometheus
PROMETHEUS_URL=http://localhost:9090
PROMETHEUS_USERNAME=admin
PROMETHEUS_PASSWORD=password

# Grafana
GRAFANA_URL=http://localhost:3000
GRAFANA_API_KEY=your-api-key

# PagerDuty
PAGERDUTY_API_KEY=your-api-key
PAGERDUTY_ROUTING_KEY=your-routing-key

# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# Microsoft Teams
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/your-webhook-url
```

### Service Configuration

```typescript
import { MonitoringService } from './integrations/monitoring';

const monitoringService = new MonitoringService({
  prometheus: {
    url: process.env.PROMETHEUS_URL,
    username: process.env.PROMETHEUS_USERNAME,
    password: process.env.PROMETHEUS_PASSWORD
  },
  grafana: {
    url: process.env.GRAFANA_URL,
    apiKey: process.env.GRAFANA_API_KEY
  },
  pagerduty: {
    apiKey: process.env.PAGERDUTY_API_KEY,
    routingKey: process.env.PAGERDUTY_ROUTING_KEY
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
  },
  teams: {
    webhookUrl: process.env.TEAMS_WEBHOOK_URL
  }
});
```

## Usage Examples

### 1. Getting System Metrics

```typescript
// Get infrastructure metrics
const metrics = await monitoringService.getSystemMetrics();
console.log('CPU Usage:', metrics.infrastructure.cpu);
console.log('Memory Usage:', metrics.infrastructure.memory);
```

### 2. Sending Alert Notifications

```typescript
// Send alert to multiple channels
const alert = {
  title: 'High CPU Usage Detected',
  description: 'CPU usage has exceeded 90% for the last 5 minutes',
  severity: 'high' as const,
  source: 'prometheus',
  affectedResources: ['web-server-1', 'web-server-2'],
  incidentId: 'INC-001'
};

const channels = {
  slack: { channel: '#alerts' },
  teams: true,
  pagerduty: true
};

const results = await monitoringService.sendAlertNotification(alert, channels);
```

### 3. Creating Monitoring Dashboard

```typescript
// Create AIOps monitoring dashboard in Grafana
const result = await monitoringService.createMonitoringDashboard();
if (result.success) {
  console.log('Dashboard created:', result.dashboardUrl);
}
```

### 4. Custom Metric Queries

```typescript
// Query custom metrics from Prometheus
const metrics = await monitoringService.queryMetrics(
  'rate(http_requests_total[5m])',
  {
    start: '2024-01-01T00:00:00Z',
    end: '2024-01-01T23:59:59Z',
    step: '1h'
  }
);
```

## API Endpoints

### Configuration
- `POST /api/monitoring/config` - Configure monitoring integrations
- `GET /api/monitoring/status` - Get integration status
- `POST /api/monitoring/test` - Test all integrations

### Metrics
- `GET /api/monitoring/metrics` - Get system metrics
- `POST /api/monitoring/metrics/query` - Query custom metrics
- `GET /api/monitoring/metrics/available` - Get available metrics

### Alerts
- `GET /api/monitoring/alerts` - Get current alerts
- `POST /api/monitoring/alerts/notify` - Send alert notification
- `POST /api/monitoring/alerts/resolve` - Send resolution notification

### Maintenance
- `POST /api/monitoring/maintenance/notify` - Send maintenance notification

### Dashboards
- `POST /api/monitoring/dashboard/create` - Create monitoring dashboard

## Alert Severity Levels

- **critical**: System is down or severely impacted
- **high**: Major functionality is impacted
- **medium**: Minor functionality is impacted
- **low**: Informational or minor issues
- **info**: General information or status updates

## Notification Channels

### Slack Notifications
- Rich formatting with blocks and attachments
- Interactive buttons for acknowledgment
- Thread support for updates
- File attachments for logs and reports

### Teams Notifications
- MessageCard format with rich content
- Action buttons for external links
- Fact tables for structured data
- Color coding based on severity

### PagerDuty Notifications
- Automatic incident creation and escalation
- Integration with on-call schedules
- Maintenance window management
- Analytics and reporting

## Error Handling

All integrations include comprehensive error handling:

- Connection timeouts and retries
- Authentication failures
- Rate limiting
- Service unavailability
- Invalid configurations

## Testing

Run the test suite:

```bash
npm test -- --testPathPattern=monitoring
```

## Security Considerations

- API keys and tokens are stored securely
- All communications use HTTPS
- Webhook URLs are validated
- Rate limiting is implemented
- Audit logging for all operations

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check network connectivity
   - Verify service URLs
   - Check firewall rules

2. **Authentication Failures**
   - Verify API keys and tokens
   - Check token permissions
   - Ensure tokens haven't expired

3. **Rate Limiting**
   - Implement exponential backoff
   - Monitor API usage
   - Consider caching strategies

4. **Webhook Failures**
   - Verify webhook URLs
   - Check webhook permissions
   - Monitor webhook logs

### Debug Mode

Enable debug logging:

```bash
DEBUG=monitoring:* npm start
```

## Contributing

When adding new monitoring integrations:

1. Create integration class in separate file
2. Implement standard interface methods
3. Add comprehensive error handling
4. Include unit tests
5. Update documentation
6. Add configuration options