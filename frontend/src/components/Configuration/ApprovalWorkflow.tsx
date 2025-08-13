import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
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
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { AgentConfig } from '../../../../shared/types/src';
import ConfigurationDiff from './ConfigurationDiff';

interface PendingApproval {
  id: string;
  configId: string;
  agentName: string;
  changes: Record<string, any>;
  requestedBy: string;
  requestedAt: string;
  riskLevel: 'low' | 'medium' | 'high';
  reason?: string;
  currentConfig: AgentConfig;
}

interface ApprovalWorkflowProps {
  pendingApprovals: PendingApproval[];
  onApprove: (approvalId: string, reason: string) => void;
  onReject: (approvalId: string, reason: string) => void;
  onRefresh: () => void;
}

const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({
  pendingApprovals,
  onApprove,
  onReject,
  onRefresh
}) => {
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    type: 'approve' | 'reject';
    approval: PendingApproval | null;
  }>({
    open: false,
    type: 'approve',
    approval: null
  });
  const [actionReason, setActionReason] = useState('');

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(onRefresh, 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  const handleViewChanges = (approval: PendingApproval) => {
    setSelectedApproval(approval);
    setShowDiff(true);
  };

  const handleApproveClick = (approval: PendingApproval) => {
    setActionDialog({
      open: true,
      type: 'approve',
      approval
    });
    setActionReason('');
  };

  const handleRejectClick = (approval: PendingApproval) => {
    setActionDialog({
      open: true,
      type: 'reject',
      approval
    });
    setActionReason('');
  };

  const handleActionConfirm = () => {
    if (actionDialog.approval) {
      if (actionDialog.type === 'approve') {
        onApprove(actionDialog.approval.id, actionReason);
      } else {
        onReject(actionDialog.approval.id, actionReason);
      }
    }
    setActionDialog({ open: false, type: 'approve', approval: null });
    setActionReason('');
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getChangesSummary = (changes: Record<string, any>) => {
    const changeCount = Object.keys(changes).length;
    const hasHighRiskChanges = Object.keys(changes).some(key => 
      key === 'automationLevel' || key === 'enabled' || key === 'approvalRequired'
    );
    
    return {
      count: changeCount,
      hasHighRisk: hasHighRiskChanges
    };
  };

  if (pendingApprovals.length === 0) {
    return (
      <Box textAlign="center" py={4}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No Pending Approvals
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All configuration changes have been processed
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">
          Pending Approvals ({pendingApprovals.length})
        </Typography>
        <Button onClick={onRefresh} variant="outlined" size="small">
          Refresh
        </Button>
      </Box>

      <Grid container spacing={2}>
        {pendingApprovals.map((approval) => {
          const changesSummary = getChangesSummary(approval.changes);
          
          return (
            <Grid item xs={12} md={6} lg={4} key={approval.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  border: approval.riskLevel === 'high' ? '2px solid' : '1px solid',
                  borderColor: approval.riskLevel === 'high' ? 'error.main' : 'divider'
                }}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Typography variant="h6" component="div" noWrap>
                      {approval.agentName}
                    </Typography>
                    <Chip 
                      label={approval.riskLevel.toUpperCase()}
                      color={getRiskLevelColor(approval.riskLevel)}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Requested by: {approval.requestedBy}
                  </Typography>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Date: {formatDate(approval.requestedAt)}
                  </Typography>

                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <Typography variant="body2">
                      {changesSummary.count} change{changesSummary.count !== 1 ? 's' : ''}
                    </Typography>
                    {changesSummary.hasHighRisk && (
                      <Chip label="High Risk Changes" color="error" size="small" />
                    )}
                  </Box>

                  {approval.reason && (
                    <Alert severity="info" sx={{ mt: 1, fontSize: '0.875rem' }}>
                      <Typography variant="body2">
                        <strong>Reason:</strong> {approval.reason}
                      </Typography>
                    </Alert>
                  )}
                </CardContent>

                <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
                  <Button
                    size="small"
                    startIcon={<VisibilityIcon />}
                    onClick={() => handleViewChanges(approval)}
                  >
                    View Changes
                  </Button>
                  
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<CloseIcon />}
                      onClick={() => handleRejectClick(approval)}
                    >
                      Reject
                    </Button>
                    <Button
                      size="small"
                      color="success"
                      variant="contained"
                      startIcon={<CheckIcon />}
                      onClick={() => handleApproveClick(approval)}
                    >
                      Approve
                    </Button>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Configuration Diff Dialog */}
      {selectedApproval && (
        <ConfigurationDiff
          open={showDiff}
          onClose={() => setShowDiff(false)}
          onConfirm={() => setShowDiff(false)}
          currentConfig={selectedApproval.currentConfig}
          newConfig={selectedApproval.changes}
          title={`Pending Changes - ${selectedApproval.agentName}`}
        />
      )}

      {/* Approval/Rejection Dialog */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog({ ...actionDialog, open: false })}>
        <DialogTitle>
          {actionDialog.type === 'approve' ? 'Approve' : 'Reject'} Configuration Change
        </DialogTitle>
        <DialogContent>
          {actionDialog.approval && (
            <Box>
              <Typography variant="body1" gutterBottom>
                {actionDialog.type === 'approve' ? 'Approve' : 'Reject'} changes for{' '}
                <strong>{actionDialog.approval.agentName}</strong>?
              </Typography>
              
              <TextField
                fullWidth
                multiline
                rows={3}
                label={`Reason for ${actionDialog.type === 'approve' ? 'approval' : 'rejection'}`}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                margin="normal"
                placeholder={
                  actionDialog.type === 'approve' 
                    ? 'Optional: Provide reason for approval...'
                    : 'Required: Explain why this change is being rejected...'
                }
                required={actionDialog.type === 'reject'}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog({ ...actionDialog, open: false })}>
            Cancel
          </Button>
          <Button
            onClick={handleActionConfirm}
            variant="contained"
            color={actionDialog.type === 'approve' ? 'success' : 'error'}
            disabled={actionDialog.type === 'reject' && !actionReason.trim()}
          >
            {actionDialog.type === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApprovalWorkflow;