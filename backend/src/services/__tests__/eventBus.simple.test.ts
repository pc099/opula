import { EventBus } from '../eventBus';
import { SystemEvent } from '../../types';

// Simple test without complex mocking
describe('EventBus Basic Functionality', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus({
      redisUrl: 'redis://localhost:6379',
      persistenceEnabled: false, // Disable persistence for testing
      retryAttempts: 1,
      retryDelay: 10
    });
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultEventBus = new EventBus();
      expect(defaultEventBus).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customEventBus = new EventBus({
        redisUrl: 'redis://custom:6379',
        retryAttempts: 5,
        retryDelay: 2000,
        persistenceEnabled: true
      });
      expect(customEventBus).toBeDefined();
    });
  });

  describe('Topic Management', () => {
    it('should generate correct topic names from events', () => {
      const testEvent: SystemEvent = {
        id: 'test-event-1',
        type: 'infrastructure-change',
        source: 'terraform-agent',
        severity: 'medium',
        data: { resource: 'aws_instance.web' },
        timestamp: new Date(),
      };

      // Access private method for testing
      const topic = (eventBus as any).getTopicFromEvent(testEvent);
      expect(topic).toBe('events:infrastructure-change:terraform-agent');
    });

    it('should handle events without source', () => {
      const testEvent: SystemEvent = {
        id: 'test-event-2',
        type: 'alert',
        source: '',
        severity: 'high',
        data: { metric: 'cpu_usage' },
        timestamp: new Date(),
      };

      const topic = (eventBus as any).getTopicFromEvent(testEvent);
      expect(topic).toBe('events:alert');
    });
  });

  describe('Health Monitoring', () => {
    it('should report unhealthy when not connected', () => {
      expect(eventBus.isHealthy()).toBe(false);
    });

    it('should track subscription counts correctly', () => {
      expect(eventBus.getSubscriptionCount()).toBe(0);
      expect(eventBus.getSubscriptionCount('nonexistent')).toBe(0);
      expect(eventBus.getTopics()).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when publishing without connection', async () => {
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

    it('should throw error when subscribing without connection', async () => {
      const callback = jest.fn();
      
      await expect(eventBus.subscribe({
        topic: 'events:test',
        callback
      })).rejects.toThrow('Event Bus not connected');
    });

    it('should throw error when getting history without connection', async () => {
      await expect(eventBus.getEventHistory()).rejects.toThrow('Event Bus not connected');
    });
  });

  describe('Utility Methods', () => {
    it('should implement delay correctly', async () => {
      const start = Date.now();
      await (eventBus as any).delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });
});