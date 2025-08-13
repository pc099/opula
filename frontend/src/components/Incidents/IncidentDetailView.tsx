import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  Chip,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  Alert,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Close as CloseIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  TrendingUp as EscalationIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { Incident } from '../../store/slices/incidentsSlice';

interface IncidentDetailViewProps {
  incident: Incident | null;
  open: boolean;
  onClose: () => void;
  onStatusUpdate: (incidentId: string, status: Incident['status'], note?: string) => void;
  onEscalate: (incidentId: string, reason: string) => void;
}

const IncidentDetailView: React.FC<IncidentDetailViewProps> = ({
  incident,
  open,
  onClose,
  onStatusUpdate,
  onEscalate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newStatus, setNewStatus] = useState<Incident['status']>('open');
  const [resolutionNote, setResolutionNote] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [showEscalation, setShowEscalation] = useState(false);

  if (!incident) return null;

  const handleStatusUpdate = () => {
    onStatusUpdate(incident.id, newStatus, resolutionNote);
    setIsEditing(false);
    setResolutionNote('');
  };

  const handleEscalate = () => {
    onEscalate(incident.id, escalationReason);
    setShowEscalation(false);
    setEscalationReason('');
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
        return 'primary';
      default:
        return 'primary';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getResolutionDuration = () => {
    if (!incident.resolvedAt) return null;
    const start = new Date(incident.detectedAt);
    const end = new Date(incident.resolvedAt);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 60) {
      return `${diffMins} minutes`;
    } else {
      return `${diffHours} hours ${diffMins % 60} minutes`;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{incident.title}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {/* Incident Header */}
        <Box mb={3}>
          <Box display="flex" gap={2} mb={2}>
            <Chip
              label={`${incident.severity.toUpperCase()} SEVERITY`}
              color={getSeverityColor(incident.severity)}
              size="medium"
            />
            <Chip
              label={incident.status.toUpperCase()}
              color={getStatusColor(incident.status)}
              variant="outlined"
              size="medium"
            />
            {incident.automatedResolution && (
              <Chip
                label="AUTO-RESOLVED"
                color="success"
                variant="outlined"
                size="medium"
              />
            )}
          </Box>
          
          <Typography variant="body1" paragraph>
            {incident.description}
          </Typography>
          
          <Box display="flex" justifyContent="space-between" mb={2}>
            <Typography variant="body2" color="text.secondary">
              <strong>Detected:</strong> {formatDateTime(incident.detectedAt)}
            </Typography>
            {incident.resolvedAt && (
              <Typography variant="body2" color="text.secondary">
                <strong>Resolved:</strong> {formatDateTime(incident.resolvedAt)}
                {getResolutionDuration() && ` (${getResolutionDuration()})`}
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Affected Resources */}
        <Box mb={3}>
          <Typography variant="h6" gutterBottom>
            Affected Resources ({incident.affectedResources.length})
          </Typography>
          <List dense>
            {incident.affectedResources.map((resource, index) => (
              <ListItem key={index} divider={index < incident.affectedResources.length - 1}>
                <ListItemText
                  primary={resource}
                  secondary={`Resource ${index + 1}`}
                />
              </ListItem>
            ))}
          </List>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Resolution Steps */}
        <Box mb={3}>
          <Typography variant="h6" gutterBottom>
            Resolution Timeline
          </Typography>
          <Stepper orientation="vertical">
            {incident.resolutionSteps.map((step, index) => (
              <Step key={index} active={true} completed={index < incident.resolutionSteps.length - 1}>
                <StepLabel>
                  <Typography variant="body2">
                    Step {index + 1}
                  </Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" color="text.secondary">
                    {step}
                  </Typography>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Status Update Section */}
        {incident.status !== 'closed' && (
          <>
            <Divider sx={{ mb: 3 }} />
            <Box mb={3}>
              <Typography variant="h6" gutterBottom>
                Actions
              </Typography>
              
              {!isEditing ? (
                <Box display="flex" gap={2}>
                  <Button
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      setIsEditing(true);
                      setNewStatus(incident.status);
                    }}
                  >
                    Update Status
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<EscalationIcon />}
                    onClick={() => setShowEscalation(true)}
                  >
                    Escalate
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Box display="flex" gap={2} mb={2}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>Status</InputLabel>
                      <Select
                        value={newStatus}
                        label="Status"
                        onChange={(e) => setNewStatus(e.target.value as Incident['status'])}
                      >
                        <MenuItem value="open">Open</MenuItem>
                        <MenuItem value="investigating">Investigating</MenuItem>
                        <MenuItem value="resolved">Resolved</MenuItem>
                        <MenuItem value="closed">Closed</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                  
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Resolution Note"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="Add a note about the status change..."
                    sx={{ mb: 2 }}
                  />
                  
                  <Box display="flex" gap={2}>
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleStatusUpdate}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<CancelIcon />}
                      onClick={() => {
                        setIsEditing(false);
                        setResolutionNote('');
                      }}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          </>
        )}

        {/* Escalation Dialog */}
        {showEscalation && (
          <Box mb={3}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Escalating this incident will notify senior engineers and create a high-priority alert.
            </Alert>
            
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Escalation Reason"
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              placeholder="Explain why this incident needs escalation..."
              sx={{ mb: 2 }}
            />
            
            <Box display="flex" gap={2}>
              <Button
                variant="contained"
                color="warning"
                onClick={handleEscalate}
                disabled={!escalationReason.trim()}
              >
                Escalate Incident
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setShowEscalation(false);
                  setEscalationReason('');
                }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default IncidentDetailView;