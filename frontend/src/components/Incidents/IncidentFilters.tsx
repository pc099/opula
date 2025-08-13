import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  TextField,
  Button,
  Grid,
  Collapse,
  IconButton,
  OutlinedInput,
  SelectChangeEvent,
} from '@mui/material';
import {
  FilterList as FilterIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Incident } from '../../store/slices/incidentsSlice';

interface IncidentFiltersProps {
  filters: {
    severity: string[];
    status: string[];
    dateRange: {
      start: string | null;
      end: string | null;
    };
    search: string;
    automatedOnly: boolean;
  };
  onFiltersChange: (filters: any) => void;
  onClearFilters: () => void;
  incidentCount: number;
}

const severityOptions = [
  { value: 'critical', label: 'Critical', color: 'error' as const },
  { value: 'high', label: 'High', color: 'warning' as const },
  { value: 'medium', label: 'Medium', color: 'info' as const },
  { value: 'low', label: 'Low', color: 'success' as const },
];

const statusOptions = [
  { value: 'open', label: 'Open', color: 'error' as const },
  { value: 'investigating', label: 'Investigating', color: 'warning' as const },
  { value: 'resolved', label: 'Resolved', color: 'success' as const },
  { value: 'closed', label: 'Closed', color: 'default' as const },
];

const IncidentFilters: React.FC<IncidentFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  incidentCount,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState(filters.search || '');

  const handleSeverityChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value as string[];
    onFiltersChange({
      ...filters,
      severity: value,
    });
  };

  const handleStatusChange = (event: SelectChangeEvent<string[]>) => {
    const value = event.target.value as string[];
    onFiltersChange({
      ...filters,
      status: value,
    });
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSearchSubmit = () => {
    onFiltersChange({
      ...filters,
      search: searchTerm,
    });
  };

  const handleSearchKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const handleDateRangeChange = (field: 'start' | 'end', date: Date | null) => {
    onFiltersChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [field]: date ? date.toISOString() : null,
      },
    });
  };

  const handleAutomatedToggle = () => {
    onFiltersChange({
      ...filters,
      automatedOnly: !filters.automatedOnly,
    });
  };

  const hasActiveFilters = 
    filters.severity.length > 0 ||
    filters.status.length > 0 ||
    filters.dateRange.start ||
    filters.dateRange.end ||
    filters.search ||
    filters.automatedOnly;

  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h6">
            Incident Filters
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ({incidentCount} incidents)
          </Typography>
          {hasActiveFilters && (
            <Chip
              label={`${Object.values(filters).flat().filter(Boolean).length} active`}
              color="primary"
              size="small"
            />
          )}
        </Box>
        
        <Box display="flex" gap={1}>
          {hasActiveFilters && (
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={onClearFilters}
            >
              Clear All
            </Button>
          )}
          <IconButton
            onClick={() => setExpanded(!expanded)}
            size="small"
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>

      {/* Search Bar - Always Visible */}
      <Box display="flex" gap={2} mb={2}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search incidents by title, description, or affected resources..."
          value={searchTerm}
          onChange={handleSearchChange}
          onKeyPress={handleSearchKeyPress}
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
        />
        <Button
          variant="outlined"
          onClick={handleSearchSubmit}
          disabled={searchTerm === filters.search}
        >
          Search
        </Button>
      </Box>

      <Collapse in={expanded}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={2}>
            {/* Severity Filter */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Severity</InputLabel>
                <Select
                  multiple
                  value={filters.severity}
                  onChange={handleSeverityChange}
                  input={<OutlinedInput label="Severity" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => {
                        const option = severityOptions.find(opt => opt.value === value);
                        return (
                          <Chip
                            key={value}
                            label={option?.label}
                            color={option?.color}
                            size="small"
                          />
                        );
                      })}
                    </Box>
                  )}
                >
                  {severityOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Chip
                        label={option.label}
                        color={option.color}
                        size="small"
                        variant="outlined"
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Status Filter */}
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  multiple
                  value={filters.status}
                  onChange={handleStatusChange}
                  input={<OutlinedInput label="Status" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {(selected as string[]).map((value) => {
                        const option = statusOptions.find(opt => opt.value === value);
                        return (
                          <Chip
                            key={value}
                            label={option?.label}
                            color={option?.color}
                            size="small"
                            variant="outlined"
                          />
                        );
                      })}
                    </Box>
                  )}
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Chip
                        label={option.label}
                        color={option.color}
                        size="small"
                        variant="outlined"
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Date Range */}
            <Grid item xs={12} sm={6} md={3}>
              <DatePicker
                label="Start Date"
                value={filters.dateRange.start ? new Date(filters.dateRange.start) : null}
                onChange={(date) => handleDateRangeChange('start', date)}
                slotProps={{
                  textField: {
                    size: 'small',
                    fullWidth: true,
                  },
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <DatePicker
                label="End Date"
                value={filters.dateRange.end ? new Date(filters.dateRange.end) : null}
                onChange={(date) => handleDateRangeChange('end', date)}
                slotProps={{
                  textField: {
                    size: 'small',
                    fullWidth: true,
                  },
                }}
              />
            </Grid>

            {/* Additional Filters */}
            <Grid item xs={12}>
              <Box display="flex" gap={2}>
                <Button
                  variant={filters.automatedOnly ? 'contained' : 'outlined'}
                  size="small"
                  onClick={handleAutomatedToggle}
                >
                  Automated Only
                </Button>
              </Box>
            </Grid>
          </Grid>
        </LocalizationProvider>
      </Collapse>
    </Paper>
  );
};

export default IncidentFilters;