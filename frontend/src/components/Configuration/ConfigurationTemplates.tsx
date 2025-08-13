import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { AgentType } from '../../../../shared/types/src';

interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  agentType: AgentType;
  config: any;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConfigurationTemplatesProps {
  onApplyTemplate: (template: ConfigurationTemplate) => void;
  onCreateFromTemplate: (template: ConfigurationTemplate) => void;
}

const ConfigurationTemplates: React.FC<ConfigurationTemplatesProps> = ({
  onApplyTemplate,
  onCreateFromTemplate
}) => {
  const [templates, setTemplates] = useState<ConfigurationTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/config/templates');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      
      const data = await response.json();
      setTemplates(data.templates || getBuiltInTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setTemplates(getBuiltInTemplates());
    } finally {
      setLoading(false);
    }
  };

  const getBuiltInTemplates = (): ConfigurationTemplate[] => [
    {
      id: 'terraform-basic',
      name: 'Basic Terraform Agent',
      description: 'Standard Terraform agent with drift detection and semi-automatic mode',
      agentType: 'terraform',
      config: {
        automationLevel: 'semi-auto',
        approvalRequired: true,
        thresholds: {
          driftCheckInterval: 30,
          maxDriftResolution: 5
        },
        integrations: []
      },
      isBuiltIn: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'kubernetes-autoscaler',
      name: 'Kubernetes Autoscaler',
      description: 'Kubernetes agent optimized for automatic scaling based on resource usage',
      agentType: 'kubernetes',
      config: {
        automationLevel: 'full-auto',
        approvalRequired: false,
        thresholds: {
          cpuThreshold: 70,
          memoryThreshold: 80,
          scaleUpThreshold: 85,
          scaleDownThreshold: 30
        },
        integrations: []
      },
      isBuiltIn: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const getAgentTypeColor = (type: AgentType): 'primary' | 'secondary' | 'error' | 'success' | 'default' => {
    const colors = {
      terraform: 'primary' as const,
      kubernetes: 'secondary' as const,
      'incident-response': 'error' as const,
      'cost-optimization': 'success' as const
    };
    return colors[type] || 'default';
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <Typography>Loading templates...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">Configuration Templates</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => alert('Template creation not yet implemented')}
        >
          Create Template
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        {templates.map((template) => (
          <Grid item xs={12} md={6} lg={4} key={template.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Typography variant="h6" component="div" noWrap>
                    {template.name}
                  </Typography>
                  <Box display="flex" gap={1}>
                    <Chip 
                      label={template.agentType}
                      color={getAgentTypeColor(template.agentType)}
                      size="small"
                    />
                    {template.isBuiltIn && (
                      <Chip label="Built-in" color="info" size="small" />
                    )}
                  </Box>
                </Box>

                <Typography variant="body2" color="text.secondary" paragraph>
                  {template.description}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <List dense>
                  <ListItem disablePadding>
                    <ListItemText 
                      primary="Automation Level"
                      secondary={template.config.automationLevel || 'manual'}
                    />
                  </ListItem>
                  <ListItem disablePadding>
                    <ListItemText 
                      primary="Approval Required"
                      secondary={template.config.approvalRequired ? 'Yes' : 'No'}
                    />
                  </ListItem>
                </List>
              </CardContent>

              <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                <Box display="flex" gap={1}>
                  <Tooltip title="Create agent from template">
                    <IconButton
                      size="small"
                      onClick={() => onCreateFromTemplate(template)}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
                
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => onApplyTemplate(template)}
                >
                  Use Template
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ConfigurationTemplates;