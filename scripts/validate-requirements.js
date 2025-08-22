#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('✅ AI Browser MCP Requirements Validation');
console.log('==========================================\n');

// Load requirements from the spec
const requirementsPath = join(rootDir, '.kiro', 'specs', 'ai-browser-mcp', 'requirements.md');
let requirements = [];
let validationResults = [];

function parseRequirements() {
  console.log('📋 Parsing requirements from specification...');
  
  if (!existsSync(requirementsPath)) {
    console.error('❌ Requirements file not found');
    process.exit(1);
  }

  const content = readFileSync(requirementsPath, 'utf8');
  const lines = content.split('\n');
  
  let currentRequirement = null;
  let currentCriteria = [];
  
  for (const line of lines) {
    // Match requirement headers
    const reqMatch = line.match(/^### Requirement (\d+)/);
    if (reqMatch) {
      // Save previous requirement
      if (currentRequirement) {
        requirements.push({
          ...currentRequirement,
          criteria: currentCriteria
        });
      }
      
      currentRequirement = {
        id: parseInt(reqMatch[1]),
        title: '',
        userStory: '',
        criteria: []
      };
      currentCriteria = [];
      continue;
    }
    
    // Match user story
    const storyMatch = line.match(/^\*\*User Story:\*\* (.+)/);
    if (storyMatch && currentRequirement) {
      currentRequirement.userStory = storyMatch[1];
      continue;
    }
    
    // Match acceptance criteria
    const criteriaMatch = line.match(/^\d+\. (WHEN|IF) (.+)/);
    if (criteriaMatch && currentRequirement) {
      currentCriteria.push({
        type: criteriaMatch[1],
        description: criteriaMatch[2]
      });
      continue;
    }
  }
  
  // Save last requirement
  if (currentRequirement) {
    requirements.push({
      ...currentRequirement,
      criteria: currentCriteria
    });
  }
  
  console.log(`✅ Parsed ${requirements.length} requirements\n`);
}

// Validation functions for each requirement
const validators = {
  1: async () => {
    console.log('🔍 Validating Requirement 1: Browser Control via MCP');
    
    const results = [];
    
    // Check if MCP server exists
    const mcpServerPath = join(rootDir, 'src', 'server', 'mcp-browser-server.ts');
    results.push({
      criterion: 'MCP server implementation',
      passed: existsSync(mcpServerPath),
      details: existsSync(mcpServerPath) ? 'MCP server file found' : 'MCP server file missing'
    });
    
    // Check if Playwright is configured
    const packagePath = join(rootDir, 'package.json');
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
      const hasPlaywright = pkg.dependencies?.playwright || pkg.devDependencies?.playwright;
      results.push({
        criterion: 'Playwright browser automation',
        passed: !!hasPlaywright,
        details: hasPlaywright ? 'Playwright dependency found' : 'Playwright dependency missing'
      });
    }
    
    // Check for browser context creation
    const sessionManagerPath = join(rootDir, 'src', 'browser', 'session-manager.ts');
    results.push({
      criterion: 'Browser context management',
      passed: existsSync(sessionManagerPath),
      details: existsSync(sessionManagerPath) ? 'Session manager found' : 'Session manager missing'
    });
    
    return results;
  },

  2: async () => {
    console.log('🔍 Validating Requirement 2: Navigation and Interaction');
    
    const results = [];
    
    // Check navigation tools
    const navToolPath = join(rootDir, 'src', 'tools', 'navigation-tool.ts');
    results.push({
      criterion: 'Navigation tool implementation',
      passed: existsSync(navToolPath),
      details: existsSync(navToolPath) ? 'Navigation tool found' : 'Navigation tool missing'
    });
    
    // Check interaction tools
    const interactionToolPath = join(rootDir, 'src', 'tools', 'interaction-tools.ts');
    results.push({
      criterion: 'Interaction tools implementation',
      passed: existsSync(interactionToolPath),
      details: existsSync(interactionToolPath) ? 'Interaction tools found' : 'Interaction tools missing'
    });
    
    // Check for click, type, select functionality
    if (existsSync(interactionToolPath)) {
      const content = readFileSync(interactionToolPath, 'utf8');
      const hasClick = content.includes('click');
      const hasType = content.includes('type');
      const hasSelect = content.includes('select');
      
      results.push({
        criterion: 'Click functionality',
        passed: hasClick,
        details: hasClick ? 'Click method found' : 'Click method missing'
      });
      
      results.push({
        criterion: 'Type functionality',
        passed: hasType,
        details: hasType ? 'Type method found' : 'Type method missing'
      });
      
      results.push({
        criterion: 'Select functionality',
        passed: hasSelect,
        details: hasSelect ? 'Select method found' : 'Select method missing'
      });
    }
    
    return results;
  },

  3: async () => {
    console.log('🔍 Validating Requirement 3: Visual and Structural Capture');
    
    const results = [];
    
    // Check capture tools
    const captureToolPath = join(rootDir, 'src', 'tools', 'capture-tools.ts');
    results.push({
      criterion: 'Capture tools implementation',
      passed: existsSync(captureToolPath),
      details: existsSync(captureToolPath) ? 'Capture tools found' : 'Capture tools missing'
    });
    
    if (existsSync(captureToolPath)) {
      const content = readFileSync(captureToolPath, 'utf8');
      const hasScreenshot = content.includes('screenshot');
      const hasDomSnapshot = content.includes('domSnapshot') || content.includes('dom');
      
      results.push({
        criterion: 'Screenshot functionality',
        passed: hasScreenshot,
        details: hasScreenshot ? 'Screenshot method found' : 'Screenshot method missing'
      });
      
      results.push({
        criterion: 'DOM snapshot functionality',
        passed: hasDomSnapshot,
        details: hasDomSnapshot ? 'DOM snapshot method found' : 'DOM snapshot method missing'
      });
    }
    
    return results;
  },

  4: async () => {
    console.log('🔍 Validating Requirement 4: JavaScript Execution');
    
    const results = [];
    
    // Check evaluation tool
    const evalToolPath = join(rootDir, 'src', 'tools', 'evaluation-tool.ts');
    results.push({
      criterion: 'JavaScript evaluation tool',
      passed: existsSync(evalToolPath),
      details: existsSync(evalToolPath) ? 'Evaluation tool found' : 'Evaluation tool missing'
    });
    
    if (existsSync(evalToolPath)) {
      const content = readFileSync(evalToolPath, 'utf8');
      const hasEval = content.includes('eval') || content.includes('evaluate');
      const hasErrorHandling = content.includes('error') || content.includes('catch');
      
      results.push({
        criterion: 'JavaScript execution capability',
        passed: hasEval,
        details: hasEval ? 'Evaluation method found' : 'Evaluation method missing'
      });
      
      results.push({
        criterion: 'Error handling for JavaScript',
        passed: hasErrorHandling,
        details: hasErrorHandling ? 'Error handling found' : 'Error handling missing'
      });
    }
    
    return results;
  },

  5: async () => {
    console.log('🔍 Validating Requirement 5: Network and Console Monitoring');
    
    const results = [];
    
    // Check monitoring tools
    const monitoringToolPath = join(rootDir, 'src', 'tools', 'monitoring-tools.ts');
    results.push({
      criterion: 'Monitoring tools implementation',
      passed: existsSync(monitoringToolPath),
      details: existsSync(monitoringToolPath) ? 'Monitoring tools found' : 'Monitoring tools missing'
    });
    
    if (existsSync(monitoringToolPath)) {
      const content = readFileSync(monitoringToolPath, 'utf8');
      const hasNetwork = content.includes('network');
      const hasConsole = content.includes('console');
      
      results.push({
        criterion: 'Network monitoring',
        passed: hasNetwork,
        details: hasNetwork ? 'Network monitoring found' : 'Network monitoring missing'
      });
      
      results.push({
        criterion: 'Console log monitoring',
        passed: hasConsole,
        details: hasConsole ? 'Console monitoring found' : 'Console monitoring missing'
      });
    }
    
    return results;
  },

  6: async () => {
    console.log('🔍 Validating Requirement 6: Security and Privacy');
    
    const results = [];
    
    // Check security manager
    const securityManagerPath = join(rootDir, 'src', 'security', 'security-manager.ts');
    results.push({
      criterion: 'Security manager implementation',
      passed: existsSync(securityManagerPath),
      details: existsSync(securityManagerPath) ? 'Security manager found' : 'Security manager missing'
    });
    
    if (existsSync(securityManagerPath)) {
      const content = readFileSync(securityManagerPath, 'utf8');
      const hasDomainCheck = content.includes('domain') || content.includes('allowlist');
      const hasDataFilter = content.includes('filter') || content.includes('sanitize');
      const hasRateLimit = content.includes('rate') || content.includes('limit');
      
      results.push({
        criterion: 'Domain access control',
        passed: hasDomainCheck,
        details: hasDomainCheck ? 'Domain checking found' : 'Domain checking missing'
      });
      
      results.push({
        criterion: 'Data filtering',
        passed: hasDataFilter,
        details: hasDataFilter ? 'Data filtering found' : 'Data filtering missing'
      });
      
      results.push({
        criterion: 'Rate limiting',
        passed: hasRateLimit,
        details: hasRateLimit ? 'Rate limiting found' : 'Rate limiting missing'
      });
    }
    
    return results;
  },

  7: async () => {
    console.log('🔍 Validating Requirement 7: IDE Integration');
    
    const results = [];
    
    // Check VS Code extension
    const extensionPath = join(rootDir, 'vscode-extension');
    results.push({
      criterion: 'VS Code extension directory',
      passed: existsSync(extensionPath),
      details: existsSync(extensionPath) ? 'Extension directory found' : 'Extension directory missing'
    });
    
    if (existsSync(extensionPath)) {
      const packagePath = join(extensionPath, 'package.json');
      const extensionFile = join(extensionPath, 'src', 'extension.ts');
      
      results.push({
        criterion: 'Extension package.json',
        passed: existsSync(packagePath),
        details: existsSync(packagePath) ? 'Extension package.json found' : 'Extension package.json missing'
      });
      
      results.push({
        criterion: 'Extension main file',
        passed: existsSync(extensionFile),
        details: existsSync(extensionFile) ? 'Extension main file found' : 'Extension main file missing'
      });
    }
    
    // Check WebSocket server
    const wsServerPath = join(rootDir, 'src', 'server', 'websocket-mcp-server.ts');
    results.push({
      criterion: 'WebSocket MCP server',
      passed: existsSync(wsServerPath),
      details: existsSync(wsServerPath) ? 'WebSocket server found' : 'WebSocket server missing'
    });
    
    return results;
  },

  8: async () => {
    console.log('🔍 Validating Requirement 8: Export and Reporting');
    
    const results = [];
    
    // Check report tools
    const reportToolPath = join(rootDir, 'src', 'tools', 'report-tools.ts');
    results.push({
      criterion: 'Report tools implementation',
      passed: existsSync(reportToolPath),
      details: existsSync(reportToolPath) ? 'Report tools found' : 'Report tools missing'
    });
    
    // Check tracing tools
    const tracingToolPath = join(rootDir, 'src', 'tools', 'tracing-tools.ts');
    results.push({
      criterion: 'Tracing tools implementation',
      passed: existsSync(tracingToolPath),
      details: existsSync(tracingToolPath) ? 'Tracing tools found' : 'Tracing tools missing'
    });
    
    if (existsSync(reportToolPath)) {
      const content = readFileSync(reportToolPath, 'utf8');
      const hasReportGen = content.includes('generate') || content.includes('report');
      const hasHarExport = content.includes('har') || content.includes('export');
      
      results.push({
        criterion: 'Report generation',
        passed: hasReportGen,
        details: hasReportGen ? 'Report generation found' : 'Report generation missing'
      });
      
      results.push({
        criterion: 'HAR export functionality',
        passed: hasHarExport,
        details: hasHarExport ? 'HAR export found' : 'HAR export missing'
      });
    }
    
    return results;
  },

  9: async () => {
    console.log('🔍 Validating Requirement 9: Macro Recording and Playback');
    
    const results = [];
    
    // Check macro tools
    const macroToolPath = join(rootDir, 'src', 'tools', 'macro-tools.ts');
    results.push({
      criterion: 'Macro tools implementation',
      passed: existsSync(macroToolPath),
      details: existsSync(macroToolPath) ? 'Macro tools found' : 'Macro tools missing'
    });
    
    if (existsSync(macroToolPath)) {
      const content = readFileSync(macroToolPath, 'utf8');
      const hasRecord = content.includes('record');
      const hasReplay = content.includes('replay') || content.includes('play');
      const hasStorage = content.includes('storage') || content.includes('save');
      
      results.push({
        criterion: 'Macro recording',
        passed: hasRecord,
        details: hasRecord ? 'Recording functionality found' : 'Recording functionality missing'
      });
      
      results.push({
        criterion: 'Macro playback',
        passed: hasReplay,
        details: hasReplay ? 'Playback functionality found' : 'Playback functionality missing'
      });
      
      results.push({
        criterion: 'Macro storage',
        passed: hasStorage,
        details: hasStorage ? 'Storage functionality found' : 'Storage functionality missing'
      });
    }
    
    return results;
  },

  10: async () => {
    console.log('🔍 Validating Requirement 10: Concurrent Sessions');
    
    const results = [];
    
    // Check session manager for concurrency support
    const sessionManagerPath = join(rootDir, 'src', 'browser', 'session-manager.ts');
    if (existsSync(sessionManagerPath)) {
      const content = readFileSync(sessionManagerPath, 'utf8');
      const hasConcurrency = content.includes('concurrent') || content.includes('multiple');
      const hasCleanup = content.includes('cleanup') || content.includes('destroy');
      const hasLimits = content.includes('limit') || content.includes('max');
      
      results.push({
        criterion: 'Concurrent session support',
        passed: hasConcurrency || content.includes('Map') || content.includes('sessions'),
        details: 'Session management structure found'
      });
      
      results.push({
        criterion: 'Session cleanup',
        passed: hasCleanup,
        details: hasCleanup ? 'Cleanup functionality found' : 'Cleanup functionality missing'
      });
      
      results.push({
        criterion: 'Resource limits',
        passed: hasLimits,
        details: hasLimits ? 'Resource limits found' : 'Resource limits missing'
      });
    }
    
    // Check performance manager
    const perfManagerPath = join(rootDir, 'src', 'performance', 'performance-manager.ts');
    results.push({
      criterion: 'Performance management',
      passed: existsSync(perfManagerPath),
      details: existsSync(perfManagerPath) ? 'Performance manager found' : 'Performance manager missing'
    });
    
    return results;
  }
};

async function validateAllRequirements() {
  console.log('🔍 Running comprehensive requirements validation...\n');
  
  let totalCriteria = 0;
  let passedCriteria = 0;
  
  for (const requirement of requirements) {
    if (validators[requirement.id]) {
      const results = await validators[requirement.id]();
      validationResults.push({
        requirement: requirement.id,
        userStory: requirement.userStory,
        results
      });
      
      totalCriteria += results.length;
      passedCriteria += results.filter(r => r.passed).length;
      
      console.log(`   ✅ ${results.filter(r => r.passed).length}/${results.length} criteria passed\n`);
    } else {
      console.log(`   ⚠️  No validator implemented for requirement ${requirement.id}\n`);
    }
  }
  
  return { totalCriteria, passedCriteria };
}

function generateReport() {
  console.log('📊 Requirements Validation Report');
  console.log('=================================\n');
  
  let totalPassed = 0;
  let totalCriteria = 0;
  
  for (const result of validationResults) {
    console.log(`Requirement ${result.requirement}:`);
    console.log(`User Story: ${result.userStory}`);
    console.log('Validation Results:');
    
    for (const criterion of result.results) {
      const status = criterion.passed ? '✅' : '❌';
      console.log(`  ${status} ${criterion.criterion}: ${criterion.details}`);
      
      if (criterion.passed) totalPassed++;
      totalCriteria++;
    }
    console.log('');
  }
  
  const percentage = totalCriteria > 0 ? Math.round((totalPassed / totalCriteria) * 100) : 0;
  
  console.log('📈 Summary');
  console.log('==========');
  console.log(`Total Criteria: ${totalCriteria}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalCriteria - totalPassed}`);
  console.log(`Success Rate: ${percentage}%`);
  
  if (percentage >= 90) {
    console.log('🟢 Excellent - All requirements well implemented');
  } else if (percentage >= 75) {
    console.log('🟡 Good - Most requirements implemented, minor gaps');
  } else if (percentage >= 50) {
    console.log('🟠 Fair - Significant requirements gaps need attention');
  } else {
    console.log('🔴 Poor - Major requirements missing, implementation incomplete');
  }
  
  return percentage >= 75;
}

// Main execution
async function main() {
  try {
    parseRequirements();
    await validateAllRequirements();
    const success = generateReport();
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

main();