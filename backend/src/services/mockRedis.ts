// Mock Redis client for testing when Redis is not available
import { EventEmitter } from 'events';

export class MockRedisClient extends EventEmitter {
  private storage: Map<string, string> = new Map();
  private subscriptions: Map<string, ((message: string) => void)[]> = new Map();
  private sortedSets: Map<string, Array<{ score: number; value: string }>> = new Map();
  public isReady: boolean = false;

  async connect(): Promise<void> {
    this.isReady = true;
    this.emit('connect');
    return Promise.resolve();
  }

  async quit(): Promise<void> {
    this.isReady = false;
    return Promise.resolve();
  }

  async publish(channel: string, message: string): Promise<number> {
    const subscribers = this.subscriptions.get(channel) || [];
    
    // Simulate async message delivery
    setTimeout(() => {
      subscribers.forEach(callback => {
        try {
          callback(message);
        } catch (error) {
          console.error('Mock Redis subscription error:', error);
        }
      });
    }, 10);

    return subscribers.length;
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, []);
    }
    this.subscriptions.get(channel)!.push(callback);
    return Promise.resolve();
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subscriptions.delete(channel);
    return Promise.resolve();
  }

  async setEx(key: string, seconds: number, value: string): Promise<string> {
    this.storage.set(key, value);
    
    // Simulate TTL by removing after specified time
    setTimeout(() => {
      this.storage.delete(key);
    }, seconds * 1000);

    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async zAdd(key: string, member: { score: number; value: string }): Promise<number> {
    if (!this.sortedSets.has(key)) {
      this.sortedSets.set(key, []);
    }
    
    const set = this.sortedSets.get(key)!;
    
    // Remove existing member if it exists
    const existingIndex = set.findIndex(item => item.value === member.value);
    if (existingIndex !== -1) {
      set.splice(existingIndex, 1);
    }
    
    // Add new member and sort by score
    set.push(member);
    set.sort((a, b) => a.score - b.score);
    
    return 1;
  }

  async zRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
    options?: { LIMIT?: { offset: number; count: number } }
  ): Promise<string[]> {
    const set = this.sortedSets.get(key) || [];
    
    const minScore = min === '-inf' ? -Infinity : Number(min);
    const maxScore = max === '+inf' ? Infinity : Number(max);
    
    let filtered = set.filter(item => 
      item.score >= minScore && item.score <= maxScore
    );
    
    if (options?.LIMIT) {
      const { offset, count } = options.LIMIT;
      filtered = filtered.slice(offset, offset + count);
    }
    
    return filtered.map(item => item.value);
  }
}

export function createClient(options: { url: string }): MockRedisClient {
  return new MockRedisClient();
}