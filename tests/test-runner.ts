// Comprehensive test runner for all test suites
import { execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface TestSuite {
  name: string;
  pattern: string;
  timeout: number;
  description: string;
  critical: boolean;
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
  error?: string;
}

class ComprehensiveTestRunner {
  private testSuites: TestSuite[] = [
    {
      name: 'Unit Tests',
      pattern: 'tests/unit/**/*.test.ts',
      timeout: 30000,
      description: 'Fast unit tests for individual components',
      critical: true
    },
    {
      name: 'Integration Tests',
      pattern: 'tests/integration/**/*.test.ts',
      timeout: 60000,
      description: 'Integration tests for component interactions',
      critical: true
    },
    {
      name: 'End-to-End Tests',
      pattern: 'tests/e2e/**/*.test.ts',
      timeout: 120000,
      description: 'Complete workflow tests',
      critical: true
    },
    {
      name: 'Performance Tests',
      pattern: 'tests/performance/**/*.test.ts',
      timeout: 180000,
      description: 'Performance benchmarks and optimization tests',
      critical: false
    },
    {
      name: 'Load Tests',
      pattern: 'tests/load/**/*.test.ts',
      timeout: 300000,
      description: 'Load testing and stress tests',
      critical: false
    },
    {
      name: 'Security Tests',
      pattern: 'tests/security/**/*.test.ts',
      timeout: 180000,
      description: 'Security penetration tests',
      critical: true
    }
  ];

  private results: TestResult[] = [];

  async runAllTests(options: {
    skipNonCritical?: boolean;
    parallel?: boolean;
    coverage?: boolean;
    verbose?: boolean;
    outputDir?: string;
  } = {}): Promise<void> {
    const {
      skipNonCritical = false,
      parallel = false,
      coverage = false,
      verbose = false,
      outputDir = 'test-results'
    } = options;

    console.log('🚀 Starting Comprehensive Test Suite');
    console.log('=====================================');

    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const suitesToRun = skipNonCritical 
      ? this.testSuites.filter(suite => suite.critical)
      : this.testSuites;

    console.log(`Running ${suitesToRun.length} test suites...`);
    console.log('');

    if (parallel && suitesToRun.length > 1) {
      await this.runTestsInParallel(suitesToRun, { coverage, verbose, outputDir });
    } else {
      await this.runTestsSequentially(suitesToRun, { coverage, verbose, outputDir });
    }

    await this.generateReport(outputDir);
    this.printSummary();
  }

  private async runTestsSequentially(
    suites: TestSuite[],
    options: { coverage: boolean; verbose: boolean; outputDir: string }
  ): Promise<void> {
    for (const suite of suites) {
      await this.runTestSuite(suite, options);
    }
  }

  private async runTestsInParallel(
    suites: TestSuite[],
    options: { coverage: boolean; verbose: boolean; outputDir: string }
  ): Promise<void> {
    const promises = suites.map(suite => this.runTestSuite(suite, options));
    await Promise.allSettled(promises);
  }

  private async runTestSuite(
    suite: TestSuite,
    options: { coverage: boolean; verbose: boolean; outputDir: string }
  ): Promise<void> {
    console.log(`📋 Running ${suite.name}...`);
    console.log(`   ${suite.description}`);

    const startTime = Date.now();
    let passed = false;
    let output = '';
    let error: string | undefined;

    try {
      const command = this.buildTestCommand(suite, options);
      
      if (options.verbose) {
        console.log(`   Command: ${command}`);
      }

      output = execSync(command, {
        encoding: 'utf8',
        timeout: suite.timeout,
        stdio: options.verbose ? 'inherit' : 'pipe'
      });

      passed = true;
      console.log(`   ✅ ${suite.name} passed`);
    } catch (err: any) {
      passed = false;
      error = err.message;
      output = err.stdout || err.stderr || err.message;
      
      console.log(`   ❌ ${suite.name} failed`);
      if (options.verbose) {
        console.log(`   Error: ${error}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log('');

    this.results.push({
      suite: suite.name,
      passed,
      duration,
      output,
      error
    });

    // Save individual test result
    const resultFile = join(options.outputDir, `${suite.name.toLowerCase().replace(/\s+/g, '-')}.json`);
    writeFileSync(resultFile, JSON.stringify({
      suite: suite.name,
      passed,
      duration,
      timestamp: new Date().toISOString(),
      output: options.verbose ? output : output.substring(0, 1000),
      error
    }, null, 2));
  }

  private buildTestCommand(suite: TestSuite, options: { coverage: boolean }): string {
    let command = 'npx vitest run';
    
    // Add pattern
    command += ` "${suite.pattern}"`;
    
    // Add coverage if requested
    if (options.coverage) {
      command += ' --coverage';
    }
    
    // Add timeout
    command += ` --testTimeout=${suite.timeout}`;
    
    // Add reporter
    command += ' --reporter=verbose';
    
    return command;
  }

  private async generateReport(outputDir: string): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => r.failed).length,
        totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0)
      },
      results: this.results.map(r => ({
        suite: r.suite,
        passed: r.passed,
        duration: r.duration,
        error: r.error
      }))
    };

    const reportFile = join(outputDir, 'test-report.json');
    writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Generate HTML report
    const htmlReport = this.generateHtmlReport(report);
    const htmlFile = join(outputDir, 'test-report.html');
    writeFileSync(htmlFile, htmlReport);

    console.log(`📊 Test reports generated:`);
    console.log(`   JSON: ${reportFile}`);
    console.log(`   HTML: ${htmlFile}`);
    console.log('');
  }

  private generateHtmlReport(report: any): string {
    const passedCount = report.summary.passed;
    const failedCount = report.summary.failed;
    const totalCount = report.summary.total;
    const successRate = ((passedCount / totalCount) * 100).toFixed(1);

    return `
<!DOCTYPE html>
<html>
<head>
    <title>AI Browser MCP - Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric.passed { border-left: 4px solid #4CAF50; }
        .metric.failed { border-left: 4px solid #f44336; }
        .metric.total { border-left: 4px solid #2196F3; }
        .results { margin-top: 20px; }
        .result { margin: 10px 0; padding: 15px; border-radius: 5px; }
        .result.passed { background: #e8f5e8; border-left: 4px solid #4CAF50; }
        .result.failed { background: #ffeaea; border-left: 4px solid #f44336; }
        .duration { color: #666; font-size: 0.9em; }
        .error { color: #d32f2f; font-family: monospace; font-size: 0.9em; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AI Browser MCP - Test Report</h1>
        <p>Generated: ${report.timestamp}</p>
        <p>Success Rate: ${successRate}%</p>
    </div>

    <div class="summary">
        <div class="metric total">
            <h3>Total Tests</h3>
            <div style="font-size: 2em; font-weight: bold;">${totalCount}</div>
        </div>
        <div class="metric passed">
            <h3>Passed</h3>
            <div style="font-size: 2em; font-weight: bold; color: #4CAF50;">${passedCount}</div>
        </div>
        <div class="metric failed">
            <h3>Failed</h3>
            <div style="font-size: 2em; font-weight: bold; color: #f44336;">${failedCount}</div>
        </div>
    </div>

    <div class="results">
        <h2>Test Results</h2>
        ${report.results.map((result: any) => `
            <div class="result ${result.passed ? 'passed' : 'failed'}">
                <h3>${result.suite} ${result.passed ? '✅' : '❌'}</h3>
                <div class="duration">Duration: ${result.duration}ms</div>
                ${result.error ? `<div class="error">Error: ${result.error}</div>` : ''}
            </div>
        `).join('')}
    </div>

    <div style="margin-top: 40px; padding: 20px; background: #f5f5f5; border-radius: 5px;">
        <h3>Test Suite Descriptions</h3>
        <ul>
            <li><strong>Unit Tests:</strong> Fast unit tests for individual components</li>
            <li><strong>Integration Tests:</strong> Integration tests for component interactions</li>
            <li><strong>End-to-End Tests:</strong> Complete workflow tests</li>
            <li><strong>Performance Tests:</strong> Performance benchmarks and optimization tests</li>
            <li><strong>Load Tests:</strong> Load testing and stress tests</li>
            <li><strong>Security Tests:</strong> Security penetration tests</li>
        </ul>
    </div>
</body>
</html>
    `;
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => r.failed).length;
    const total = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log('📊 Test Summary');
    console.log('===============');
    console.log(`Total Suites: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
    console.log('');

    if (failed > 0) {
      console.log('❌ Failed Suites:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`   - ${r.suite}: ${r.error || 'Unknown error'}`);
        });
      console.log('');
    }

    const criticalFailed = this.results.filter(r => 
      !r.passed && this.testSuites.find(s => s.name === r.suite)?.critical
    ).length;

    if (criticalFailed > 0) {
      console.log('🚨 Critical test suites failed! Please fix before deployment.');
      process.exit(1);
    } else if (failed > 0) {
      console.log('⚠️  Some non-critical tests failed. Consider fixing before deployment.');
      process.exit(0);
    } else {
      console.log('🎉 All tests passed!');
      process.exit(0);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    skipNonCritical: args.includes('--skip-non-critical'),
    parallel: args.includes('--parallel'),
    coverage: args.includes('--coverage'),
    verbose: args.includes('--verbose'),
    outputDir: args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'test-results'
  };

  const runner = new ComprehensiveTestRunner();
  runner.runAllTests(options).catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { ComprehensiveTestRunner };