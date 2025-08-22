# 📦 Installation Guide

Multiple ways to install AI Browser MCP, from one-liners to manual setup.

## 🚀 Quick Installation Methods

### Method 1: One-Command Install (Recommended)

```bash
# Clone and auto-install
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
node install.js
```

### Method 2: One-Liner from Web

```bash
# Direct from GitHub (Linux/macOS)
curl -fsSL https://raw.githubusercontent.com/your-org/ai-browser-mcp/main/scripts/one-liner-install.sh | bash

# Or with wget
wget -qO- https://raw.githubusercontent.com/your-org/ai-browser-mcp/main/scripts/one-liner-install.sh | bash
```

### Method 3: Platform-Specific Installers

**Linux/macOS:**
```bash
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
chmod +x scripts/install.sh
./scripts/install.sh
```

**Windows PowerShell:**
```powershell
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\install.ps1
```

**Windows Command Prompt:**
```cmd
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

### Method 4: NPM Scripts

```bash
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
npm run setup    # Installs everything and builds
npm start        # Start the server
```

## 🔧 Manual Installation

If you prefer full control over the installation process:

### Prerequisites

- **Node.js 16+** - [Download from nodejs.org](https://nodejs.org/)
- **Git** - [Download from git-scm.com](https://git-scm.com/)
- **npm** (comes with Node.js)

### Step-by-Step Manual Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/ai-browser-mcp.git
   cd ai-browser-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

5. **Configure MCP (optional):**
   ```bash
   # Create MCP configuration
   mkdir -p .kiro/settings
   cp config/mcp-example.json .kiro/settings/mcp.json
   # Edit the paths in mcp.json to match your setup
   ```

6. **Test the installation:**
   ```bash
   npm start
   ```

## 🐳 Docker Installation

For containerized deployment:

### Using Docker Compose (Recommended)

```bash
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
docker-compose up -d
```

### Using Docker directly

```bash
# Build the image
docker build -t ai-browser-mcp .

# Run the container
docker run -d \
  --name ai-browser-mcp \
  -p 3000:3000 \
  -e NODE_ENV=production \
  ai-browser-mcp
```

### Docker with MCP configuration

```bash
# Mount your MCP config
docker run -d \
  --name ai-browser-mcp \
  -p 3000:3000 \
  -v ~/.kiro/settings:/app/.kiro/settings \
  -e NODE_ENV=production \
  ai-browser-mcp
```

## 📱 Installation Options

### Development Installation

For development work with hot reload:

```bash
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
npm install
npx playwright install chromium
npm run dev  # Starts with hot reload
```

### Production Installation

For production deployment:

```bash
git clone https://github.com/your-org/ai-browser-mcp.git
cd ai-browser-mcp
NODE_ENV=production npm install --only=production
npx playwright install chromium
npm run build
npm start
```

### Global Installation

To install as a global npm package:

```bash
npm install -g ai-browser-mcp
ai-browser-mcp --help
```

## 🔐 Security Considerations

### System Dependencies

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y \
  libnss3-dev \
  libatk-bridge2.0-dev \
  libdrm2 \
  libxkbcommon0 \
  libgtk-3-dev \
  libxss1 \
  libasound2
```

**Linux (CentOS/RHEL):**
```bash
sudo yum install -y \
  nss \
  atk \
  at-spi2-atk \
  gtk3 \
  cups-libs \
  libdrm \
  libxkbcommon \
  libXcomposite \
  libXdamage \
  libXrandr \
  libgbm \
  libXss \
  alsa-lib
```

### Firewall Configuration

```bash
# Allow MCP server port (default 3000)
sudo ufw allow 3000/tcp

# Or for specific interface
sudo ufw allow in on lo to any port 3000
```

### User Permissions

```bash
# Create dedicated user (optional)
sudo useradd -r -s /bin/false ai-browser-mcp
sudo mkdir -p /opt/ai-browser-mcp
sudo chown ai-browser-mcp:ai-browser-mcp /opt/ai-browser-mcp

# Install as dedicated user
sudo -u ai-browser-mcp git clone https://github.com/your-org/ai-browser-mcp.git /opt/ai-browser-mcp
```

## 🌐 Network Configuration

### Proxy Setup

If behind a corporate proxy:

```bash
# Set npm proxy
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# Set environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.local

# Install with proxy
npm install
```

### Custom Registry

For private npm registries:

```bash
# Set custom registry
npm config set registry https://npm.company.com/

# Or use .npmrc file
echo "registry=https://npm.company.com/" > .npmrc
```

## 🔧 Configuration After Installation

### Environment Configuration

Create `.env` file:

```env
# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=production

# Browser Configuration
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
ALLOWED_DOMAINS=localhost,example.com

# Security
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000

# Logging
LOG_LEVEL=info
LOG_FILE=logs/server.log
```

### MCP Configuration

**Workspace config** (`.kiro/settings/mcp.json`):
```json
{
  "mcpServers": {
    "ai-browser-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/ai-browser-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      },
      "disabled": false,
      "autoApprove": [
        "mcp_ai_browser_mcp_browsernewContext",
        "mcp_ai_browser_mcp_browsergoto",
        "mcp_ai_browser_mcp_browserscreenshot",
        "mcp_ai_browser_mcp_browserclick",
        "mcp_ai_browser_mcp_browsertype",
        "mcp_ai_browser_mcp_browsereval"
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
      "args": ["/absolute/path/to/ai-browser-mcp/dist/index.js"],
      "disabled": false
    }
  }
}
```

## 🧪 Verification

### Test Installation

```bash
# Health check
curl http://localhost:3000/health

# Test MCP tools
npm run test:integration

# Manual test
node -e "
const { MCPBrowserServer } = require('./dist/server/mcp-browser-server.js');
const server = new MCPBrowserServer();
console.log('Server created successfully');
"
```

### Verify MCP Integration

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Check Kiro integration:**
   - Restart Kiro
   - Open Command Palette (Ctrl/Cmd + Shift + P)
   - Search for "MCP"
   - Look for "ai-browser-mcp" in the server list

3. **Test basic functionality:**
   ```
   Take a screenshot of google.com
   Navigate to example.com
   ```

## 🚨 Troubleshooting Installation

### Common Issues

**Node.js version error:**
```bash
# Check version
node --version

# Install Node Version Manager
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts
```

**Playwright installation fails:**
```bash
# Clear cache and reinstall
rm -rf node_modules
npm cache clean --force
npm install
npx playwright install --force chromium

# Install system dependencies (Linux)
npx playwright install-deps chromium
```

**Permission errors:**
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use different prefix
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

**Port already in use:**
```bash
# Find process using port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Use different port
PORT=3001 npm start
```

### Getting Help

If you encounter issues:

1. **Check the logs:**
   ```bash
   tail -f logs/server.log
   ```

2. **Run diagnostics:**
   ```bash
   npm run health
   node --version
   npm --version
   npx playwright --version
   ```

3. **Clean installation:**
   ```bash
   rm -rf node_modules package-lock.json dist
   npm install
   npm run build
   ```

4. **Report issues:**
   - [GitHub Issues](https://github.com/your-org/ai-browser-mcp/issues)
   - Include system info, error logs, and steps to reproduce

## 📚 Next Steps

After successful installation:

1. **Read the [Quick Start Guide](../QUICK_START.md)**
2. **Try the [Examples](../examples/)**
3. **Configure for your use case**
4. **Set up monitoring and logging**
5. **Deploy to production**

---

**Installation complete!** 🎉 You're ready to start automating browsers with AI Browser MCP.