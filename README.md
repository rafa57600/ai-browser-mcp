# 🤖 AI Browser MCP

Browser automation system that exposes browser control capabilities through the Model Context Protocol (MCP). Seamlessly integrate web automation into Kiro and other MCP-compatible tools.

## ⚡ Quick Start

**One-command installation:**

```bash
# Clone and install everything automatically
git clone https://github.com/rafa57600/ai-browser-mcp.git
cd ai-browser-mcp
node install.js
```

**Or use npm scripts:**

```bash
npm run setup    # Install dependencies + build
npm start        # Start the MCP server
```

**Platform-specific installers:**

```bash
# Linux/macOS
chmod +x scripts/install.sh && ./scripts/install.sh

# Windows PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\install.ps1
```

## 🚀 Features

- **Browser Automation**: Full Playwright integration with Chromium
- **MCP Protocol**: Standards-compliant Model Context Protocol server
- **Kiro Integration**: Native support for Kiro AI assistant
- **Security**: Domain allowlisting and rate limiting
- **Performance**: Context pooling and resource management
- **Monitoring**: Built-in health checks and metrics
- **Cross-Platform**: Windows, macOS, and Linux support

## 📖 Documentation

- **[Quick Start Guide](QUICK_START.md)** - Get running in 5 minutes
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Examples](examples/)** - Common use cases and patterns
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions
- **[Contributing](docs/CONTRIBUTING.md)** - Development and contribution guide

## 🎯 Use Cases

### Web Scraping
```javascript
// Navigate and extract data
await browser.goto("https://news.ycombinator.com");
const titles = await browser.eval(`
  Array.from(document.querySelectorAll('.titleline > a'))
    .map(a => a.textContent)
`);
```

### Form Automation
```javascript
// Fill and submit forms
await browser.goto("https://example.com/contact");
await browser.type("input[name='email']", "user@example.com");
await browser.click("button[type='submit']");
```

### Testing & QA
```javascript
// Automated testing workflows
await browser.goto("https://app.example.com");
await browser.screenshot(); // Visual regression testing
await browser.click("[data-testid='login-button']");
```

### Content Generation
```javascript
// Screenshot generation for documentation
await browser.goto("https://dashboard.example.com");
await browser.screenshot({ fullPage: true });
```

## 🛠️ Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Manual Setup

```bash
# Install dependencies
npm install

# Install browser
npx playwright install chromium

# Build project
npm run build

# Start development server
npm run dev
```

### Available Scripts

- `npm run setup` - Complete setup (install + build)
- `npm run dev` - Development mode with hot reload
- `npm start` - Production server
- `npm test` - Run test suite
- `npm run lint` - Code linting
- `npm run install:easy` - Interactive installer

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Browser
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
ALLOWED_DOMAINS=*

# Security
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000
```

### MCP Configuration

The installer automatically configures MCP. Manual configuration:

```json
{
  "mcpServers": {
    "ai-browser-mcp": {
      "command": "node",
      "args": ["path/to/ai-browser-mcp/dist/index.js"],
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

## 📁 Project Structure

```
ai-browser-mcp/
├── src/
│   ├── server/          # MCP server implementation
│   ├── browser/         # Browser session management
│   ├── tools/           # MCP tools for browser operations
│   ├── security/        # Security and domain management
│   ├── performance/     # Performance optimization
│   └── types/           # TypeScript definitions
├── tests/               # Comprehensive test suite
├── examples/            # Usage examples
├── docs/                # Documentation
├── scripts/             # Installation and deployment scripts
└── install.js           # Easy installer
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Examples**: [examples/](examples/)
- **Issues**: [GitHub Issues](https://github.com/rafa57600/ai-browser-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rafa57600/ai-browser-mcp/discussions)

---

**Ready to automate the web?** Start with our [Quick Start Guide](QUICK_START.md) and be up and running in minutes! 🚀