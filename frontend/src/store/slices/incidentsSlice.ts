import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  affectedResources: string[];
  detectedAt: string;
  resolvedAt?: string;
  resolutionSteps: string[];
  automatedResolution: boolean;
  assignedAgent?: string;
}

interface IncidentsState {
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  selectedIncident: Incident | null;
  filters: {
    severity: string[];
    status: string[];
    dateRange: {
      start: string | null;
      end: string | null;
    };
    search: string;
    automatedOnly: boolean;
  };
}

const initialState: IncidentsState = {
  incidents: [],
  loading: false,
  error: null,
  selectedIncident: null,
  filters: {
    severity: [],
    status: [],
    dateRange: {
      start: null,
      end: null,
    },
    search: '',
    automatedOnly: false,
  },
};

export const fetchIncidents = createAsyncThunk(
  'incidents/fetchIncidents',
  async (filters?: Partial<IncidentsState['filters']>) => {
    const params = new URLSearchParams();
    
    if (filters?.severity?.length) {
      filters.severity.forEach(s => params.append('severity', s));
    }
    if (filters?.status?.length) {
      filters.status.forEach(s => params.append('status', s));
    }
    if (filters?.search) {
      params.append('search', filters.search);
    }
    if (filters?.automatedOnly) {
      params.append('automatedOnly', 'true');
    }
    if (filters?.dateRange?.start) {
      params.append('startDate', filters.dateRange.start);
    }
    if (filters?.dateRange?.end) {
      params.append('endDate', filters.dateRange.end);
    }

    const response = await fetch(`/api/incidents?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch incidents');
    }
    return response.json();
  }
);

export const createIncident = createAsyncThunk(
  'incidents/createIncident',
  async (incidentData: Omit<Incident, 'id' | 'detectedAt' | 'resolutionSteps' | 'automatedResolution'>) => {
    const response = await fetch('/api/incidents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...incidentData,
        resolutionSteps: [`Incident created manually`],
        automatedResolution: false,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create incident');
    }
    
    return response.json();
  }
);

export const updateIncidentStatus = createAsyncThunk(
  'incidents/updateStatus',
  async ({ id, status, note }: { id: string; status: Incident['status']; note?: string }) => {
    const response = await fetch(`/api/incidents/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, resolutionNote: note }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update incident status');
    }
    
    return { id, status, note };
  }
);

export const escalateIncident = createAsyncThunk(
  'incidents/escalate',
  async ({ id, reason }: { id: string; reason: string }) => {
    const response = await fetch(`/api/incidents/${id}/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to escalate incident');
    }
    
    return { id, reason };
  }
);

const incidentsSlice = createSlice({
  name: 'incidents',
  initialState,
  reducers: {
    setSelectedIncident: (state, action: PayloadAction<Incident | null>) => {
      state.selectedIncident = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<IncidentsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIncidents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchIncidents.fulfilled, (state, action) => {
        state.loading = false;
        state.incidents = action.payload;
      })
      .addCase(fetchIncidents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch incidents';
      })
      .addCase(createIncident.fulfilled, (state, action) => {
        state.incidents.unshift(action.payload.incident);
      })
      .addCase(updateIncidentStatus.fulfilled, (state, action) => {
        const incident = state.incidents.find(i => i.id === action.payload.id);
        if (incident) {
          incident.status = action.payload.status;
          if (action.payload.status === 'resolved' || action.payload.status === 'closed') {
            incident.resolvedAt = new Date().toISOString();
          }
          if (action.payload.note) {
            incident.resolutionSteps.push(`Status updated to ${action.payload.status}: ${action.payload.note}`);
          }
        }
      })
      .addCase(escalateIncident.fulfilled, (state, action) => {
        const incident = state.incidents.find(i => i.id === action.payload.id);
        if (incident) {
          incident.resolutionSteps.push(`Incident escalated: ${action.payload.reason}`);
        }
      });
  },
});

export const { setSelectedIncident, setFilters, clearFilters } = incidentsSlice.actions;
export default incidentsSlice.reducer;