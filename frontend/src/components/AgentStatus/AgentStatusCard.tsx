import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress,
  IconButton,
  Tooltip,
  Badge,
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  FiberManualRecord as StatusDotIcon,
  TrendingUp,
  Speed,
  Assignment,
} from '@mui/icons-material';
import { Agent } from '../../store/slices/agentsSlice';

interface AgentStatusCardProps {
  agent: Agent;
  onStart?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
  onRefresh?: (agentId: string) => void;
  onConfigure?: (agentId: string) => void;
  showRealTimeIndicators?: boolean;
}

const AgentStatusCard: React.FC<AgentStatusCardProps> = ({
  agent,
  onStart,
  onStop,
  onRefresh,
  onConfigure,
  showRealTimeIndicators = false,
}) => {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Simulate real-time activity indicator
    if (agent.status === 'active' && showRealTimeIndicators) {
      const interval = setInterval(() => {
        setIsActive(prev => !prev);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [agent.status, showRealTimeIndicators]);
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'default';
      case 'error':
        return 'error';
      case 'maintenance':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getHealthColor = (health: Agent['health']) => {
    switch (health) {
      case 'healthy':
        return 'success';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ 
      minWidth: 300, 
      m: 1,
      border: showRealTimeIndicators && agent.status === 'active' && isActive ? '2px solid #4caf50' : 'none',
      transition: 'border 0.3s ease',
      '@keyframes pulse': {
        '0%': { opacity: 1 },
        '50%': { opacity: 0.5 },
        '100%': { opacity: 1 }
      }
    }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box display="flex" alignItems="center">
            {showRealTimeIndicators && (
              <StatusDotIcon 
                sx={{ 
                  color: agent.status === 'active' ? '#4caf50' : '#9e9e9e',
                  fontSize: 12,
                  mr: 1,
                  animation: agent.status === 'active' && isActive ? 'pulse 1s infinite' : 'none'
                }} 
              />
            )}
            <Typography variant="h6" component="div">
              {agent.name}
            </Typography>
          </Box>
          <Box>
            <Tooltip title="Start Agent">
              <IconButton
                size="small"
                onClick={() => onStart?.(agent.id)}
                disabled={agent.status === 'active'}
              >
                <StartIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Stop Agent">
              <IconButton
                size="small"
                onClick={() => onStop?.(agent.id)}
                disabled={agent.status === 'inactive'}
              >
                <StopIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" onClick={() => onRefresh?.(agent.id)}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Configure">
              <IconButton size="small" onClick={() => onConfigure?.(agent.id)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box display="flex" gap={1} mb={2}>
          <Chip
            label={agent.status}
            color={getStatusColor(agent.status)}
            size="small"
          />
          <Chip
            label={agent.health}
            color={getHealthColor(agent.health)}
            size="small"
          />
          <Chip
            label={agent.type}
            variant="outlined"
            size="small"
          />
        </Box>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Last Activity: {new Date(agent.lastActivity).toLocaleString()}
        </Typography>

        <Box mt={2}>
          <Box display="flex" alignItems="center" mb={1}>
            <TrendingUp sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
            <Typography variant="body2" gutterBottom>
              Success Rate: {agent.metrics.successRate}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={agent.metrics.successRate}
            sx={{ mb: 2, height: 6, borderRadius: 3 }}
            color={agent.metrics.successRate >= 90 ? 'success' : agent.metrics.successRate >= 70 ? 'warning' : 'error'}
          />

          <Box display="flex" justifyContent="space-between" mb={1}>
            <Box display="flex" alignItems="center">
              <Assignment sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
              <Typography variant="body2">
                Actions: {agent.metrics.actionsPerformed}
              </Typography>
            </Box>
            <Box display="flex" alignItems="center">
              <Speed sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
              <Typography variant="body2">
                {agent.metrics.avgResponseTime}ms
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AgentStatusCard;