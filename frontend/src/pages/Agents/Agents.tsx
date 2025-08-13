import React, { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Grid,
  Typography,
  Box,
  Paper,
  CircularProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { RootState, AppDispatch } from '../../store/store';
import { fetchAgents, setSelectedAgent } from '../../store/slices/agentsSlice';
import AgentStatusCard from '../../components/AgentStatus/AgentStatusCard';
import AgentTopologyVisualization from '../../components/AgentMonitoring/AgentTopologyVisualization';
import AgentActivityFilter, { FilterOptions } from '../../components/AgentMonitoring/AgentActivityFilter';
import RealTimeMetrics from '../../components/AgentMonitoring/RealTimeMetrics';
import { useRealTimeAgentMonitoring } from '../../hooks/useRealTimeAgentMonitoring';

const Agents: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { agents, loading, error } = useSelector((state: RootState) => state.agents);
  const { isConnected } = useRealTimeAgentMonitoring();
  
  const [showTopology, setShowTopology] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    agentTypes: [],
    statuses: [],
    healthLevels: [],
  });

  const filteredAgents = useMemo(() => {
    // Ensure agents is an array
    const agentsArray = Array.isArray(agents) ? agents : [];
    
    return agentsArray.filter(agent => {
      const matchesSearch = !filters.search || 
        agent.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        agent.id.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesType = filters.agentTypes.length === 0 || 
        filters.agentTypes.includes(agent.type);
      
      const matchesStatus = filters.statuses.length === 0 || 
        filters.statuses.includes(agent.status);
      
      const matchesHealth = filters.healthLevels.length === 0 || 
        filters.healthLevels.includes(agent.health);

      return matchesSearch && matchesType && matchesStatus && matchesHealth;
    });
  }, [agents, filters]);

  useEffect(() => {
    dispatch(fetchAgents());
  }, [dispatch]);

  const handleAgentStart = (agentId: string) => {
    // TODO: Implement agent start functionality
    console.log('Starting agent:', agentId);
  };

  const handleAgentStop = (agentId: string) => {
    // TODO: Implement agent stop functionality
    console.log('Stopping agent:', agentId);
  };

  const handleAgentRefresh = (agentId: string) => {
    // TODO: Implement agent refresh functionality
    console.log('Refreshing agent:', agentId);
    dispatch(fetchAgents());
  };

  const handleAgentConfigure = (agentId: string) => {
    // TODO: Navigate to configuration page
    console.log('Configuring agent:', agentId);
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
          Agents
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography color="error">
            Error loading agents: {error}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          AI Agents ({filteredAgents.length} of {Array.isArray(agents) ? agents.length : 0})
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={showTopology}
              onChange={(e) => setShowTopology(e.target.checked)}
            />
          }
          label="Show Topology"
        />
      </Box>

      <RealTimeMetrics agents={Array.isArray(agents) ? agents : []} isConnected={isConnected} />

      <AgentActivityFilter
        agents={Array.isArray(agents) ? agents : []}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {showTopology && (
        <Box mb={3}>
          <AgentTopologyVisualization agents={filteredAgents} />
        </Box>
      )}

      <Grid container spacing={3}>
        {filteredAgents.map((agent) => (
          <Grid item key={agent.id} xs={12} sm={6} md={4} lg={3}>
            <AgentStatusCard
              agent={agent}
              onStart={handleAgentStart}
              onStop={handleAgentStop}
              onRefresh={handleAgentRefresh}
              onConfigure={handleAgentConfigure}
              showRealTimeIndicators={isConnected}
            />
          </Grid>
        ))}
      </Grid>

      {filteredAgents.length === 0 && Array.isArray(agents) && agents.length > 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No agents match the current filters
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try adjusting your search criteria or clearing the filters
          </Typography>
        </Paper>
      )}

      {(!Array.isArray(agents) || agents.length === 0) && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            No agents configured
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure your first AI agent to get started with automation
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default Agents;