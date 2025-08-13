// Import commands.js using ES2015 syntax:
import './commands'
import 'cypress-real-events'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Global error handling
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing the test on uncaught exceptions
  // that might occur during development
  if (err.message.includes('ResizeObserver loop limit exceeded')) {
    return false
  }
  return true
})

// Set up global test data
beforeEach(() => {
  // Mock authentication for all tests
  cy.window().then((win) => {
    win.localStorage.setItem('authToken', 'mock-jwt-token')
    win.localStorage.setItem('user', JSON.stringify({
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'admin'
    }))
  })
})