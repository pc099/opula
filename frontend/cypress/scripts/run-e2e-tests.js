#!/usr/bin/env node

const cypress = require('cypress')
const fs = require('fs')
const path = require('path')

/**
 * Comprehensive E2E Test Runner for AIOps Platform
 * Executes all end-to-end tests with proper reporting and validation
 */

const testSuites = [
  {
    name: 'Automation Workflows',
    spec: 'cypress/e2e/automation-workflows.cy.ts',
    description: 'Tests complete automation workflows from event detection to resolution'
  },
  {
    name: 'Dashboard Functionality',
    spec: 'cypress/e2e/dashboard-functionality.cy.ts',
    description: 'Tests dashboard functionality and user interactions'
  },
  {
    name: 'Performance Tests',
    spec: 'cypress/e2e/performance-tests.cy.ts',
    description: 'Tests high-volume event processing scenarios'
  },
  {
    name: 'Disaster Recovery',
    spec: 'cypress/e2e/disaster-recovery.cy.ts',
    description: 'Tests backup/restore and data persistence'
  },
  {
    name: 'Complete System Validation',
    spec: 'cypress/e2e/complete-system-validation.cy.ts',
    description: 'Comprehensive system validation and integration tests'
  }
]

async function runTestSuite(suite) {
  console.log(`\n🚀 Running ${suite.name}...`)
  console.log(`📝 ${suite.description}`)
  
  try {
    const result = await cypress.run({
      spec: suite.spec,
      browser: 'chrome',
      headless: true,
      video: true,
      screenshotOnRunFailure: true,
      reporter: 'mochawesome',
      reporterOptions: {
        reportDir: `cypress/reports/${suite.name.toLowerCase().replace(/\s+/g, '-')}`,
        overwrite: false,
        html: true,
        json: true
      }
    })

    return {
      suite: suite.name,
      success: result.totalFailed === 0,
      stats: {
        tests: result.totalTests,
        passed: result.totalPassed,
        failed: result.totalFailed,
        skipped: result.totalSkipped,
        duration: result.totalDuration
      },
      result
    }
  } catch (error) {
    console.error(`❌ Error running ${suite.name}:`, error.message)
    return {
      suite: suite.name,
      success: false,
      error: error.message
    }
  }
}

async function generateSummaryReport(results) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalSuites: results.length,
    passedSuites: results.filter(r => r.success).length,
    failedSuites: results.filter(r => !r.success).length,
    totalTests: results.reduce((sum, r) => sum + (r.stats?.tests || 0), 0),
    totalPassed: results.reduce((sum, r) => sum + (r.stats?.passed || 0), 0),
    totalFailed: results.reduce((sum, r) => sum + (r.stats?.failed || 0), 0),
    totalDuration: results.reduce((sum, r) => sum + (r.stats?.duration || 0), 0),
    suites: results
  }

  // Generate HTML report
  const htmlReport = `
<!DOCTYPE html>
<html>
<head>
    <title>AIOps Platform E2E Test Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #e8f4fd; padding: 15px; border-radius: 5px; text-align: center; }
        .metric.success { background: #d4edda; }
        .metric.failure { background: #f8d7da; }
        .suite { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .suite.success { border-color: #28a745; }
        .suite.failure { border-color: #dc3545; }
        .stats { display: flex; gap: 10px; margin: 10px 0; }
        .stat { padding: 5px 10px; background: #f8f9fa; border-radius: 3px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 AIOps Platform E2E Test Results</h1>
        <p>Generated: ${new Date(summary.timestamp).toLocaleString()}</p>
        <p>Total Duration: ${Math.round(summary.totalDuration / 1000)}s</p>
    </div>

    <div class="summary">
        <div class="metric ${summary.failedSuites === 0 ? 'success' : 'failure'}">
            <h3>${summary.passedSuites}/${summary.totalSuites}</h3>
            <p>Test Suites Passed</p>
        </div>
        <div class="metric ${summary.totalFailed === 0 ? 'success' : 'failure'}">
            <h3>${summary.totalPassed}/${summary.totalTests}</h3>
            <p>Tests Passed</p>
        </div>
        <div class="metric">
            <h3>${Math.round(summary.totalDuration / 1000)}s</h3>
            <p>Total Duration</p>
        </div>
    </div>

    <h2>📊 Test Suite Results</h2>
    ${results.map(result => `
        <div class="suite ${result.success ? 'success' : 'failure'}">
            <h3>${result.success ? '✅' : '❌'} ${result.suite}</h3>
            ${result.stats ? `
                <div class="stats">
                    <span class="stat">Tests: ${result.stats.tests}</span>
                    <span class="stat">Passed: ${result.stats.passed}</span>
                    <span class="stat">Failed: ${result.stats.failed}</span>
                    <span class="stat">Duration: ${Math.round(result.stats.duration / 1000)}s</span>
                </div>
            ` : ''}
            ${result.error ? `<p style="color: red;">Error: ${result.error}</p>` : ''}
        </div>
    `).join('')}
</body>
</html>
  `

  // Save reports
  const reportsDir = path.join(__dirname, '../reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }

  fs.writeFileSync(path.join(reportsDir, 'summary.json'), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(reportsDir, 'summary.html'), htmlReport)

  return summary
}

async function main() {
  console.log('🧪 Starting AIOps Platform E2E Test Suite')
  console.log('=' .repeat(60))

  const startTime = Date.now()
  const results = []

  // Run all test suites
  for (const suite of testSuites) {
    const result = await runTestSuite(suite)
    results.push(result)
    
    if (result.success) {
      console.log(`✅ ${suite.name} completed successfully`)
    } else {
      console.log(`❌ ${suite.name} failed`)
    }
  }

  // Generate summary report
  const summary = await generateSummaryReport(results)
  const totalTime = Date.now() - startTime

  console.log('\n' + '=' .repeat(60))
  console.log('📊 E2E Test Suite Summary')
  console.log('=' .repeat(60))
  console.log(`Total Suites: ${summary.totalSuites}`)
  console.log(`Passed Suites: ${summary.passedSuites}`)
  console.log(`Failed Suites: ${summary.failedSuites}`)
  console.log(`Total Tests: ${summary.totalTests}`)
  console.log(`Passed Tests: ${summary.totalPassed}`)
  console.log(`Failed Tests: ${summary.totalFailed}`)
  console.log(`Total Duration: ${Math.round(totalTime / 1000)}s`)
  console.log(`\n📄 Reports saved to: cypress/reports/`)

  // Exit with appropriate code
  process.exit(summary.failedSuites > 0 ? 1 : 0)
}

// Handle CLI arguments
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AIOps Platform E2E Test Runner

Usage: node run-e2e-tests.js [options]

Options:
  --help, -h     Show this help message
  --suite <name> Run specific test suite
  --browser <name> Browser to use (chrome, firefox, edge)
  --headed       Run tests in headed mode
  --record       Record tests to Cypress Dashboard

Examples:
  node run-e2e-tests.js
  node run-e2e-tests.js --suite "Dashboard Functionality"
  node run-e2e-tests.js --browser firefox --headed
  `)
  process.exit(0)
}

// Run specific suite if requested
const suiteArg = args.indexOf('--suite')
if (suiteArg !== -1 && args[suiteArg + 1]) {
  const suiteName = args[suiteArg + 1]
  const suite = testSuites.find(s => s.name === suiteName)
  if (suite) {
    runTestSuite(suite).then(result => {
      console.log(result.success ? '✅ Test suite passed' : '❌ Test suite failed')
      process.exit(result.success ? 0 : 1)
    })
  } else {
    console.error(`❌ Test suite "${suiteName}" not found`)
    console.log('Available suites:', testSuites.map(s => s.name).join(', '))
    process.exit(1)
  }
} else {
  // Run all suites
  main().catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
}