import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Typography,
  Box,
  Paper,
  CircularProgress,
  Tabs,
  Tab,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryIcon from '@mui/icons-material/History';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { RootState, AppDispatch } from '../../store/store';
import { fetchConfigurations, updateConfiguration, setSelectedConfig } from '../../store/slices/configurationSlice';
import { AgentConfig as SharedAgentConfig } from '../../../../shared/types/src';
import { AgentConfig } from '../../store/slices/configurationSlice';
import { toSharedAgentConfig, toSharedPartialAgentConfig } from '../../utils/typeConverters';
import AgentConfigForm from '../../components/Configuration/AgentConfigForm';
import ConfigurationDiff from '../../components/Configuration/ConfigurationDiff';
import ConfigurationHistory from '../../components/Configuration/ConfigurationHistory';
import ApprovalWorkflow from '../../components/Configuration/ApprovalWorkflow';
// import { default as ConfigurationTemplates } from '../../components/Configuration/ConfigurationTemplates';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`configuration-tabpanel-${index}`}
      aria-labelledby={`configuration-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const Configuration: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { configs, loading, error, pendingApprovals } = useSelector((state: RootState) => state.configuration);
  
  const [tabValue, setTabValue] = useState(0);
  const [configFormOpen, setConfigFormOpen] = useState(false);
  const [configFormMode, setConfigFormMode] = useState<'create' | 'edit'>('create');
  const [selectedConfig, setSelectedConfigLocal] = useState<AgentConfig | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffData, setDiffData] = useState<{
    current: AgentConfig;
    new: Partial<AgentConfig>;
  } | null>(null);
  const [bulkOperationDialog, setBulkOperationDialog] = useState(false);
  const [selectedConfigs, setSelectedConfigs] = useState<string[]>([]);
  const [bulkOperation, setBulkOperation] = useState<'enable' | 'disable' | 'delete'>('enable');

  useEffect(() => {
    dispatch(fetchConfigurations());
  }, [dispatch]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCreateConfig = () => {
    setSelectedConfigLocal(null);
    setConfigFormMode('create');
    setConfigFormOpen(true);
  };

  const handleEditConfig = (config: AgentConfig) => {
    setSelectedConfigLocal(config);
    setConfigFormMode('edit');
    setConfigFormOpen(true);
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) {
      return;
    }

    try {
      const response = await fetch(`/api/config/agents/${configId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete configuration');
      }

      dispatch(fetchConfigurations());
    } catch (err) {
      console.error('Failed to delete configuration:', err);
    }
  };

  const handleSaveConfig = async (configData: Partial<SharedAgentConfig>) => {
    try {
      if (configFormMode === 'create') {
        const response = await fetch('/api/config/agents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(configData)
        });

        if (!response.ok) {
          throw new Error('Failed to create configuration');
        }
      } else if (selectedConfig) {
        dispatch(updateConfiguration({ 
          id: selectedConfig.id, 
          config: configData as any
        }));
      }

      setConfigFormOpen(false);
      dispatch(fetchConfigurations());
    } catch (err) {
      console.error('Failed to save configuration:', err);
    }
  };

  const handleToggleConfig = async (configId: string, enabled: boolean) => {
    try {
      dispatch(updateConfiguration({ 
        id: configId, 
        config: { enabled } 
      }));
    } catch (err) {
      console.error('Failed to toggle configuration:', err);
    }
  };

  const handleViewHistory = (config: AgentConfig) => {
    setSelectedConfigLocal(config);
    setHistoryOpen(true);
  };

  const handleRollback = async (version: number, reason: string) => {
    if (!selectedConfig) return;

    try {
      const response = await fetch(`/api/config/agents/${selectedConfig.id}/rollback/${version}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        throw new Error('Failed to rollback configuration');
      }

      dispatch(fetchConfigurations());
      setHistoryOpen(false);
    } catch (err) {
      console.error('Failed to rollback configuration:', err);
    }
  };

  const handleApproveChange = async (approvalId: string, reason: string) => {
    try {
      const response = await fetch(`/api/config/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        throw new Error('Failed to approve change');
      }

      dispatch(fetchConfigurations());
    } catch (err) {
      console.error('Failed to approve change:', err);
    }
  };

  const handleRejectChange = async (approvalId: string, reason: string) => {
    try {
      const response = await fetch(`/api/config/approvals/${approvalId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (!response.ok) {
        throw new Error('Failed to reject change');
      }

      dispatch(fetchConfigurations());
    } catch (err) {
      console.error('Failed to reject change:', err);
    }
  };

  const handleApplyTemplate = (template: any) => {
    setSelectedConfigLocal({
      ...template.config,
      name: `${template.name} - ${new Date().toLocaleDateString()}`,
      type: template.agentType
    } as AgentConfig);
    setConfigFormMode('create');
    setConfigFormOpen(true);
  };

  const handleCreateFromTemplate = (template: any) => {
    handleApplyTemplate(template);
  };

  const handleBulkOperation = async () => {
    if (selectedConfigs.length === 0) return;

    try {
      const promises = selectedConfigs.map(configId => {
        switch (bulkOperation) {
          case 'enable':
          case 'disable':
            return fetch(`/api/config/agents/${configId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: bulkOperation === 'enable' })
            });
          case 'delete':
            return fetch(`/api/config/agents/${configId}`, {
              method: 'DELETE'
            });
          default:
            return Promise.resolve();
        }
      });

      await Promise.all(promises);
      dispatch(fetchConfigurations());
      setSelectedConfigs([]);
      setBulkOperationDialog(false);
    } catch (err) {
      console.error('Bulk operation failed:', err);
    }
  };

  const getAgentTypeColor = (type: string): 'primary' | 'secondary' | 'error' | 'success' | 'default' => {
    const colors = {
      terraform: 'primary' as const,
      kubernetes: 'secondary' as const,
      'incident-response': 'error' as const,
      'cost-optimization': 'success' as const
    };
    return colors[type as keyof typeof colors] || 'default';
  };

  const getAutomationLevelColor = (level: string): 'warning' | 'success' | 'default' => {
    const colors = {
      manual: 'default' as const,
      'semi-auto': 'warning' as const,
      'full-auto': 'success' as const
    };
    return colors[level as keyof typeof colors] || 'default';
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
          Configuration
        </Typography>
        <Paper sx={{ p: 2 }}>
          <Typography color="error">
            Error loading configurations: {error}
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Agent Configuration Management
        </Typography>
        <Box display="flex" gap={2}>
          {selectedConfigs.length > 0 && (
            <Button
              variant="outlined"
              onClick={() => setBulkOperationDialog(true)}
            >
              Bulk Actions ({selectedConfigs.length})
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateConfig}
          >
            Create Agent
          </Button>
        </Box>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="configuration tabs">
          <Tab label={`Agents (${configs.length})`} />
          <Tab label={`Approvals (${pendingApprovals.length})`} />
          <Tab label="Templates" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {configs.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Agent Configurations
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Create your first agent configuration to get started
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateConfig}>
                Create Agent
              </Button>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {configs.map((config) => (
                <Grid item xs={12} md={6} lg={4} key={config.id}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                        <Typography variant="h6" component="div" noWrap>
                          {config.name}
                        </Typography>
                        <Box display="flex" gap={1} flexWrap="wrap">
                          <Chip 
                            label={config.type}
                            color={getAgentTypeColor(config.type)}
                            size="small"
                          />
                          <Chip 
                            label={config.automationLevel}
                            color={getAutomationLevelColor(config.automationLevel)}
                            size="small"
                          />
                        </Box>
                      </Box>

                      <Box display="flex" alignItems="center" gap={2} mb={2}>
                        <Typography variant="body2" color="text.secondary">
                          Status:
                        </Typography>
                        <Switch
                          checked={config.enabled}
                          onChange={(e) => handleToggleConfig(config.id, e.target.checked)}
                          size="small"
                        />
                        <Typography variant="body2" color={config.enabled ? 'success.main' : 'text.secondary'}>
                          {config.enabled ? 'Enabled' : 'Disabled'}
                        </Typography>
                      </Box>

                      <List dense>
                        <ListItem disablePadding>
                          <ListItemText 
                            primary="Approval Required"
                            secondary={config.approvalRequired ? 'Yes' : 'No'}
                          />
                        </ListItem>
                        <ListItem disablePadding>
                          <ListItemText 
                            primary="Integrations"
                            secondary={`${config.integrations.length} configured`}
                          />
                        </ListItem>
                        <ListItem disablePadding>
                          <ListItemText 
                            primary="Last Updated"
                            secondary={new Date(config.updatedAt).toLocaleDateString()}
                          />
                        </ListItem>
                      </List>
                    </CardContent>

                    <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                      <Box display="flex" gap={1}>
                        <Tooltip title="Edit configuration">
                          <IconButton
                            size="small"
                            onClick={() => handleEditConfig(config)}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="View history">
                          <IconButton
                            size="small"
                            onClick={() => handleViewHistory(config)}
                          >
                            <HistoryIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Duplicate configuration">
                          <IconButton
                            size="small"
                            onClick={() => {
                              const configCopy = {
                                ...config,
                                name: `${config.name} (Copy)`
                              };
                              delete (configCopy as any).id;
                              setSelectedConfigLocal(configCopy as AgentConfig);
                              setConfigFormMode('create');
                              setConfigFormOpen(true);
                            }}
                          >
                            <ContentCopyIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete configuration">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteConfig(config.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <ApprovalWorkflow
            pendingApprovals={pendingApprovals.map(approval => ({
              ...approval,
              currentConfig: toSharedAgentConfig(approval.currentConfig)
            }))}
            onApprove={handleApproveChange}
            onReject={handleRejectChange}
            onRefresh={() => dispatch(fetchConfigurations())}
          />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Box textAlign="center" py={4}>
            <Typography variant="h6" color="text.secondary">
              Configuration Templates
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Template functionality will be available soon
            </Typography>
          </Box>
        </TabPanel>
      </Paper>

      {/* Agent Configuration Form Dialog */}
      <AgentConfigForm
        open={configFormOpen}
        onClose={() => setConfigFormOpen(false)}
        onSave={handleSaveConfig}
        config={selectedConfig ? toSharedAgentConfig(selectedConfig) : null}
        mode={configFormMode}
      />

      {/* Configuration History Dialog */}
      {selectedConfig && (
        <ConfigurationHistory
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          agentId={selectedConfig.id}
          currentConfig={selectedConfig ? toSharedAgentConfig(selectedConfig) : {} as SharedAgentConfig}
          onRollback={handleRollback}
        />
      )}

      {/* Configuration Diff Dialog */}
      {diffData && (
        <ConfigurationDiff
          open={diffOpen}
          onClose={() => setDiffOpen(false)}
          onConfirm={() => setDiffOpen(false)}
          currentConfig={toSharedAgentConfig(diffData.current)}
          newConfig={toSharedPartialAgentConfig(diffData.new)}
        />
      )}

      {/* Bulk Operations Dialog */}
      <Dialog open={bulkOperationDialog} onClose={() => setBulkOperationDialog(false)}>
        <DialogTitle>Bulk Operations</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Select operation to perform on {selectedConfigs.length} selected configurations:
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button
              variant={bulkOperation === 'enable' ? 'contained' : 'outlined'}
              onClick={() => setBulkOperation('enable')}
              sx={{ mr: 1, mb: 1 }}
            >
              Enable All
            </Button>
            <Button
              variant={bulkOperation === 'disable' ? 'contained' : 'outlined'}
              onClick={() => setBulkOperation('disable')}
              sx={{ mr: 1, mb: 1 }}
            >
              Disable All
            </Button>
            <Button
              variant={bulkOperation === 'delete' ? 'contained' : 'outlined'}
              color="error"
              onClick={() => setBulkOperation('delete')}
              sx={{ mb: 1 }}
            >
              Delete All
            </Button>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkOperationDialog(false)}>Cancel</Button>
          <Button onClick={handleBulkOperation} variant="contained">
            Execute
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Configuration;