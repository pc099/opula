import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Box,
  Typography,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AgentConfig, AgentType, AutomationLevel } from '../../../../shared/types/src';

interface AgentConfigFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: Partial<AgentConfig>) => void;
  config?: AgentConfig | null;
  mode: 'create' | 'edit';
}

interface ValidationErrors {
  [key: string]: string;
}

const AgentConfigForm: React.FC<AgentConfigFormProps> = ({
  open,
  onClose,
  onSave,
  config,
  mode
}) => {
  const [formData, setFormData] = useState<Partial<AgentConfig>>({
    name: '',
    type: 'terraform',
    enabled: true,
    automationLevel: 'semi-auto',
    thresholds: {},
    approvalRequired: false,
    integrations: []
  });
  
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    if (config && mode === 'edit') {
      setFormData({
        ...config,
        createdAt: undefined,
        updatedAt: undefined
      });
    } else {
      setFormData({
        name: '',
        type: 'terraform',
        enabled: true,
        automationLevel: 'semi-auto',
        thresholds: {},
        approvalRequired: false,
        integrations: []
      });
    }
    setErrors({});
  }, [config, mode, open]);

  const validateForm = async (): Promise<boolean> => {
    setIsValidating(true);
    const newErrors: ValidationErrors = {};

    // Basic validation
    if (!formData.name?.trim()) {
      newErrors.name = 'Agent name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Agent name must be at least 3 characters';
    }

    if (!formData.type) {
      newErrors.type = 'Agent type is required';
    }

    // Validate thresholds based on agent type
    if (formData.type === 'kubernetes') {
      if (!formData.thresholds?.cpuThreshold || formData.thresholds.cpuThreshold <= 0) {
        newErrors.cpuThreshold = 'CPU threshold must be greater than 0';
      }
      if (!formData.thresholds?.memoryThreshold || formData.thresholds.memoryThreshold <= 0) {
        newErrors.memoryThreshold = 'Memory threshold must be greater than 0';
      }
    }

    if (formData.type === 'cost-optimization') {
      if (!formData.thresholds?.costThreshold || formData.thresholds.costThreshold <= 0) {
        newErrors.costThreshold = 'Cost threshold must be greater than 0';
      }
    }

    // Server-side validation
    try {
      const response = await fetch('/api/config/agents/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const result = await response.json();
        if (result.errors) {
          Object.assign(newErrors, result.errors);
        }
      }
    } catch (error) {
      console.error('Validation error:', error);
    }

    setErrors(newErrors);
    setIsValidating(false);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    const isValid = await validateForm();
    if (isValid) {
      onSave(formData);
    }
  };

  const handleThresholdChange = (key: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      thresholds: {
        ...prev.thresholds,
        [key]: value
      }
    }));
  };

  const getThresholdFields = () => {
    switch (formData.type) {
      case 'kubernetes':
        return (
          <>
            <TextField
              fullWidth
              label="CPU Threshold (%)"
              type="number"
              value={formData.thresholds?.cpuThreshold || ''}
              onChange={(e) => handleThresholdChange('cpuThreshold', Number(e.target.value))}
              error={!!errors.cpuThreshold}
              helperText={errors.cpuThreshold}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Memory Threshold (%)"
              type="number"
              value={formData.thresholds?.memoryThreshold || ''}
              onChange={(e) => handleThresholdChange('memoryThreshold', Number(e.target.value))}
              error={!!errors.memoryThreshold}
              helperText={errors.memoryThreshold}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Scale Up Threshold"
              type="number"
              value={formData.thresholds?.scaleUpThreshold || ''}
              onChange={(e) => handleThresholdChange('scaleUpThreshold', Number(e.target.value))}
              margin="normal"
            />
          </>
        );
      case 'cost-optimization':
        return (
          <>
            <TextField
              fullWidth
              label="Cost Threshold ($)"
              type="number"
              value={formData.thresholds?.costThreshold || ''}
              onChange={(e) => handleThresholdChange('costThreshold', Number(e.target.value))}
              error={!!errors.costThreshold}
              helperText={errors.costThreshold}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Utilization Threshold (%)"
              type="number"
              value={formData.thresholds?.utilizationThreshold || ''}
              onChange={(e) => handleThresholdChange('utilizationThreshold', Number(e.target.value))}
              margin="normal"
            />
          </>
        );
      case 'terraform':
        return (
          <TextField
            fullWidth
            label="Drift Detection Interval (minutes)"
            type="number"
            value={formData.thresholds?.driftCheckInterval || ''}
            onChange={(e) => handleThresholdChange('driftCheckInterval', Number(e.target.value))}
            margin="normal"
          />
        );
      case 'incident-response':
        return (
          <>
            <TextField
              fullWidth
              label="Response Time Threshold (minutes)"
              type="number"
              value={formData.thresholds?.responseTimeThreshold || ''}
              onChange={(e) => handleThresholdChange('responseTimeThreshold', Number(e.target.value))}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Escalation Threshold (minutes)"
              type="number"
              value={formData.thresholds?.escalationThreshold || ''}
              onChange={(e) => handleThresholdChange('escalationThreshold', Number(e.target.value))}
              margin="normal"
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === 'create' ? 'Create Agent Configuration' : 'Edit Agent Configuration'}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Agent Name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                error={!!errors.name}
                helperText={errors.name}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal" error={!!errors.type}>
                <InputLabel>Agent Type</InputLabel>
                <Select
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as AgentType }))}
                  label="Agent Type"
                >
                  <MenuItem value="terraform">Terraform</MenuItem>
                  <MenuItem value="kubernetes">Kubernetes</MenuItem>
                  <MenuItem value="incident-response">Incident Response</MenuItem>
                  <MenuItem value="cost-optimization">Cost Optimization</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth margin="normal">
                <InputLabel>Automation Level</InputLabel>
                <Select
                  value={formData.automationLevel}
                  onChange={(e) => setFormData(prev => ({ ...prev, automationLevel: e.target.value as AutomationLevel }))}
                  label="Automation Level"
                >
                  <MenuItem value="manual">Manual</MenuItem>
                  <MenuItem value="semi-auto">Semi-Automatic</MenuItem>
                  <MenuItem value="full-auto">Fully Automatic</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.enabled}
                      onChange={(e) => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
                    />
                  }
                  label="Enabled"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.approvalRequired}
                      onChange={(e) => setFormData(prev => ({ ...prev, approvalRequired: e.target.checked }))}
                    />
                  }
                  label="Approval Required"
                />
              </Box>
            </Grid>
          </Grid>

          <Accordion sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Thresholds & Settings</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {getThresholdFields()}
            </AccordionDetails>
          </Accordion>

          {formData.automationLevel === 'full-auto' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Full automation mode will execute actions without human approval. 
              Ensure thresholds are properly configured.
            </Alert>
          )}

          {formData.approvalRequired && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This agent will require approval for high-risk actions regardless of automation level.
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={isValidating}
        >
          {isValidating ? 'Validating...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AgentConfigForm;