import * as Redis from 'redis';
import { EventEmitter } from 'events';
import { SystemEvent, EventType } from '../types';
import { logger } from '../middleware/requestLogger';

export interface EventBusConfig {
  redisUrl?: string;
  retryAttempts?: number;
  retryDelay?: number;
  persistenceEnabled?: boolean;
}

export interface EventSubscription {
  topic: string;
  callback: (event: SystemEvent) => Promise<void>;
  filter?: (event: SystemEvent) => boolean;
}

export class EventBus extends EventEmitter {
  private redisClient: Redis.RedisClientType;
  private subscriberClient: Redis.RedisClientType;
  private subscriptions: Map<string, EventSubscription[]> = new Map();
  private config: EventBusConfig;
  private isConnected: boolean = false;

  constructor(config: EventBusConfig = {}) {
    super();
    this.config = {
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      persistenceEnabled: config.persistenceEnabled || true,
      ...config
    };

    this.redisClient = Redis.createClient({ url: this.config.redisUrl });
    this.subscriberClient = Redis.createClient({ url: this.config.redisUrl });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
      this.emit('error', err);
    });

    this.subscriberClient.on('error', (err) => {
      logger.error('Redis subscriber error:', err);
      this.emit('error', err);
    });

    this.redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.subscriberClient.on('connect', () => {
      logger.info('Redis subscriber connected');
    });
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.redisClient.connect(),
        this.subscriberClient.connect()
      ]);
      
      this.isConnected = true;
      logger.info('Event Bus connected to Redis');
      this.emit('connected');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        this.redisClient.quit(),
        this.subscriberClient.quit()
      ]);
      
      this.isConnected = false;
      logger.info('Event Bus disconnected from Redis');
      this.emit('disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  async publish(event: SystemEvent): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Event Bus not connected');
    }

    try {
      const topic = this.getTopicFromEvent(event);
      const eventData = JSON.stringify(event);

      // Publish to topic-specific channel
      await this.redisClient.publish(topic, eventData);
      
      // Publish to global event stream for monitoring
      await this.redisClient.publish('events:all', eventData);

      // Persist event if enabled
      if (this.config.persistenceEnabled) {
        await this.persistEvent(event);
      }

      logger.debug(`Event published to topic ${topic}:`, event.id);
    } catch (error) {
      logger.error('Failed to publish event:', error);
      throw error;
    }
  }

  async subscribe(subscription: EventSubscription): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Event Bus not connected');
    }

    const { topic, callback, filter } = subscription;

    // Add subscription to local registry
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic)!.push(subscription);

    // Subscribe to Redis channel if this is the first subscription for this topic
    if (this.subscriptions.get(topic)!.length === 1) {
      await this.subscriberClient.subscribe(topic, async (message) => {
        try {
          const event: SystemEvent = JSON.parse(message);
          await this.handleIncomingEvent(topic, event);
        } catch (error) {
          logger.error(`Error processing event on topic ${topic}:`, error);
        }
      });

      logger.info(`Subscribed to topic: ${topic}`);
    }
  }

  async unsubscribe(topic: string, callback?: (event: SystemEvent) => Promise<void>): Promise<void> {
    const subscriptions = this.subscriptions.get(topic);
    if (!subscriptions) {
      return;
    }

    if (callback) {
      // Remove specific callback
      const index = subscriptions.findIndex(sub => sub.callback === callback);
      if (index !== -1) {
        subscriptions.splice(index, 1);
      }
    } else {
      // Remove all subscriptions for topic
      subscriptions.length = 0;
    }

    // Unsubscribe from Redis if no more subscriptions
    if (subscriptions.length === 0) {
      await this.subscriberClient.unsubscribe(topic);
      this.subscriptions.delete(topic);
      logger.info(`Unsubscribed from topic: ${topic}`);
    }
  }

  private async handleIncomingEvent(topic: string, event: SystemEvent): Promise<void> {
    const subscriptions = this.subscriptions.get(topic);
    if (!subscriptions) {
      return;
    }

    // Process each subscription
    const promises = subscriptions.map(async (subscription) => {
      try {
        // Apply filter if provided
        if (subscription.filter && !subscription.filter(event)) {
          return;
        }

        // Execute callback with retry logic
        await this.executeWithRetry(subscription.callback, event);
      } catch (error) {
        logger.error(`Error in subscription callback for topic ${topic}:`, error);
        this.emit('subscriptionError', { topic, event, error });
      }
    });

    await Promise.allSettled(promises);
  }

  private async executeWithRetry(
    callback: (event: SystemEvent) => Promise<void>,
    event: SystemEvent
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        await callback(event);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Callback attempt ${attempt} failed:`, error);

        if (attempt < this.config.retryAttempts!) {
          await this.delay(this.config.retryDelay! * attempt);
        }
      }
    }

    throw lastError;
  }

  private getTopicFromEvent(event: SystemEvent): string {
    // Create hierarchical topic structure
    const baseTopic = `events:${event.type}`;
    
    // Add source-specific routing
    if (event.source) {
      return `${baseTopic}:${event.source}`;
    }
    
    return baseTopic;
  }

  private async persistEvent(event: SystemEvent): Promise<void> {
    try {
      const key = `event:${event.id}`;
      const eventData = JSON.stringify({
        ...event,
        persistedAt: new Date().toISOString()
      });

      // Store event with TTL (30 days)
      await this.redisClient.setEx(key, 30 * 24 * 60 * 60, eventData);

      // Add to time-ordered list for replay capability
      await this.redisClient.zAdd('events:timeline', {
        score: event.timestamp.getTime(),
        value: event.id
      });
    } catch (error) {
      logger.error('Failed to persist event:', error);
      // Don't throw - persistence failure shouldn't break event publishing
    }
  }

  async getEventHistory(
    startTime?: Date,
    endTime?: Date,
    limit: number = 100
  ): Promise<SystemEvent[]> {
    if (!this.isConnected) {
      throw new Error('Event Bus not connected');
    }

    try {
      const start = startTime ? startTime.getTime() : '-inf';
      const end = endTime ? endTime.getTime() : '+inf';

      // Get event IDs from timeline
      const eventIds = await this.redisClient.zRangeByScore(
        'events:timeline',
        start,
        end,
        { LIMIT: { offset: 0, count: limit } }
      );

      // Fetch event details
      const events: SystemEvent[] = [];
      for (const eventId of eventIds) {
        try {
          const eventData = await this.redisClient.get(`event:${eventId}`);
          if (eventData) {
            const event = JSON.parse(eventData);
            // Convert timestamp back to Date object
            event.timestamp = new Date(event.timestamp);
            events.push(event);
          }
        } catch (error) {
          logger.warn(`Failed to retrieve event ${eventId}:`, error);
        }
      }

      return events;
    } catch (error) {
      logger.error('Failed to get event history:', error);
      throw error;
    }
  }

  async replayEvents(
    startTime: Date,
    endTime: Date,
    targetTopic?: string
  ): Promise<number> {
    if (!this.isConnected) {
      throw new Error('Event Bus not connected');
    }

    try {
      const events = await this.getEventHistory(startTime, endTime, 1000);
      let replayedCount = 0;

      for (const event of events) {
        try {
          // Create replay event
          const replayEvent: SystemEvent = {
            ...event,
            id: `replay-${event.id}`,
            data: {
              ...event.data,
              originalEventId: event.id,
              replayedAt: new Date().toISOString()
            }
          };

          if (targetTopic) {
            // Publish to specific topic
            await this.redisClient.publish(targetTopic, JSON.stringify(replayEvent));
          } else {
            // Republish to original topic
            await this.publish(replayEvent);
          }

          replayedCount++;
        } catch (error) {
          logger.error(`Failed to replay event ${event.id}:`, error);
        }
      }

      logger.info(`Replayed ${replayedCount} events`);
      return replayedCount;
    } catch (error) {
      logger.error('Failed to replay events:', error);
      throw error;
    }
  }

  getSubscriptionCount(topic?: string): number {
    if (topic) {
      return this.subscriptions.get(topic)?.length || 0;
    }
    
    return Array.from(this.subscriptions.values())
      .reduce((total, subs) => total + subs.length, 0);
  }

  getTopics(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  isHealthy(): boolean {
    return this.isConnected && 
           this.redisClient.isReady && 
           this.subscriberClient.isReady;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const eventBus = new EventBus();