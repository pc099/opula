import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Chip,
  Grid,
} from '@mui/material';
import { AgentConfig } from '../../../../shared/types/src';

interface ConfigurationDiffProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentConfig: AgentConfig;
  newConfig: Partial<AgentConfig>;
  title?: string;
}

interface DiffItem {
  field: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'removed' | 'modified';
}

const ConfigurationDiff: React.FC<ConfigurationDiffProps> = ({
  open,
  onClose,
  onConfirm,
  currentConfig,
  newConfig,
  title = 'Configuration Changes'
}) => {
  const generateDiff = (): DiffItem[] => {
    const diff: DiffItem[] = [];
    const allKeys = new Set([
      ...Object.keys(currentConfig),
      ...Object.keys(newConfig)
    ]);

    allKeys.forEach(key => {
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
        return; // Skip these fields
      }

      const oldValue = (currentConfig as any)[key];
      const newValue = (newConfig as any)[key];

      if (oldValue === undefined && newValue !== undefined) {
        diff.push({
          field: key,
          oldValue: null,
          newValue,
          type: 'added'
        });
      } else if (oldValue !== undefined && newValue === undefined) {
        diff.push({
          field: key,
          oldValue,
          newValue: null,
          type: 'removed'
        });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        diff.push({
          field: key,
          oldValue,
          newValue,
          type: 'modified'
        });
      }
    });

    return diff;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getFieldDisplayName = (field: string): string => {
    const fieldNames: Record<string, string> = {
      name: 'Agent Name',
      type: 'Agent Type',
      enabled: 'Enabled Status',
      automationLevel: 'Automation Level',
      thresholds: 'Thresholds',
      approvalRequired: 'Approval Required',
      integrations: 'Integrations'
    };
    return fieldNames[field] || field;
  };

  const getChangeTypeColor = (type: DiffItem['type']) => {
    switch (type) {
      case 'added':
        return 'success';
      case 'removed':
        return 'error';
      case 'modified':
        return 'warning';
      default:
        return 'default';
    }
  };

  const diff = generateDiff();
  const hasChanges = diff.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h6">{title}</Typography>
          <Chip 
            label={`${diff.length} change${diff.length !== 1 ? 's' : ''}`}
            color={hasChanges ? 'primary' : 'default'}
            size="small"
          />
        </Box>
      </DialogTitle>
      <DialogContent>
        {!hasChanges ? (
          <Box textAlign="center" py={4}>
            <Typography variant="body1" color="text.secondary">
              No changes detected
            </Typography>
          </Box>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Review the changes below before applying the configuration:
            </Typography>
            
            {diff.map((item, index) => (
              <Paper key={index} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {getFieldDisplayName(item.field)}
                  </Typography>
                  <Chip 
                    label={item.type}
                    color={getChangeTypeColor(item.type)}
                    size="small"
                  />
                </Box>
                
                <Grid container spacing={2}>
                  {item.type !== 'added' && (
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Current Value:
                      </Typography>
                      <Paper 
                        sx={{ 
                          p: 1, 
                          bgcolor: 'error.light', 
                          color: 'error.contrastText',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 200,
                          overflow: 'auto'
                        }}
                      >
                        {formatValue(item.oldValue)}
                      </Paper>
                    </Grid>
                  )}
                  
                  {item.type !== 'removed' && (
                    <Grid item xs={12} md={item.type === 'added' ? 12 : 6}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        New Value:
                      </Typography>
                      <Paper 
                        sx={{ 
                          p: 1, 
                          bgcolor: 'success.light', 
                          color: 'success.contrastText',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          whiteSpace: 'pre-wrap',
                          maxHeight: 200,
                          overflow: 'auto'
                        }}
                      >
                        {formatValue(item.newValue)}
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={onConfirm} 
          variant="contained" 
          disabled={!hasChanges}
          color={diff.some(d => d.type === 'removed') ? 'error' : 'primary'}
        >
          Apply Changes
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfigurationDiff;