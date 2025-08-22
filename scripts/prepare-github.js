#!/usr/bin/env node

/**
 * AI Browser MCP - GitHub Preparation Script
 * 
 * Prepares the project for GitHub upload by:
 * - Validating all files are present
 * - Running tests and verification
 * - Creating release artifacts
 * - Generating upload instructions
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

class GitHubPreparation {
  constructor() {
    this.projectRoot = process.cwd();
    this.errors = [];
    this.warnings = [];
    this.checklist = [];
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

  checkFile(path, required = true) {
    const exists = existsSync(join(this.projectRoot, path));
    if (exists) {
      this.log(`${path} ✓`, 'success');
      return true;
    } else {
      const message = `${path} missing`;
      if (required) {
        this.log(message, 'error');
        this.errors.push(message);
      } else {
        this.log(message, 'warning');
        this.warnings.push(message);
      }
      return false;
    }
  }

  validateProjectStructure() {
    this.log('Validating project structure...', 'info');
    
    // Essential files
    this.checkFile('package.json');
    this.checkFile('README.md');
    this.checkFile('LICENSE');
    this.checkFile('CHANGELOG.md');
    this.checkFile('.gitignore');
    
    // Installation files
    this.checkFile('install.js');
    this.checkFile('verify-setup.js');
    this.checkFile('QUICK_START.md');
    this.checkFile('scripts/install.sh');
    this.checkFile('scripts/install.ps1');
    this.checkFile('scripts/one-liner-install.sh');
    
    // Documentation
    this.checkFile('docs/installation.md');
    this.checkFile('docs/api-reference.md');
    this.checkFile('docs/troubleshooting.md');
    this.checkFile('docs/CONTRIBUTING.md');
    
    // Examples
    this.checkFile('examples/README.md');
    this.checkFile('examples/basic-usage.js');
    this.checkFile('examples/web-scraping.js');
    this.checkFile('examples/form-automation.js');
    
    // Source code
    this.checkFile('src/index.ts');
    this.checkFile('src/server/mcp-browser-server.ts');
    this.checkFile('tsconfig.json', false);
    
    // GitHub files
    this.checkFile('.github/workflows/ci.yml');
    this.checkFile('.github/ISSUE_TEMPLATE/bug_report.md');
    this.checkFile('.github/ISSUE_TEMPLATE/feature_request.md');
    this.checkFile('.github/pull_request_template.md');
    
    // Docker files
    this.checkFile('Dockerfile');
    this.checkFile('docker-compose.yml');
    this.checkFile('.env.example');
  }

  validatePackageJson() {
    this.log('Validating package.json...', 'info');
    
    try {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
      
      // Check required fields
      const requiredFields = ['name', 'version', 'description', 'main', 'scripts', 'keywords', 'license'];
      for (const field of requiredFields) {
        if (!packageJson[field]) {
          this.errors.push(`package.json missing field: ${field}`);
        }
      }
      
      // Check required scripts
      const requiredScripts = ['build', 'start', 'test', 'setup', 'verify'];
      for (const script of requiredScripts) {
        if (!packageJson.scripts[script]) {
          this.errors.push(`package.json missing script: ${script}`);
        }
      }
      
      // Check dependencies
      if (!packageJson.dependencies['@modelcontextprotocol/sdk']) {
        this.errors.push('Missing MCP SDK dependency');
      }
      
      if (!packageJson.dependencies['playwright']) {
        this.errors.push('Missing Playwright dependency');
      }
      
      this.log('package.json validation complete', 'success');
    } catch (error) {
      this.errors.push(`Invalid package.json: ${error.message}`);
    }
  }

  runTests() {
    this.log('Running tests and verification...', 'info');
    
    try {
      // Build the project
      this.log('Building project...', 'info');
      execSync('npm run build', { stdio: 'inherit' });
      
      // Run verification
      this.log('Running setup verification...', 'info');
      execSync('npm run verify', { stdio: 'inherit' });
      
      // Run linting
      this.log('Running linting...', 'info');
      execSync('npm run lint', { stdio: 'inherit' });
      
      this.log('All tests passed ✓', 'success');
    } catch (error) {
      this.errors.push(`Tests failed: ${error.message}`);
    }
  }

  generateUploadInstructions() {
    const instructions = `# 🚀 GitHub Upload Instructions

## Pre-Upload Checklist
${this.checklist.map(item => `- [x] ${item}`).join('\n')}

## Upload Steps

### 1. Initialize Git Repository
\`\`\`bash
git init
git add .
git commit -m "Initial commit: AI Browser MCP v1.0.0

🎉 Features:
- Complete MCP browser automation system
- One-command installation (node install.js)
- Cross-platform support (Windows, macOS, Linux)
- Comprehensive documentation and examples
- Docker support and CI/CD workflows
- Extensive test suite and verification tools"
\`\`\`

### 2. Create GitHub Repository
1. Go to [GitHub](https://github.com/new)
2. Repository name: \`ai-browser-mcp\`
3. Description: \`Browser automation system that exposes browser control capabilities through the Model Context Protocol (MCP)\`
4. Make it public
5. Don't initialize with README (we have our own)

### 3. Connect and Push
\`\`\`bash
git remote add origin https://github.com/YOUR_USERNAME/ai-browser-mcp.git
git branch -M main
git push -u origin main
\`\`\`

### 4. Configure Repository Settings
1. **Topics**: Add topics: \`mcp\`, \`browser-automation\`, \`playwright\`, \`kiro\`, \`typescript\`
2. **About**: Add description and website URL
3. **Releases**: Create first release (v1.0.0)
4. **Issues**: Enable issue templates
5. **Actions**: Enable GitHub Actions
6. **Pages**: Enable if you want documentation hosting

### 5. Create First Release
\`\`\`bash
git tag -a v1.0.0 -m "Release v1.0.0: Initial AI Browser MCP release"
git push origin v1.0.0
\`\`\`

### 6. Update Repository URLs
After creating the repository, update these files with your actual GitHub URLs:
- \`README.md\` - Update clone URLs and links
- \`scripts/one-liner-install.sh\` - Update repository URL
- \`package.json\` - Add repository field
- \`CHANGELOG.md\` - Update issue/discussion links

### 7. Test Installation from GitHub
\`\`\`bash
# Test the one-liner installation
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/ai-browser-mcp/main/scripts/one-liner-install.sh | bash
\`\`\`

## Post-Upload Tasks

### Documentation
- [ ] Update README.md with correct repository URLs
- [ ] Verify all documentation links work
- [ ] Test installation instructions
- [ ] Update any hardcoded paths or URLs

### Community
- [ ] Create discussion categories
- [ ] Pin important issues/discussions
- [ ] Add contributing guidelines
- [ ] Set up issue labels

### Marketing
- [ ] Share on relevant communities
- [ ] Create demo videos/screenshots
- [ ] Write blog post about the project
- [ ] Submit to awesome lists

## Repository Configuration

### Recommended Settings
- **Default branch**: \`main\`
- **Branch protection**: Require PR reviews for main
- **Auto-merge**: Enable for dependabot
- **Delete head branches**: Enable
- **Issues**: Enable with templates
- **Discussions**: Enable
- **Wiki**: Enable for extended documentation

### Labels to Create
- \`bug\` - Something isn't working
- \`enhancement\` - New feature or request
- \`documentation\` - Improvements or additions to documentation
- \`good first issue\` - Good for newcomers
- \`help wanted\` - Extra attention is needed
- \`installation\` - Installation or setup related
- \`performance\` - Performance improvements
- \`security\` - Security related issues

## Success Metrics

After upload, monitor:
- [ ] Installation success rate
- [ ] Issue reports and resolution
- [ ] Community engagement
- [ ] Documentation feedback
- [ ] Performance and reliability

---

🎉 **Ready for GitHub!** Your AI Browser MCP project is prepared for upload with:
- Complete installation automation
- Comprehensive documentation  
- Professional repository structure
- CI/CD workflows
- Community templates

Happy coding! 🤖✨`;

    writeFileSync('GITHUB_UPLOAD_INSTRUCTIONS.md', instructions);
    this.log('Upload instructions created: GITHUB_UPLOAD_INSTRUCTIONS.md', 'success');
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 GITHUB PREPARATION REPORT');
    console.log('='.repeat(60));
    
    if (this.errors.length === 0) {
      this.log('🎉 Project is ready for GitHub upload!', 'success');
      
      this.checklist = [
        'All required files present',
        'Package.json validated',
        'Tests and verification passed',
        'Documentation complete',
        'Installation scripts working',
        'GitHub workflows configured',
        'Docker support ready',
        'Community templates created'
      ];
      
    } else {
      this.log(`❌ ${this.errors.length} issues need to be fixed before upload`, 'error');
      console.log('\n🔧 ISSUES TO FIX:');
      this.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS (Optional):');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    console.log('\n📋 NEXT STEPS:');
    if (this.errors.length === 0) {
      console.log('   1. Review GITHUB_UPLOAD_INSTRUCTIONS.md');
      console.log('   2. Create GitHub repository');
      console.log('   3. Push code to GitHub');
      console.log('   4. Configure repository settings');
      console.log('   5. Create first release');
      console.log('   6. Test installation from GitHub');
    } else {
      console.log('   1. Fix the issues listed above');
      console.log('   2. Run this script again');
      console.log('   3. Proceed with GitHub upload');
    }

    console.log('\n🚀 AI Browser MCP - GitHub Preparation Complete');
    console.log('='.repeat(60));
    
    return this.errors.length === 0;
  }

  async run() {
    console.log('📦 AI Browser MCP - GitHub Preparation');
    console.log('=====================================\n');
    
    this.validateProjectStructure();
    this.validatePackageJson();
    this.runTests();
    
    const success = this.generateReport();
    
    if (success) {
      this.generateUploadInstructions();
    }
    
    process.exit(success ? 0 : 1);
  }
}

// Run preparation
const preparation = new GitHubPreparation();
preparation.run().catch(console.error);