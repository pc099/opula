import { Client } from '@elastic/elasticsearch';
import { logger } from '../middleware/requestLogger';
import { AppError } from '../middleware/errorHandler';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceType: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  correlationId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  outcome: 'success' | 'failure' | 'partial';
}

export interface SearchQuery {
  query?: string;
  filters?: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    action?: string;
    resource?: string;
    severity?: string;
    outcome?: string;
  };
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

class ElasticsearchService {
  private client: Client;
  private auditIndex: string = 'aiops-audit-logs';
  private logIndex: string = 'aiops-application-logs';

  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_AUTH ? {
        username: process.env.ELASTICSEARCH_USERNAME || 'elastic',
        password: process.env.ELASTICSEARCH_PASSWORD || 'changeme'
      } : undefined,
      requestTimeout: 30000,
      pingTimeout: 3000,
      maxRetries: 3
    });

    this.initializeIndices();
  }

  // Initialize Elasticsearch indices with proper mappings
  private async initializeIndices(): Promise<void> {
    try {
      // Create audit logs index
      const auditIndexExists = await this.client.indices.exists({ index: this.auditIndex });
      if (!auditIndexExists) {
        await this.client.indices.create({
          index: this.auditIndex,
          body: {
            mappings: {
              properties: {
                timestamp: { type: 'date' },
                userId: { type: 'keyword' },
                userEmail: { type: 'keyword' },
                action: { type: 'keyword' },
                resource: { type: 'keyword' },
                resourceType: { type: 'keyword' },
                details: { type: 'object', enabled: true },
                ipAddress: { type: 'ip' },
                userAgent: { type: 'text' },
                correlationId: { type: 'keyword' },
                severity: { type: 'keyword' },
                outcome: { type: 'keyword' }
              }
            },
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              'index.lifecycle.name': 'aiops-audit-policy',
              'index.lifecycle.rollover_alias': 'aiops-audit-logs'
            }
          }
        });
        logger.info('Audit logs index created successfully');
      }

      // Create application logs index
      const logIndexExists = await this.client.indices.exists({ index: this.logIndex });
      if (!logIndexExists) {
        await this.client.indices.create({
          index: this.logIndex,
          body: {
            mappings: {
              properties: {
                timestamp: { type: 'date' },
                level: { type: 'keyword' },
                message: { type: 'text' },
                service: { type: 'keyword' },
                correlationId: { type: 'keyword' },
                error: { type: 'text' },
                stack: { type: 'text' },
                metadata: { type: 'object', enabled: true }
              }
            },
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0
            }
          }
        });
        logger.info('Application logs index created successfully');
      }
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch indices', { 
        error: (error as Error).message 
      });
      // Don't throw error to prevent service startup failure
    }
  }

  // Index an audit log entry
  async indexAuditLog(auditEntry: AuditLogEntry): Promise<void> {
    try {
      await this.client.index({
        index: this.auditIndex,
        id: auditEntry.id,
        body: {
          ...auditEntry,
          '@timestamp': auditEntry.timestamp.toISOString()
        }
      });

      logger.debug('Audit log indexed successfully', { 
        auditId: auditEntry.id,
        action: auditEntry.action 
      });
    } catch (error) {
      logger.error('Failed to index audit log', { 
        auditId: auditEntry.id,
        error: (error as Error).message 
      });
      throw new AppError('Failed to store audit log', 500);
    }
  }

  // Search audit logs
  async searchAuditLogs(searchQuery: SearchQuery): Promise<{
    logs: AuditLogEntry[];
    totalCount: number;
    searchTime: string;
  }> {
    try {
      const { query, filters = {}, limit = 50, offset = 0, sortBy = 'timestamp', sortOrder = 'desc' } = searchQuery;

      // Build Elasticsearch query
      const esQuery: any = {
        bool: {
          must: [],
          filter: []
        }
      };

      // Add text search if provided
      if (query) {
        esQuery.bool.must.push({
          multi_match: {
            query,
            fields: ['action', 'resource', 'userEmail', 'details.*'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        });
      }

      // Add filters
      if (filters.startDate || filters.endDate) {
        const dateRange: any = {};
        if (filters.startDate) dateRange.gte = filters.startDate;
        if (filters.endDate) dateRange.lte = filters.endDate;
        
        esQuery.bool.filter.push({
          range: { timestamp: dateRange }
        });
      }

      if (filters.userId) {
        esQuery.bool.filter.push({ term: { userId: filters.userId } });
      }

      if (filters.action) {
        esQuery.bool.filter.push({ wildcard: { action: `*${filters.action}*` } });
      }

      if (filters.resource) {
        esQuery.bool.filter.push({ wildcard: { resource: `*${filters.resource}*` } });
      }

      if (filters.severity) {
        esQuery.bool.filter.push({ term: { severity: filters.severity } });
      }

      if (filters.outcome) {
        esQuery.bool.filter.push({ term: { outcome: filters.outcome } });
      }

      // Execute search
      const startTime = Date.now();
      const response = await this.client.search({
        index: this.auditIndex,
        body: {
          query: esQuery,
          sort: [{ [sortBy]: { order: sortOrder } }],
          from: offset,
          size: limit,
          highlight: {
            fields: {
              action: {},
              resource: {},
              'details.*': {}
            }
          }
        }
      });

      const searchTime = `${Date.now() - startTime}ms`;
      const logs = response.hits.hits.map((hit: any) => ({
        ...hit._source,
        id: hit._id,
        highlights: hit.highlight
      }));

      logger.info('Audit log search completed', {
        query,
        totalHits: (response.hits.total as any)?.value || response.hits.hits.length,
        searchTime
      });

      return {
        logs,
        totalCount: (response.hits.total as any)?.value || response.hits.hits.length,
        searchTime
      };
    } catch (error) {
      logger.error('Audit log search failed', { 
        query: searchQuery,
        error: (error as Error).message 
      });
      throw new AppError('Failed to search audit logs', 500);
    }
  }

  // Index application log
  async indexApplicationLog(logEntry: {
    level: string;
    message: string;
    service: string;
    correlationId?: string;
    error?: string;
    stack?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.client.index({
        index: this.logIndex,
        body: {
          ...logEntry,
          timestamp: new Date().toISOString(),
          '@timestamp': new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to index application log', { 
        error: (error as Error).message 
      });
      // Don't throw error to prevent logging loops
    }
  }

  // Get audit statistics
  async getAuditStatistics(timeRange: string = '24h'): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    actionsByUser: Record<string, number>;
    actionsBySeverity: Record<string, number>;
    successRate: number;
    failedActions: number;
    topResources: Array<{ resource: string; count: number }>;
  }> {
    try {
      const timeRangeMap: Record<string, string> = {
        '1h': 'now-1h',
        '24h': 'now-24h',
        '7d': 'now-7d',
        '30d': 'now-30d'
      };

      const fromTime = timeRangeMap[timeRange] || 'now-24h';

      const response = await this.client.search({
        index: this.auditIndex,
        body: {
          query: {
            range: {
              timestamp: {
                gte: fromTime
              }
            }
          },
          size: 0,
          aggs: {
            total_actions: {
              value_count: { field: 'action' }
            },
            actions_by_type: {
              terms: { field: 'action', size: 20 }
            },
            actions_by_user: {
              terms: { field: 'userEmail', size: 10 }
            },
            actions_by_severity: {
              terms: { field: 'severity' }
            },
            actions_by_outcome: {
              terms: { field: 'outcome' }
            },
            top_resources: {
              terms: { field: 'resource', size: 10 }
            }
          }
        }
      });

      const aggs = response.aggregations as any;
      if (!aggs) {
        throw new Error('No aggregations returned from Elasticsearch');
      }

      const totalActions = aggs.total_actions?.value || 0;
      const outcomeStats = (aggs.actions_by_outcome?.buckets || []).reduce((acc: any, bucket: any) => {
        acc[bucket.key] = bucket.doc_count;
        return acc;
      }, {});

      const successRate = totalActions > 0 ? 
        ((outcomeStats.success || 0) / totalActions * 100) : 0;

      return {
        totalActions,
        actionsByType: (aggs.actions_by_type?.buckets || []).reduce((acc: any, bucket: any) => {
          acc[bucket.key] = bucket.doc_count;
          return acc;
        }, {}),
        actionsByUser: (aggs.actions_by_user?.buckets || []).reduce((acc: any, bucket: any) => {
          acc[bucket.key] = bucket.doc_count;
          return acc;
        }, {}),
        actionsBySeverity: (aggs.actions_by_severity?.buckets || []).reduce((acc: any, bucket: any) => {
          acc[bucket.key] = bucket.doc_count;
          return acc;
        }, {}),
        successRate: Math.round(successRate * 10) / 10,
        failedActions: outcomeStats.failure || 0,
        topResources: (aggs.top_resources?.buckets || []).map((bucket: any) => ({
          resource: bucket.key,
          count: bucket.doc_count
        }))
      };
    } catch (error) {
      logger.error('Failed to get audit statistics', { 
        error: (error as Error).message 
      });
      throw new AppError('Failed to retrieve audit statistics', 500);
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: string; responseTime: string; lastChecked: string }> {
    const start = Date.now();
    try {
      await this.client.ping();
      const responseTime = Date.now() - start;
      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: 'N/A',
        lastChecked: new Date().toISOString()
      };
    }
  }

  // Close connection
  async close(): Promise<void> {
    await this.client.close();
    logger.info('Elasticsearch connection closed');
  }
}

// Export singleton instance
export const elasticsearchService = new ElasticsearchService();
export default ElasticsearchService;