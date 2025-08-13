import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface AgentConfig {
  id: string;
  name: string;
  type: 'terraform' | 'kubernetes' | 'incident-response' | 'cost-optimization';
  enabled: boolean;
  automationLevel: 'manual' | 'semi-auto' | 'full-auto';
  thresholds: Record<string, number>;
  approvalRequired: boolean;
  integrations: Array<{
    id: string;
    name: string;
    type: string;
    config: Record<string, any>;
    enabled: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  agentType: string;
  config: Partial<AgentConfig>;
}

interface ConfigurationState {
  configs: AgentConfig[];
  templates: ConfigurationTemplate[];
  loading: boolean;
  error: string | null;
  selectedConfig: AgentConfig | null;
  pendingApprovals: Array<{
    id: string;
    configId: string;
    agentName: string;
    changes: Record<string, any>;
    requestedBy: string;
    requestedAt: string;
    riskLevel: 'low' | 'medium' | 'high';
    reason?: string;
    currentConfig: AgentConfig;
  }>;
}

const initialState: ConfigurationState = {
  configs: [],
  templates: [],
  loading: false,
  error: null,
  selectedConfig: null,
  pendingApprovals: [],
};

export const fetchConfigurations = createAsyncThunk(
  'configuration/fetchConfigurations',
  async () => {
    const [configsResponse, approvalsResponse] = await Promise.all([
      fetch('/api/config/agents'),
      fetch('/api/config/approvals')
    ]);
    
    if (!configsResponse.ok) {
      throw new Error('Failed to fetch configurations');
    }
    
    const configs = await configsResponse.json();
    let approvals = [];
    
    if (approvalsResponse.ok) {
      const approvalsData = await approvalsResponse.json();
      approvals = approvalsData.approvals || [];
    }
    
    return { configs: configs.configurations || configs, approvals };
  }
);

export const updateConfiguration = createAsyncThunk(
  'configuration/updateConfiguration',
  async ({ id, config }: { id: string; config: Partial<AgentConfig> }) => {
    const response = await fetch(`/api/config/agents/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error('Failed to update configuration');
    }
    return response.json();
  }
);

const configurationSlice = createSlice({
  name: 'configuration',
  initialState,
  reducers: {
    setSelectedConfig: (state, action: PayloadAction<AgentConfig | null>) => {
      state.selectedConfig = action.payload;
    },
    addPendingApproval: (state, action: PayloadAction<ConfigurationState['pendingApprovals'][0]>) => {
      state.pendingApprovals.push(action.payload);
    },
    removePendingApproval: (state, action: PayloadAction<string>) => {
      state.pendingApprovals = state.pendingApprovals.filter(a => a.id !== action.payload);
    },
    updateConfigStatus: (state, action: PayloadAction<{ id: string; enabled: boolean }>) => {
      const config = state.configs.find(c => c.id === action.payload.id);
      if (config) {
        config.enabled = action.payload.enabled;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConfigurations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConfigurations.fulfilled, (state, action) => {
        state.loading = false;
        state.configs = action.payload.configs;
        state.pendingApprovals = action.payload.approvals;
      })
      .addCase(fetchConfigurations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch configurations';
      })
      .addCase(updateConfiguration.fulfilled, (state, action) => {
        const index = state.configs.findIndex(c => c.id === action.payload.id);
        if (index !== -1) {
          state.configs[index] = action.payload;
        }
      });
  },
});

export const { setSelectedConfig, addPendingApproval, removePendingApproval, updateConfigStatus } = configurationSlice.actions;
export default configurationSlice.reducer;