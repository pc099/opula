import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Typography,
  Box,
  Paper,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Alert,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Warning,
  CheckCircle,
  Schedule,
  Cancel,
  Settings,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { RootState, AppDispatch } from '../../store/store';
import { 
  fetchCostOptimizations, 
  fetchCostReports, 
  fetchCostTrends,
  fetchBudgets,
  fetchRecommendations,
  setBudgetThreshold 
} from '../../store/slices/costOptimizationSlice';

interface CostTrend {
  date: string;
  cost: number;
  savings: number;
}

interface CostBreakdown {
  service: string;
  cost: number;
  percentage: number;
}

interface Budget {
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

interface Recommendation {
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const CostOptimization: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { 
    optimizations, 
    reports, 
    trends, 
    budgets: reduxBudgets, 
    recommendations: reduxRecommendations, 
    loading, 
    error, 
    budgetAlerts 
  } = useSelector((state: RootState) => state.costOptimization);
  
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown[]>([]);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [newBudgetThreshold, setNewBudgetThreshold] = useState(80);
  const [totalSavings, setTotalSavings] = useState(0);
  const [monthlyCost, setMonthlyCost] = useState(0);
  const [roi, setRoi] = useState(0);

  useEffect(() => {
    dispatch(fetchCostOptimizations());
    dispatch(fetchCostReports());
    dispatch(fetchCostTrends());
    dispatch(fetchBudgets());
    dispatch(fetchRecommendations());
    fetchCostData();
  }, [dispatch]);

  const fetchCostData = async () => {
    try {
      // Fetch cost trends for additional data
      const trendsResponse = await fetch('/api/cost-optimization/trends');
      const trendsData = await trendsResponse.json();
      setTotalSavings(trendsData.totalSavings);
      setMonthlyCost(trendsData.projectedMonthlyCost);

      // Fetch cost reports for breakdown
      const reportsResponse = await fetch('/api/cost-optimization/reports');
      const reportsData = await reportsResponse.json();
      setCostBreakdown(reportsData.breakdown.byService);

      // Fetch recommendations for ROI calculation
      const recommendationsResponse = await fetch('/api/cost-optimization/recommendations');
      const recommendationsData = await recommendationsResponse.json();

      // Calculate ROI
      const totalPotentialSavings = recommendationsData.totalPotentialSavings || 0;
      const currentMonthlyCost = trendsData.projectedMonthlyCost || 1;
      setRoi((totalPotentialSavings / currentMonthlyCost) * 100);
    } catch (error) {
      console.error('Error fetching cost data:', error);
    }
  };

  const handleBudgetThresholdUpdate = () => {
    dispatch(setBudgetThreshold(newBudgetThreshold));
    setBudgetDialogOpen(false);
  };

  const applyRecommendation = async (recommendationId: string) => {
    try {
      await fetch(`/api/cost-optimization/recommendations/${recommendationId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      fetchCostData(); // Refresh data
    } catch (error) {
      console.error('Error applying recommendation:', error);
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      default: return 'default';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Cost Optimization
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography color="error">
            Error loading cost optimization data: {error}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Cost Optimization Dashboard
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Monthly Cost
                  </Typography>
                  <Typography variant="h5">
                    ${monthlyCost.toLocaleString()}
                  </Typography>
                </Box>
                <AttachMoney color="primary" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Savings
                  </Typography>
                  <Typography variant="h5" color="success.main">
                    ${totalSavings.toLocaleString()}
                  </Typography>
                </Box>
                <TrendingDown color="success" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    ROI
                  </Typography>
                  <Typography variant="h5" color="success.main">
                    {roi.toFixed(1)}%
                  </Typography>
                </Box>
                <TrendingUp color="success" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Active Optimizations
                  </Typography>
                  <Typography variant="h5">
                    {optimizations.length}
                  </Typography>
                </Box>
                <CheckCircle color="primary" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Budget Alerts */}
      {reduxBudgets.some(budget => budget.forecast.willExceed) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="subtitle1">Budget Alert</Typography>
          <Typography variant="body2">
            Some budgets are projected to exceed their limits this month.
          </Typography>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Cost Trends Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cost Trends
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${value}`, '']} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="cost" 
                  stroke="#8884d8" 
                  name="Daily Cost"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="savings" 
                  stroke="#82ca9d" 
                  name="Daily Savings"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Cost Breakdown Pie Chart */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cost Breakdown by Service
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={costBreakdown}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ service, percentage }) => `${service} ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                >
                  {costBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`$${value}`, 'Cost']} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Budget Management */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                Budget Management
              </Typography>
              <Button
                startIcon={<Settings />}
                onClick={() => setBudgetDialogOpen(true)}
                variant="outlined"
                size="small"
              >
                Configure
              </Button>
            </Box>
            {reduxBudgets.map((budget) => (
              <Box key={budget.id} sx={{ mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle1">{budget.name}</Typography>
                  <Chip
                    label={`${budget.percentage.toFixed(1)}%`}
                    color={budget.percentage > 90 ? 'error' : budget.percentage > 80 ? 'warning' : 'success'}
                    size="small"
                  />
                </Box>
                <Typography variant="body2" color="textSecondary">
                  ${budget.spent.toLocaleString()} / ${budget.amount.toLocaleString()}
                </Typography>
                <Box sx={{ width: '100%', bgcolor: 'grey.200', borderRadius: 1, mt: 1 }}>
                  <Box
                    sx={{
                      width: `${Math.min(budget.percentage, 100)}%`,
                      bgcolor: budget.percentage > 90 ? 'error.main' : budget.percentage > 80 ? 'warning.main' : 'success.main',
                      height: 8,
                      borderRadius: 1,
                    }}
                  />
                </Box>
                {budget.forecast.willExceed && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    Projected to exceed budget: ${budget.forecast.projectedSpend.toLocaleString()}
                  </Alert>
                )}
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Cost Optimization Recommendations */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Optimization Recommendations
            </Typography>
            <List>
              {reduxRecommendations.slice(0, 5).map((recommendation, index) => (
                <React.Fragment key={recommendation.id}>
                  <ListItem>
                    <ListItemIcon>
                      {recommendation.priority === 'high' ? (
                        <Warning color="error" />
                      ) : recommendation.priority === 'medium' ? (
                        <Schedule color="warning" />
                      ) : (
                        <CheckCircle color="success" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Typography variant="subtitle2">
                            {recommendation.title}
                          </Typography>
                          <Box>
                            <Chip
                              label={`$${recommendation.potentialSavings}`}
                              color="success"
                              size="small"
                              sx={{ mr: 1 }}
                            />
                            <Chip
                              label={recommendation.riskLevel}
                              color={getRiskColor(recommendation.riskLevel) as any}
                              size="small"
                            />
                          </Box>
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            {recommendation.description}
                          </Typography>
                          <Box mt={1}>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => applyRecommendation(recommendation.id)}
                              sx={{ mr: 1 }}
                            >
                              Apply
                            </Button>
                            <Button size="small" variant="outlined">
                              Details
                            </Button>
                          </Box>
                        </Box>
                      }
                    />
                  </ListItem>
                  {index < reduxRecommendations.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Savings Tracking */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Savings Tracking & ROI
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${value}`, '']} />
                <Legend />
                <Bar dataKey="savings" fill="#82ca9d" name="Daily Savings" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Budget Configuration Dialog */}
      <Dialog open={budgetDialogOpen} onClose={() => setBudgetDialogOpen(false)}>
        <DialogTitle>Configure Budget Alerts</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Alert Threshold (%)"
            type="number"
            fullWidth
            variant="outlined"
            value={newBudgetThreshold}
            onChange={(e) => setNewBudgetThreshold(Number(e.target.value))}
            inputProps={{ min: 0, max: 100 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBudgetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleBudgetThresholdUpdate} variant="contained">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CostOptimization;