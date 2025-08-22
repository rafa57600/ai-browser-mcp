#!/usr/bin/env node

import { IntegratedMCPServer } from '../src/server/integrated-server.js';

async function demonstrateVSCodeExtension() {
  console.log('🚀 Starting AI Browser MCP WebSocket Server Demo');
  console.log('This demonstrates the VS Code extension integration functionality\n');

  // Create server with WebSocket enabled
  const server = new IntegratedMCPServer({
    websocketPort: 3000,
    enableWebSocket: true,
    enableStdio: false, // Disable STDIO for this demo
    allowedDomains: ['localhost', '127.0.0.1', 'example.com'],
    maxSessions: 5
  });

  try {
    // Start the server
    await server.start();
    
    console.log('✅ WebSocket MCP Server started successfully!');
    console.log('📊 Server Status:');
    const status = server.getStatus();
    console.log(JSON.stringify(status, null, 2));
    
    console.log('\n🔌 VS Code Extension Integration Features:');
    console.log('- WebSocket communication on port 3000');
    console.log('- Real-time console log streaming');
    console.log('- Screenshot capture and display');
    console.log('- Browser command execution');
    console.log('- Tool registration notifications');
    
    console.log('\n📝 Available MCP Tools:');
    const wsServer = server.getWebSocketServer();
    if (wsServer) {
      const tools = wsServer.getRegisteredTools();
      tools.forEach(tool => console.log(`  - ${tool}`));
    }
    
    console.log('\n🎯 To test with VS Code extension:');
    console.log('1. Install the VS Code extension from vscode-extension/ directory');
    console.log('2. Configure the extension to connect to ws://localhost:3000/mcp');
    console.log('3. Use VS Code commands to start/stop browser and take screenshots');
    console.log('4. View console logs in the VS Code output panel');
    
    console.log('\n⏳ Server running... Press Ctrl+C to stop');
    
    // Keep the server running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down server...');
      await server.stop();
      console.log('✅ Server stopped successfully');
      process.exit(0);
    });
    
    // Simulate some activity for demo
    setTimeout(() => {
      console.log('\n📡 Broadcasting demo console log...');
      wsServer?.broadcastConsoleLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Demo: VS Code extension integration is working!',
        location: {
          url: 'http://demo.example.com',
          lineNumber: 1,
          columnNumber: 1
        }
      });
    }, 2000);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run the demo
demonstrateVSCodeExtension().catch(console.error);