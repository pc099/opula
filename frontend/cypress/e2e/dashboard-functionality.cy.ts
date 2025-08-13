/// <reference types="cypress" />

describe('Dashboard Functionality', () => {
  beforeEach(() => {
    cy.login('admin', 'password');
    cy.visit('/dashboard');
  });

  describe('Real-time Agent Monitoring', () => {
    it('should display all agent statuses in real-time', () => {
      // Verify all agents are displayed
      cy.get('[data-testid="agent-status-grid"]').should('be.visible');
      cy.get('[data-testid="terraform-agent-card"]').should('exist');
      cy.get('[data-testid="kubernetes-agent-card"]').should('exist');
      cy.get('[data-testid="incident-agent-card"]').should('exist');
      cy.get('[data-testid="cost-agent-card"]').should('exist');

      // Verify real-time updates
      cy.simulateAgentStatusChange('terraform_agent', 'processing');
      cy.get('[data-testid="terraform-agent-status"]').should('contain', 'Processing');
      
      cy.simulateAgentStatusChange('terraform_agent', 'idle');
      cy.get('[data-testid="terraform-agent-status"]').should('contain', 'Idle');
    });

    it('should show agent health metrics and performance data', () => {
      cy.get('[data-testid="terraform-agent-card"]').click();
      
      // Verify detailed metrics
      cy.get('[data-testid="agent-details-modal"]').should('be.visible');
      cy.get('[data-testid="cpu-usage"]').should('exist');
      cy.get('[data-testid="memory-usage"]').should('exist');
      cy.get('[data-testid="actions-completed"]').should('exist');
      cy.get('[data-testid="success-rate"]').should('exist');
      
      // Verify metrics update in real-time
      cy.simulateMetricsUpdate('terraform_agent', { cpu: 45, memory: 60 });
      cy.get('[data-testid="cpu-usage"]').should('contain', '45%');
      cy.get('[data-testid="memory-usage"]').should('contain', '60%');
    });

    it('should filter and search agent activities', () => {
      // Add some test activities
      cy.seedAgentActivities();
      
      // Test filtering by agent type
      cy.get('[data-testid="activity-filter"]').select('terraform');
      cy.get('[data-testid="activity-list"] .activity-item').should('have.length.greaterThan', 0);
      cy.get('[data-testid="activity-list"] .activity-item').each(($el) => {
        cy.wrap($el).should('contain', 'terraform');
      });
      
      // Test filtering by severity
      cy.get('[data-testid="severity-filter"]').select('high');
      cy.get('[data-testid="activity-list"] .activity-item').each(($el) => {
        cy.wrap($el).find('[data-testid="severity-badge"]').should('contain', 'High');
      });
      
      // Test search functionality
      cy.get('[data-testid="activity-search"]').type('drift detection');
      cy.get('[data-testid="activity-list"] .activity-item').should('contain', 'drift detection');
    });
  });

  describe('Infrastructure Topology Visualization', () => {
    it('should display infrastructure topology with real-time updates', () => {
      cy.get('[data-testid="topology-view"]').click();
      
      // Verify topology elements
      cy.get('[data-testid="topology-canvas"]').should('be.visible');
      cy.get('[data-testid="node-aws"]').should('exist');
      cy.get('[data-testid="node-kubernetes"]').should('exist');
      cy.get('[data-testid="connections"]').should('exist');
      
      // Test node interactions
      cy.get('[data-testid="node-aws"]').click();
      cy.get('[data-testid="node-details-panel"]').should('be.visible');
      cy.get('[data-testid="node-details-panel"]').should('contain', 'AWS Resources');
      
      // Verify real-time updates
      cy.simulateTopologyChange('add_node', { type: 'database', id: 'db-1' });
      cy.get('[data-testid="node-db-1"]').should('exist');
    });

    it('should show resource relationships and dependencies', () => {
      cy.get('[data-testid="topology-view"]').click();
      
      // Verify dependency lines
      cy.get('[data-testid="dependency-line"]').should('have.length.greaterThan', 0);
      
      // Test dependency highlighting
      cy.get('[data-testid="node-web-app"]').trigger('mouseover');
      cy.get('[data-testid="highlighted-dependencies"]').should('be.visible');
      
      // Test impact analysis
      cy.get('[data-testid="node-database"]').rightclick();
      cy.get('[data-testid="context-menu"]').should('be.visible');
      cy.get('[data-testid="show-impact"]').click();
      cy.get('[data-testid="impact-analysis"]').should('be.visible');
      cy.get('[data-testid="affected-services"]').should('contain', 'web-app');
    });
  });

  describe('Incident Management Interface', () => {
    it('should display incident timeline with severity indicators', () => {
      cy.visit('/incidents');
      
      // Seed test incidents
      cy.seedTestIncidents();
      
      // Verify incident timeline
      cy.get('[data-testid="incident-timeline"]').should('be.visible');
      cy.get('[data-testid="incident-item"]').should('have.length.greaterThan', 0);
      
      // Verify severity indicators
      cy.get('[data-testid="incident-item"]').first().within(() => {
        cy.get('[data-testid="severity-indicator"]').should('exist');
        cy.get('[data-testid="incident-title"]').should('exist');
        cy.get('[data-testid="incident-timestamp"]').should('exist');
      });
      
      // Test incident filtering
      cy.get('[data-testid="severity-filter"]').select('critical');
      cy.get('[data-testid="incident-item"]').each(($el) => {
        cy.wrap($el).find('[data-testid="severity-indicator"]').should('have.class', 'critical');
      });
    });

    it('should show detailed incident views with resolution steps', () => {
      cy.visit('/incidents');
      cy.seedTestIncidents();
      
      // Click on first incident
      cy.get('[data-testid="incident-item"]').first().click();
      
      // Verify incident details
      cy.get('[data-testid="incident-details-modal"]').should('be.visible');
      cy.get('[data-testid="incident-description"]').should('exist');
      cy.get('[data-testid="affected-resources"]').should('exist');
      cy.get('[data-testid="resolution-steps"]').should('exist');
      cy.get('[data-testid="incident-timeline"]').should('exist');
      
      // Test manual incident creation
      cy.get('[data-testid="create-incident-button"]').click();
      cy.get('[data-testid="incident-form"]').should('be.visible');
      
      cy.get('[data-testid="incident-title-input"]').type('Test Incident');
      cy.get('[data-testid="incident-description-input"]').type('Test incident description');
      cy.get('[data-testid="severity-select"]').select('medium');
      cy.get('[data-testid="affected-resources-input"]').type('web-app, database');
      
      cy.get('[data-testid="create-incident-submit"]').click();
      cy.get('[data-testid="incident-created-notification"]').should('be.visible');
    });

    it('should handle incident escalation controls', () => {
      cy.visit('/incidents');
      cy.seedTestIncidents();
      
      // Open incident details
      cy.get('[data-testid="incident-item"]').first().click();
      
      // Test escalation
      cy.get('[data-testid="escalate-button"]').click();
      cy.get('[data-testid="escalation-form"]').should('be.visible');
      
      cy.get('[data-testid="escalation-reason"]').type('Requires senior engineer review');
      cy.get('[data-testid="escalation-priority"]').select('high');
      cy.get('[data-testid="escalate-submit"]').click();
      
      cy.get('[data-testid="escalation-success"]').should('be.visible');
      cy.get('[data-testid="incident-status"]').should('contain', 'Escalated');
    });
  });

  describe('Cost Optimization Dashboard', () => {
    it('should display cost trends and optimization recommendations', () => {
      cy.visit('/cost-optimization');
      
      // Verify cost trend charts
      cy.get('[data-testid="cost-trend-chart"]').should('be.visible');
      cy.get('[data-testid="savings-chart"]').should('be.visible');
      cy.get('[data-testid="cost-breakdown-chart"]').should('be.visible');
      
      // Verify optimization recommendations
      cy.get('[data-testid="recommendations-panel"]').should('be.visible');
      cy.get('[data-testid="recommendation-item"]').should('have.length.greaterThan', 0);
      
      // Test recommendation interaction
      cy.get('[data-testid="recommendation-item"]').first().within(() => {
        cy.get('[data-testid="recommendation-title"]').should('exist');
        cy.get('[data-testid="potential-savings"]').should('exist');
        cy.get('[data-testid="apply-recommendation"]').should('exist');
      });
    });

    it('should track savings and ROI calculations', () => {
      cy.visit('/cost-optimization');
      
      // Verify savings tracking
      cy.get('[data-testid="total-savings"]').should('exist');
      cy.get('[data-testid="monthly-savings"]').should('exist');
      cy.get('[data-testid="roi-percentage"]').should('exist');
      
      // Test savings breakdown
      cy.get('[data-testid="savings-breakdown"]').click();
      cy.get('[data-testid="savings-by-service"]').should('be.visible');
      cy.get('[data-testid="savings-by-optimization-type"]').should('be.visible');
      
      // Test time range filtering
      cy.get('[data-testid="time-range-selector"]').select('last-30-days');
      cy.get('[data-testid="cost-trend-chart"]').should('be.visible');
      
      cy.get('[data-testid="time-range-selector"]').select('last-90-days');
      cy.get('[data-testid="cost-trend-chart"]').should('be.visible');
    });

    it('should manage cost budget alerts and thresholds', () => {
      cy.visit('/cost-optimization');
      
      // Navigate to budget settings
      cy.get('[data-testid="budget-settings"]').click();
      cy.get('[data-testid="budget-form"]').should('be.visible');
      
      // Set budget threshold
      cy.get('[data-testid="monthly-budget"]').clear().type('5000');
      cy.get('[data-testid="alert-threshold"]').clear().type('80');
      cy.get('[data-testid="save-budget"]').click();
      
      cy.get('[data-testid="budget-saved"]').should('be.visible');
      
      // Verify budget alerts
      cy.get('[data-testid="budget-status"]').should('contain', '$5,000');
      cy.get('[data-testid="alert-threshold-display"]').should('contain', '80%');
    });
  });

  describe('Agent Configuration Management', () => {
    it('should provide configuration forms with validation', () => {
      cy.visit('/configuration');
      
      // Select agent to configure
      cy.get('[data-testid="agent-selector"]').select('terraform_agent');
      cy.get('[data-testid="config-form"]').should('be.visible');
      
      // Test form validation
      cy.get('[data-testid="automation-level"]').select('full-auto');
      cy.get('[data-testid="approval-threshold"]').clear();
      cy.get('[data-testid="save-config"]').click();
      
      cy.get('[data-testid="validation-error"]').should('contain', 'Approval threshold is required');
      
      // Fill valid configuration
      cy.get('[data-testid="approval-threshold"]').type('high');
      cy.get('[data-testid="max-concurrent-actions"]').clear().type('3');
      cy.get('[data-testid="save-config"]').click();
      
      cy.get('[data-testid="config-saved"]').should('be.visible');
    });

    it('should show configuration diff and rollback functionality', () => {
      cy.visit('/configuration');
      
      // Make configuration change
      cy.get('[data-testid="agent-selector"]').select('kubernetes_agent');
      cy.get('[data-testid="scaling-threshold"]').clear().type('85');
      cy.get('[data-testid="save-config"]').click();
      
      // View configuration history
      cy.get('[data-testid="config-history"]').click();
      cy.get('[data-testid="config-version"]').should('have.length.greaterThan', 1);
      
      // View diff
      cy.get('[data-testid="config-version"]').first().within(() => {
        cy.get('[data-testid="view-diff"]').click();
      });
      
      cy.get('[data-testid="config-diff"]').should('be.visible');
      cy.get('[data-testid="diff-added"]').should('contain', '85');
      cy.get('[data-testid="diff-removed"]').should('exist');
      
      // Test rollback
      cy.get('[data-testid="rollback-button"]').click();
      cy.get('[data-testid="rollback-confirmation"]').should('be.visible');
      cy.get('[data-testid="confirm-rollback"]').click();
      
      cy.get('[data-testid="rollback-success"]').should('be.visible');
    });

    it('should handle approval workflow interface', () => {
      cy.visit('/configuration');
      
      // Configure high-risk action requiring approval
      cy.get('[data-testid="agent-selector"]').select('terraform_agent');
      cy.get('[data-testid="auto-apply-destructive"]').check();
      cy.get('[data-testid="save-config"]').click();
      
      // Verify approval request created
      cy.get('[data-testid="approval-required"]').should('be.visible');
      
      // Navigate to approvals
      cy.visit('/approvals');
      cy.get('[data-testid="pending-approval"]').should('exist');
      
      // Review and approve
      cy.get('[data-testid="pending-approval"]').first().click();
      cy.get('[data-testid="approval-details"]').should('be.visible');
      cy.get('[data-testid="approve-button"]').click();
      
      cy.get('[data-testid="approval-reason"]').type('Approved for testing environment');
      cy.get('[data-testid="confirm-approval"]').click();
      
      cy.get('[data-testid="approval-success"]').should('be.visible');
    });
  });

  describe('WebSocket Real-time Updates', () => {
    it('should receive and display real-time updates', () => {
      // Verify WebSocket connection
      cy.window().its('WebSocket').should('exist');
      
      // Simulate real-time event
      cy.simulateWebSocketMessage({
        type: 'agent_status_update',
        data: {
          agent_id: 'terraform_agent',
          status: 'processing',
          action: 'drift_detection'
        }
      });
      
      // Verify UI updates
      cy.get('[data-testid="terraform-agent-status"]').should('contain', 'Processing');
      cy.get('[data-testid="current-action"]').should('contain', 'drift_detection');
      
      // Test connection resilience
      cy.simulateWebSocketDisconnect();
      cy.get('[data-testid="connection-status"]').should('contain', 'Reconnecting');
      
      cy.simulateWebSocketReconnect();
      cy.get('[data-testid="connection-status"]').should('contain', 'Connected');
    });
  });

  afterEach(() => {
    cy.cleanupTestData();
  });
});