import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface Agent {
  id: string;
  name: string;
  type: 'terraform' | 'kubernetes' | 'incident-response' | 'cost-optimization';
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  health: 'healthy' | 'warning' | 'critical';
  lastActivity: string;
  metrics: {
    actionsPerformed: number;
    successRate: number;
    avgResponseTime: number;
  };
}

interface AgentsState {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  selectedAgent: Agent | null;
}

const initialState: AgentsState = {
  agents: [],
  loading: false,
  error: null,
  selectedAgent: null,
};

export const fetchAgents = createAsyncThunk(
  'agents/fetchAgents',
  async () => {
    const response = await fetch('/api/agents/status');
    if (!response.ok) {
      throw new Error('Failed to fetch agents');
    }
    return response.json();
  }
);

const agentsSlice = createSlice({
  name: 'agents',
  initialState,
  reducers: {
    setSelectedAgent: (state, action: PayloadAction<Agent | null>) => {
      state.selectedAgent = action.payload;
    },
    updateAgentStatus: (state, action: PayloadAction<{ id: string; status: Agent['status']; health?: Agent['health']; lastActivity?: string }>) => {
      const agent = state.agents.find(a => a.id === action.payload.id);
      if (agent) {
        agent.status = action.payload.status;
        if (action.payload.health) {
          agent.health = action.payload.health;
        }
        if (action.payload.lastActivity) {
          agent.lastActivity = action.payload.lastActivity;
        }
      }
    },
    updateAgentMetrics: (state, action: PayloadAction<{ id: string; metrics: Agent['metrics'] }>) => {
      const agent = state.agents.find(a => a.id === action.payload.id);
      if (agent) {
        agent.metrics = { ...agent.metrics, ...action.payload.metrics };
        agent.lastActivity = new Date().toISOString();
      }
    },
    updateAgentRealTime: (state, action: PayloadAction<Partial<Agent> & { id: string }>) => {
      const agent = state.agents.find(a => a.id === action.payload.id);
      if (agent) {
        Object.assign(agent, action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAgents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAgents.fulfilled, (state, action) => {
        state.loading = false;
        state.agents = action.payload;
      })
      .addCase(fetchAgents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch agents';
      });
  },
});

export const { setSelectedAgent, updateAgentStatus, updateAgentMetrics, updateAgentRealTime } = agentsSlice.actions;
export default agentsSlice.reducer;