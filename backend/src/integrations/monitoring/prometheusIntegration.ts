import axios, { AxiosInstance } from 'axios';
import {
  PrometheusConfig,
  PrometheusQuery,
  PrometheusRangeQuery,
  PrometheusQueryResult,
  PrometheusAlert,
  PrometheusRule,
  MonitoringMetric
} from './types';

export class PrometheusIntegration {
  private client: AxiosInstance;
  private config: PrometheusConfig;

  constructor(config: PrometheusConfig) {
    this.config = config;
    
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeout || 30000,
      auth: config.username && config.password ? {
        username: config.username,
        password: config.password
      } : undefined
    });
  }

  /**
   * Execute an instant query
   */
  async query(query: PrometheusQuery): Promise<PrometheusQueryResult> {
    try {
      const params = new URLSearchParams();
      params.append('query', query.query);
      
      if (query.time) {
        params.append('time', query.time);
      }
      
      if (query.timeout) {
        params.append('timeout', query.timeout);
      }

      const response = await this.client.get(`/api/v1/query?${params.toString()}`);
      return response.data;
    } catch (error) {
      throw new Error(`Prometheus query failed: ${error.message}`);
    }
  }

  /**
   * Execute a range query
   */
  async queryRange(query: PrometheusRangeQuery): Promise<PrometheusQueryResult> {
    try {
      const params = new URLSearchParams();
      params.append('query', query.query);
      params.append('start', query.start);
      params.append('end', query.end);
      params.append('step', query.step);
      
      if (query.timeout) {
        params.append('timeout', query.timeout);
      }

      const response = await this.client.get(`/api/v1/query_range?${params.toString()}`);
      return response.data;
    } catch (error) {
      throw new Error(`Prometheus range query failed: ${error.message}`);
    }
  }

  /**
   * Get current alerts
   */
  async getAlerts(): Promise<PrometheusAlert[]> {
    try {
      const response = await this.client.get('/api/v1/alerts');
      return response.data.data.alerts || [];
    } catch (error) {
      throw new Error(`Failed to get Prometheus alerts: ${error.message}`);
    }
  }

  /**
   * Get alert rules
   */
  async getRules(): Promise<PrometheusRule[]> {
    try {
      const response = await this.client.get('/api/v1/rules');
      const rules: PrometheusRule[] = [];
      
      if (response.data.data && response.data.data.groups) {
        for (const group of response.data.data.groups) {
          if (group.rules) {
            for (const rule of group.rules) {
              if (rule.type === 'alerting') {
                rules.push({
                  name: rule.name,
                  query: rule.query,
                  duration: rule.duration,
                  labels: rule.labels,
                  annotations: rule.annotations
                });
              }
            }
          }
        }
      }
      
      return rules;
    } catch (error) {
      throw new Error(`Failed to get Prometheus rules: ${error.message}`);
    }
  }

  /**
   * Get available metrics
   */
  async getMetrics(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/v1/label/__name__/values');
      return response.data.data || [];
    } catch (error) {
      throw new Error(`Failed to get Prometheus metrics: ${error.message}`);
    }
  }

  /**
   * Get metric metadata
   */
  async getMetricMetadata(metric?: string): Promise<Record<string, any>> {
    try {
      const params = metric ? `?metric=${metric}` : '';
      const response = await this.client.get(`/api/v1/metadata${params}`);
      return response.data.data || {};
    } catch (error) {
      throw new Error(`Failed to get metric metadata: ${error.message}`);
    }
  }

  /**
   * Get label values for a specific label
   */
  async getLabelValues(label: string): Promise<string[]> {
    try {
      const response = await this.client.get(`/api/v1/label/${label}/values`);
      return response.data.data || [];
    } catch (error) {
      throw new Error(`Failed to get label values: ${error.message}`);
    }
  }

  /**
   * Get series matching label selectors
   */
  async getSeries(match: string[], start?: string, end?: string): Promise<Array<Record<string, string>>> {
    try {
      const params = new URLSearchParams();
      match.forEach(m => params.append('match[]', m));
      
      if (start) params.append('start', start);
      if (end) params.append('end', end);

      const response = await this.client.get(`/api/v1/series?${params.toString()}`);
      return response.data.data || [];
    } catch (error) {
      throw new Error(`Failed to get series: ${error.message}`);
    }
  }

  /**
   * Get targets (scrape targets)
   */
  async getTargets(): Promise<any[]> {
    try {
      const response = await this.client.get('/api/v1/targets');
      return response.data.data.activeTargets || [];
    } catch (error) {
      throw new Error(`Failed to get targets: ${error.message}`);
    }
  }

  /**
   * Get Prometheus configuration
   */
  async getConfig(): Promise<any> {
    try {
      const response = await this.client.get('/api/v1/status/config');
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to get Prometheus config: ${error.message}`);
    }
  }

  /**
   * Get Prometheus build information
   */
  async getBuildInfo(): Promise<any> {
    try {
      const response = await this.client.get('/api/v1/status/buildinfo');
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to get build info: ${error.message}`);
    }
  }

  /**
   * Check Prometheus health
   */
  async checkHealth(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.client.get('/-/healthy');
      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        message: `Prometheus health check failed: ${error.message}` 
      };
    }
  }

  /**
   * Check if Prometheus is ready
   */
  async checkReady(): Promise<{ ready: boolean; message?: string }> {
    try {
      await this.client.get('/-/ready');
      return { ready: true };
    } catch (error) {
      return { 
        ready: false, 
        message: `Prometheus readiness check failed: ${error.message}` 
      };
    }
  }

  /**
   * Get common infrastructure metrics
   */
  async getInfrastructureMetrics(): Promise<{
    cpu: MonitoringMetric[];
    memory: MonitoringMetric[];
    disk: MonitoringMetric[];
    network: MonitoringMetric[];
  }> {
    const now = Math.floor(Date.now() / 1000);
    
    const [cpuResult, memoryResult, diskResult, networkResult] = await Promise.all([
      this.query({
        query: '100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
        time: now.toString()
      }),
      this.query({
        query: '(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100',
        time: now.toString()
      }),
      this.query({
        query: '100 - ((node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)',
        time: now.toString()
      }),
      this.query({
        query: 'irate(node_network_receive_bytes_total[5m]) + irate(node_network_transmit_bytes_total[5m])',
        time: now.toString()
      })
    ]);

    return {
      cpu: this.transformMetrics(cpuResult, 'cpu_usage_percent', 'CPU usage percentage'),
      memory: this.transformMetrics(memoryResult, 'memory_usage_percent', 'Memory usage percentage'),
      disk: this.transformMetrics(diskResult, 'disk_usage_percent', 'Disk usage percentage'),
      network: this.transformMetrics(networkResult, 'network_io_bytes_per_second', 'Network I/O bytes per second')
    };
  }

  /**
   * Get application metrics
   */
  async getApplicationMetrics(application: string): Promise<{
    requests: MonitoringMetric[];
    errors: MonitoringMetric[];
    latency: MonitoringMetric[];
  }> {
    const now = Math.floor(Date.now() / 1000);
    
    const [requestsResult, errorsResult, latencyResult] = await Promise.all([
      this.query({
        query: `sum(rate(http_requests_total{job="${application}"}[5m])) by (instance)`,
        time: now.toString()
      }),
      this.query({
        query: `sum(rate(http_requests_total{job="${application}",status=~"5.."}[5m])) by (instance)`,
        time: now.toString()
      }),
      this.query({
        query: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="${application}"}[5m])) by (le, instance))`,
        time: now.toString()
      })
    ]);

    return {
      requests: this.transformMetrics(requestsResult, 'http_requests_per_second', 'HTTP requests per second'),
      errors: this.transformMetrics(errorsResult, 'http_errors_per_second', 'HTTP errors per second'),
      latency: this.transformMetrics(latencyResult, 'http_latency_p95_seconds', '95th percentile latency in seconds')
    };
  }

  private transformMetrics(result: PrometheusQueryResult, name: string, help: string): MonitoringMetric[] {
    if (result.status !== 'success' || !result.data.result) {
      return [];
    }

    return result.data.result.map(metric => ({
      name,
      help,
      type: 'gauge' as const,
      labels: metric.metric,
      value: metric.value ? parseFloat(metric.value[1]) : 0,
      timestamp: metric.value ? metric.value[0] * 1000 : Date.now()
    }));
  }

  /**
   * Create a custom query for specific use cases
   */
  async customQuery(promql: string, timeRange?: { start: string; end: string; step: string }): Promise<MonitoringMetric[]> {
    try {
      const result = timeRange 
        ? await this.queryRange({ query: promql, ...timeRange })
        : await this.query({ query: promql });

      return this.transformMetrics(result, 'custom_metric', 'Custom metric query');
    } catch (error) {
      throw new Error(`Custom query failed: ${error.message}`);
    }
  }
}