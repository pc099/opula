const { EventBus } = require('./dist/services/eventBus');

async function testEventBus() {
  console.log('Testing Event Bus...');
  
  const eventBus = new EventBus({
    redisUrl: 'redis://localhost:6379',
    persistenceEnabled: true
  });

  try {
    // Connect to Redis
    await eventBus.connect();
    console.log('✓ Connected to Redis');

    // Test event publishing and subscription
    let receivedEvent = null;
    
    await eventBus.subscribe({
      topic: 'events:infrastructure-change',
      callback: async (event) => {
        receivedEvent = event;
        console.log('✓ Received event:', event.id);
      }
    });

    // Publish a test event
    const testEvent = {
      id: 'test-event-1',
      type: 'infrastructure-change',
      source: 'terraform-agent',
      severity: 'medium',
      data: { resource: 'aws_instance.web', action: 'create' },
      timestamp: new Date()
    };

    await eventBus.publish(testEvent);
    console.log('✓ Published test event');

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (receivedEvent && receivedEvent.id === testEvent.id) {
      console.log('✓ Event subscription working correctly');
    } else {
      console.log('✗ Event subscription failed');
    }

    // Test event persistence and history
    const history = await eventBus.getEventHistory();
    if (history.length > 0) {
      console.log('✓ Event persistence working, found', history.length, 'events');
    } else {
      console.log('✗ Event persistence failed');
    }

    // Test health check
    if (eventBus.isHealthy()) {
      console.log('✓ Event Bus health check passed');
    } else {
      console.log('✗ Event Bus health check failed');
    }

    console.log('Event Bus test completed successfully!');

  } catch (error) {
    console.error('Event Bus test failed:', error);
  } finally {
    await eventBus.disconnect();
    console.log('✓ Disconnected from Redis');
  }
}

testEventBus().catch(console.error);