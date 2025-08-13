import React, { useState } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Paper,
  Typography,
  Grid,
  SelectChangeEvent,
} from '@mui/material';
import { Agent } from '../../store/slices/agentsSlice';

export interface FilterOptions {
  search: string;
  agentTypes: string[];
  statuses: string[];
  healthLevels: string[];
}

interface AgentActivityFilterProps {
  agents: Agent[];
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
}

const AgentActivityFilter: React.FC<AgentActivityFilterProps> = ({
  agents,
  filters,
  onFiltersChange,
}) => {
  const agentTypes = ['terraform', 'kubernetes', 'incident-response', 'cost-optimization'];
  const statuses = ['active', 'inactive', 'error', 'maintenance'];
  const healthLevels = ['healthy', 'warning', 'critical'];

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      search: event.target.value,
    });
  };

  const handleAgentTypesChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      agentTypes: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleStatusesChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      statuses: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleHealthLevelsChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      healthLevels: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      agentTypes: [],
      statuses: [],
      healthLevels: [],
    });
  };

  const getFilteredCount = () => {
    return agents.filter(agent => {
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
    }).length;
  };

  const hasActiveFilters = filters.search || 
    filters.agentTypes.length > 0 || 
    filters.statuses.length > 0 || 
    filters.healthLevels.length > 0;

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        Filter Agents ({getFilteredCount()} of {agents.length})
      </Typography>
      
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={3}>
          <TextField
            fullWidth
            label="Search agents"
            variant="outlined"
            size="small"
            value={filters.search}
            onChange={handleSearchChange}
            placeholder="Search by name or ID..."
          />
        </Grid>

        <Grid item xs={12} md={3}>
          <FormControl fullWidth size="small">
            <InputLabel>Agent Types</InputLabel>
            <Select
              multiple
              value={filters.agentTypes}
              onChange={handleAgentTypesChange}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {agentTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select
              multiple
              value={filters.statuses}
              onChange={handleStatusesChange}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {statuses.map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Health</InputLabel>
            <Select
              multiple
              value={filters.healthLevels}
              onChange={handleHealthLevelsChange}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip key={value} label={value} size="small" />
                  ))}
                </Box>
              )}
            >
              {healthLevels.map((health) => (
                <MenuItem key={health} value={health}>
                  {health}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={2}>
          {hasActiveFilters && (
            <Chip
              label="Clear Filters"
              onClick={clearFilters}
              onDelete={clearFilters}
              color="primary"
              variant="outlined"
            />
          )}
        </Grid>
      </Grid>
    </Paper>
  );
};

export default AgentActivityFilter;