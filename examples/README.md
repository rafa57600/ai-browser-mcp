# AI Browser MCP - Example Scripts

This directory contains practical example scripts demonstrating how to use the AI Browser MCP server for various automation tasks.

## Quick Start

1. **Start the MCP server:**
   ```bash
   npm start
   ```

2. **Run an example:**
   ```bash
   node examples/basic-usage.js
   ```

## Available Examples

### 🚀 Basic Usage
**File:** `basic-usage.js`

Demonstrates fundamental operations:
- Connecting to the MCP server
- Creating browser contexts
- Navigation and page interaction
- Taking screenshots
- Extracting data with JavaScript

```bash
# Run with default settings
node examples/basic-usage.js

# Run with custom URL
node examples/basic-usage.js https://github.com

# Show help
node examples/basic-usage.js --help
```

### 🕷️ Web Scraping
**File:** `web-scraping.js`

Advanced web scraping techniques:
- Product listing extraction
- Pagination handling
- Data export (JSON/CSV)
- Performance reporting

```bash
# Basic scraping
node examples/web-scraping.js

# Custom configuration
node examples/web-scraping.js --url https://example-shop.com --pages 5 --format csv

# Show help
node examples/web-scraping.js --help
```

### 📝 Form Automation
**File:** `form-automation.js`

Automated form filling and submission:
- Login forms
- Registration forms
- Contact forms
- Multi-step forms
- Form validation handling

```bash
# Run form automation examples
node examples/form-automation.js

# Show help
node examples/form-automation.js --help
```

### 🧪 Testing Workflows
**File:** `testing-workflows.js`

End-to-end testing examples:
- User journey testing
- Visual regression testing
- Performance testing
- Accessibility testing

```bash
# Run testing examples
node examples/testing-workflows.js

# Run specific test type
node examples/testing-workflows.js --type visual

# Show help
node examples/testing-workflows.js --help
```

### 📊 Performance Monitoring
**File:** `performance-monitoring.js`

Performance analysis and monitoring:
- Page load time measurement
- Resource usage tracking
- Network performance analysis
- Core Web Vitals collection

```bash
# Monitor performance
node examples/performance-monitoring.js

# Monitor specific URL
node examples/performance-monitoring.js --url https://example.com

# Show help
node examples/performance-monitoring.js --help
```

### 🔒 Security Testing
**File:** `security-testing.js`

Security-focused automation:
- XSS detection
- CSRF testing
- Authentication bypass testing
- Input validation testing

```bash
# Run security tests
node examples/security-testing.js

# Test specific domain
node examples/security-testing.js --domain example.com

# Show help
node examples/security-testing.js --help
```

### 📱 Mobile Testing
**File:** `mobile-testing.js`

Mobile device emulation and testing:
- Responsive design testing
- Touch interaction simulation
- Mobile-specific feature testing
- Cross-device compatibility

```bash
# Run mobile tests
node examples/mobile-testing.js

# Test specific device
node examples/mobile-testing.js --device "iPhone 12"

# Show help
node examples/mobile-testing.js --help
```

### 🎯 API Testing
**File:** `api-testing.js`

API testing through browser automation:
- Network request monitoring
- API response validation
- Authentication flow testing
- Error handling verification

```bash
# Run API tests
node examples/api-testing.js

# Test specific API
node examples/api-testing.js --api https://api.example.com

# Show help
node examples/api-testing.js --help
```

## Example Categories

### 🎓 Beginner Examples
Perfect for getting started:
- `basic-usage.js` - Fundamental operations
- `simple-scraping.js` - Basic data extraction
- `form-filling.js` - Simple form automation

### 🔧 Intermediate Examples
More complex scenarios:
- `web-scraping.js` - Advanced scraping techniques
- `form-automation.js` - Complex form handling
- `testing-workflows.js` - E2E testing patterns

### 🚀 Advanced Examples
Production-ready patterns:
- `performance-monitoring.js` - Performance analysis
- `security-testing.js` - Security automation
- `enterprise-automation.js` - Large-scale automation

## Common Patterns

### Error Handling
```javascript
try {
  const result = await client.callTool('browser.goto', {
    url: 'https://example.com'
  });
} catch (error) {
  if (error.data?.category === 'security') {
    console.log('Domain access denied');
  } else if (error.data?.category === 'browser') {
    console.log('Navigation failed');
  } else {
    console.log('Unexpected error:', error.message);
  }
}
```

### Waiting for Elements
```javascript
// Wait for element to appear
await client.callTool('browser.eval', {
  code: `
    return new Promise(resolve => {
      const checkElement = () => {
        const element = document.querySelector('#target');
        if (element) {
          resolve(true);
        } else {
          setTimeout(checkElement, 100);
        }
      };
      checkElement();
    });
  `
});
```

### Data Extraction
```javascript
// Extract structured data
const data = await client.callTool('browser.eval', {
  code: `
    const items = [];
    document.querySelectorAll('.item').forEach(element => {
      items.push({
        title: element.querySelector('.title')?.textContent?.trim(),
        price: element.querySelector('.price')?.textContent?.trim(),
        link: element.querySelector('a')?.href
      });
    });
    return items;
  `
});
```

### Screenshot Capture
```javascript
// Take full page screenshot
const screenshot = await client.callTool('browser.screenshot', {
  fullPage: true,
  format: 'png'
});

// Save screenshot
const fs = require('fs').promises;
await fs.writeFile('screenshot.png', Buffer.from(screenshot.data, 'base64'));
```

## Configuration

### Environment Variables
```bash
# Server configuration
MCP_SERVER_URL=http://localhost:3000
MCP_TIMEOUT=30000

# Browser configuration
BROWSER_HEADLESS=true
BROWSER_VIEWPORT_WIDTH=1280
BROWSER_VIEWPORT_HEIGHT=720

# Output configuration
OUTPUT_DIR=./output
SCREENSHOT_DIR=./screenshots
LOGS_DIR=./logs
```

### Command Line Options
Most examples support these common options:

```bash
--help, -h              Show help message
--server-url URL        MCP server URL (default: http://localhost:3000)
--headless BOOL         Run browser in headless mode (default: true)
--timeout MS            Operation timeout in milliseconds (default: 30000)
--output-dir DIR        Output directory for files (default: ./output)
--verbose, -v           Enable verbose logging
--dry-run               Show what would be done without executing
```

## Output Files

Examples may generate various output files:

### Screenshots
- `screenshots/` - Captured screenshots
- `screenshots/debug/` - Debug screenshots
- `screenshots/comparison/` - Visual comparison images

### Data Files
- `output/data.json` - Extracted data in JSON format
- `output/data.csv` - Extracted data in CSV format
- `output/report.html` - HTML reports

### Logs
- `logs/server.log` - Server operation logs
- `logs/browser.log` - Browser console logs
- `logs/network.log` - Network activity logs

### Reports
- `reports/performance.html` - Performance analysis
- `reports/security.html` - Security test results
- `reports/accessibility.html` - Accessibility audit

## Best Practices

### 1. Resource Management
```javascript
// Always clean up resources
try {
  await client.connect('http://localhost:3000');
  // Perform operations...
} finally {
  await client.disconnect();
}
```

### 2. Error Handling
```javascript
// Handle different error types
catch (error) {
  switch (error.data?.category) {
    case 'security':
      // Handle security errors
      break;
    case 'browser':
      // Handle browser errors
      break;
    case 'network':
      // Handle network errors
      break;
    default:
      // Handle unexpected errors
      break;
  }
}
```

### 3. Rate Limiting
```javascript
// Add delays between operations
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const url of urls) {
  await client.callTool('browser.goto', { url });
  // Process page...
  await delay(1000); // Wait 1 second
}
```

### 4. Robust Selectors
```javascript
// Use multiple selector strategies
const selectors = [
  '[data-testid="submit-button"]',  // Preferred: test attributes
  '#submit-button',                 // ID selector
  '.submit-button',                 // Class selector
  'button[type="submit"]'           // Attribute selector
];

const selector = await findWorkingSelector(selectors);
```

## Troubleshooting

### Common Issues

**1. Connection Refused**
```bash
# Check if server is running
curl http://localhost:3000/health

# Start the server
npm start
```

**2. Element Not Found**
```javascript
// Add explicit waits
await client.callTool('browser.eval', {
  code: 'return document.readyState === "complete"'
});
```

**3. Timeout Errors**
```javascript
// Increase timeout values
await client.callTool('browser.goto', {
  url: 'https://slow-site.com',
  timeout: 60000 // 60 seconds
});
```

**4. Permission Denied**
```bash
# Check allowed domains in config
cat config/development.json | grep allowedDomains
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Enable all debug logs
DEBUG=* node examples/basic-usage.js

# Enable specific debug categories
DEBUG=ai-browser-mcp:* node examples/web-scraping.js

# Enable browser debug mode
BROWSER_HEADLESS=false BROWSER_DEVTOOLS=true node examples/form-automation.js
```

## Contributing Examples

We welcome new examples! Please follow these guidelines:

### 1. Example Structure
```javascript
#!/usr/bin/env node

/**
 * Example Name
 * 
 * Brief description of what this example demonstrates.
 */

const { MCPClient } = require('@modelcontextprotocol/client');

async function exampleFunction() {
  // Implementation
}

// Command line interface
if (require.main === module) {
  // Handle CLI arguments
  exampleFunction().catch(console.error);
}
```

### 2. Documentation
- Add clear comments explaining each step
- Include error handling examples
- Provide usage examples in comments
- Add help text for command line options

### 3. Testing
- Test with different websites
- Verify error handling
- Check resource cleanup
- Test command line options

### 4. Submission
- Create a pull request with your example
- Include documentation updates
- Add the example to this README
- Provide test cases if applicable

## Resources

- **API Reference**: [../docs/api-reference.md](../docs/api-reference.md)
- **Troubleshooting**: [../docs/troubleshooting.md](../docs/troubleshooting.md)
- **Contributing**: [../docs/CONTRIBUTING.md](../docs/CONTRIBUTING.md)
- **Developer Setup**: [../docs/developer-setup.md](../docs/developer-setup.md)

## Support

- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Ask questions and share ideas
- **Discord**: Join our community chat
- **Stack Overflow**: Tag questions with `ai-browser-mcp`

Happy automating! 🤖✨