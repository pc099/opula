#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/**
 * Disaster Recovery Test Runner
 * Executes comprehensive disaster recovery and data persistence tests
 */

interface TestResult {
  name: string
  success: boolean
  duration: number
  output?: string
  error?: string
}

interface TestSuite {
  name: string
  description: string
  testFile: string
  setup?: () => Promise<void>
  teardown?: () => Promise<void>
}

const testSuites: TestSuite[] = [
  {
    name: 'Database Backup and Restore',
    description: 'Tests database backup creation, validation, and restoration',
    testFile: 'src/__tests__/disaster-recovery.test.ts',
    setup: async () => {
      console.log('🔧 Setting up test database...')
      // Create test database and populate with sample data
      execSync('npm run db:test:setup', { stdio: 'inherit' })
    },
    teardown: async () => {
      console.log('🧹 Cleaning up test database...')
      execSync('npm run db:test:cleanup', { stdio: 'inherit' })
    }
  },
  {
    name: 'Service Recovery',
    description: 'Tests service failure detection and automated recovery',
    testFile: 'src/__tests__/service-recovery.test.ts'
  },
  {
    name: 'Data Consistency',
    description: 'Tests data consistency validation and integrity checks',
    testFile: 'src/__tests__/data-consistency.test.ts'
  }
]

async function runTestSuite(suite: TestSuite): Promise<TestResult> {
  console.log(`\n🚀 Running ${suite.name}...`)
  console.log(`📝 ${suite.description}`)

  const startTime = Date.now()

  try {
    // Run setup if provided
    if (suite.setup) {
      await suite.setup()
    }

    // Run the test
    const output = execSync(`npx jest ${suite.testFile} --verbose --coverage`, {
      encoding: 'utf8',
      stdio: 'pipe'
    })

    const duration = Date.now() - startTime

    // Run teardown if provided
    if (suite.teardown) {
      await suite.teardown()
    }

    console.log(`✅ ${suite.name} completed successfully (${duration}ms)`)

    return {
      name: suite.name,
      success: true,
      duration,
      output
    }
  } catch (error: any) {
    const duration = Date.now() - startTime

    // Run teardown even on failure
    if (suite.teardown) {
      try {
        await suite.teardown()
      } catch (teardownError) {
        console.error('⚠️ Teardown failed:', teardownError)
      }
    }

    console.log(`❌ ${suite.name} failed (${duration}ms)`)

    return {
      name: suite.name,
      success: false,
      duration,
      error: error.message,
      output: error.stdout
    }
  }
}

async function generateReport(results: TestResult[]): Promise<void> {
  const summary = {
    timestamp: new Date().toISOString(),
    totalSuites: results.length,
    passedSuites: results.filter(r => r.success).length,
    failedSuites: results.filter(r => !r.success).length,
    totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
    results
  }

  // Generate JSON report
  const reportsDir = path.join(__dirname, '../reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }

  fs.writeFileSync(
    path.join(reportsDir, 'disaster-recovery-results.json'),
    JSON.stringify(summary, null, 2)
  )

  // Generate HTML report
  const htmlReport = `
<!DOCTYPE html>
<html>
<head>
    <title>Disaster Recovery Test Results</title>
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
        .output { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; }
        .error { color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛡️ Disaster Recovery Test Results</h1>
        <p>Generated: ${new Date(summary.timestamp).toLocaleString()}</p>
        <p>Total Duration: ${Math.round(summary.totalDuration / 1000)}s</p>
    </div>

    <div class="summary">
        <div class="metric ${summary.failedSuites === 0 ? 'success' : 'failure'}">
            <h3>${summary.passedSuites}/${summary.totalSuites}</h3>
            <p>Test Suites Passed</p>
        </div>
        <div class="metric">
            <h3>${Math.round(summary.totalDuration / 1000)}s</h3>
            <p>Total Duration</p>
        </div>
    </div>

    <h2>📊 Test Results</h2>
    ${results.map(result => `
        <div class="suite ${result.success ? 'success' : 'failure'}">
            <h3>${result.success ? '✅' : '❌'} ${result.name}</h3>
            <p>Duration: ${result.duration}ms</p>
            ${result.error ? `<div class="output error">Error: ${result.error}</div>` : ''}
            ${result.output ? `<details><summary>Test Output</summary><div class="output">${result.output}</div></details>` : ''}
        </div>
    `).join('')}
</body>
</html>
  `

  fs.writeFileSync(
    path.join(reportsDir, 'disaster-recovery-results.html'),
    htmlReport
  )

  console.log(`\n📄 Reports saved to: ${reportsDir}`)
}

async function main(): Promise<void> {
  console.log('🛡️ Starting Disaster Recovery Test Suite')
  console.log('=' .repeat(60))

  const startTime = Date.now()
  const results: TestResult[] = []

  // Run all test suites
  for (const suite of testSuites) {
    const result = await runTestSuite(suite)
    results.push(result)
  }

  // Generate report
  await generateReport(results)

  const totalTime = Date.now() - startTime
  const passedSuites = results.filter(r => r.success).length
  const failedSuites = results.filter(r => !r.success).length

  console.log('\n' + '=' .repeat(60))
  console.log('📊 Disaster Recovery Test Summary')
  console.log('=' .repeat(60))
  console.log(`Total Suites: ${results.length}`)
  console.log(`Passed Suites: ${passedSuites}`)
  console.log(`Failed Suites: ${failedSuites}`)
  console.log(`Total Duration: ${Math.round(totalTime / 1000)}s`)

  // Exit with appropriate code
  process.exit(failedSuites > 0 ? 1 : 0)
}

// Handle CLI arguments
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Disaster Recovery Test Runner

Usage: npx ts-node run-disaster-recovery-tests.ts [options]

Options:
  --help, -h     Show this help message
  --suite <name> Run specific test suite

Examples:
  npx ts-node run-disaster-recovery-tests.ts
  npx ts-node run-disaster-recovery-tests.ts --suite "Database Backup and Restore"
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