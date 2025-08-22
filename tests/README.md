# AI Browser MCP - Comprehensive Testing Suite

This directory contains a comprehensive testing suite for the AI Browser MCP project, covering all aspects of functionality, performance, security, and reliability.

## Test Structure

```
tests/
├── unit/                 # Fast unit tests for individual components
├── integration/          # Integration tests for component interactions
├── e2e/                 # End-to-end workflow tests
├── performance/         # Performance benchmarks and optimization tests
├── load/                # Load testing and stress tests
├── security/            # Security penetration tests
├── mocks/               # Mock implementations for isolated testing
├── fixtures/            # Test data and sample files
├── utils/               # Test utilities and helper functions
├── config/              # Test configuration for different environments
└── README.md           # This file
```

## Test Categories

### Unit Tests (`tests/unit/`)
- **Purpose**: Test individual components in isolation
- **Speed**: Fast (< 5 seconds per test)
- **Coverage**: All core classes and functions
- **Dependencies**: Minimal, uses mocks for external dependencies

### Integration Tests (`tests/integration/`)
- **Purpose**: Test component interactions and workflows
- **Speed**: Medium (5-30 seconds per test)
- **Coverage**: Tool integrations, manager interactions, data flow
- **Dependencies**: Real browser instances, limited external services

### End-to-End Tests (`tests/e2e/`)
- **Purpose**: Test complete user workflows
- **Speed**: Slow (30-120 seconds per test)
- **Coverage**: Full system workflows, real-world scenarios
- **Dependencies**: Full system stack, external services

### Performance Tests (`tests/performance/`)
- **Purpose**: Benchmark performance and resource usage
- **Speed**: Variable (30-180 seconds per test)
- **Coverage**: Memory usage, CPU utilization, response times
- **Dependencies**: Performance monitoring tools

### Load Tests (`tests/load/`)
- **Purpose**: Test system behavior under high load
- **Speed**: Very slow (60-300 seconds per test)
- **Coverage**: Concurrent operations, resource limits, scalability
- **Dependencies**: Multiple browser instances, stress testing tools

### Security Tests (`tests/security/`)
- **Purpose**: Validate security measures and find vulnerabilities
- **Speed**: Medium to slow (30-180 seconds per test)
- **Coverage**: Input validation, access control, data sanitization
- **Dependencies**: Security testing tools, malicious payloads

## Running Tests

### Quick Start
```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:performance
npm run test:load
npm run test:security

# Run comprehensive test suite
npm run test:comprehensive
```

### Advanced Usage
```bash
# Run tests with coverage
npm run test:coverage

# Run comprehensive tests in parallel
npm run test:comprehensive:parallel

# Run only critical tests (for CI)
npm run test:critical

# Run tests with verbose output
npx vitest --reporter=verbose

# Run specific test file
npx vitest tests/unit/server.test.ts

# Watch mode for development
npm run test:watch
```

### Using the Test Runner
```bash
# Run all test suites
npx tsx tests/test-runner.ts

# Skip non-critical tests
npx tsx tests/test-runner.ts --skip-non-critical

# Run with coverage
npx tsx tests/test-runner.ts --coverage

# Run in parallel
npx tsx tests/test-runner.ts --parallel

# Verbose output
npx tsx tests/test-runner.ts --verbose

# Custom output directory
npx tsx tests/test-runner.ts --output=custom-results
```

## Test Configuration

Tests are configured for different environments:

- **unit**: Fast, isolated tests with minimal resources
- **integration**: Medium tests with real browser instances
- **e2e**: Full system tests with external dependencies
- **performance**: Resource-intensive performance benchmarks
- **load**: High-load stress testing
- **security**: Security-focused testing with restricted permissions
- **ci**: Optimized for continuous integration environments

Configuration is managed in `tests/config/test-config.ts`.

## Mock Implementations

### Mock Browser (`tests/mocks/mock-browser.ts`)
- Simulates Playwright browser behavior
- Supports all major browser operations
- Configurable responses and error conditions
- Useful for unit testing without real browser overhead

### Mock MCP Client (`tests/mocks/mock-mcp-client.ts`)
- Simulates MCP client interactions
- Supports request/response patterns
- Configurable mock responses
- Useful for testing server behavior in isolation

## Test Utilities

The `tests/utils/test-helpers.ts` file provides:

- **Async Utilities**: `waitFor`, `retry`, `expectEventually`
- **Performance Utilities**: `measureTime`, `expectPerformanceWithinLimits`
- **Response Validation**: `expectValidResponse`, `expectSuccessResponse`, `expectErrorResponse`
- **Load Testing**: `createLoadTestScenario`, `createStressTestScenario`
- **Data Generation**: `generateRandomString`, `generateTestUrl`, `createTestData`

## Test Fixtures

Sample data and test files are provided in `tests/fixtures/`:

- `sample-html.html`: Complete test page with forms, buttons, and dynamic content
- `test-data.json`: Comprehensive test data including URLs, selectors, and payloads

## Continuous Integration

The testing suite is integrated with GitHub Actions:

- **Unit/Integration/E2E**: Run on every push and PR
- **Performance/Load**: Run nightly or on demand
- **Security**: Run on every push and PR
- **Comprehensive**: Run nightly with full coverage
- **Cross-Platform**: Test on Ubuntu, Windows, and macOS

## Writing Tests

### Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up resources (sessions, files, etc.) after tests
3. **Timeouts**: Set appropriate timeouts for different test types
4. **Error Handling**: Test both success and failure scenarios
5. **Performance**: Monitor and assert on performance characteristics
6. **Security**: Include security considerations in all tests

### Test Structure
```typescript
describe('Component Name', () => {
  let component: ComponentType;

  beforeAll(async () => {
    // One-time setup
  });

  afterAll(async () => {
    // One-time cleanup
  });

  beforeEach(async () => {
    // Per-test setup
    component = new ComponentType();
  });

  afterEach(async () => {
    // Per-test cleanup
    await component.cleanup();
  });

  describe('Feature Group', () => {
    it('should handle normal case', async () => {
      // Arrange
      const input = createTestInput();
      
      // Act
      const result = await component.process(input);
      
      // Assert
      expect(result).toBeDefined();
      expectSuccessResponse(result);
    });

    it('should handle error case', async () => {
      // Arrange
      const invalidInput = createInvalidInput();
      
      // Act & Assert
      await expect(component.process(invalidInput)).rejects.toThrow();
    });
  });
});
```

### Performance Testing
```typescript
it('should complete operation within time limit', async () => {
  const { result, duration } = await TestHelpers.measureTime(async () => {
    return await component.expensiveOperation();
  });

  expectPerformanceWithinLimits(duration, 5000, 'expensive operation');
  expect(result).toBeDefined();
});
```

### Load Testing
```typescript
it('should handle concurrent operations', async () => {
  const loadTest = TestHelpers.createLoadTestScenario(
    testConfig,
    async (sessionId, index) => {
      return await component.processRequest(sessionId, `request-${index}`);
    }
  );

  const metrics = await loadTest();
  
  expect(metrics.successRate).toBeGreaterThan(80);
  expect(metrics.operationsPerSecond).toBeGreaterThan(10);
  
  TestHelpers.logTestMetrics('Concurrent Operations', metrics);
});
```

## Troubleshooting

### Common Issues

1. **Browser Launch Failures**
   - Ensure Playwright browsers are installed: `npx playwright install`
   - Check system resources and permissions

2. **Test Timeouts**
   - Increase timeout values in test configuration
   - Check for resource contention or slow operations

3. **Memory Issues**
   - Ensure proper cleanup in `afterEach` hooks
   - Monitor memory usage during tests
   - Reduce concurrent test execution

4. **Network Issues**
   - Use local test servers when possible
   - Implement retry logic for flaky network operations
   - Mock external dependencies

### Debugging Tests

```bash
# Run single test with debug output
npx vitest tests/specific.test.ts --reporter=verbose

# Run with Node.js debugging
node --inspect-brk ./node_modules/.bin/vitest tests/specific.test.ts

# Enable browser debugging (non-headless)
TEST_HEADLESS=false npx vitest tests/browser.test.ts
```

## Contributing

When adding new tests:

1. Choose the appropriate test category
2. Follow the established patterns and naming conventions
3. Include both positive and negative test cases
4. Add performance assertions where relevant
5. Update this README if adding new test utilities or patterns
6. Ensure tests pass in CI environment

## Metrics and Reporting

Test results are automatically collected and reported:

- **JSON Reports**: Machine-readable test results
- **HTML Reports**: Human-readable test dashboards
- **Coverage Reports**: Code coverage analysis
- **Performance Metrics**: Response times and resource usage
- **Security Reports**: Vulnerability assessments

Reports are generated in the `test-results/` directory and uploaded as CI artifacts.