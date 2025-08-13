import React from 'react';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from '@mui/lab';
import {
  Typography,
  Paper,
  Chip,
  Box,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { Incident } from '../../store/slices/incidentsSlice';

interface IncidentTimelineProps {
  incidents: Incident[];
  onIncidentClick: (incident: Incident) => void;
}

const getSeverityIcon = (severity: Incident['severity']) => {
  switch (severity) {
    case 'critical':
      return <ErrorIcon color="error" />;
    case 'high':
      return <WarningIcon color="warning" />;
    case 'medium':
      return <InfoIcon color="info" />;
    case 'low':
      return <CheckCircleIcon color="success" />;
    default:
      return <InfoIcon />;
  }
};

const getSeverityColor = (severity: Incident['severity']) => {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'primary';
  }
};

const getStatusColor = (status: Incident['status']) => {
  switch (status) {
    case 'open':
      return 'error';
    case 'investigating':
      return 'warning';
    case 'resolved':
      return 'success';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
};

const formatTimeAgo = (date: string) => {
  const now = new Date();
  const incidentDate = new Date(date);
  const diffMs = now.getTime() - incidentDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
};

const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ incidents, onIncidentClick }) => {
  if (incidents.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No incidents found
        </Typography>
      </Paper>
    );
  }

  return (
    <Timeline>
      {incidents.map((incident, index) => (
        <TimelineItem key={incident.id}>
          <TimelineOppositeContent sx={{ m: 'auto 0' }} variant="body2" color="text.secondary">
            {formatTimeAgo(incident.detectedAt)}
          </TimelineOppositeContent>
          <TimelineSeparator>
            <TimelineDot color={getSeverityColor(incident.severity)}>
              {getSeverityIcon(incident.severity)}
            </TimelineDot>
            {index < incidents.length - 1 && <TimelineConnector />}
          </TimelineSeparator>
          <TimelineContent sx={{ py: '12px', px: 2 }}>
            <Paper
              elevation={1}
              sx={{
                p: 2,
                cursor: 'pointer',
                '&:hover': {
                  elevation: 3,
                  backgroundColor: 'action.hover',
                },
              }}
              onClick={() => onIncidentClick(incident)}
            >
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                <Typography variant="h6" component="h3">
                  {incident.title}
                </Typography>
                <Box display="flex" gap={1} alignItems="center">
                  <Chip
                    label={incident.severity.toUpperCase()}
                    color={getSeverityColor(incident.severity)}
                    size="small"
                  />
                  <Chip
                    label={incident.status.toUpperCase()}
                    color={getStatusColor(incident.status)}
                    size="small"
                    variant="outlined"
                  />
                  <Tooltip title="View Details">
                    <IconButton size="small">
                      <ViewIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              
              <Typography variant="body2" color="text.secondary" mb={1}>
                {incident.description}
              </Typography>
              
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" color="text.secondary">
                  Affected: {incident.affectedResources.length} resource(s)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {incident.automatedResolution ? 'Auto-resolved' : 'Manual intervention'}
                </Typography>
              </Box>
              
              {incident.resolvedAt && (
                <Typography variant="caption" color="success.main" mt={1} display="block">
                  Resolved: {formatTimeAgo(incident.resolvedAt)}
                </Typography>
              )}
            </Paper>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
};

export default IncidentTimeline;