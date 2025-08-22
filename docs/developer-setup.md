# Developer Setup Guide

This guide will help you set up a complete development environment for the AI Browser MCP project.

## Prerequisites

### System Requirements

**Minimum Requirements:**
- **OS**: Linux, macOS, or Windows 10/11
- **Node.js**: 16.0 or higher
- **RAM**: 4GB available
- **Disk Space**: 2GB free space
- **Network**: Internet connection for dependencies

**Recommended:**
- **OS**: Linux (Ubuntu 20.04+) or macOS 12+
- **Node.js**: 18.0 or higher (LTS version)
- **RAM**: 8GB or more
- **Disk Space**: 5GB free space
- **SSD**: For better performance

### Required Software

#### 1. Node.js and npm

**Option A: Using Node Version Manager (Recommended)**

```bash
# Install nvm (Linux/macOS)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or source profile
source ~/.bashrc

# Install and use Node.js LTS
nvm install --lts
nvm use --lts
nvm alias default node
```

**Option B: Direct Installation**

- Download from [nodejs.org](https://nodejs.org/)
- Choose the LTS version
- Follow installation instructions for your OS

**Verify Installation:**
```bash
node --version  # Should be 16.0+
npm --version   # Should be 7.0+
```

#### 2. Git

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install git
```

**macOS:**
```bash
# Using Homebrew
brew install git

# Or download from git-scm.com
```

**Windows:**
- Download from [git-scm.com](https://git-scm.com/)
- Use Git Bash for command line operations

**Configure Git:**
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

#### 3. Browser Dependencies

**Linux (Ubuntu/Debian):**
```bash
# Install Chromium dependencies
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

**macOS:**
```bash
# Install Xcode command line tools
xcode-select --install
```

**Windows:**
- No additional dependencies required
- Windows Defender may need exclusions for browser automation

## Project Setup

### 1. Clone the Repository

```bash
# Clone your fork (replace YOUR_USERNAME)
git clone https://github.com/YOUR_USERNAME/ai-browser-mcp.git
cd ai-browser-mcp

# Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/ai-browser-mcp.git

# Verify remotes
git remote -v
```

### 2. Install Dependencies

```bash
# Install all project dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Verify Playwright installation
npx playwright --version
```

### 3. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env

# Edit environment variables
nano .env  # or use your preferred editor
```

**Environment Variables:**

```env
# Server Configuration
PORT=3000
HOST=localhost
NODE_ENV=development

# Browser Configuration
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage

# Security Configuration
ALLOWED_DOMAINS=localhost,127.0.0.1,example.com,httpbin.org
RATE_LIMIT_REQUESTS=120
RATE_LIMIT_WINDOW=60000

# Logging Configuration
LOG_LEVEL=debug
LOG_FILE=logs/server.log
LOG_MAX_SIZE=10485760
LOG_MAX_FILES=5

# Development Configuration
DEBUG=ai-browser-mcp:*
ENABLE_CORS=true
ENABLE_METRICS=true

# Testing Configuration
TEST_TIMEOUT=30000
TEST_HEADLESS=true
TEST_SLOW_MO=0
```

### 4. Development Configuration

**TypeScript Configuration (`tsconfig.json`):**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**VS Code Settings (`.vscode/settings.json`):**
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true
  }
}
```

## Development Tools

### 1. IDE Setup

**VS Code (Recommended):**

Install these extensions:
```bash
# Essential extensions
code --install-extension ms-vscode.vscode-typescript-next
code --install-extension esbenp.prettier-vscode
code --install-extension dbaeumer.vscode-eslint
code --install-extension bradlc.vscode-tailwindcss

# Helpful extensions
code --install-extension ms-vscode.vscode-json
code --install-extension redhat.vscode-yaml
code --install-extension ms-vscode.test-adapter-converter
```

**WebStorm/IntelliJ:**
- Enable TypeScript support
- Configure ESLint and Prettier
- Set up Node.js run configurations

### 2. Terminal Setup

**Recommended Terminal Tools:**
```bash
# Install useful CLI tools
npm install -g nodemon ts-node concurrently

# For better terminal experience (optional)
# Linux/macOS: Install zsh with oh-my-zsh
# Windows: Use Windows Terminal with PowerShell
```

### 3. Browser DevTools

**Chrome DevTools Extensions:**
- React Developer Tools (if using React components)
- Redux DevTools (if using Redux)
- Lighthouse (for performance testing)

## Development Workflow

### 1. Start Development Server

```bash
# Start in development mode with hot reload
npm run dev

# Or start with specific configuration
NODE_ENV=development DEBUG=ai-browser-mcp:* npm run dev

# Start with custom port
PORT=3001 npm run dev
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

### 3. Code Quality

```bash
# Run linting
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code
npm run format

# Type checking
npm run type-check

# Run all quality checks
npm run quality
```

### 4. Build and Deploy

```bash
# Build for production
npm run build

# Start production server
npm start

# Clean build artifacts
npm run clean
```

## Debugging Setup

### 1. VS Code Debugging

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "ai-browser-mcp:*"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeArgs": ["-r", "ts-node/register"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "--reporter=verbose"],
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

### 2. Browser Debugging

**Enable Visual Debugging:**
```bash
# Run with visible browser
BROWSER_HEADLESS=false npm run dev

# Run with slow motion
BROWSER_SLOW_MO=1000 npm run dev

# Enable browser DevTools
BROWSER_DEVTOOLS=true npm run dev
```

**Debug Browser Automation:**
```typescript
// Add debugging to your code
await page.pause(); // Pauses execution for manual inspection
await page.screenshot({ path: 'debug.png' }); // Take debug screenshot
console.log(await page.content()); // Log page content
```

### 3. Network Debugging

**Monitor Network Traffic:**
```bash
# Enable network logging
DEBUG=ai-browser-mcp:network npm run dev

# Use network monitoring tools
npm install -g mitmproxy  # HTTP proxy for debugging
```

## Testing Environment

### 1. Test Configuration

**Vitest Configuration (`vitest.config.ts`):**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts'
      ]
    }
  }
});
```

### 2. Test Utilities

**Create Test Helpers (`tests/utils/test-helpers.ts`):**
```typescript
import { MCPBrowserServer } from '../../src/server/mcp-browser-server';

export async function createTestServer(port = 0) {
  const server = new MCPBrowserServer();
  await server.start(port);
  return server;
}

export function createMockBrowser() {
  return {
    newContext: vi.fn(),
    close: vi.fn()
  };
}

export async function waitFor(condition: () => boolean, timeout = 5000) {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!condition()) {
    throw new Error('Condition not met within timeout');
  }
}
```

### 3. Mock Services

**Create Mock MCP Client (`tests/mocks/mock-mcp-client.ts`):**
```typescript
export class MockMCPClient {
  private tools = new Map();
  
  async connect(url: string) {
    // Mock connection
  }
  
  async callTool(name: string, params: any) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool(params);
  }
  
  registerMockTool(name: string, handler: Function) {
    this.tools.set(name, handler);
  }
}
```

## Performance Optimization

### 1. Development Performance

**Optimize Build Times:**
```bash
# Use TypeScript incremental compilation
npm run build:incremental

# Use parallel processing
npm install -g concurrently
concurrently "npm run build:watch" "npm run test:watch"
```

**Memory Optimization:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Use faster file watching
npm install -g chokidar-cli
```

### 2. Browser Performance

**Optimize Browser Settings:**
```typescript
// Use performance-optimized browser settings
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  offline: false,
  permissions: [],
  geolocation: undefined,
  colorScheme: 'light'
});
```

## Troubleshooting

### Common Issues

**1. Port Already in Use:**
```bash
# Find process using port
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

**2. Browser Installation Issues:**
```bash
# Reinstall Playwright browsers
npx playwright install --force chromium

# Check browser dependencies (Linux)
npx playwright install-deps chromium
```

**3. Permission Issues:**
```bash
# Fix npm permissions (Linux/macOS)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npm prefix
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

**4. TypeScript Issues:**
```bash
# Clear TypeScript cache
rm -rf node_modules/.cache
rm -rf dist/

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Getting Help

**Debug Information:**
```bash
# Collect system information
node --version
npm --version
npx playwright --version
git --version

# Check environment
env | grep NODE
env | grep DEBUG

# Test basic functionality
npm run health-check
```

**Log Analysis:**
```bash
# View server logs
tail -f logs/server.log

# View test logs
npm test -- --reporter=verbose

# Enable debug logging
DEBUG=* npm run dev
```

## Next Steps

After completing the setup:

1. **Read the [API Documentation](./api-reference.md)**
2. **Try the [Examples](./examples/)**
3. **Run the [Test Suite](../tests/README.md)**
4. **Check the [Contributing Guide](./CONTRIBUTING.md)**
5. **Join our [Discord Community](#)**

## Resources

- **Documentation**: [docs/](./README.md)
- **Examples**: [examples/](../examples/)
- **Tests**: [tests/](../tests/)
- **Issues**: [GitHub Issues](https://github.com/your-org/ai-browser-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/ai-browser-mcp/discussions)

Happy coding! 🚀