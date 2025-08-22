#!/usr/bin/env node

import { IntegratedMCPServer } from '../server/integrated-server.js';
import { program } from 'commander';

program
  .name('ai-browser-mcp-ws')
  .description('AI Browser MCP WebSocket Server')
  .version('1.0.0')
  .option('-p, --port <port>', 'WebSocket server port', '3000')
  .option('--no-stdio', 'Disable STDIO MCP server')
  .option('--no-websocket', 'Disable WebSocket MCP server')
  .option('--max-sessions <count>', 'Maximum concurrent sessions', '10')
  .option('--session-timeout <ms>', 'Session timeout in milliseconds', '1800000')
  .option('--allowed-domains <domains>', 'Comma-separated list of allowed domains', 'localhost,127.0.0.1')
  .parse();

const options = program.opts();

const config = {
  websocketPort: parseInt(options.port),
  enableStdio: options.stdio !== false,
  enableWebSocket: options.websocket !== false,
  maxSessions: parseInt(options.maxSessions),
  sessionTimeout: parseInt(options.sessionTimeout),
  allowedDomains: options.allowedDomains.split(',').map((d: string) => d.trim())
};

const server = new IntegratedMCPServer(config);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
async function main() {
  try {
    await server.start();
    
    // Log status periodically
    setInterval(() => {
      const status = server.getStatus();
      console.log(`Status: ${status.sessions.active}/${status.sessions.max} sessions, ${status.websocket.clients} WS clients`);
    }, 30000);

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main().catch(console.error);