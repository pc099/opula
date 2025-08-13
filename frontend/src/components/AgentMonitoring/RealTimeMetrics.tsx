import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  Card,
  CardContent,
} from '@mui/material';
import {
  TrendingUp,
  Speed,
  CheckCircle,
  Error,
  Warning,
} from '@mui/icons-material';
import { Agent } from '../../store/slices/agentsSlice';

interface RealTimeMetricsProps {
  agents: Agent[];
  isConnected: boolean;
}

interface SystemMetrics {
  totalAgents: number;
  activeAgents: number;
  healthyAgents: number;
  avgSuccessRate: number;
  avgResponseTime: number;
  totalActions: number;
}

const RealTimeMetrics: React.FC<RealTimeMetricsProps> = ({
  agents,
  isConnected,
}) => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalAgents: 0,
    activeAgents: 0,
    healthyAgents: 0,
    avgSuccessRate: 0,
    avgResponseTime: 0,
    totalActions: 0,
  });

  useEffect(() => {
    const calculateMetrics = () => {
      const totalAgents = agents.length;
      const activeAgents = agents.filter(a => a.status === 'active').length;
      const healthyAgents = agents.filter(a => a.health === 'healthy').length;
      
      const avgSuccessRate = agents.length > 0 
        ? agents.reduce((sum, agent) => sum + agent.metrics.successRate, 0) / agents.length
        : 0;
      
      const avgResponseTime = agents.length > 0
        ? agents.reduce((sum, agent) => sum + agent.metrics.avgResponseTime, 0) / agents.length
        : 0;
      
      const totalActions = agents.reduce((sum, agent) => sum + agent.metrics.actionsPerformed, 0);

      setMetrics({
        totalAgents,
        activeAgents,
        healthyAgents,
        avgSuccessRate,
        avgResponseTime,
        totalActions,
      });
    };

    calculateMetrics();
  }, [agents]);

  const getHealthColor = (ratio: number) => {
    if (ratio >= 0.8) return 'success';
    if (ratio >= 0.6) return 'warning';
    return 'error';
  };

  const getConnectionStatus = () => {
    if (isConnected) {
      return (
        <Chip
          icon={<CheckCircle />}
          label="Connected"
          color="success"
          size="small"
        />
      );
    }
    return (
      <Chip
        icon={<Error />}
        label="Disconnected"
        color="error"
        size="small"
      />
    );
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Real-Time System Metrics
        </Typography>
        {getConnectionStatus()}
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="primary">
                {metrics.totalAgents}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Agents
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="success.main">
                {metrics.activeAgents}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active Agents
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="success.main">
                {metrics.healthyAgents}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Healthy Agents
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="h4" color="primary">
                {metrics.totalActions}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Actions
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                <TrendingUp sx={{ mr: 1 }} />
                <Typography variant="h4" color="primary">
                  {metrics.avgSuccessRate.toFixed(1)}%
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Avg Success Rate
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                <Speed sx={{ mr: 1 }} />
                <Typography variant="h4" color="primary">
                  {metrics.avgResponseTime.toFixed(0)}ms
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Avg Response Time
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 2 }}>
        <Typography variant="body2" gutterBottom>
          System Health Overview
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ width: '100%', mr: 1 }}>
            <LinearProgress
              variant="determinate"
              value={metrics.totalAgents > 0 ? (metrics.healthyAgents / metrics.totalAgents) * 100 : 0}
              color={getHealthColor(metrics.totalAgents > 0 ? metrics.healthyAgents / metrics.totalAgents : 0)}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
          <Box sx={{ minWidth: 35 }}>
            <Typography variant="body2" color="text.secondary">
              {metrics.totalAgents > 0 ? Math.round((metrics.healthyAgents / metrics.totalAgents) * 100) : 0}%
            </Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default RealTimeMetrics;