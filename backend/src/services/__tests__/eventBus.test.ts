import { EventBus } from '../eventBus';
import { SystemEvent } from '../../types';

// Mock Redis for testing
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockImplementation((channel, callback) => {
      // Store callback for later invocation
      (global as any).mockRedisCallbacks = (global as any).mockRedisCallbacks || {};
      (global as any).mockRedisCallbacks[channel] = callback;
      return Promise.resolve();
    }),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    setEx: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    zAdd: jest.fn().mockResolvedValue(1),
    zRangeByScore: jest.fn().mockResolvedValue([]),
    isReady: true,
    on: jest.fn(),
  })),
}));

describe('EventBus', () => {
  let eventBus: EventBus;
  let mockRedisClient: any;
  let mockSubscriberClient: any;

  beforeEach(() => {
    // Clear global mock state
    (global as any).mockRedisCallbacks = {};
    
    eventBus = new EventBus({
      redisUrl: 'redis://localhost:6379',
      persistenceEnabled: true,
      retryAttempts: 2,
      retryDelay: 100
    });

    // Get references to mocked clients
    const redis = require('redis');
    mockRedisClient = redis.createClient();
    mockSubscriberClient = redis.createClient();
  });

  afterEach(async () => {
    if (eventBus.isHealthy()) {
      await eventBus.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should connect to Redis successfully', async () => {
      await eventBus.connect();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockSubscriberClient.connect).toHaveBeenCalled();
      expect(eventBus.isHealthy()).toBe(true);
    });

    it('should disconnect from Redis successfully', async () => {
      await eventBus.connect();
      await eventBus.disconnect();
      
      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(mockSubscriberClient.quit).toHaveBeenCalled();
    });

    it('should handle connection errors gracefully', async () => {
      mockRedisClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
      
      await expect(eventBus.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('Event Publishing', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should publish events to correct topics', async () => {
      const testEvent: SystemEvent = {
        id: 'test-event-1',
        type: 'infrastructure-change',
        source: 'terraform-agent',
        severity: 'medium',
        data: { resource: 'aws_instance.web' },
        timestamp: new Date(),
      };

      await eventBus.publish(testEvent);

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'events:infrastructure-change:terraform-agent',
        JSON.stringify(testEvent)
      );
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'events:all',
        JSON.stringify(testEvent)
      );
    });

    it('should persist events when persistence is enabled', async () => {
      const testEvent: SystemEvent = {
        id: 'test-event-2',
        type: 'alert',
        source: 'monitoring',
        severity: 'high',
        data: { metric: 'cpu_usage', value: 95 },
        timestamp: new Date(),
      };

      await eventBus.publish(testEvent);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `event:${testEvent.id}`,
        30 * 24 * 60 * 60, // 30 days TTL
        expect.stringContaining(testEvent.id)
      );
      expect(mockRedisClient.zAdd).toHaveBeenCalledWith(
        'events:timeline',
        {
          score: testEvent.timestamp.getTime(),
          value: testEvent.id
        }
      );
    });

    it('should throw error when not connected', async () => {
      const testEvent: SystemEvent = {
        id: 'test-event-3',
        type: 'metric-threshold',
        source: 'agent',
        severity: 'low',
        data: {},
        timestamp: new Date(),
      };

      await expect(eventBus.publish(testEvent)).rejects.toThrow('Event Bus not connected');
    });
  });

  describe('Event Subscription', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should subscribe to topics successfully', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      
      await eventBus.subscribe({
        topic: 'events:infrastructure-change',
        callback
      });

      expect(mockSubscriberClient.subscribe).toHaveBeenCalledWith(
        'events:infrastructure-change',
        expect.any(Function)
      );
      expect(eventBus.getSubscriptionCount('events:infrastructure-change')).toBe(1);
    });

    it('should handle incoming events correctly', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      const testEvent: SystemEvent = {
        id: 'incoming-event-1',
        type: 'infrastructure-change',
        source: 'terraform-agent',
        severity: 'medium',
        data: { action: 'apply' },
        timestamp: new Date(),
      };

      await eventBus.subscribe({
        topic: 'events:infrastructure-change',
        callback
      });

      // Simulate incoming Redis message
      const redisCallback = (global as any).mockRedisCallbacks['events:infrastructure-change'];
      await redisCallback(JSON.stringify(testEvent));

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(callback).toHaveBeenCalledWith(testEvent);
    });

    it('should apply filters when provided', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      const filter = jest.fn().mockReturnValue(false); // Filter out all events
      
      const testEvent: SystemEvent = {
        id: 'filtered-event-1',
        type: 'infrastructure-change',
        source: 'terraform-agent',
        severity: 'low',
        data: {},
        timestamp: new Date(),
      };

      await eventBus.subscribe({
        topic: 'events:infrastructure-change',
        callback,
        filter
      });

      // Simulate incoming Redis message
      const redisCallback = (global as any).mockRedisCallbacks['events:infrastructure-change'];
      await redisCallback(JSON.stringify(testEvent));

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(filter).toHaveBeenCalledWith(testEvent);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should unsubscribe from topics', async () => {
      const callback = jest.fn().mockResolvedValue(undefined);
      
      await eventBus.subscribe({
        topic: 'events:test',
        callback
      });

      expect(eventBus.getSubscriptionCount('events:test')).toBe(1);

      await eventBus.unsubscribe('events:test');

      expect(mockSubscriberClient.unsubscribe).toHaveBeenCalledWith('events:test');
      expect(eventBus.getSubscriptionCount('events:test')).toBe(0);
    });
  });

  describe('Event History and Replay', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should retrieve event history', async () => {
      const mockEvents = ['event-1', 'event-2'];
      mockRedisClient.zRangeByScore.mockResolvedValueOnce(mockEvents);
      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify({
          id: 'event-1',
          type: 'infrastructure-change',
          timestamp: new Date().toISOString()
        }))
        .mockResolvedValueOnce(JSON.stringify({
          id: 'event-2',
          type: 'alert',
          timestamp: new Date().toISOString()
        }));

      const startTime = new Date(Date.now() - 3600000); // 1 hour ago
      const endTime = new Date();
      
      const history = await eventBus.getEventHistory(startTime, endTime, 10);

      expect(mockRedisClient.zRangeByScore).toHaveBeenCalledWith(
        'events:timeline',
        startTime.getTime(),
        endTime.getTime(),
        { LIMIT: { offset: 0, count: 10 } }
      );
      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('event-1');
      expect(history[1].id).toBe('event-2');
    });

    it('should replay events', async () => {
      const mockEvents = [{
        id: 'replay-event-1',
        type: 'infrastructure-change',
        source: 'terraform-agent',
        severity: 'medium',
        data: { action: 'plan' },
        timestamp: new Date()
      }];

      // Mock getEventHistory
      eventBus.getEventHistory = jest.fn().mockResolvedValue(mockEvents);

      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date();
      
      const replayedCount = await eventBus.replayEvents(startTime, endTime);

      expect(replayedCount).toBe(1);
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'events:infrastructure-change:terraform-agent',
        expect.stringContaining('replay-replay-event-1')
      );
    });
  });

  describe('Health and Monitoring', () => {
    it('should report health status correctly', async () => {
      expect(eventBus.isHealthy()).toBe(false);
      
      await eventBus.connect();
      expect(eventBus.isHealthy()).toBe(true);
    });

    it('should track subscription counts', async () => {
      await eventBus.connect();
      
      expect(eventBus.getSubscriptionCount()).toBe(0);
      
      await eventBus.subscribe({
        topic: 'events:test1',
        callback: jest.fn().mockResolvedValue(undefined)
      });
      
      await eventBus.subscribe({
        topic: 'events:test2',
        callback: jest.fn().mockResolvedValue(undefined)
      });

      expect(eventBus.getSubscriptionCount()).toBe(2);
      expect(eventBus.getSubscriptionCount('events:test1')).toBe(1);
      expect(eventBus.getTopics()).toEqual(['events:test1', 'events:test2']);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should retry failed callbacks', async () => {
      const callback = jest.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce(undefined);

      const testEvent: SystemEvent = {
        id: 'retry-event-1',
        type: 'infrastructure-change',
        source: 'agent',
        severity: 'medium',
        data: {},
        timestamp: new Date(),
      };

      await eventBus.subscribe({
        topic: 'events:infrastructure-change',
        callback
      });

      // Simulate incoming Redis message
      const redisCallback = (global as any).mockRedisCallbacks['events:infrastructure-change'];
      await redisCallback(JSON.stringify(testEvent));

      // Wait for retries to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should emit subscription errors after max retries', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      const errorHandler = jest.fn();
      
      eventBus.on('subscriptionError', errorHandler);

      const testEvent: SystemEvent = {
        id: 'error-event-1',
        type: 'infrastructure-change',
        source: 'agent',
        severity: 'medium',
        data: {},
        timestamp: new Date(),
      };

      await eventBus.subscribe({
        topic: 'events:infrastructure-change',
        callback
      });

      // Simulate incoming Redis message
      const redisCallback = (global as any).mockRedisCallbacks['events:infrastructure-change'];
      await redisCallback(JSON.stringify(testEvent));

      // Wait for retries to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(callback).toHaveBeenCalledTimes(2); // Initial + 1 retry
      expect(errorHandler).toHaveBeenCalledWith({
        topic: 'events:infrastructure-change',
        event: testEvent,
        error: expect.any(Error)
      });
    });
  });
});