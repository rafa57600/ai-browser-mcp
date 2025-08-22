# Frequently Asked Questions (FAQ)

## General Questions

### What is the AI Browser MCP server?

The AI Browser MCP server is a browser automation system that exposes Chromium browser control capabilities through the Model Context Protocol (MCP). It allows AI agents, IDEs, and other applications to programmatically control a browser, capture screenshots, interact with web pages, monitor network activity, and export debugging information.

### What is MCP (Model Context Protocol)?

MCP is a standardized protocol for AI agents to interact with external tools and services. It provides a consistent JSON-RPC interface that allows AI models to call functions, access data, and perform actions in a secure and controlled manner.

### Why use MCP instead of direct browser automation?

MCP provides several advantages:
- **Standardized Interface**: Consistent API across different tools and services
- **Security**: Built-in security boundaries and permission systems
- **IDE Integration**: Native support in development environments
- **AI-Friendly**: Designed specifically for AI agent interactions
- **Protocol Compliance**: Works with any MCP-compatible client

### What browsers are supported?

Currently, the server supports Chromium-based browsers through Playwright:
- Chromium (default)
- Google Chrome
- Microsoft Edge
- Other Chromium-based browsers

Firefox and Safari support may be added in future versions.

## Installation and Setup

### How do I install the AI Browser MCP server?

```bash
# Clone the repository
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp

# Install dependencies
npm install

# Start the server
npm start
```

### What are the system requirements?

**Minimum Requirements:**
- Node.js 16.0 or higher
- 2GB RAM
- 1GB disk space
- Linux, macOS, or Windows

**Recommended:**
- Node.js 18.0 or higher
- 4GB RAM
- 2GB disk space
- SSD storage for better performance

### How do I configure the server?

Configuration is managed through JSON files in the `config/` directory:

```javascript
// config/development.json
{
  "server": {
    "port": 3000,
    "host": "localhost"
  },
  "browser": {
    "headless": true,
    "timeout": 30000
  },
  "security": {
    "allowedDomains": ["example.com"],
    "rateLimit": {
      "requests": 60,
      "window": 60000
    }
  }
}
```

### Can I run multiple server instances?

Yes, you can run multiple instances on different ports:

```bash
# Instance 1
PORT=3000 npm start

# Instance 2
PORT=3001 npm start

# Instance 3
PORT=3002 npm start
```

Each instance maintains its own browser contexts and sessions.

## Usage and Features

### How do I create a browser session?

```javascript
const { MCPClient } = require('@modelcontextprotocol/client');

const client = new MCPClient();
await client.connect('http://localhost:3000');

const session = await client.callTool('browser.newContext', {
  viewport: { width: 1280, height: 720 },
  userAgent: 'Mozilla/5.0 (compatible; AI-Browser/1.0)'
});
```

### Can I run multiple browser sessions simultaneously?

Yes, the server supports multiple concurrent sessions. Each session is isolated with its own browser context, cookies, and local storage.

```javascript
// Create multiple sessions
const session1 = await client.callTool('browser.newContext');
const session2 = await client.callTool('browser.newContext');
const session3 = await client.callTool('browser.newContext');
```

### How do I interact with web pages?

The server provides various interaction tools:

```javascript
// Navigate to a page
await client.callTool('browser.goto', {
  url: 'https://example.com'
});

// Click elements
await client.callTool('browser.click', {
  selector: '#submit-button'
});

// Type text
await client.callTool('browser.type', {
  selector: '#username',
  text: 'myusername'
});

// Select dropdown options
await client.callTool('browser.select', {
  selector: '#country',
  value: 'US'
});
```

### How do I capture screenshots?

```javascript
// Full page screenshot
const screenshot = await client.callTool('browser.screenshot', {
  fullPage: true,
  format: 'png'
});

// Element screenshot
const elementScreenshot = await client.callTool('browser.screenshot', {
  selector: '#main-content',
  format: 'jpeg',
  quality: 90
});
```

### Can I execute custom JavaScript?

Yes, you can execute JavaScript code in the browser context:

```javascript
const result = await client.callTool('browser.eval', {
  code: `
    // Extract all links
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.textContent.trim(),
      href: a.href
    }));
    return links;
  `
});

console.log('Found links:', result.value);
```

### How do I monitor network activity?

```javascript
// Get recent network requests
const networkLogs = await client.callTool('browser.network.getRecent', {
  limit: 20
});

networkLogs.forEach(log => {
  console.log(`${log.method} ${log.url} - ${log.status}`);
});
```

### Can I record and replay user interactions?

Yes, the server supports macro recording and playback:

```javascript
// Start recording
await client.callTool('browser.macro.record', {
  name: 'user-workflow'
});

// Perform interactions...
await client.callTool('browser.click', { selector: '#login' });
await client.callTool('browser.type', { selector: '#username', text: 'user' });

// Stop recording
await client.callTool('browser.macro.stop');

// Play back later
await client.callTool('browser.macro.play', {
  name: 'user-workflow'
});
```

## Security and Privacy

### Is the browser automation secure?

The server implements multiple security layers:
- **Domain Allowlists**: Only approved domains can be accessed
- **Session Isolation**: Each session runs in an isolated browser context
- **Data Filtering**: Sensitive headers and data are automatically filtered
- **Rate Limiting**: Prevents abuse and resource exhaustion
- **Permission System**: User approval required for new domains

### How are sensitive data handled?

Sensitive data is automatically filtered from logs and exports:
- Authorization headers are redacted
- Cookies are not logged
- API keys are masked
- Personal information is sanitized

### Can I control which domains are accessible?

Yes, configure allowed domains in your config file:

```javascript
{
  "security": {
    "allowedDomains": [
      "example.com",
      "*.example.com",
      "localhost",
      "127.0.0.1"
    ]
  }
}
```

### How do I handle HTTPS/SSL certificates?

```javascript
// Ignore SSL errors (development only)
await client.callTool('browser.newContext', {
  ignoreHTTPSErrors: true
});

// For production, ensure proper SSL certificates
```

## Performance and Scaling

### How many concurrent sessions can I run?

The default limit is 10 concurrent sessions per server instance. This can be configured:

```javascript
{
  "browser": {
    "maxSessions": 20,
    "sessionTimeout": 1800000 // 30 minutes
  }
}
```

### How do I optimize performance?

1. **Use headless mode** for better performance
2. **Limit viewport size** to reduce memory usage
3. **Enable resource filtering** to block unnecessary content
4. **Implement session pooling** for frequently used configurations
5. **Regular cleanup** of idle sessions and temporary files

```javascript
// Performance optimized context
await client.callTool('browser.newContext', {
  viewport: { width: 1280, height: 720 },
  headless: true,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false
});
```

### Can I run the server in a container?

Yes, Docker support is included:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3000

CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t ai-browser-mcp .
docker run -p 3000:3000 ai-browser-mcp
```

### How do I monitor server performance?

```javascript
// Get server metrics
const health = await fetch('http://localhost:3000/health');
const metrics = await health.json();

console.log('Active sessions:', metrics.sessions.active);
console.log('Memory usage:', metrics.memory);
console.log('CPU usage:', metrics.cpu);
```

## Integration and Development

### How do I integrate with VS Code?

Install the VS Code extension:

1. Install the extension from the marketplace
2. Configure the MCP server endpoint
3. Use browser commands from the command palette
4. View screenshots and logs in integrated panels

### Can I use this with other IDEs?

Yes, any IDE that supports MCP can integrate with the server. The protocol is IDE-agnostic.

### How do I write custom tools?

```javascript
// Custom tool example
class CustomTool extends BrowserTool {
  constructor() {
    super('custom.extractData', 'Extract custom data from page');
  }

  async execute(params) {
    // Custom implementation
    const result = await this.page.evaluate(() => {
      // Custom extraction logic
      return extractCustomData();
    });
    
    return result;
  }
}

// Register the tool
server.registerTool(new CustomTool());
```

### How do I contribute to the project?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.

## Troubleshooting

### The server won't start. What should I check?

1. **Port availability**: Ensure port 3000 is not in use
2. **Node.js version**: Verify Node.js 16+ is installed
3. **Dependencies**: Run `npm install` to install dependencies
4. **Permissions**: Check file and directory permissions
5. **Browser installation**: Ensure Chromium is properly installed

### Browser operations are timing out. How do I fix this?

1. **Increase timeout values** in configuration
2. **Check network connectivity** to target sites
3. **Verify domain allowlists** include target domains
4. **Monitor resource usage** for memory/CPU limits
5. **Use explicit waits** for dynamic content

### Elements are not being found. What's wrong?

1. **Verify selectors** are correct and unique
2. **Wait for elements** to appear before interacting
3. **Check for dynamic content** that loads after page load
4. **Use more robust selectors** like data attributes
5. **Debug with screenshots** to see current page state

### How do I report bugs or request features?

1. Check existing issues on GitHub
2. Create a new issue with:
   - Detailed description
   - Steps to reproduce
   - Expected vs actual behavior
   - System information
   - Error logs

## API and Protocol

### What MCP version is supported?

The server supports MCP version 2.0 and is compatible with all MCP 2.0 clients.

### Can I use HTTP instead of WebSocket?

Yes, the server supports both HTTP and WebSocket connections:

```javascript
// HTTP connection
const client = new MCPClient();
await client.connect('http://localhost:3000');

// WebSocket connection
await client.connect('ws://localhost:3000');
```

### How do I handle errors in my client code?

```javascript
try {
  const result = await client.callTool('browser.goto', {
    url: 'https://example.com'
  });
} catch (error) {
  switch (error.data?.category) {
    case 'security':
      console.log('Domain access denied');
      break;
    case 'browser':
      console.log('Browser operation failed');
      break;
    case 'network':
      console.log('Network error');
      break;
    default:
      console.log('Unknown error:', error.message);
  }
}
```

### Are there client libraries available?

Official client libraries are available for:
- **JavaScript/Node.js**: `@modelcontextprotocol/client`
- **Python**: `mcp-client-python`
- **Go**: `mcp-client-go`

Community libraries exist for other languages.

## Licensing and Support

### What license is the project under?

The project is licensed under the MIT License. See [LICENSE](../LICENSE) for details.

### Is commercial use allowed?

Yes, the MIT license allows commercial use, modification, and distribution.

### Where can I get support?

- **Documentation**: Check the docs directory
- **GitHub Issues**: Report bugs and request features
- **Community Forum**: Discuss usage and best practices
- **Stack Overflow**: Tag questions with `ai-browser-mcp`

### Are there paid support options?

Community support is provided through GitHub issues. For enterprise support, contact the maintainers.

## Future Development

### What features are planned?

Upcoming features include:
- Firefox and Safari support
- Enhanced mobile device emulation
- Advanced performance profiling
- Plugin system for custom tools
- Cloud deployment options

### How can I stay updated?

- **Watch the repository** on GitHub for updates
- **Follow releases** for new versions
- **Join the mailing list** for announcements
- **Check the roadmap** for planned features

### Can I request new features?

Yes! Feature requests are welcome. Please:
1. Check existing issues first
2. Describe the use case clearly
3. Provide examples if possible
4. Consider contributing the implementation