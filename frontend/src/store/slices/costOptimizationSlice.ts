import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface CostOptimization {
  id: string;
  type: 'right-sizing' | 'reserved-instances' | 'unused-resources' | 'scheduling';
  description: string;
  estimatedSavings: number;
  actualSavings?: number;
  status: 'pending' | 'applied' | 'rejected' | 'monitoring';
  appliedAt?: string;
  affectedResources: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CostReport {
  period: string;
  totalCost: number;
  optimizedCost: number;
  savings: number;
  savingsPercentage: number;
  breakdown: {
    compute: number;
    storage: number;
    network: number;
    other: number;
  };
}

export interface CostTrend {
  date: string;
  cost: number;
  savings: number;
}

export interface Budget {
  id: string;
  name: string;
  amount: number;
  spent: number;
  percentage: number;
  period: string;
  alerts: Array<{ threshold: number; triggered: boolean }>;
  forecast: {
    projectedSpend: number;
    projectedPercentage: number;
    willExceed: boolean;
  };
}

export interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  potentialSavings: number;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  affectedResources: string[];
  priority: 'low' | 'medium' | 'high';
}

interface CostOptimizationState {
  optimizations: CostOptimization[];
  reports: CostReport[];
  trends: CostTrend[];
  budgets: Budget[];
  recommendations: Recommendation[];
  loading: boolean;
  error: string | null;
  selectedOptimization: CostOptimization | null;
  budgetAlerts: {
    threshold: number;
    current: number;
    alerts: Array<{
      id: string;
      message: string;
      severity: 'warning' | 'critical';
      timestamp: string;
    }>;
  };
}

const initialState: CostOptimizationState = {
  optimizations: [],
  reports: [],
  trends: [],
  budgets: [],
  recommendations: [],
  loading: false,
  error: null,
  selectedOptimization: null,
  budgetAlerts: {
    threshold: 80,
    current: 0,
    alerts: [],
  },
};

export const fetchCostOptimizations = createAsyncThunk(
  'costOptimization/fetchOptimizations',
  async () => {
    const response = await fetch('/api/cost-optimization/optimizations');
    if (!response.ok) {
      throw new Error('Failed to fetch cost optimizations');
    }
    return response.json();
  }
);

export const fetchCostReports = createAsyncThunk(
  'costOptimization/fetchReports',
  async () => {
    const response = await fetch('/api/cost-optimization/reports');
    if (!response.ok) {
      throw new Error('Failed to fetch cost reports');
    }
    return response.json();
  }
);

export const fetchCostTrends = createAsyncThunk(
  'costOptimization/fetchTrends',
  async () => {
    const response = await fetch('/api/cost-optimization/trends');
    if (!response.ok) {
      throw new Error('Failed to fetch cost trends');
    }
    return response.json();
  }
);

export const fetchBudgets = createAsyncThunk(
  'costOptimization/fetchBudgets',
  async () => {
    const response = await fetch('/api/cost-optimization/budgets');
    if (!response.ok) {
      throw new Error('Failed to fetch budgets');
    }
    return response.json();
  }
);

export const fetchRecommendations = createAsyncThunk(
  'costOptimization/fetchRecommendations',
  async () => {
    const response = await fetch('/api/cost-optimization/recommendations');
    if (!response.ok) {
      throw new Error('Failed to fetch recommendations');
    }
    return response.json();
  }
);

const costOptimizationSlice = createSlice({
  name: 'costOptimization',
  initialState,
  reducers: {
    setSelectedOptimization: (state, action: PayloadAction<CostOptimization | null>) => {
      state.selectedOptimization = action.payload;
    },
    updateOptimizationStatus: (state, action: PayloadAction<{ id: string; status: CostOptimization['status'] }>) => {
      const optimization = state.optimizations.find(o => o.id === action.payload.id);
      if (optimization) {
        optimization.status = action.payload.status;
      }
    },
    setBudgetThreshold: (state, action: PayloadAction<number>) => {
      state.budgetAlerts.threshold = action.payload;
    },
    addBudgetAlert: (state, action: PayloadAction<CostOptimizationState['budgetAlerts']['alerts'][0]>) => {
      state.budgetAlerts.alerts.push(action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCostOptimizations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCostOptimizations.fulfilled, (state, action) => {
        state.loading = false;
        state.optimizations = action.payload;
      })
      .addCase(fetchCostOptimizations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch cost optimizations';
      })
      .addCase(fetchCostReports.fulfilled, (state, action) => {
        state.reports = action.payload;
      })
      .addCase(fetchCostTrends.fulfilled, (state, action) => {
        state.trends = action.payload.data;
      })
      .addCase(fetchBudgets.fulfilled, (state, action) => {
        state.budgets = action.payload.budgets;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.recommendations = action.payload.recommendations;
      });
  },
});

export const { setSelectedOptimization, updateOptimizationStatus, setBudgetThreshold, addBudgetAlert } = costOptimizationSlice.actions;
export default costOptimizationSlice.reducer;