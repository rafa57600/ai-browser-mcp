#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🚀 AI Browser MCP Deployment Validation');
console.log('========================================\n');

let validationErrors = [];
let validationWarnings = [];

// Check package.json and dependencies
function validatePackageJson() {
  console.log('📦 Validating package.json...');
  
  try {
    const packagePath = join(rootDir, 'package.json');
    if (!existsSync(packagePath)) {
      validationErrors.push('package.json not found');
      return;
    }

    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    // Check required fields
    const requiredFields = ['name', 'version', 'description', 'main', 'scripts'];
    for (const field of requiredFields) {
      if (!pkg[field]) {
        validationErrors.push(`package.json missing required field: ${field}`);
      }
    }

    // Check required scripts
    const requiredScripts = ['start', 'build', 'test'];
    for (const script of requiredScripts) {
      if (!pkg.scripts[script]) {
        validationWarnings.push(`package.json missing recommended script: ${script}`);
      }
    }

    // Check dependencies
    const requiredDeps = ['playwright', 'ws', 'winston'];
    for (const dep of requiredDeps) {
      if (!pkg.dependencies[dep] && !pkg.devDependencies[dep]) {
        validationErrors.push(`Missing required dependency: ${dep}`);
      }
    }

    console.log('✅ package.json validation complete');
  } catch (error) {
    validationErrors.push(`Error validating package.json: ${error.message}`);
  }
}

// Check TypeScript configuration
function validateTypeScript() {
  console.log('🔧 Validating TypeScript configuration...');
  
  try {
    const tsconfigPath = join(rootDir, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) {
      validationErrors.push('tsconfig.json not found');
      return;
    }

    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    
    // Check compiler options
    if (!tsconfig.compilerOptions) {
      validationErrors.push('tsconfig.json missing compilerOptions');
      return;
    }

    const requiredOptions = ['target', 'module', 'outDir', 'rootDir'];
    for (const option of requiredOptions) {
      if (!tsconfig.compilerOptions[option]) {
        validationWarnings.push(`tsconfig.json missing recommended option: ${option}`);
      }
    }

    console.log('✅ TypeScript configuration validation complete');
  } catch (error) {
    validationErrors.push(`Error validating TypeScript config: ${error.message}`);
  }
}

// Check source code structure
function validateSourceStructure() {
  console.log('📁 Validating source code structure...');
  
  const requiredDirs = [
    'src',
    'src/server',
    'src/browser',
    'src/tools',
    'src/security',
    'src/performance',
    'src/config',
    'src/monitoring',
    'src/errors',
    'tests',
    'tests/unit',
    'tests/integration',
    'tests/e2e',
    'vscode-extension',
    'docs'
  ];

  for (const dir of requiredDirs) {
    const dirPath = join(rootDir, dir);
    if (!existsSync(dirPath)) {
      validationErrors.push(`Required directory missing: ${dir}`);
    }
  }

  const requiredFiles = [
    'src/index.ts',
    'src/server/mcp-browser-server.ts',
    'src/browser/session-manager.ts',
    'src/security/security-manager.ts',
    'README.md',
    '.gitignore'
  ];

  for (const file of requiredFiles) {
    const filePath = join(rootDir, file);
    if (!existsSync(filePath)) {
      validationErrors.push(`Required file missing: ${file}`);
    }
  }

  console.log('✅ Source structure validation complete');
}

// Check build process
function validateBuild() {
  console.log('🔨 Validating build process...');
  
  try {
    // Check if build script exists and works
    execSync('npm run build', { 
      cwd: rootDir, 
      stdio: 'pipe',
      timeout: 60000 
    });

    // Check if dist directory was created
    const distPath = join(rootDir, 'dist');
    if (!existsSync(distPath)) {
      validationErrors.push('Build process did not create dist directory');
    } else {
      // Check for main entry point
      const mainEntry = join(distPath, 'index.js');
      if (!existsSync(mainEntry)) {
        validationErrors.push('Build process did not create main entry point');
      }
    }

    console.log('✅ Build process validation complete');
  } catch (error) {
    validationErrors.push(`Build process failed: ${error.message}`);
  }
}

// Check test coverage
function validateTests() {
  console.log('🧪 Validating test suite...');
  
  try {
    // Run tests with coverage
    const testOutput = execSync('npm test -- --run --reporter=json', { 
      cwd: rootDir, 
      stdio: 'pipe',
      timeout: 120000,
      encoding: 'utf8'
    });

    const testResults = JSON.parse(testOutput);
    
    if (testResults.numFailedTests > 0) {
      validationWarnings.push(`${testResults.numFailedTests} tests are failing`);
    }

    if (testResults.numPassedTests < 100) {
      validationWarnings.push('Test coverage appears low (less than 100 passing tests)');
    }

    console.log(`✅ Test validation complete (${testResults.numPassedTests} passed, ${testResults.numFailedTests} failed)`);
  } catch (error) {
    validationWarnings.push(`Test execution failed: ${error.message}`);
  }
}

// Check security configuration
function validateSecurity() {
  console.log('🔒 Validating security configuration...');
  
  try {
    // Check for security-related files
    const securityFiles = [
      'src/security/security-manager.ts',
      '.gitignore'
    ];

    for (const file of securityFiles) {
      const filePath = join(rootDir, file);
      if (!existsSync(filePath)) {
        validationErrors.push(`Security file missing: ${file}`);
      }
    }

    // Check .gitignore for sensitive patterns
    const gitignorePath = join(rootDir, '.gitignore');
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, 'utf8');
      const requiredPatterns = ['node_modules', '*.log', '.env', 'dist'];
      
      for (const pattern of requiredPatterns) {
        if (!gitignore.includes(pattern)) {
          validationWarnings.push(`gitignore missing pattern: ${pattern}`);
        }
      }
    }

    console.log('✅ Security validation complete');
  } catch (error) {
    validationErrors.push(`Error validating security: ${error.message}`);
  }
}

// Check documentation
function validateDocumentation() {
  console.log('📚 Validating documentation...');
  
  const requiredDocs = [
    'README.md',
    'docs/api-reference.md',
    'docs/developer-setup.md',
    'docs/deployment.md',
    'docs/troubleshooting.md'
  ];

  for (const doc of requiredDocs) {
    const docPath = join(rootDir, doc);
    if (!existsSync(docPath)) {
      validationWarnings.push(`Documentation missing: ${doc}`);
    } else {
      // Check if documentation is not empty
      const content = readFileSync(docPath, 'utf8');
      if (content.trim().length < 100) {
        validationWarnings.push(`Documentation appears incomplete: ${doc}`);
      }
    }
  }

  console.log('✅ Documentation validation complete');
}

// Check VS Code extension
function validateVSCodeExtension() {
  console.log('🔌 Validating VS Code extension...');
  
  try {
    const extensionPath = join(rootDir, 'vscode-extension');
    if (!existsSync(extensionPath)) {
      validationErrors.push('VS Code extension directory missing');
      return;
    }

    const packagePath = join(extensionPath, 'package.json');
    if (!existsSync(packagePath)) {
      validationErrors.push('VS Code extension package.json missing');
      return;
    }

    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    // Check extension-specific fields
    const requiredFields = ['name', 'displayName', 'description', 'version', 'engines', 'activationEvents'];
    for (const field of requiredFields) {
      if (!pkg[field]) {
        validationErrors.push(`VS Code extension package.json missing: ${field}`);
      }
    }

    // Check for main extension file
    const mainFile = join(extensionPath, 'src', 'extension.ts');
    if (!existsSync(mainFile)) {
      validationErrors.push('VS Code extension main file missing');
    }

    console.log('✅ VS Code extension validation complete');
  } catch (error) {
    validationErrors.push(`Error validating VS Code extension: ${error.message}`);
  }
}

// Check deployment readiness
function validateDeployment() {
  console.log('🚀 Validating deployment readiness...');
  
  try {
    // Check for deployment scripts
    const deployScript = join(rootDir, 'scripts', 'deploy.sh');
    if (!existsSync(deployScript)) {
      validationWarnings.push('Deployment script missing');
    }

    // Check for configuration files
    const configDir = join(rootDir, 'config');
    if (existsSync(configDir)) {
      const requiredConfigs = ['development.json', 'production.json'];
      for (const config of requiredConfigs) {
        const configPath = join(configDir, config);
        if (!existsSync(configPath)) {
          validationWarnings.push(`Configuration missing: ${config}`);
        }
      }
    }

    // Check for Docker files (if using containerization)
    const dockerFile = join(rootDir, 'Dockerfile');
    const dockerCompose = join(rootDir, 'docker-compose.yml');
    
    if (!existsSync(dockerFile) && !existsSync(dockerCompose)) {
      validationWarnings.push('No containerization files found (Dockerfile or docker-compose.yml)');
    }

    console.log('✅ Deployment validation complete');
  } catch (error) {
    validationErrors.push(`Error validating deployment: ${error.message}`);
  }
}

// Run all validations
async function runValidation() {
  console.log('Starting comprehensive deployment validation...\n');

  validatePackageJson();
  validateTypeScript();
  validateSourceStructure();
  validateBuild();
  validateTests();
  validateSecurity();
  validateDocumentation();
  validateVSCodeExtension();
  validateDeployment();

  console.log('\n📊 Validation Summary');
  console.log('=====================');

  if (validationErrors.length === 0) {
    console.log('✅ No critical errors found!');
  } else {
    console.log(`❌ ${validationErrors.length} critical error(s) found:`);
    validationErrors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }

  if (validationWarnings.length === 0) {
    console.log('✅ No warnings found!');
  } else {
    console.log(`⚠️  ${validationWarnings.length} warning(s) found:`);
    validationWarnings.forEach((warning, index) => {
      console.log(`   ${index + 1}. ${warning}`);
    });
  }

  console.log('\n🎯 Deployment Readiness Score');
  const totalIssues = validationErrors.length + validationWarnings.length;
  const maxScore = 100;
  const score = Math.max(0, maxScore - (validationErrors.length * 10) - (validationWarnings.length * 2));
  
  console.log(`Score: ${score}/${maxScore}`);
  
  if (score >= 90) {
    console.log('🟢 Excellent - Ready for production deployment');
  } else if (score >= 70) {
    console.log('🟡 Good - Minor issues should be addressed');
  } else if (score >= 50) {
    console.log('🟠 Fair - Several issues need attention');
  } else {
    console.log('🔴 Poor - Critical issues must be resolved before deployment');
  }

  console.log('\n📋 Next Steps:');
  if (validationErrors.length > 0) {
    console.log('1. Fix all critical errors listed above');
  }
  if (validationWarnings.length > 0) {
    console.log('2. Address warnings to improve deployment quality');
  }
  console.log('3. Run validation again to verify fixes');
  console.log('4. Proceed with deployment when score is 90+');

  // Exit with appropriate code
  process.exit(validationErrors.length > 0 ? 1 : 0);
}

// Run the validation
runValidation().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});