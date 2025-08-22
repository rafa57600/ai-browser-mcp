# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the AI Browser MCP server.

## Quick Diagnostics

### Health Check

First, verify the server is running and responsive:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "sessions": {
    "active": 2,
    "total": 15
  }
}
```

### Server Logs

Check server logs for errors:

```bash
# If running with npm
npm run logs

# If running with Docker
docker logs ai-browser-mcp

# Check log files
tail -f logs/server.log
```

## Common Issues

### 1. Connection Issues

#### Problem: Cannot connect to MCP server

**Symptoms:**
- Connection refused errors
- Timeout when connecting
- "Server not found" messages

**Solutions:**

1. **Check if server is running:**
   ```bash
   ps aux | grep node
   netstat -tlnp | grep 3000
   ```

2. **Verify port configuration:**
   ```javascript
   // Check config/development.json
   {
     "server": {
       "port": 3000,
       "host": "localhost"
     }
   }
   ```

3. **Check firewall settings:**
   ```bash
   # Linux
   sudo ufw status
   sudo ufw allow 3000
   
   # Windows
   netsh advfirewall firewall show rule name="AI Browser MCP"
   ```

4. **Test with curl:**
   ```bash
   curl -X POST http://localhost:3000 \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

#### Problem: WebSocket connection fails

**Symptoms:**
- WebSocket handshake errors
- Connection drops immediately
- "Upgrade required" errors

**Solutions:**

1. **Check WebSocket support:**
   ```javascript
   // Verify server supports WebSocket
   const WebSocket = require('ws');
   const ws = new WebSocket('ws://localhost:3000');
   ```

2. **Proxy configuration:**
   ```nginx
   # Nginx proxy config
   location / {
     proxy_pass http://localhost:3000;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
   }
   ```

### 2. Browser Issues

#### Problem: Browser fails to start

**Symptoms:**
- "Browser not found" errors
- Chromium download failures
- Permission denied errors

**Solutions:**

1. **Install browser dependencies:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y chromium-browser
   
   # CentOS/RHEL
   sudo yum install -y chromium
   
   # macOS
   brew install chromium
   ```

2. **Download Chromium manually:**
   ```bash
   npx playwright install chromium
   ```

3. **Check permissions:**
   ```bash
   # Linux
   chmod +x node_modules/playwright/.local-browsers/chromium-*/chrome-linux/chrome
   
   # Set executable permissions
   sudo chown -R $USER:$USER node_modules/playwright
   ```

4. **Run in headless mode:**
   ```javascript
   await client.callTool('browser.newContext', {
     headless: true // Force headless mode
   });
   ```

#### Problem: Browser crashes frequently

**Symptoms:**
- "Browser process crashed" errors
- Unexpected browser exits
- Memory-related errors

**Solutions:**

1. **Increase memory limits:**
   ```javascript
   // config/development.json
   {
     "browser": {
       "args": [
         "--max-old-space-size=4096",
         "--disable-dev-shm-usage",
         "--no-sandbox"
       ]
     }
   }
   ```

2. **Monitor resource usage:**
   ```bash
   # Check memory usage
   ps aux | grep chrome
   free -h
   
   # Check disk space
   df -h
   ```

3. **Enable crash reporting:**
   ```javascript
   // Enable detailed error logging
   const context = await browser.newContext({
     recordVideo: { dir: 'videos/' },
     recordHar: { path: 'network.har' }
   });
   ```

### 3. Navigation and Interaction Issues

#### Problem: Page navigation fails

**Symptoms:**
- Timeout errors during navigation
- "Page not found" errors
- SSL certificate errors

**Solutions:**

1. **Increase timeout values:**
   ```javascript
   await client.callTool('browser.goto', {
     url: 'https://example.com',
     timeout: 60000, // 60 seconds
     waitUntil: 'networkidle'
   });
   ```

2. **Handle SSL errors:**
   ```javascript
   await client.callTool('browser.newContext', {
     ignoreHTTPSErrors: true
   });
   ```

3. **Check network connectivity:**
   ```bash
   # Test direct connection
   curl -I https://example.com
   
   # Check DNS resolution
   nslookup example.com
   
   # Test with different user agent
   curl -H "User-Agent: Mozilla/5.0..." https://example.com
   ```

#### Problem: Elements not found

**Symptoms:**
- "Element not found" errors
- Selector timeouts
- Interaction failures

**Solutions:**

1. **Use explicit waits:**
   ```javascript
   // Wait for element to appear
   await client.callTool('browser.eval', {
     code: `
       return new Promise(resolve => {
         const checkElement = () => {
           const element = document.querySelector('#my-element');
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

2. **Debug selectors:**
   ```javascript
   // Check if selector exists
   const elementExists = await client.callTool('browser.eval', {
     code: `!!document.querySelector('#my-element')`
   });
   
   console.log('Element exists:', elementExists.value);
   ```

3. **Use more robust selectors:**
   ```javascript
   // Instead of: '#submit'
   // Use: 'button[type="submit"], input[type="submit"]'
   
   // Instead of: '.btn'
   // Use: '[data-testid="submit-button"]'
   ```

### 4. Security and Permission Issues

#### Problem: Domain access denied

**Symptoms:**
- "Domain not allowed" errors
- Security policy violations
- CORS errors

**Solutions:**

1. **Update allowed domains:**
   ```javascript
   // config/development.json
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

2. **Request domain permission:**
   ```javascript
   try {
     await client.callTool('browser.goto', {
       url: 'https://new-domain.com'
     });
   } catch (error) {
     if (error.data?.category === 'security') {
       console.log('Domain permission required');
       // Handle permission request
     }
   }
   ```

#### Problem: Rate limiting errors

**Symptoms:**
- "Rate limit exceeded" errors
- 429 HTTP status codes
- Request throttling

**Solutions:**

1. **Adjust rate limits:**
   ```javascript
   // config/development.json
   {
     "security": {
       "rateLimit": {
         "requests": 120, // Increase from 60
         "window": 60000
       }
     }
   }
   ```

2. **Implement request queuing:**
   ```javascript
   class RequestQueue {
     constructor(maxConcurrent = 5) {
       this.queue = [];
       this.running = 0;
       this.maxConcurrent = maxConcurrent;
     }
     
     async add(request) {
       return new Promise((resolve, reject) => {
         this.queue.push({ request, resolve, reject });
         this.process();
       });
     }
     
     async process() {
       if (this.running >= this.maxConcurrent || this.queue.length === 0) {
         return;
       }
       
       this.running++;
       const { request, resolve, reject } = this.queue.shift();
       
       try {
         const result = await request();
         resolve(result);
       } catch (error) {
         reject(error);
       } finally {
         this.running--;
         this.process();
       }
     }
   }
   ```

### 5. Performance Issues

#### Problem: Slow response times

**Symptoms:**
- Long wait times for operations
- Timeout errors
- High CPU/memory usage

**Solutions:**

1. **Enable performance monitoring:**
   ```javascript
   // Start tracing
   await client.callTool('browser.trace.start', {
     categories: ['devtools.timeline']
   });
   
   // Perform operations...
   
   // Stop and analyze
   const trace = await client.callTool('browser.trace.stop');
   ```

2. **Optimize browser settings:**
   ```javascript
   await client.callTool('browser.newContext', {
     viewport: { width: 1280, height: 720 }, // Smaller viewport
     deviceScaleFactor: 1, // Disable high DPI
     hasTouch: false,
     isMobile: false,
     offline: false,
     permissions: [], // Minimal permissions
     geolocation: undefined,
     colorScheme: 'light'
   });
   ```

3. **Use resource filtering:**
   ```javascript
   // Block unnecessary resources
   await client.callTool('browser.eval', {
     code: `
       // Block images and fonts for faster loading
       const observer = new PerformanceObserver((list) => {
         for (const entry of list.getEntries()) {
           if (entry.name.includes('.jpg') || entry.name.includes('.png')) {
             // Log resource blocking
           }
         }
       });
       observer.observe({entryTypes: ['resource']});
     `
   });
   ```

## Debugging Tools

### 1. Enable Debug Logging

```javascript
// Set environment variable
process.env.DEBUG = 'ai-browser-mcp:*';

// Or in config
{
  "logging": {
    "level": "debug",
    "categories": ["browser", "network", "security"]
  }
}
```

### 2. Capture Network Activity

```javascript
// Get recent network logs
const networkLogs = await client.callTool('browser.network.getRecent', {
  limit: 50
});

networkLogs.forEach(log => {
  console.log(`${log.method} ${log.url} - ${log.status} (${log.duration}ms)`);
});
```

### 3. Monitor Console Output

```javascript
// Get console logs
const consoleLogs = await client.callTool('browser.console.getRecent', {
  limit: 20
});

consoleLogs.forEach(log => {
  console.log(`[${log.level}] ${log.message}`);
});
```

### 4. Generate Debug Report

```javascript
async function generateDebugReport() {
  const report = await client.callTool('browser.report.generate', {
    format: 'html',
    includeScreenshots: true,
    includeLogs: true,
    includeNetworkActivity: true,
    includePerformanceMetrics: true
  });
  
  console.log('Debug report generated:', report.path);
}
```

## Getting Help

### 1. Check Documentation
- [API Reference](./api-reference.md)
- [Examples](./examples/)
- [Configuration Guide](./configuration.md)

### 2. Enable Verbose Logging
```bash
DEBUG=* npm start
```

### 3. Collect System Information
```bash
# System info
uname -a
node --version
npm --version

# Browser info
chromium --version
google-chrome --version

# Memory and disk
free -h
df -h
```

### 4. Create Minimal Reproduction
```javascript
// Minimal test case
const { MCPClient } = require('@modelcontextprotocol/client');

async function reproduce() {
  const client = new MCPClient();
  
  try {
    await client.connect('http://localhost:3000');
    
    // Minimal steps to reproduce the issue
    const result = await client.callTool('browser.newContext');
    console.log('Success:', result);
    
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await client.disconnect();
  }
}

reproduce();
```

### 5. Report Issues

When reporting issues, include:
- Error messages and stack traces
- System information
- Configuration files
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or logs if relevant

## Performance Optimization

### 1. Resource Management
```javascript
// Monitor memory usage
const memoryUsage = process.memoryUsage();
console.log('Memory usage:', {
  rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
  heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
});
```

### 2. Connection Pooling
```javascript
// Reuse browser contexts
const contextPool = new Map();

async function getContext(options) {
  const key = JSON.stringify(options);
  if (!contextPool.has(key)) {
    const context = await client.callTool('browser.newContext', options);
    contextPool.set(key, context);
  }
  return contextPool.get(key);
}
```

### 3. Cleanup Procedures
```javascript
// Regular cleanup
setInterval(async () => {
  // Clean up idle sessions
  await client.callTool('browser.cleanup.idle');
  
  // Clear temporary files
  await client.callTool('browser.cleanup.temp');
  
  // Garbage collection
  if (global.gc) {
    global.gc();
  }
}, 300000); // Every 5 minutes
```