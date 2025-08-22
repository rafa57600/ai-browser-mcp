#!/usr/bin/env node

/**
 * Basic Usage Example
 * 
 * This script demonstrates the fundamental operations of the AI Browser MCP server:
 * - Connecting to the server
 * - Creating a browser context
 * - Navigating to a webpage
 * - Taking a screenshot
 * - Extracting data with JavaScript
 */

const { MCPClient } = require('@modelcontextprotocol/client');

async function basicUsageExample() {
  console.log('🚀 Starting AI Browser MCP Basic Usage Example\n');
  
  const client = new MCPClient();
  
  try {
    // Step 1: Connect to the MCP server
    console.log('📡 Connecting to MCP server...');
    await client.connect('http://localhost:3000');
    console.log('✅ Connected successfully\n');
    
    // Step 2: Create a new browser context
    console.log('🌐 Creating browser context...');
    const context = await client.callTool('browser.newContext', {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (compatible; AI-Browser-Example/1.0)'
    });
    console.log(`✅ Browser context created: ${context.sessionId}\n`);
    
    // Step 3: Navigate to a webpage
    console.log('🔗 Navigating to example.com...');
    const navigation = await client.callTool('browser.goto', {
      url: 'https://example.com',
      waitUntil: 'networkidle'
    });
    console.log(`✅ Navigation completed: ${navigation.url}`);
    console.log(`   Title: ${navigation.title}`);
    console.log(`   Status: ${navigation.status}`);
    console.log(`   Load time: ${navigation.loadTime}ms\n`);
    
    // Step 4: Take a screenshot
    console.log('📸 Taking screenshot...');
    const screenshot = await client.callTool('browser.screenshot', {
      fullPage: true,
      format: 'png'
    });
    console.log(`✅ Screenshot captured: ${screenshot.width}x${screenshot.height}`);
    console.log(`   Format: ${screenshot.format}`);
    console.log(`   Size: ${Math.round(screenshot.data.length / 1024)}KB\n`);
    
    // Step 5: Extract page information
    console.log('📊 Extracting page information...');
    const pageInfo = await client.callTool('browser.eval', {
      code: `
        return {
          title: document.title,
          url: window.location.href,
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
            tag: h.tagName,
            text: h.textContent.trim()
          })),
          links: Array.from(document.querySelectorAll('a[href]')).map(a => ({
            text: a.textContent.trim(),
            href: a.href
          })).slice(0, 5), // First 5 links only
          paragraphs: Array.from(document.querySelectorAll('p')).map(p => 
            p.textContent.trim()
          ).filter(text => text.length > 0).slice(0, 3), // First 3 paragraphs
          meta: {
            description: document.querySelector('meta[name="description"]')?.content || '',
            keywords: document.querySelector('meta[name="keywords"]')?.content || '',
            viewport: document.querySelector('meta[name="viewport"]')?.content || ''
          }
        };
      `
    });
    
    console.log('✅ Page information extracted:');
    console.log(`   Title: ${pageInfo.value.title}`);
    console.log(`   URL: ${pageInfo.value.url}`);
    console.log(`   Headings: ${pageInfo.value.headings.length}`);
    console.log(`   Links: ${pageInfo.value.links.length}`);
    console.log(`   Paragraphs: ${pageInfo.value.paragraphs.length}\n`);
    
    // Display extracted content
    if (pageInfo.value.headings.length > 0) {
      console.log('📝 Headings found:');
      pageInfo.value.headings.forEach((heading, index) => {
        console.log(`   ${index + 1}. ${heading.tag}: ${heading.text}`);
      });
      console.log();
    }
    
    if (pageInfo.value.paragraphs.length > 0) {
      console.log('📄 First few paragraphs:');
      pageInfo.value.paragraphs.forEach((paragraph, index) => {
        const truncated = paragraph.length > 100 
          ? paragraph.substring(0, 100) + '...' 
          : paragraph;
        console.log(`   ${index + 1}. ${truncated}`);
      });
      console.log();
    }
    
    // Step 6: Get network activity
    console.log('🌐 Checking network activity...');
    const networkLogs = await client.callTool('browser.network.getRecent', {
      limit: 5
    });
    
    if (networkLogs.length > 0) {
      console.log('✅ Recent network requests:');
      networkLogs.forEach((log, index) => {
        console.log(`   ${index + 1}. ${log.method} ${log.url}`);
        console.log(`      Status: ${log.status}, Duration: ${log.duration}ms`);
      });
    } else {
      console.log('ℹ️  No network logs available');
    }
    console.log();
    
    // Step 7: Get console logs
    console.log('📋 Checking console logs...');
    const consoleLogs = await client.callTool('browser.console.getRecent', {
      limit: 5
    });
    
    if (consoleLogs.length > 0) {
      console.log('✅ Recent console logs:');
      consoleLogs.forEach((log, index) => {
        console.log(`   ${index + 1}. [${log.level.toUpperCase()}] ${log.message}`);
      });
    } else {
      console.log('ℹ️  No console logs available');
    }
    console.log();
    
    console.log('🎉 Basic usage example completed successfully!');
    
  } catch (error) {
    console.error('❌ Error occurred:', error.message);
    
    if (error.data) {
      console.error('   Category:', error.data.category);
      console.error('   Details:', error.data.details);
    }
    
    process.exit(1);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await client.disconnect();
    console.log('✅ Disconnected from server');
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const url = args[0] || 'https://example.com';

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AI Browser MCP - Basic Usage Example

Usage: node basic-usage.js [URL] [OPTIONS]

Arguments:
  URL                    Target URL to visit (default: https://example.com)

Options:
  -h, --help            Show this help message
  --server-url URL      MCP server URL (default: http://localhost:3000)

Examples:
  node basic-usage.js
  node basic-usage.js https://github.com
  node basic-usage.js https://news.ycombinator.com --server-url http://localhost:3001
`);
  process.exit(0);
}

// Override URL if provided
if (url !== 'https://example.com') {
  // Modify the example to use the provided URL
  basicUsageExample.toString = basicUsageExample.toString().replace(
    'https://example.com',
    url
  );
}

// Run the example
basicUsageExample().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});