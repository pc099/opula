import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  IconButton,
  Alert,
  Autocomplete,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { Incident } from '../../store/slices/incidentsSlice';

interface CreateIncidentDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (incident: Omit<Incident, 'id' | 'detectedAt' | 'resolutionSteps' | 'automatedResolution'>) => void;
}

const severityOptions = [
  { value: 'low', label: 'Low', description: 'Minor issue with minimal impact' },
  { value: 'medium', label: 'Medium', description: 'Moderate issue affecting some users' },
  { value: 'high', label: 'High', description: 'Significant issue affecting many users' },
  { value: 'critical', label: 'Critical', description: 'Severe issue affecting all users' },
];

const commonResources = [
  'prod-cluster-1',
  'staging-cluster',
  'web-deployment',
  'api-deployment',
  'database-primary',
  'database-replica',
  'load-balancer',
  'cdn-distribution',
  'aws_instance.web-1',
  'aws_instance.web-2',
  'aws_security_group.web',
  'kubernetes-ingress',
];

const CreateIncidentDialog: React.FC<CreateIncidentDialogProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium' as Incident['severity'],
    status: 'open' as Incident['status'],
    affectedResources: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newResource, setNewResource] = useState('');

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleAddResource = () => {
    if (newResource.trim() && !formData.affectedResources.includes(newResource.trim())) {
      setFormData(prev => ({
        ...prev,
        affectedResources: [...prev.affectedResources, newResource.trim()],
      }));
      setNewResource('');
    }
  };

  const handleRemoveResource = (resource: string) => {
    setFormData(prev => ({
      ...prev,
      affectedResources: prev.affectedResources.filter(r => r !== resource),
    }));
  };

  const handleResourcesChange = (event: any, newValue: string[]) => {
    setFormData(prev => ({
      ...prev,
      affectedResources: newValue,
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      return;
    }

    onSubmit({
      ...formData,
      resolvedAt: undefined,
    });

    // Reset form
    setFormData({
      title: '',
      description: '',
      severity: 'medium',
      status: 'open',
      affectedResources: [],
    });
    setErrors({});
    onClose();
  };

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      severity: 'medium',
      status: 'open',
      affectedResources: [],
    });
    setErrors({});
    onClose();
  };

  const getSeverityColor = (severity: string) => {
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
        return 'default';
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Create New Incident</Typography>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 3 }}>
          Create a manual incident report for issues that require immediate attention or tracking.
        </Alert>

        <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Title */}
          <TextField
            fullWidth
            label="Incident Title"
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            error={!!errors.title}
            helperText={errors.title || 'Provide a clear, concise title for the incident'}
            placeholder="e.g., High CPU usage on production cluster"
          />

          {/* Description */}
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            error={!!errors.description}
            helperText={errors.description || 'Describe the incident in detail, including symptoms and impact'}
            placeholder="Provide detailed information about the incident, including what was observed, when it started, and the potential impact..."
          />

          {/* Severity */}
          <FormControl fullWidth>
            <InputLabel>Severity</InputLabel>
            <Select
              value={formData.severity}
              label="Severity"
              onChange={(e) => handleInputChange('severity', e.target.value)}
            >
              {severityOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Chip
                      label={option.label}
                      color={getSeverityColor(option.value) as any}
                      size="small"
                    />
                    <Typography variant="body2" color="text.secondary">
                      {option.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status */}
          <FormControl fullWidth>
            <InputLabel>Initial Status</InputLabel>
            <Select
              value={formData.status}
              label="Initial Status"
              onChange={(e) => handleInputChange('status', e.target.value)}
            >
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="investigating">Investigating</MenuItem>
            </Select>
          </FormControl>

          {/* Affected Resources */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Affected Resources
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Select or add resources affected by this incident
            </Typography>
            
            <Autocomplete
              multiple
              freeSolo
              options={commonResources}
              value={formData.affectedResources}
              onChange={handleResourcesChange}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    {...getTagProps({ index })}
                    key={option}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Type resource name or select from common resources"
                  helperText="Press Enter to add custom resources"
                />
              )}
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!formData.title.trim() || !formData.description.trim()}
        >
          Create Incident
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateIncidentDialog;