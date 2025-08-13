// Prometheus Types
export interface PrometheusConfig {
  url: string;
  username?: string;
  password?: string;
  timeout?: number;
}

export interface PrometheusQuery {
  query: string;
  time?: string;
  timeout?: string;
  step?: string;
}

export interface PrometheusRangeQuery extends PrometheusQuery {
  start: string;
  end: string;
  step: string;
}

export interface PrometheusMetric {
  metric: Record<string, string>;
  value?: [number, string];
  values?: Array<[number, string]>;
}

export interface PrometheusQueryResult {
  status: 'success' | 'error';
  data: {
    resultType: 'matrix' | 'vector' | 'scalar' | 'string';
    result: PrometheusMetric[];
  };
  errorType?: string;
  error?: string;
}

export interface PrometheusAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'inactive' | 'pending' | 'firing';
  activeAt?: string;
  value: string;
}

export interface PrometheusRule {
  name: string;
  query: string;
  duration: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

// Grafana Types
export interface GrafanaConfig {
  url: string;
  apiKey: string;
  timeout?: number;
}

export interface GrafanaDashboard {
  id?: number;
  uid?: string;
  title: string;
  tags?: string[];
  timezone?: string;
  panels: GrafanaPanel[];
  time?: {
    from: string;
    to: string;
  };
  refresh?: string;
  schemaVersion?: number;
  version?: number;
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: string;
  targets: GrafanaTarget[];
  gridPos: {
    h: number;
    w: number;
    x: number;
    y: number;
  };
  options?: Record<string, any>;
  fieldConfig?: {
    defaults: Record<string, any>;
    overrides?: Array<Record<string, any>>;
  };
}

export interface GrafanaTarget {
  expr: string;
  refId: string;
  legendFormat?: string;
  interval?: string;
  format?: string;
}

export interface GrafanaDataSource {
  id?: number;
  uid?: string;
  name: string;
  type: string;
  url: string;
  access: 'proxy' | 'direct';
  basicAuth?: boolean;
  basicAuthUser?: string;
  basicAuthPassword?: string;
  jsonData?: Record<string, any>;
  secureJsonData?: Record<string, any>;
}

export interface GrafanaAlert {
  id: number;
  dashboardId: number;
  panelId: number;
  name: string;
  message: string;
  state: 'alerting' | 'ok' | 'no_data' | 'paused' | 'pending';
  newStateDate: string;
  evalDate: string;
  executionError?: string;
  url: string;
}

// PagerDuty Types
export interface PagerDutyConfig {
  apiKey: string;
  routingKey: string;
  baseUrl?: string;
}

export interface PagerDutyIncident {
  incident_key?: string;
  event_type: 'trigger' | 'acknowledge' | 'resolve';
  description: string;
  details?: Record<string, any>;
  contexts?: Array<{
    type: 'link' | 'image';
    href?: string;
    src?: string;
    text?: string;
    alt?: string;
  }>;
  client?: string;
  client_url?: string;
  severity?: 'critical' | 'error' | 'warning' | 'info';
  component?: string;
  group?: string;
  class?: string;
}

export interface PagerDutyService {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'warning' | 'critical' | 'maintenance' | 'disabled';
  escalation_policy: {
    id: string;
    name: string;
  };
  integrations?: Array<{
    id: string;
    name: string;
    service: { id: string };
    created_at: string;
    vendor: { id: string; name: string };
  }>;
}

export interface PagerDutyUser {
  id: string;
  name: string;
  email: string;
  time_zone: string;
  color: string;
  role: string;
  avatar_url: string;
  description?: string;
  contact_methods?: Array<{
    id: string;
    type: 'email_contact_method' | 'phone_contact_method' | 'sms_contact_method';
    summary: string;
    address: string;
  }>;
}

// Slack Types
export interface SlackConfig {
  botToken: string;
  signingSecret?: string;
  appToken?: string;
}

export interface SlackMessage {
  channel: string;
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  thread_ts?: string;
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

export interface SlackBlock {
  type: 'section' | 'divider' | 'image' | 'actions' | 'context' | 'header';
  text?: {
    type: 'plain_text' | 'mrkdwn';
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: 'plain_text' | 'mrkdwn';
    text: string;
  }>;
  accessory?: {
    type: 'button' | 'image' | 'overflow' | 'datepicker' | 'timepicker';
    text?: {
      type: 'plain_text';
      text: string;
    };
    value?: string;
    url?: string;
    action_id?: string;
  };
  elements?: Array<{
    type: 'button' | 'image' | 'overflow';
    text?: {
      type: 'plain_text';
      text: string;
    };
    value?: string;
    url?: string;
    action_id?: string;
  }>;
}

export interface SlackAttachment {
  color?: 'good' | 'warning' | 'danger' | string;
  pretext?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  ts?: number;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  created: number;
  is_archived: boolean;
  is_general: boolean;
  unlinked: number;
  name_normalized: string;
  is_shared: boolean;
  is_ext_shared: boolean;
  is_org_shared: boolean;
  pending_shared: string[];
  is_pending_ext_shared: boolean;
  is_member: boolean;
  is_open: boolean;
  topic: {
    value: string;
    creator: string;
    last_set: number;
  };
  purpose: {
    value: string;
    creator: string;
    last_set: number;
  };
  previous_names: string[];
  num_members?: number;
}

// Teams Types
export interface TeamsConfig {
  webhookUrl: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface TeamsMessage {
  '@type': 'MessageCard';
  '@context': 'http://schema.org/extensions';
  themeColor?: string;
  summary: string;
  sections?: TeamsSection[];
  potentialAction?: TeamsAction[];
}

export interface TeamsSection {
  activityTitle?: string;
  activitySubtitle?: string;
  activityImage?: string;
  facts?: Array<{
    name: string;
    value: string;
  }>;
  markdown?: boolean;
  text?: string;
}

export interface TeamsAction {
  '@type': 'OpenUri' | 'HttpPOST' | 'ActionCard';
  name: string;
  targets?: Array<{
    os: 'default' | 'iOS' | 'android' | 'windows';
    uri: string;
  }>;
  body?: string;
  method?: 'POST' | 'GET';
  headers?: Array<{
    name: string;
    value: string;
  }>;
}

// Common Monitoring Types
export interface MonitoringAlert {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'firing' | 'resolved' | 'acknowledged';
  source: 'prometheus' | 'grafana' | 'custom';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt?: string;
  generatorURL?: string;
  fingerprint?: string;
}

export interface MonitoringMetric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels: Record<string, string>;
  value: number;
  timestamp: number;
}

export interface MonitoringDashboard {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  panels: Array<{
    id: string;
    title: string;
    type: 'graph' | 'singlestat' | 'table' | 'heatmap' | 'logs';
    queries: string[];
    timeRange?: {
      from: string;
      to: string;
    };
  }>;
  variables?: Array<{
    name: string;
    type: 'query' | 'custom' | 'constant';
    query?: string;
    options?: string[];
    current?: string;
  }>;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'slack' | 'teams' | 'pagerduty' | 'email' | 'webhook';
  settings: Record<string, any>;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  query: string;
  condition: {
    operator: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte';
    threshold: number;
    timeRange: string;
  };
  frequency: string;
  notifications: string[]; // Channel IDs
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  enabled: boolean;
}