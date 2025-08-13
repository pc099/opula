# End-to-End Testing Guide

This document provides comprehensive guidance for running end-to-end tests for the AIOps Platform.

## Overview

The AIOps Platform includes comprehensive end-to-end testing that validates:

- **Complete automation workflows** from event detection to resolution
- **Dashboard functionality** and user interactions using Cypress
- **Performance tests** for high-volume event processing scenarios
- **Disaster recovery** and backup/restore tests for data persistence

## Test Categories

### 1. Frontend E2E Tests (Cypress)

Located in `frontend/cypress/e2e/`, these tests validate:

- **Automation Workflows** (`automation-workflows.cy.ts`)
  - Terraform drift detection and resolution
  - Kubernetes predictive scaling
  - Incident response automation
  - Cost optimization workflows
  - Multi-agent coordination

- **Dashboard Functionality** (`dashboard-functionality.cy.ts`)
  - Real-time agent monitoring
  - Infrastructure topology visualization
  - Incident management interface
  - Cost optimization dashboard
  - Agent configuration management

- **Performance Tests** (`performance-tests.cy.ts`)
  - High-volume agent status updates
  - Rapid incident processing
  - Real-time WebSocket message bursts
  - Large topology visualization
  - Memory usage monitoring

- **Disaster Recovery** (`disaster-recovery.cy.ts`)
  - Service failure recovery
  - Data backup and restore workflows
  - Automated recovery scenarios
  - Data consistency validation

- **Complete System Validation** (`complete-system-validation.cy.ts`)
  - System health monitoring
  - Security and authentication
  - Data validation and integrity
  - Integration validation
  - Compliance and audit validation

### 2. Backend Disaster Recovery Tests

Located in `backend/src/__tests__/disaster-recovery.test.ts`, these tests validate:

- Database backup creation, validation, and restoration
- Redis data persistence and recovery
- Service failure detection and automated recovery
- Data consistency during partial failures
- Automated recovery procedure execution

### 3. Agent Integration Tests

Located in `agents/src/tests/`, these tests validate:

- AI agent decision algorithms
- ML model accuracy and performance
- Agent coordination and conflict resolution
- External API integrations

## Running Tests

### Prerequisites

1. **System Requirements**:
   - Node.js 18+
   - Python 3.8+
   - Docker and Docker Compose
   - Chrome browser (for Cypress)

2. **Environment Setup**:
   ```bash
   # Install dependencies
   npm install
   
   # Start services
   docker-compose up -d
   
   # Run database migrations
   npm run migrate --workspace=backend
   ```

### Quick Start

Run all end-to-end tests:
```bash
npm run test:e2e
```

### Individual Test Categories

Run specific test categories:

```bash
# Frontend tests only
npm run test:e2e:frontend

# Backend disaster recovery tests only
npm run test:e2e:backend

# Agent tests only
npm run test:e2e:agents

# Integration tests only
npm run test:e2e:integration
```

### Frontend-Specific Tests

```bash
# All frontend E2E tests
cd frontend && npm run test:e2e:complete

# Specific test suites
npm run test:e2e:automation      # Automation workflows
npm run test:e2e:dashboard       # Dashboard functionality
npm run test:e2e:performance     # Performance tests
npm run test:e2e:disaster-recovery # Disaster recovery
npm run test:e2e:validation      # System validation

# Interactive mode
npm run cypress:open
```

### Backend-Specific Tests

```bash
# Disaster recovery tests
cd backend && npm run test:disaster-recovery

# Integration tests
npm run test:integration

# All backend tests
npm test
```

### Agent-Specific Tests

```bash
# All agent tests
cd agents && python -m pytest src/tests/ -v

# Specific agent tests
python -m pytest src/tests/test_terraform_agent.py -v
python -m pytest src/tests/test_kubernetes_agent.py -v
python -m pytest src/tests/test_incident_response_agent.py -v
python -m pytest src/tests/test_cost_optimization_agent.py -v
```

## Test Configuration

### Cypress Configuration

Located in `frontend/cypress.config.ts`:

```typescript
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    env: {
      apiUrl: 'http://localhost:3000/api'
    }
  }
})
```

### Environment Variables

Create `.env` files for test configuration:

```bash
# backend/.env.test
DATABASE_URL=postgresql://postgres:password@localhost:5432/aiops_test
REDIS_URL=redis://localhost:6379/1
ELASTICSEARCH_URL=http://localhost:9200

# frontend/.env.test
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000
```

## Test Reports

### Report Locations

- **Frontend Reports**: `frontend/cypress/reports/`
- **Backend Reports**: `backend/src/reports/`
- **Complete Reports**: `scripts/reports/`

### Report Types

1. **HTML Reports**: Visual test results with screenshots and videos
2. **JSON Reports**: Machine-readable test results
3. **Coverage Reports**: Code coverage analysis
4. **Performance Reports**: Performance metrics and benchmarks

### Viewing Reports

After running tests, open the HTML reports:

```bash
# Complete test report
open scripts/reports/complete-e2e-results.html

# Frontend test reports
open frontend/cypress/reports/summary.html

# Backend test reports
open backend/src/reports/disaster-recovery-results.html
```

## Troubleshooting

### Common Issues

1. **Services Not Starting**:
   ```bash
   # Check Docker services
   docker-compose ps
   
   # View logs
   docker-compose logs
   
   # Restart services
   docker-compose down && docker-compose up -d
   ```

2. **Database Connection Issues**:
   ```bash
   # Check database connectivity
   docker exec aiops-postgres pg_isready -U postgres
   
   # Run migrations
   npm run migrate --workspace=backend
   ```

3. **Port Conflicts**:
   ```bash
   # Check port usage
   netstat -tulpn | grep :3000
   netstat -tulpn | grep :5173
   
   # Kill processes if needed
   pkill -f "node.*3000"
   ```

4. **Cypress Issues**:
   ```bash
   # Clear Cypress cache
   npx cypress cache clear
   
   # Verify Cypress installation
   npx cypress verify
   
   # Run in headed mode for debugging
   npx cypress open
   ```

### Performance Optimization

1. **Parallel Test Execution**:
   ```bash
   # Run tests in parallel
   npx cypress run --record --parallel
   ```

2. **Test Isolation**:
   - Each test suite runs in isolation
   - Database is reset between test suites
   - Redis cache is cleared between tests

3. **Resource Management**:
   - Tests automatically clean up resources
   - Docker containers are stopped after tests
   - Temporary files are removed

## Continuous Integration

### GitHub Actions

Example workflow (`.github/workflows/e2e-tests.yml`):

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.8'
          
      - name: Install dependencies
        run: npm install
        
      - name: Start services
        run: docker-compose up -d
        
      - name: Wait for services
        run: npm run wait-for-services
        
      - name: Run E2E tests
        run: npm run test:e2e
        
      - name: Upload test reports
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-reports
          path: |
            scripts/reports/
            frontend/cypress/reports/
            backend/src/reports/
```

## Requirements Coverage

The end-to-end tests validate the following requirements:

### Requirement 1.1, 1.2, 1.3, 1.4
- ✅ Dashboard functionality and user interactions
- ✅ Real-time monitoring and visualization
- ✅ Incident management interface
- ✅ Cost optimization dashboard

### Requirement 2.4, 3.4, 4.4, 5.4
- ✅ Agent decision algorithms and ML model performance
- ✅ Terraform drift prediction and resolution
- ✅ Kubernetes scaling algorithms
- ✅ Incident classification and response
- ✅ Cost optimization recommendations

### Requirement 1.2, 2.3, 3.3, 4.3
- ✅ Event coordination and agent integration
- ✅ Multi-agent workflow execution
- ✅ Conflict resolution and prioritization
- ✅ External system integrations

### Data Persistence and Recovery
- ✅ Backup and restore procedures
- ✅ Disaster recovery scenarios
- ✅ Data consistency validation
- ✅ Service failure recovery

### Performance and Scalability
- ✅ High-volume event processing
- ✅ Real-time update handling
- ✅ Memory usage optimization
- ✅ Network latency resilience

## Best Practices

1. **Test Data Management**:
   - Use factories for test data creation
   - Clean up test data after each test
   - Use realistic but anonymized data

2. **Test Isolation**:
   - Each test should be independent
   - Use beforeEach/afterEach for setup/cleanup
   - Avoid shared state between tests

3. **Assertions**:
   - Use specific, meaningful assertions
   - Test both positive and negative scenarios
   - Validate error handling and edge cases

4. **Performance**:
   - Keep tests focused and fast
   - Use mocking for external dependencies
   - Parallelize tests where possible

5. **Maintenance**:
   - Keep tests up-to-date with code changes
   - Use page objects for UI tests
   - Document complex test scenarios

## Support

For issues with end-to-end testing:

1. Check the troubleshooting section above
2. Review test logs and reports
3. Consult the development team
4. Create an issue in the project repository

---

This comprehensive testing suite ensures the AIOps Platform meets all requirements and maintains high quality and reliability standards.