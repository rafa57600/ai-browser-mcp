# End-to-End Testing Example

This example demonstrates how to create comprehensive E2E tests using the AI Browser MCP server.

## Overview

We'll create an E2E test suite for a web application that includes:
- User authentication flow
- Form submission testing
- Navigation testing
- Visual regression testing

## Test Framework Setup

```javascript
const { MCPClient } = require('@modelcontextprotocol/client');
const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');

class E2ETestSuite {
  constructor() {
    this.client = new MCPClient();
    this.sessionId = null;
    this.testResults = [];
  }

  async setup() {
    await this.client.connect('http://localhost:3000');
    
    const context = await this.client.callTool('browser.newContext', {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (E2E Test Runner)'
    });
    
    this.sessionId = context.sessionId;
    console.log('Test environment initialized');
  }

  async teardown() {
    await this.client.disconnect();
    console.log('Test environment cleaned up');
  }

  async runTest(testName, testFunction) {
    console.log(`\nRunning test: ${testName}`);
    const startTime = Date.now();
    
    try {
      await testFunction();
      const duration = Date.now() - startTime;
      this.testResults.push({ name: testName, status: 'PASS', duration });
      console.log(`✓ ${testName} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.testResults.push({ name: testName, status: 'FAIL', duration, error: error.message });
      console.log(`✗ ${testName} (${duration}ms): ${error.message}`);
    }
  }

  async generateReport() {
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    console.log('\n=== Test Results ===');
    console.log(`Total: ${this.testResults.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }
  }
}
```

## Complete E2E Test Suite

```javascript
async function runE2ETests() {
  const suite = new E2ETestSuite();
  
  try {
    await suite.setup();
    
    // Test 1: Homepage Load Test
    await suite.runTest('Homepage loads correctly', async () => {
      const result = await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com',
        waitUntil: 'networkidle'
      });
      
      assert.strictEqual(result.status, 200, 'Homepage should return 200 status');
      
      // Verify page title
      const title = await suite.client.callTool('browser.eval', {
        code: 'document.title'
      });
      
      assert.ok(title.value.includes('Example App'), 'Page title should contain app name');
      
      // Take screenshot for visual verification
      await suite.client.callTool('browser.screenshot', {
        fullPage: true,
        format: 'png'
      });
    });
    
    // Test 2: User Registration Flow
    await suite.runTest('User registration flow', async () => {
      // Navigate to registration page
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com/register'
      });
      
      // Fill registration form
      await suite.client.callTool('browser.type', {
        selector: '#username',
        text: 'testuser123'
      });
      
      await suite.client.callTool('browser.type', {
        selector: '#email',
        text: 'test@example.com'
      });
      
      await suite.client.callTool('browser.type', {
        selector: '#password',
        text: 'SecurePassword123!'
      });
      
      await suite.client.callTool('browser.type', {
        selector: '#confirm-password',
        text: 'SecurePassword123!'
      });
      
      // Submit form
      await suite.client.callTool('browser.click', {
        selector: '#register-button'
      });
      
      // Wait for success message
      const successMessage = await suite.client.callTool('browser.eval', {
        code: `
          return new Promise(resolve => {
            const checkMessage = () => {
              const element = document.querySelector('.success-message');
              if (element) {
                resolve(element.textContent);
              } else {
                setTimeout(checkMessage, 100);
              }
            };
            checkMessage();
          });
        `
      });
      
      assert.ok(successMessage.value.includes('Registration successful'), 
        'Should show success message after registration');
    });
    
    // Test 3: Login Flow
    await suite.runTest('User login flow', async () => {
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com/login'
      });
      
      await suite.client.callTool('browser.type', {
        selector: '#login-username',
        text: 'testuser123'
      });
      
      await suite.client.callTool('browser.type', {
        selector: '#login-password',
        text: 'SecurePassword123!'
      });
      
      await suite.client.callTool('browser.click', {
        selector: '#login-button'
      });
      
      // Verify redirect to dashboard
      const currentUrl = await suite.client.callTool('browser.eval', {
        code: 'window.location.href'
      });
      
      assert.ok(currentUrl.value.includes('/dashboard'), 
        'Should redirect to dashboard after login');
      
      // Verify user is logged in
      const userInfo = await suite.client.callTool('browser.eval', {
        code: 'document.querySelector(".user-name")?.textContent'
      });
      
      assert.ok(userInfo.value.includes('testuser123'), 
        'Should display logged in username');
    });
    
    // Test 4: Form Validation
    await suite.runTest('Form validation works', async () => {
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com/contact'
      });
      
      // Try to submit empty form
      await suite.client.callTool('browser.click', {
        selector: '#submit-contact'
      });
      
      // Check for validation errors
      const validationErrors = await suite.client.callTool('browser.eval', {
        code: 'document.querySelectorAll(".validation-error").length'
      });
      
      assert.ok(validationErrors.value > 0, 
        'Should show validation errors for empty form');
      
      // Fill form with invalid email
      await suite.client.callTool('browser.type', {
        selector: '#contact-email',
        text: 'invalid-email'
      });
      
      await suite.client.callTool('browser.click', {
        selector: '#submit-contact'
      });
      
      const emailError = await suite.client.callTool('browser.eval', {
        code: 'document.querySelector("#contact-email + .validation-error")?.textContent'
      });
      
      assert.ok(emailError.value.includes('valid email'), 
        'Should show email validation error');
    });
    
    // Test 5: Navigation Menu
    await suite.runTest('Navigation menu works', async () => {
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com'
      });
      
      // Test each navigation link
      const navLinks = await suite.client.callTool('browser.eval', {
        code: `
          const links = [];
          document.querySelectorAll('nav a').forEach(link => {
            links.push({
              text: link.textContent.trim(),
              href: link.href
            });
          });
          return links;
        `
      });
      
      for (const link of navLinks.value) {
        await suite.client.callTool('browser.goto', {
          url: link.href
        });
        
        const pageLoaded = await suite.client.callTool('browser.eval', {
          code: 'document.readyState === "complete"'
        });
        
        assert.ok(pageLoaded.value, `${link.text} page should load successfully`);
      }
    });
    
    // Test 6: Mobile Responsiveness
    await suite.runTest('Mobile responsiveness', async () => {
      // Switch to mobile viewport
      await suite.client.callTool('browser.newContext', {
        viewport: { width: 375, height: 667 } // iPhone SE size
      });
      
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com'
      });
      
      // Check if mobile menu is visible
      const mobileMenuVisible = await suite.client.callTool('browser.eval', {
        code: `
          const mobileMenu = document.querySelector('.mobile-menu-toggle');
          return mobileMenu && window.getComputedStyle(mobileMenu).display !== 'none';
        `
      });
      
      assert.ok(mobileMenuVisible.value, 'Mobile menu should be visible on mobile viewport');
      
      // Test mobile menu functionality
      await suite.client.callTool('browser.click', {
        selector: '.mobile-menu-toggle'
      });
      
      const menuExpanded = await suite.client.callTool('browser.eval', {
        code: 'document.querySelector(".mobile-menu").classList.contains("expanded")'
      });
      
      assert.ok(menuExpanded.value, 'Mobile menu should expand when clicked');
    });
    
    // Test 7: Performance Check
    await suite.runTest('Page performance is acceptable', async () => {
      // Start performance tracing
      await suite.client.callTool('browser.trace.start', {
        categories: ['devtools.timeline'],
        screenshots: false
      });
      
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com'
      });
      
      // Stop tracing and get metrics
      const trace = await suite.client.callTool('browser.trace.stop');
      
      // Check page load time
      const loadTime = await suite.client.callTool('browser.eval', {
        code: `
          const timing = performance.timing;
          return timing.loadEventEnd - timing.navigationStart;
        `
      });
      
      assert.ok(loadTime.value < 5000, 'Page should load in less than 5 seconds');
      
      // Check for console errors
      const consoleErrors = await suite.client.callTool('browser.console.getRecent', {
        level: 'error',
        limit: 10
      });
      
      assert.strictEqual(consoleErrors.length, 0, 'Page should not have console errors');
    });
    
    // Test 8: Accessibility Check
    await suite.runTest('Basic accessibility compliance', async () => {
      await suite.client.callTool('browser.goto', {
        url: 'https://example-app.com'
      });
      
      // Check for alt attributes on images
      const imagesWithoutAlt = await suite.client.callTool('browser.eval', {
        code: `
          const images = document.querySelectorAll('img');
          let count = 0;
          images.forEach(img => {
            if (!img.alt || img.alt.trim() === '') count++;
          });
          return count;
        `
      });
      
      assert.strictEqual(imagesWithoutAlt.value, 0, 'All images should have alt attributes');
      
      // Check for proper heading hierarchy
      const headingStructure = await suite.client.callTool('browser.eval', {
        code: `
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
          return headings.map(h => h.tagName);
        `
      });
      
      assert.ok(headingStructure.value.includes('H1'), 'Page should have an H1 heading');
    });
    
    await suite.generateReport();
    
  } catch (error) {
    console.error('Test suite failed:', error);
  } finally {
    await suite.teardown();
  }
}

// Run the test suite
runE2ETests()
  .then(() => {
    console.log('\nE2E test suite completed');
  })
  .catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
```

## Visual Regression Testing

```javascript
async function visualRegressionTest() {
  const client = new MCPClient();
  await client.connect('http://localhost:3000');
  
  try {
    await client.callTool('browser.newContext', {
      viewport: { width: 1280, height: 720 }
    });
    
    // Take baseline screenshot
    await client.callTool('browser.goto', {
      url: 'https://example-app.com'
    });
    
    const currentScreenshot = await client.callTool('browser.screenshot', {
      fullPage: true,
      format: 'png'
    });
    
    // Compare with baseline (pseudo-code)
    const baselinePath = './screenshots/baseline.png';
    const currentPath = './screenshots/current.png';
    
    await fs.writeFile(currentPath, Buffer.from(currentScreenshot.data, 'base64'));
    
    // Use image comparison library
    const pixelmatch = require('pixelmatch');
    const PNG = require('pngjs').PNG;
    
    const baseline = PNG.sync.read(await fs.readFile(baselinePath));
    const current = PNG.sync.read(await fs.readFile(currentPath));
    
    const diff = new PNG({ width: baseline.width, height: baseline.height });
    const numDiffPixels = pixelmatch(
      baseline.data, 
      current.data, 
      diff.data, 
      baseline.width, 
      baseline.height,
      { threshold: 0.1 }
    );
    
    const diffPercentage = (numDiffPixels / (baseline.width * baseline.height)) * 100;
    
    if (diffPercentage > 1) { // Allow 1% difference
      await fs.writeFile('./screenshots/diff.png', PNG.sync.write(diff));
      throw new Error(`Visual regression detected: ${diffPercentage.toFixed(2)}% difference`);
    }
    
    console.log('Visual regression test passed');
    
  } finally {
    await client.disconnect();
  }
}
```

## Test Configuration

```javascript
// test-config.js
module.exports = {
  baseUrl: 'https://example-app.com',
  timeout: 30000,
  viewport: {
    desktop: { width: 1280, height: 720 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 667 }
  },
  users: {
    testUser: {
      username: 'testuser123',
      email: 'test@example.com',
      password: 'SecurePassword123!'
    }
  },
  screenshots: {
    onFailure: true,
    baseline: './screenshots/baseline/',
    current: './screenshots/current/',
    diff: './screenshots/diff/'
  }
};
```

## Running Tests

```bash
# Run all E2E tests
node e2e-tests.js

# Run specific test category
node e2e-tests.js --category=auth

# Run with visual regression
node e2e-tests.js --visual-regression

# Generate detailed report
node e2e-tests.js --report=html
```

## Best Practices

1. **Use Page Object Pattern**: Organize tests with reusable page objects
2. **Implement Proper Waits**: Always wait for elements and conditions
3. **Clean Test Data**: Reset application state between tests
4. **Parallel Execution**: Run independent tests in parallel
5. **Comprehensive Reporting**: Generate detailed test reports with screenshots
6. **CI/CD Integration**: Integrate tests into your deployment pipeline