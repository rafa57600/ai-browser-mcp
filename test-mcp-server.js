#!/usr/bin/env node

// Simple test script to verify the MCP server works
import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

console.log('🧪 Testing AI Browser MCP Server...\n');

// Test 1: Check if the server starts
console.log('1. Starting MCP server...');
const server = spawn('node', ['dist/simple-server.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

// Test 2: Send MCP requests
const testRequests = [
  // List tools request
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  },
  // Create browser context
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'browser.newContext',
      arguments: {
        viewport: { width: 1280, height: 720 }
      }
    }
  }
];

let testIndex = 0;

function sendNextTest() {
  if (testIndex >= testRequests.length) {
    console.log('\n✅ All tests completed!');
    server.kill();
    return;
  }

  const request = testRequests[testIndex];
  console.log(`\n📤 Sending request ${testIndex + 1}:`, JSON.stringify(request, null, 2));
  
  server.stdin.write(JSON.stringify(request) + '\n');
  testIndex++;
}

server.stdout.on('data', (data) => {
  const response = data.toString().trim();
  if (response) {
    console.log('📥 Response:', response);
    
    // Wait a bit before sending next test
    setTimeout(sendNextTest, 1000);
  }
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
});

server.on('close', (code) => {
  console.log(`\n🏁 Server exited with code ${code}`);
});

// Start the first test after a short delay
setTimeout(sendNextTest, 2000);

// Cleanup after 30 seconds
setTimeout(() => {
  console.log('\n⏰ Test timeout, cleaning up...');
  server.kill();
  process.exit(0);
}, 30000);