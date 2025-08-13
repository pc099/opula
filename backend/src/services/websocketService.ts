import { Server as SocketIOServer, Socket } from 'socket.io';
import { agentOrchestrator } from './agentOrchestrator';
import { eventBus } from './eventBus';

interface ClientSubscription {
  socketId: string;
  topics: Set<string>;
  agentIds: Set<string>;
}

class WebSocketService {
  private io: SocketIOServer | null = null;
  private clients: Map<string, ClientSubscription> = new Map();

  initialize(io: SocketIOServer) {
    this.io = io;
    this.setupEventListeners();
    this.setupSocketHandlers();
  }

  private setupEventListeners() {
    // Listen to agent orchestrator events
    eventBus.on('agent-status-changed', (data) => {
      this.broadcastToSubscribers('agent-status-update', data);
    });

    eventBus.on('agent-metrics-updated', (data) => {
      this.broadcastToSubscribers('agent-metrics-update', data);
    });

    eventBus.on('agent-registered', (data) => {
      this.broadcastToSubscribers('agent-list-update', data);
    });

    eventBus.on('agent-unregistered', (data) => {
      this.broadcastToSubscribers('agent-list-update', data);
    });
  }

  private setupSocketHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      console.log('Client connected to agent monitoring:', socket.id);
      
      // Initialize client subscription
      this.clients.set(socket.id, {
        socketId: socket.id,
        topics: new Set(),
        agentIds: new Set(),
      });

      // Handle subscription to general topics
      socket.on('subscribe', (data: { topic: string }) => {
        const client = this.clients.get(socket.id);
        if (client) {
          client.topics.add(data.topic);
          console.log(`Client ${socket.id} subscribed to topic: ${data.topic}`);
        }
      });

      // Handle subscription to specific agents
      socket.on('subscribe-agent', (data: { agentId: string }) => {
        const client = this.clients.get(socket.id);
        if (client) {
          client.agentIds.add(data.agentId);
          console.log(`Client ${socket.id} subscribed to agent: ${data.agentId}`);
        }
      });

      // Handle unsubscription from specific agents
      socket.on('unsubscribe-agent', (data: { agentId: string }) => {
        const client = this.clients.get(socket.id);
        if (client) {
          client.agentIds.delete(data.agentId);
          console.log(`Client ${socket.id} unsubscribed from agent: ${data.agentId}`);
        }
      });

      // Handle request for current agent status
      socket.on('request-agent-status', async () => {
        try {
          const agents = await agentOrchestrator.getAllAgents();
          socket.emit('agent-status-bulk', agents);
        } catch (error) {
          console.error('Error fetching agent status:', error);
          socket.emit('error', { message: 'Failed to fetch agent status' });
        }
      });

      // Handle request for specific agent details
      socket.on('request-agent-details', async (data: { agentId: string }) => {
        try {
          const agent = await agentOrchestrator.getAgent(data.agentId);
          if (agent) {
            socket.emit('agent-details', agent);
          } else {
            socket.emit('error', { message: `Agent ${data.agentId} not found` });
          }
        } catch (error) {
          console.error('Error fetching agent details:', error);
          socket.emit('error', { message: 'Failed to fetch agent details' });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected from agent monitoring:', socket.id);
        this.clients.delete(socket.id);
      });
    });
  }

  private broadcastToSubscribers(event: string, data: any) {
    if (!this.io) return;

    this.clients.forEach((client, socketId) => {
      const socket = this.io!.sockets.sockets.get(socketId);
      if (!socket) {
        // Clean up disconnected clients
        this.clients.delete(socketId);
        return;
      }

      // Check if client is subscribed to this type of update
      const shouldReceive = this.shouldReceiveUpdate(client, event, data);
      if (shouldReceive) {
        socket.emit(event, data);
      }
    });
  }

  private shouldReceiveUpdate(client: ClientSubscription, event: string, data: any): boolean {
    // Check topic subscriptions
    if (client.topics.has('agent-updates')) {
      return true;
    }

    // Check specific agent subscriptions
    if (data.agentId && client.agentIds.has(data.agentId)) {
      return true;
    }

    return false;
  }

  // Public methods for broadcasting updates
  broadcastAgentStatusUpdate(agentId: string, status: any) {
    this.broadcastToSubscribers('agent-status-update', {
      agentId,
      ...status,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastAgentMetricsUpdate(agentId: string, metrics: any) {
    this.broadcastToSubscribers('agent-metrics-update', {
      agentId,
      metrics,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastAgentListUpdate() {
    this.broadcastToSubscribers('agent-list-update', {
      timestamp: new Date().toISOString(),
    });
  }

  // Send real-time system metrics
  broadcastSystemMetrics(metrics: any) {
    this.broadcastToSubscribers('system-metrics-update', {
      ...metrics,
      timestamp: new Date().toISOString(),
    });
  }
}

export const websocketService = new WebSocketService();