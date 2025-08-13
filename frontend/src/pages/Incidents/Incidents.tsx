import React, { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Typography,
  Box,
  Paper,
  CircularProgress,
  Button,
  Alert,
  Tabs,
  Tab,
  Badge,
} from '@mui/material';
import {
  Add as AddIcon,
  Timeline as TimelineIcon,
  List as ListIcon,
} from '@mui/icons-material';
import { RootState, AppDispatch } from '../../store/store';
import { 
  fetchIncidents, 
  createIncident, 
  updateIncidentStatus, 
  escalateIncident,
  setFilters, 
  clearFilters,
  setSelectedIncident,
  Incident 
} from '../../store/slices/incidentsSlice';
import IncidentTimeline from '../../components/Incidents/IncidentTimeline';
import IncidentDetailView from '../../components/Incidents/IncidentDetailView';
import IncidentFilters from '../../components/Incidents/IncidentFilters';
import CreateIncidentDialog from '../../components/Incidents/CreateIncidentDialog';

const Incidents: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { incidents, loading, error, selectedIncident, filters } = useSelector(
    (state: RootState) => state.incidents
  );
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);

  // Filter incidents based on current filters
  const filteredIncidents = useMemo(() => {
    let filtered = [...incidents];

    // Apply local filtering for real-time updates
    if (filters.severity.length > 0) {
      filtered = filtered.filter(incident => filters.severity.includes(incident.severity));
    }

    if (filters.status.length > 0) {
      filtered = filtered.filter(incident => filters.status.includes(incident.status));
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(incident =>
        incident.title.toLowerCase().includes(searchTerm) ||
        incident.description.toLowerCase().includes(searchTerm) ||
        incident.affectedResources.some(resource => 
          resource.toLowerCase().includes(searchTerm)
        )
      );
    }

    if (filters.automatedOnly) {
      filtered = filtered.filter(incident => incident.automatedResolution);
    }

    if (filters.dateRange.start) {
      const start = new Date(filters.dateRange.start);
      filtered = filtered.filter(incident => 
        new Date(incident.detectedAt) >= start
      );
    }

    if (filters.dateRange.end) {
      const end = new Date(filters.dateRange.end);
      filtered = filtered.filter(incident => 
        new Date(incident.detectedAt) <= end
      );
    }

    // Sort by detection time (newest first)
    return filtered.sort((a, b) => 
      new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    );
  }, [incidents, filters]);

  // Get incident counts by status
  const incidentCounts = useMemo(() => {
    return filteredIncidents.reduce((counts, incident) => {
      counts[incident.status] = (counts[incident.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }, [filteredIncidents]);

  useEffect(() => {
    dispatch(fetchIncidents(filters));
  }, [dispatch]);

  // Refetch when filters change
  useEffect(() => {
    dispatch(fetchIncidents(filters));
  }, [dispatch, filters]);

  const handleFiltersChange = (newFilters: any) => {
    dispatch(setFilters(newFilters));
  };

  const handleClearFilters = () => {
    dispatch(clearFilters());
  };

  const handleIncidentClick = (incident: Incident) => {
    dispatch(setSelectedIncident(incident));
    setDetailViewOpen(true);
  };

  const handleCreateIncident = (incidentData: Omit<Incident, 'id' | 'detectedAt' | 'resolutionSteps' | 'automatedResolution'>) => {
    dispatch(createIncident(incidentData));
    setCreateDialogOpen(false);
  };

  const handleStatusUpdate = (incidentId: string, status: Incident['status'], note?: string) => {
    dispatch(updateIncidentStatus({ id: incidentId, status, note }));
  };

  const handleEscalate = (incidentId: string, reason: string) => {
    dispatch(escalateIncident({ id: incidentId, reason }));
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  if (loading && incidents.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Incident Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Incident
        </Button>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading incidents: {error}
        </Alert>
      )}

      {/* Filters */}
      <IncidentFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onClearFilters={handleClearFilters}
        incidentCount={filteredIncidents.length}
      />

      {/* View Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={currentTab} onChange={handleTabChange}>
          <Tab 
            icon={<TimelineIcon />} 
            label="Timeline View" 
            iconPosition="start"
          />
          <Tab 
            icon={
              <Badge badgeContent={incidentCounts.open || 0} color="error">
                <ListIcon />
              </Badge>
            } 
            label="Status Overview" 
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Content */}
      {currentTab === 0 && (
        <IncidentTimeline
          incidents={filteredIncidents}
          onIncidentClick={handleIncidentClick}
        />
      )}

      {currentTab === 1 && (
        <Box>
          {/* Status Overview */}
          <Box display="flex" gap={2} mb={3}>
            {['open', 'investigating', 'resolved', 'closed'].map((status) => (
              <Paper key={status} sx={{ p: 2, textAlign: 'center', minWidth: 120 }}>
                <Typography variant="h4" color={
                  status === 'open' ? 'error.main' :
                  status === 'investigating' ? 'warning.main' :
                  status === 'resolved' ? 'success.main' : 'text.secondary'
                }>
                  {incidentCounts[status] || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary" textTransform="capitalize">
                  {status}
                </Typography>
              </Paper>
            ))}
          </Box>

          {/* Incident List */}
          <IncidentTimeline
            incidents={filteredIncidents}
            onIncidentClick={handleIncidentClick}
          />
        </Box>
      )}

      {/* Empty State */}
      {filteredIncidents.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No incidents found
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {Object.values(filters).some(f => Array.isArray(f) ? f.length > 0 : f) 
              ? 'Try adjusting your filters to see more incidents.'
              : 'Create your first incident report to get started.'
            }
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Incident
          </Button>
        </Paper>
      )}

      {/* Dialogs */}
      <CreateIncidentDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={handleCreateIncident}
      />

      <IncidentDetailView
        incident={selectedIncident}
        open={detailViewOpen}
        onClose={() => {
          setDetailViewOpen(false);
          dispatch(setSelectedIncident(null));
        }}
        onStatusUpdate={handleStatusUpdate}
        onEscalate={handleEscalate}
      />
    </Box>
  );
};

export default Incidents;