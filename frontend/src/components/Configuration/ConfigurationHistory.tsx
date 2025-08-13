import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { AgentConfig } from '../../../../shared/types/src';
import ConfigurationDiff from './ConfigurationDiff';

interface ConfigurationHistoryProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  currentConfig: AgentConfig;
  onRollback: (version: number, reason: string) => void;
}

interface ConfigurationVersion {
  version: number;
  config: AgentConfig;
  changedBy: string;
  changedAt: string;
  reason?: string;
  rollbackReason?: string;
}

const ConfigurationHistory: React.FC<ConfigurationHistoryProps> = ({
  open,
  onClose,
  agentId,
  currentConfig,
  onRollback
}) => {
  const [history, setHistory] = useState<ConfigurationVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ConfigurationVersion | null>(null);
  const [showDiff, setShowDiff] = useState(false);


  useEffect(() => {
    if (open && agentId) {
      fetchHistory();
    }
  }, [open, agentId]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/config/agents/${agentId}/history`);
      if (!response.ok) {
        throw new Error('Failed to fetch configuration history');
      }
      
      const data = await response.json();
      setHistory(data.versions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDiff = (version: ConfigurationVersion) => {
    setSelectedVersion(version);
    setShowDiff(true);
  };

  const handleRollback = async (version: number) => {
    const reason = prompt('Please provide a reason for this rollback:');
    if (reason) {
      onRollback(version, reason);
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getVersionStatus = (version: ConfigurationVersion) => {
    if (version.rollbackReason) {
      return <Chip label="Rolled Back" color="error" size="small" />;
    }
    if (version.version === 1) {
      return <Chip label="Initial" color="primary" size="small" />;
    }
    return <Chip label="Applied" color="success" size="small" />;
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          Configuration History - {currentConfig.name}
        </DialogTitle>
        <DialogContent>
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                View and rollback to previous configuration versions
              </Typography>
              
              {history.length === 0 ? (
                <Box textAlign="center" py={4}>
                  <Typography variant="body1" color="text.secondary">
                    No configuration history available
                  </Typography>
                </Box>
              ) : (
                <List>
                  {history.map((version) => (
                    <ListItem key={version.version} divider>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={2}>
                            <Typography variant="subtitle1">
                              Version {version.version}
                            </Typography>
                            {getVersionStatus(version)}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              Changed by: {version.changedBy}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Date: {formatDate(version.changedAt)}
                            </Typography>
                            {version.reason && (
                              <Typography variant="body2" color="text.secondary">
                                Reason: {version.reason}
                              </Typography>
                            )}
                            {version.rollbackReason && (
                              <Typography variant="body2" color="error.main">
                                Rollback Reason: {version.rollbackReason}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Box display="flex" gap={1}>
                          <Tooltip title="View Changes">
                            <IconButton
                              edge="end"
                              onClick={() => handleViewDiff(version)}
                              size="small"
                            >
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
                          {version.version !== history[0]?.version && (
                            <Tooltip title="Rollback to this version">
                              <IconButton
                                edge="end"
                                onClick={() => handleRollback(version.version)}
                                size="small"
                                color="warning"
                              >
                                <RestoreIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      {selectedVersion && (
        <ConfigurationDiff
          open={showDiff}
          onClose={() => setShowDiff(false)}
          onConfirm={() => setShowDiff(false)}
          currentConfig={currentConfig}
          newConfig={selectedVersion.config}
          title={`Configuration Diff - Version ${selectedVersion.version}`}
        />
      )}
    </>
  );
};

export default ConfigurationHistory;