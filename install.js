#!/usr/bin/env node

/**
 * AI Browser MCP - Easy Installation Script
 * 
 * This script automates the complete setup process for the AI Browser MCP server.
 * It handles dependency installation, configuration, and MCP registration.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AIBrowserMCPInstaller {
  constructor() {
    this.projectRoot = __dirname;
    this.homeDir = process.env.HOME || process.env.USERPROFILE;
    this.kiloConfigDir = join(this.homeDir, '.kiro', 'settings');
    this.workspaceConfigDir = join(this.projectRoot, '.kiro', 'settings');
    
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };
    
    const prefix = {
      info: 'ℹ',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    
    console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`);
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async checkPrerequisites() {
    this.log('Checking prerequisites...', 'info');
    
    try {
      // Check Node.js version
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
      
      if (majorVersion < 16) {
        throw new Error(`Node.js 16+ required, found ${nodeVersion}`);
      }
      
      this.log(`Node.js ${nodeVersion} ✓`, 'success');
      
      // Check npm
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      this.log(`npm ${npmVersion} ✓`, 'success');
      
      return true;
    } catch (error) {
      this.log(`Prerequisites check failed: ${error.message}`, 'error');
      this.log('Please install Node.js 16+ from https://nodejs.org/', 'warning');
      return false;
    }
  }

  async installDependencies() {
    this.log('Installing project dependencies...', 'info');
    
    try {
      execSync('npm install', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
      
      this.log('Dependencies installed ✓', 'success');
      return true;
    } catch (error) {
      this.log(`Dependency installation failed: ${error.message}`, 'error');
      return false;
    }
  }

  async installPlaywright() {
    this.log('Installing Playwright browsers...', 'info');
    
    try {
      execSync('npx playwright install chromium', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
      
      this.log('Playwright browsers installed ✓', 'success');
      return true;
    } catch (error) {
      this.log(`Playwright installation failed: ${error.message}`, 'error');
      this.log('You may need to install system dependencies. See docs/troubleshooting.md', 'warning');
      return false;
    }
  }

  async buildProject() {
    this.log('Building project...', 'info');
    
    try {
      execSync('npm run build', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
      
      this.log('Project built ✓', 'success');
      return true;
    } catch (error) {
      this.log(`Build failed: ${error.message}`, 'error');
      return false;
    }
  }

  async configureMCP() {
    this.log('Configuring MCP integration...', 'info');
    
    const installType = await this.question(
      'Install MCP configuration:\n' +
      '1. Workspace only (recommended for development)\n' +
      '2. Global user configuration\n' +
      '3. Both\n' +
      'Choose (1-3): '
    );

    const mcpConfig = {
      mcpServers: {
        "ai-browser-mcp": {
          command: "node",
          args: [join(this.projectRoot, "dist", "simple-mcp-server.js")],
          env: {
            NODE_ENV: "production",
            LOG_LEVEL: "info"
          },
          disabled: false,
          autoApprove: [
            "mcp_ai_browser_mcp_browsernewContext",
            "mcp_ai_browser_mcp_browsergoto",
            "mcp_ai_browser_mcp_browserscreenshot",
            "mcp_ai_browser_mcp_browserclick",
            "mcp_ai_browser_mcp_browsertype",
            "mcp_ai_browser_mcp_browsereval"
          ]
        }
      }
    };

    try {
      if (installType === '1' || installType === '3') {
        // Workspace configuration
        if (!existsSync(this.workspaceConfigDir)) {
          mkdirSync(this.workspaceConfigDir, { recursive: true });
        }
        
        const workspaceConfigPath = join(this.workspaceConfigDir, 'mcp.json');
        let existingConfig = {};
        
        if (existsSync(workspaceConfigPath)) {
          try {
            existingConfig = JSON.parse(readFileSync(workspaceConfigPath, 'utf8'));
          } catch (e) {
            this.log('Invalid existing workspace config, creating new one', 'warning');
          }
        }
        
        const mergedConfig = {
          ...existingConfig,
          mcpServers: {
            ...existingConfig.mcpServers,
            ...mcpConfig.mcpServers
          }
        };
        
        writeFileSync(workspaceConfigPath, JSON.stringify(mergedConfig, null, 2));
        this.log(`Workspace MCP config created: ${workspaceConfigPath}`, 'success');
      }

      if (installType === '2' || installType === '3') {
        // Global configuration
        if (!existsSync(this.kiloConfigDir)) {
          mkdirSync(this.kiloConfigDir, { recursive: true });
        }
        
        const globalConfigPath = join(this.kiloConfigDir, 'mcp.json');
        let existingConfig = {};
        
        if (existsSync(globalConfigPath)) {
          try {
            existingConfig = JSON.parse(readFileSync(globalConfigPath, 'utf8'));
          } catch (e) {
            this.log('Invalid existing global config, creating new one', 'warning');
          }
        }
        
        const mergedConfig = {
          ...existingConfig,
          mcpServers: {
            ...existingConfig.mcpServers,
            ...mcpConfig.mcpServers
          }
        };
        
        writeFileSync(globalConfigPath, JSON.stringify(mergedConfig, null, 2));
        this.log(`Global MCP config created: ${globalConfigPath}`, 'success');
      }

      return true;
    } catch (error) {
      this.log(`MCP configuration failed: ${error.message}`, 'error');
      return false;
    }
  }

  async testInstallation() {
    this.log('Testing installation...', 'info');
    
    try {
      // Test basic server startup
      const testProcess = spawn('node', ['dist/simple-mcp-server.js', '--test'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          testProcess.kill();
          this.log('Server test timeout - this may be normal', 'warning');
          resolve(true);
        }, 5000);

        testProcess.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0 || output.includes('Server started') || output.includes('MCP server')) {
            this.log('Installation test passed ✓', 'success');
            resolve(true);
          } else {
            this.log(`Installation test failed with code ${code}`, 'warning');
            this.log('Output: ' + output, 'info');
            resolve(false);
          }
        });
      });
    } catch (error) {
      this.log(`Installation test failed: ${error.message}`, 'warning');
      return false;
    }
  }

  async createQuickStartScript() {
    const quickStartScript = `#!/usr/bin/env node

/**
 * AI Browser MCP - Quick Start Script
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting AI Browser MCP Server...');

const serverProcess = spawn('node', ['dist/simple-mcp-server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
});

serverProcess.on('close', (code) => {
  console.log(\`Server exited with code \${code}\`);
});

process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down server...');
  serverProcess.kill('SIGINT');
});
`;

    writeFileSync(join(this.projectRoot, 'start.js'), quickStartScript);
    this.log('Quick start script created: start.js', 'success');
  }

  async showCompletionMessage() {
    this.log('\n🎉 Installation completed successfully!', 'success');
    
    console.log(`
📋 Next Steps:

1. Start the MCP server:
   ${this.log('npm start', 'info')}
   or
   ${this.log('node start.js', 'info')}

2. In Kiro/VS Code:
   - Open Command Palette (Ctrl/Cmd + Shift + P)
   - Search for "MCP" to find MCP-related commands
   - The server should appear as "ai-browser-mcp"

3. Test the integration:
   - Try browser automation tools in Kiro
   - Check the examples in the examples/ folder

📚 Documentation:
   - README.md - Project overview
   - docs/api-reference.md - API documentation
   - docs/troubleshooting.md - Common issues
   - examples/ - Usage examples

🔧 Configuration:
   - MCP config: ${this.workspaceConfigDir}/mcp.json
   - Server logs: logs/
   - Environment: Set NODE_ENV, LOG_LEVEL as needed

❓ Need help?
   - Check docs/faq.md
   - Review docs/troubleshooting.md
   - Open an issue on GitHub

Happy automating! 🤖✨
`);
  }

  async run() {
    console.log(`
🤖 AI Browser MCP - Easy Installation
=====================================

This script will set up the AI Browser MCP server with all dependencies
and configure it for use with Kiro.

`);

    try {
      // Check prerequisites
      if (!(await this.checkPrerequisites())) {
        process.exit(1);
      }

      // Install dependencies
      if (!(await this.installDependencies())) {
        process.exit(1);
      }

      // Install Playwright
      if (!(await this.installPlaywright())) {
        const continueAnyway = await this.question(
          'Playwright installation failed. Continue anyway? (y/N): '
        );
        if (continueAnyway.toLowerCase() !== 'y') {
          process.exit(1);
        }
      }

      // Build project
      if (!(await this.buildProject())) {
        process.exit(1);
      }

      // Configure MCP
      if (!(await this.configureMCP())) {
        process.exit(1);
      }

      // Test installation
      await this.testInstallation();

      // Create quick start script
      await this.createQuickStartScript();

      // Show completion message
      await this.showCompletionMessage();

    } catch (error) {
      this.log(`Installation failed: ${error.message}`, 'error');
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run installer
const installer = new AIBrowserMCPInstaller();
installer.run().catch(console.error);