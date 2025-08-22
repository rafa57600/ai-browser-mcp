# 🚀 AI Browser MCP - Quick Start Guide

Get up and running with AI Browser MCP in under 5 minutes!

## One-Command Installation

```bash
# Clone and install everything automatically
git clone https://github.com/rafa57600/ai-browser-mcp.git
cd ai-browser-mcp
node install.js
```

That's it! The installer handles everything:
- ✅ Dependency installation
- ✅ Browser setup (Playwright + Chromium)
- ✅ Project building
- ✅ MCP configuration
- ✅ Integration testing

## Alternative: Manual Installation

If you prefer manual control:

```bash
# 1. Install dependencies
npm install

# 2. Install browser
npx playwright install chromium

# 3. Build project
npm run build

# 4. Start server
npm start
```

## Quick Test

After installation, test the server:

```bash
# Start the server
npm start

# In another terminal, test basic functionality
curl http://localhost:3000/health
```

## Kiro Integration

### Automatic Setup (Recommended)

The installer automatically configures MCP for Kiro. Just restart Kiro and the server will be available.

### Manual MCP Configuration

If you need to configure manually, add to your MCP config:

**Workspace config** (`.kiro/settings/mcp.json`):
```json
{
  "mcpServers": {
    "ai-browser-mcp": {
      "command": "node",
      "args": ["path/to/ai-browser-mcp/dist/simple-mcp-server.js"],
      "disabled": false,
      "autoApprove": [
        "mcp_ai_browser_mcp_browsernewContext",
        "mcp_ai_browser_mcp_browsergoto",
        "mcp_ai_browser_mcp_browserscreenshot"
      ]
    }
  }
}
```

**Global config** (`~/.kiro/settings/mcp.json`):
```json
{
  "mcpServers": {
    "ai-browser-mcp": {
      "command": "node",
      "args": ["path/to/ai-browser-mcp/dist/simple-mcp-server.js"],
      "disabled": false
    }
  }
}
```

## First Steps in Kiro

1. **Open Kiro** and restart if needed
2. **Check MCP Status**: Look for "ai-browser-mcp" in the MCP servers panel
3. **Try Basic Commands**:
   ```
   Take a screenshot of google.com
   Navigate to example.com and click the "More information" link
   Fill out a form on httpbin.org/forms/post
   ```

## Example Usage

### Basic Browser Automation
```javascript
// Create a new browser context
const context = await browser.newContext();

// Navigate to a page
await browser.goto("https://example.com");

// Take a screenshot
const screenshot = await browser.screenshot();

// Click an element
await browser.click("button[type='submit']");

// Type text
await browser.type("input[name='email']", "test@example.com");
```

### Web Scraping
```javascript
// Navigate and extract data
await browser.goto("https://news.ycombinator.com");
const titles = await browser.eval(`
  Array.from(document.querySelectorAll('.titleline > a'))
    .map(a => a.textContent)
    .slice(0, 5)
`);
```

### Form Automation
```javascript
// Fill and submit a form
await browser.goto("https://httpbin.org/forms/post");
await browser.type("input[name='custname']", "John Doe");
await browser.type("input[name='custtel']", "555-1234");
await browser.click("input[type='submit']");
```

## Configuration Options

### Environment Variables
```bash
# Server configuration
PORT=3000                    # Server port
NODE_ENV=production         # Environment mode
LOG_LEVEL=info              # Logging level

# Browser configuration  
BROWSER_HEADLESS=true       # Run browser in headless mode
BROWSER_TIMEOUT=30000       # Default timeout (ms)
ALLOWED_DOMAINS=*           # Allowed domains (comma-separated)

# Security
RATE_LIMIT_REQUESTS=100     # Requests per window
RATE_LIMIT_WINDOW=60000     # Rate limit window (ms)
```

### Server Modes

**Development Mode:**
```bash
npm run dev
# - Hot reload
# - Detailed logging
# - Browser DevTools available
```

**Production Mode:**
```bash
npm start
# - Optimized performance
# - Minimal logging
# - Headless browser
```

**WebSocket Mode:**
```bash
npm run start:ws
# - WebSocket transport
# - Real-time communication
# - Better for interactive use
```

## Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check if port is in use
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Try different port
PORT=3001 npm start
```

**Browser installation failed:**
```bash
# Reinstall Playwright
npx playwright install --force chromium

# Install system dependencies (Linux)
npx playwright install-deps chromium
```

**MCP not connecting:**
1. Check server is running: `curl http://localhost:3000/health`
2. Verify MCP config path and syntax
3. Restart Kiro
4. Check Kiro's MCP server panel for errors

**Permission errors:**
```bash
# Fix npm permissions (Linux/macOS)
sudo chown -R $(whoami) ~/.npm

# Or use different npm prefix
npm config set prefix ~/.npm-global
```

### Getting Help

- 📖 **Full Documentation**: [docs/README.md](docs/README.md)
- 🔧 **Troubleshooting**: [docs/troubleshooting.md](docs/troubleshooting.md)
- ❓ **FAQ**: [docs/faq.md](docs/faq.md)
- 💡 **Examples**: [examples/](examples/)
- 🐛 **Issues**: [GitHub Issues](https://github.com/rafa57600/ai-browser-mcp/issues)

## What's Next?

- **Explore Examples**: Check out [examples/](examples/) for common use cases
- **Read API Docs**: [docs/api-reference.md](docs/api-reference.md) for full API
- **Advanced Config**: [docs/deployment.md](docs/deployment.md) for production setup
- **Contributing**: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) to contribute

---

**Need more help?** The installer created everything you need to get started. If you run into issues, check the troubleshooting guide or open an issue on GitHub.

Happy automating! 🤖✨