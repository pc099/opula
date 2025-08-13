import { useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store/store';
import { updateAgentStatus, updateAgentMetrics, fetchAgents } from '../store/slices/agentsSlice';
import { useWebSocket } from './useWebSocket';

interface AgentStatusUpdate {
  agentId: string;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  health: 'healthy' | 'warning' | 'critical';
  lastActivity: string;
}

interface AgentMetricsUpdate {
  agentId: string;
  metrics: {
    actionsPerformed: number;
    successRate: number;
    avgResponseTime: number;
  };
}

export const useRealTimeAgentMonitoring = () => {
  const dispatch = useDispatch<AppDispatch>();
  
  const { isConnected, on, off, emit } = useWebSocket({
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:3002',
    autoConnect: true,
    onConnect: () => {
      console.log('Connected to agent monitoring WebSocket');
      // Subscribe to agent updates
      emit('subscribe', { topic: 'agent-updates' });
    },
    onDisconnect: () => {
      console.log('Disconnected from agent monitoring WebSocket');
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  const handleAgentStatusUpdate = useCallback((data: AgentStatusUpdate) => {
    dispatch(updateAgentStatus({
      id: data.agentId,
      status: data.status,
    }));
  }, [dispatch]);

  const handleAgentMetricsUpdate = useCallback((data: AgentMetricsUpdate) => {
    dispatch(updateAgentMetrics({
      id: data.agentId,
      metrics: data.metrics,
    }));
  }, [dispatch]);

  const handleAgentListUpdate = useCallback(() => {
    // Refresh the entire agent list when there are structural changes
    dispatch(fetchAgents());
  }, [dispatch]);

  useEffect(() => {
    if (isConnected) {
      // Set up event listeners
      on('agent-status-update', handleAgentStatusUpdate);
      on('agent-metrics-update', handleAgentMetricsUpdate);
      on('agent-list-update', handleAgentListUpdate);

      // Request initial data
      emit('request-agent-status');

      return () => {
        // Clean up event listeners
        off('agent-status-update', handleAgentStatusUpdate);
        off('agent-metrics-update', handleAgentMetricsUpdate);
        off('agent-list-update', handleAgentListUpdate);
      };
    }
  }, [isConnected, on, off, emit, handleAgentStatusUpdate, handleAgentMetricsUpdate, handleAgentListUpdate]);

  const subscribeToAgent = useCallback((agentId: string) => {
    if (isConnected) {
      emit('subscribe-agent', { agentId });
    }
  }, [isConnected, emit]);

  const unsubscribeFromAgent = useCallback((agentId: string) => {
    if (isConnected) {
      emit('unsubscribe-agent', { agentId });
    }
  }, [isConnected, emit]);

  const requestAgentDetails = useCallback((agentId: string) => {
    if (isConnected) {
      emit('request-agent-details', { agentId });
    }
  }, [isConnected, emit]);

  return {
    isConnected,
    subscribeToAgent,
    unsubscribeFromAgent,
    requestAgentDetails,
  };
};