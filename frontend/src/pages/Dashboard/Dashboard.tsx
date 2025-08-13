import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Grid,
  Typography,
  Box,
  Paper,
} from '@mui/material';
import {
  SmartToy as AgentsIcon,
  Warning as IncidentsIcon,
  AttachMoney as CostIcon,
  Speed as PerformanceIcon,
} from '@mui/icons-material';
import { RootState, AppDispatch } from '../../store/store';
import { fetchAgents } from '../../store/slices/agentsSlice';
import { fetchIncidents } from '../../store/slices/incidentsSlice';
import MetricsCard from '../../components/MetricsDisplay/MetricsCard';
import AgentStatusCard from '../../components/AgentStatus/AgentStatusCard';

const Dashboard: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard Overview
      </Typography>

      <Typography variant="body1" gutterBottom>
        Welcome to the AIOps Platform! The dashboard is loading...
      </Typography>

      {/* Key Metrics */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricsCard
            title="Active Agents"
            value={0}
            subtitle="of 0 total"
            trend="up"
            trendValue="+2"
            color="primary"
            icon={<AgentsIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricsCard
            title="Open Incidents"
            value={0}
            subtitle="0 critical"
            trend="down"
            trendValue="-1"
            color="success"
            icon={<IncidentsIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricsCard
            title="Cost Savings"
            value="$12.5K"
            subtitle="This month"
            trend="up"
            trendValue="+15%"
            color="success"
            icon={<CostIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricsCard
            title="Success Rate"
            value="0%"
            subtitle="Average across agents"
            trend="flat"
            trendValue="0%"
            color="warning"
            icon={<PerformanceIcon />}
          />
        </Grid>
      </Grid>

      {/* Agent Status Overview */}
      <Typography variant="h5" gutterBottom>
        Agent Status
      </Typography>
      <Paper sx={{ p: 2, mb: 4 }}>
        <Typography>No agents configured yet. Connect your backend to see agent data.</Typography>
      </Paper>

      {/* Recent Activity */}
      <Typography variant="h5" gutterBottom>
        Recent Activity
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Recent activity feed will be implemented with real-time updates
        </Typography>
      </Paper>
    </Box>
  );
};

export default Dashboard;