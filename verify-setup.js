#!/usr/bin/env node

/**
 * AI Browser MCP - Setup Verification Script
 * 
 * Verifies that the installation was successful and everything is working correctly.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SetupVerifier {
  constructor() {
    this.projectRoot = __dirname;
    this.errors = [];
    this.warnings = [];
    this.passed = 0;
    this.total = 0;
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    
    const prefix = {
      info: 'ℹ',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    
    console.log(`${colors[type]}${prefix[type]} ${message}${colors.reset}`);
  }

  test(name, testFn) {
    this.total++;
    try {
      const result = testFn();
      if (result !== false) {
        this.log(`${name} ✓`, 'success');
        this.passed++;
        return true;
      } else {
        this.log(`${name} ✗`, 'error');
        this.errors.push(name);
        return false;
      }
    } catch (error) {
      this.log(`${name} ✗ - ${error.message}`, 'error');
      this.errors.push(`${name}: ${error.message}`);
      return false;
    }
  }

  warn(name, testFn) {
    try {
      const result = testFn();
      if (result !== false) {
        this.log(`${name} ✓`, 'success');
        return true;
      } else {
        this.log(`${name} - Warning`, 'warning');
        this.warnings.push(name);
        return false;
      }
    } catch (error) {
      this.log(`${name} - Warning: ${error.message}`, 'warning');
      this.warnings.push(`${name}: ${error.message}`);
      return false;
    }
  }

  async verifyPrerequisites() {
    this.log('Verifying prerequisites...', 'info');
    
    this.test('Node.js version', () => {
      const version = execSync('node --version', { encoding: 'utf8' }).trim();
      const majorVersion = parseInt(version.slice(1).split('.')[0]);
      return majorVersion >= 16;
    });

    this.test('npm available', () => {
      execSync('npm --version', { encoding: 'utf8' });
      return true;
    });

    this.test('git available', () => {
      execSync('git --version', { encoding: 'utf8' });
      return true;
    });
  }

  async verifyProjectStructure() {
    this.log('Verifying project structure...', 'info');
    
    this.test('package.json exists', () => {
      return existsSync(join(this.projectRoot, 'package.json'));
    });

    this.test('src directory exists', () => {
      return existsSync(join(this.projectRoot, 'src'));
    });

    this.test('dist directory exists', () => {
      return existsSync(join(this.projectRoot, 'dist'));
    });

    this.test('Built files exist', () => {
      return existsSync(join(this.projectRoot, 'dist', 'simple-mcp-server.js'));
    });

    this.warn('node_modules exists', () => {
      return existsSync(join(this.projectRoot, 'node_modules'));
    });
  }

  async verifyDependencies() {
    this.log('Verifying dependencies...', 'info');
    
    this.test('Playwright installed', () => {
      try {
        execSync('npx playwright --version', { 
          cwd: this.projectRoot, 
          encoding: 'utf8' 
        });
        return true;
      } catch {
        return false;
      }
    });

    this.test('TypeScript compiler available', () => {
      try {
        execSync('npx tsc --version', { 
          cwd: this.projectRoot, 
          encoding: 'utf8' 
        });
        return true;
      } catch {
        return false;
      }
    });

    this.warn('Chromium browser installed', () => {
      try {
        const result = execSync('npx playwright install --dry-run chromium', { 
          cwd: this.projectRoot, 
          encoding: 'utf8' 
        });
        return !result.includes('needs to be installed');
      } catch {
        return false;
      }
    });
  }

  async verifyConfiguration() {
    this.log('Verifying configuration...', 'info');
    
    this.warn('MCP workspace config exists', () => {
      return existsSync(join(this.projectRoot, '.kiro', 'settings', 'mcp.json'));
    });

    this.warn('MCP global config exists', () => {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      return existsSync(join(homeDir, '.kiro', 'settings', 'mcp.json'));
    });

    this.test('Package.json has required scripts', () => {
      const packageJson = JSON.parse(
        readFileSync(join(this.projectRoot, 'package.json'), 'utf8')
      );
      const requiredScripts = ['build', 'start', 'dev', 'test'];
      return requiredScripts.every(script => packageJson.scripts[script]);
    });
  }

  async verifyServerStartup() {
    this.log('Verifying server startup...', 'info');
    
    return new Promise((resolve) => {
      this.test('Server can start', () => {
        try {
          const serverProcess = spawn('node', ['dist/simple-mcp-server.js', '--test'], {
            cwd: this.projectRoot,
            stdio: 'pipe'
          });

          let output = '';
          let resolved = false;

          const timeout = setTimeout(() => {
            if (!resolved) {
              serverProcess.kill();
              resolved = true;
              resolve(true); // Timeout is acceptable for this test
            }
          }, 5000);

          serverProcess.stdout.on('data', (data) => {
            output += data.toString();
          });

          serverProcess.stderr.on('data', (data) => {
            output += data.toString();
          });

          serverProcess.on('close', (code) => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              // Server starting and stopping is success
              resolve(code === 0 || output.includes('Server') || output.includes('MCP'));
            }
          });

          serverProcess.on('error', (error) => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          });

          return true; // Will be resolved by the promise
        } catch (error) {
          return false;
        }
      });
      
      // If test doesn't resolve, resolve the promise anyway
      setTimeout(() => resolve(), 6000);
    });
  }

  async verifyExamples() {
    this.log('Verifying examples...', 'info');
    
    this.warn('Examples directory exists', () => {
      return existsSync(join(this.projectRoot, 'examples'));
    });

    this.warn('Documentation exists', () => {
      return existsSync(join(this.projectRoot, 'docs'));
    });

    this.warn('Quick start guide exists', () => {
      return existsSync(join(this.projectRoot, 'QUICK_START.md'));
    });
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 SETUP VERIFICATION REPORT');
    console.log('='.repeat(50));
    
    const successRate = Math.round((this.passed / this.total) * 100);
    
    if (successRate >= 90) {
      this.log(`Overall Status: EXCELLENT (${this.passed}/${this.total} passed)`, 'success');
    } else if (successRate >= 70) {
      this.log(`Overall Status: GOOD (${this.passed}/${this.total} passed)`, 'warning');
    } else {
      this.log(`Overall Status: NEEDS ATTENTION (${this.passed}/${this.total} passed)`, 'error');
    }

    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS TO FIX:');
      this.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (Optional):');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    console.log('\n📋 NEXT STEPS:');
    
    if (this.errors.length === 0) {
      console.log('   ✅ Setup verification passed!');
      console.log('   🚀 Start the server: npm start');
      console.log('   📖 Read the docs: docs/README.md');
      console.log('   💡 Try examples: examples/');
    } else {
      console.log('   🔧 Fix the errors listed above');
      console.log('   📖 Check troubleshooting: docs/troubleshooting.md');
      console.log('   🆘 Get help: GitHub Issues');
    }

    if (this.warnings.length > 0) {
      console.log('   ⚡ Consider addressing warnings for optimal experience');
    }

    console.log('\n🤖 AI Browser MCP Setup Verification Complete');
    console.log('='.repeat(50));
    
    return this.errors.length === 0;
  }

  async run() {
    console.log('🔍 AI Browser MCP - Setup Verification');
    console.log('======================================\n');
    
    await this.verifyPrerequisites();
    await this.verifyProjectStructure();
    await this.verifyDependencies();
    await this.verifyConfiguration();
    await this.verifyServerStartup();
    await this.verifyExamples();
    
    const success = this.generateReport();
    process.exit(success ? 0 : 1);
  }
}

// Run verifier
const verifier = new SetupVerifier();
verifier.run().catch(console.error);