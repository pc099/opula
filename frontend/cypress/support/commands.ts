/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      login(email?: string, password?: string): Chainable<void>
      mockApiResponse(endpoint: string, response: any, method?: string): Chainable<void>
      waitForAgentStatus(): Chainable<void>
      createTestIncident(incident: any): Chainable<void>
      waitForRealTimeUpdate(): Chainable<void>
      
      // Test Data Management
      resetTestData(): Chainable<void>
      cleanupTestData(): Chainable<void>
      seedTestData(options: any): Chainable<void>
      seedAgentActivities(): Chainable<void>
      seedTestIncidents(): Chainable<void>
      seedLargeDataset(options: any): Chainable<void>
      
      // Event Simulation
      simulateEvent(event: any): Chainable<void>
      simulateEventBatch(events: any[]): Chainable<void>
      simulateMetrics(metrics: any): Chainable<void>
      simulateIncident(incident: any): Chainable<void>
      simulateResourceUsage(usage: any): Chainable<void>
      simulateComplexScenario(scenario: any): Chainable<void>
      
      // Agent Management
      simulateAgentStatusChange(agentId: string, status: string): Chainable<void>
      simulateAgentAction(agentId: string, action: string, options?: any): Chainable<void>
      waitForAgentAction(agentId: string, action: string, options?: any): Chainable<void>
      waitForAllAgentActions(agentIds: string[], options?: any): Chainable<void>
      
      // Performance Testing
      startContinuousEventStream(options: any): Chainable<void>
      stopContinuousEventStream(): Chainable<void>
      startContinuousDataUpdates(options: any): Chainable<void>
      stopContinuousDataUpdates(): Chainable<void>
      simulateHighLoad(options: any): Chainable<void>
      cleanupPerformanceTestData(): Chainable<void>
      stopAllContinuousStreams(): Chainable<void>
      
      // WebSocket Testing
      simulateWebSocketMessage(message: any): Chainable<void>
      simulateWebSocketDisconnect(): Chainable<void>
      simulateWebSocketReconnect(): Chainable<void>
      startHighFrequencyWebSocketStream(options: any): Chainable<void>
      waitForWebSocketMessages(count: number, options?: any): Chainable<void>
      startContinuousWebSocketStream(): Chainable<void>
      stopContinuousWebSocketStream(): Chainable<void>
      
      // Resource Monitoring
      startResourceMonitoring(): Chainable<void>
      stopResourceMonitoring(): Chainable<void>
      getResourceUsage(): Chainable<any>
      
      // Topology Testing
      simulateTopologyChange(changeType: string, data: any): Chainable<void>
      simulateMetricsUpdate(agentId: string, metrics: any): Chainable<void>
      
      // Disaster Recovery Testing
      cleanupDisasterRecoveryTests(): Chainable<void>
      restoreAllServices(): Chainable<void>
      waitForOperation(operationId: string, status: string, options?: any): Chainable<void>
      waitForRecoveryCompletion(service: string, options?: any): Chainable<void>
    }
  }
}

// Custom command for login
Cypress.Commands.add('login', (email = 'test@example.com', password = 'testpassword123') => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/auth/login`,
    body: { email, password },
    failOnStatusCode: false
  }).then((response) => {
    if (response.status === 200) {
      cy.window().then((win) => {
        win.localStorage.setItem('authToken', response.body.token)
        win.localStorage.setItem('user', JSON.stringify(response.body.user))
      })
    }
  })
})

// Mock API responses for testing
Cypress.Commands.add('mockApiResponse', (endpoint: string, response: any, method = 'GET') => {
  cy.intercept(method, `${Cypress.env('apiUrl')}${endpoint}`, response).as(`mock${endpoint.replace(/\//g, '_')}`)
})

// Wait for agent status to load
Cypress.Commands.add('waitForAgentStatus', () => {
  cy.get('[data-testid="agent-status-card"]').should('be.visible')
  cy.get('[data-testid="loading-spinner"]').should('not.exist')
})

// Create test incident
Cypress.Commands.add('createTestIncident', (incident: any) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/incidents`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`
    },
    body: incident
  })
})

// Wait for real-time updates
Cypress.Commands.add('waitForRealTimeUpdate', () => {
  cy.wait(1000) // Allow time for WebSocket updates
  cy.get('[data-testid="real-time-indicator"]').should('contain', 'Connected')
})
// T
est Data Management Commands
Cypress.Commands.add('resetTestData', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/reset-data`)
})

Cypress.Commands.add('cleanupTestData', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/cleanup`)
})

Cypress.Commands.add('seedTestData', (options: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/seed`, options)
})

Cypress.Commands.add('seedAgentActivities', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/seed-activities`)
})

Cypress.Commands.add('seedTestIncidents', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/seed-incidents`)
})

Cypress.Commands.add('seedLargeDataset', (options: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/seed-large-dataset`, options)
})

// Event Simulation Commands
Cypress.Commands.add('simulateEvent', (event: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-event`, event)
})

Cypress.Commands.add('simulateEventBatch', (events: any[]) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-event-batch`, { events })
})

Cypress.Commands.add('simulateMetrics', (metrics: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-metrics`, metrics)
})

Cypress.Commands.add('simulateIncident', (incident: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-incident`, incident)
})

Cypress.Commands.add('simulateResourceUsage', (usage: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-resource-usage`, usage)
})

Cypress.Commands.add('simulateComplexScenario', (scenario: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-complex-scenario`, scenario)
})

// Agent Management Commands
Cypress.Commands.add('simulateAgentStatusChange', (agentId: string, status: string) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/agent-status/${agentId}`, { status })
})

Cypress.Commands.add('simulateAgentAction', (agentId: string, action: string, options: any = {}) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/agent-action/${agentId}`, { action, ...options })
})

Cypress.Commands.add('waitForAgentAction', (agentId: string, action: string, options: any = {}) => {
  const timeout = options.timeout || 30000
  cy.request({
    method: 'GET',
    url: `${Cypress.env('apiUrl')}/admin/test/wait-for-action/${agentId}/${action}`,
    timeout
  })
})

Cypress.Commands.add('waitForAllAgentActions', (agentIds: string[], options: any = {}) => {
  const timeout = options.timeout || 30000
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/admin/test/wait-for-all-actions`,
    body: { agentIds },
    timeout
  })
})

// Performance Testing Commands
Cypress.Commands.add('startContinuousEventStream', (options: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/start-event-stream`, options)
})

Cypress.Commands.add('stopContinuousEventStream', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/stop-event-stream`)
})

Cypress.Commands.add('startContinuousDataUpdates', (options: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/start-data-updates`, options)
})

Cypress.Commands.add('stopContinuousDataUpdates', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/stop-data-updates`)
})

Cypress.Commands.add('simulateHighLoad', (options: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/simulate-high-load`, options)
})

Cypress.Commands.add('cleanupPerformanceTestData', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/cleanup-performance-data`)
})

Cypress.Commands.add('stopAllContinuousStreams', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/stop-all-streams`)
})

// WebSocket Testing Commands
Cypress.Commands.add('simulateWebSocketMessage', (message: any) => {
  cy.window().then((win: any) => {
    if (win.testWebSocket) {
      win.testWebSocket.simulateMessage(message)
    }
  })
})

Cypress.Commands.add('simulateWebSocketDisconnect', () => {
  cy.window().then((win: any) => {
    if (win.testWebSocket) {
      win.testWebSocket.simulateDisconnect()
    }
  })
})

Cypress.Commands.add('simulateWebSocketReconnect', () => {
  cy.window().then((win: any) => {
    if (win.testWebSocket) {
      win.testWebSocket.simulateReconnect()
    }
  })
})

Cypress.Commands.add('startHighFrequencyWebSocketStream', (options: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/start-websocket-stream`, options)
})

Cypress.Commands.add('waitForWebSocketMessages', (count: number, options: any = {}) => {
  const timeout = options.timeout || 30000
  cy.request({
    method: 'GET',
    url: `${Cypress.env('apiUrl')}/admin/test/wait-for-websocket-messages/${count}`,
    timeout
  })
})

Cypress.Commands.add('startContinuousWebSocketStream', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/start-continuous-websocket-stream`)
})

Cypress.Commands.add('stopContinuousWebSocketStream', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/stop-continuous-websocket-stream`)
})

// Resource Monitoring Commands
Cypress.Commands.add('startResourceMonitoring', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/start-resource-monitoring`)
})

Cypress.Commands.add('stopResourceMonitoring', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/stop-resource-monitoring`)
})

Cypress.Commands.add('getResourceUsage', () => {
  return cy.request('GET', `${Cypress.env('apiUrl')}/admin/test/resource-usage`).then((response) => response.body)
})

// Topology Testing Commands
Cypress.Commands.add('simulateTopologyChange', (changeType: string, data: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/topology-change`, { changeType, data })
})

Cypress.Commands.add('simulateMetricsUpdate', (agentId: string, metrics: any) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/metrics-update/${agentId}`, metrics)
})

// Disaster Recovery Testing Commands
Cypress.Commands.add('cleanupDisasterRecoveryTests', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/cleanup-disaster-recovery`)
})

Cypress.Commands.add('restoreAllServices', () => {
  cy.request('POST', `${Cypress.env('apiUrl')}/admin/test/restore-all-services`)
})

Cypress.Commands.add('waitForOperation', (operationId: string, status: string, options: any = {}) => {
  const timeout = options.timeout || 60000
  cy.request({
    method: 'GET',
    url: `${Cypress.env('apiUrl')}/operations/${operationId}/wait-for-status/${status}`,
    timeout
  })
})

Cypress.Commands.add('waitForRecoveryCompletion', (service: string, options: any = {}) => {
  const timeout = options.timeout || 60000
  cy.request({
    method: 'GET',
    url: `${Cypress.env('apiUrl')}/admin/recovery/wait-for-completion/${service}`,
    timeout
  })
})