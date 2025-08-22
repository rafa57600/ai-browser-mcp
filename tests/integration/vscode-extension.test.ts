import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as WebSocket from 'ws';
import { WebSocketMCPServer } from '../../src/server/websocket-mcp-server.js';
import { MCPClient } from '../../vscode-extension/src/mcp-client.js';

describe('VS Code Extension Integration', () => {
  let server: WebSocketMCPServer;
  let client: MCPClient;
  const testPort = 3001;

  beforeEach(async () => {
    server = new WebSocketMCPServer(testPort);
    
    // Register mock tools
    server.registerTool({
      name: 'browser.screenshot',
      description: 'Take a screenshot',
      inputSchema: {
        type: 'object',
        properties: {
          fullPage: { type: 'boolean' },
          selector: { type: 'string' }
        }
      },
      handler: async (params) => ({
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        format: 'png',
        width: 1280,
        height: 720,
        timestamp: new Date()
      })
    });

    server.registerTool({
      name: 'browser.console.getRecent',
      description: 'Get recent console logs',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number' }
        }
      },
      handler: async (params) => [
        {
          timestamp: new Date(),
          level: 'info',
          message: 'Test log message',
          location: {
            url: 'http://example.com',
            lineNumber: 1,
            columnNumber: 1
          }
        }
      ]
    });

    await server.start();
    client = new MCPClient(testPort);
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  describe('WebSocket Communication', () => {
    it('should establish WebSocket connection', async () => {
      await expect(client.connect()).resolves.not.toThrow();
    });

    it('should handle connection failures gracefully', async () => {
      const invalidClient = new MCPClient(9999); // Non-existent port
      await expect(invalidClient.connect()).rejects.toThrow();
    });

    it('should reconnect automatically after disconnection', async () => {
      await client.connect();
      
      // Simulate server restart
      await server.stop();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      server = new WebSocketMCPServer(testPort);
      await server.start();
      
      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Should be able to make requests after reconnection
      const result = await client.takeScreenshot();
      expect(result).toBeDefined();
    });
  });

  describe('Browser Commands', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should take screenshots via WebSocket', async () => {
      const screenshot = await client.takeScreenshot();
      
      expect(screenshot).toMatchObject({
        data: expect.any(String),
        format: 'png',
        width: expect.any(Number),
        height: expect.any(Number),
        timestamp: expect.any(Date)
      });
    });

    it('should take screenshots with options', async () => {
      const screenshot = await client.takeScreenshot({
        fullPage: true,
        selector: '.test-element'
      });
      
      expect(screenshot).toBeDefined();
    });

    it('should get console logs', async () => {
      const logs = await client.getConsoleLogs(10);
      
      expect(Array.isArray(logs)).toBe(true);
      if (logs.length > 0) {
        expect(logs[0]).toMatchObject({
          timestamp: expect.any(Date),
          level: expect.any(String),
          message: expect.any(String)
        });
      }
    });

    it('should handle navigation commands', async () => {
      // Mock navigation tool
      server.registerTool({
        name: 'browser.goto',
        description: 'Navigate to URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' }
          },
          required: ['url']
        },
        handler: async (params) => {
          return { success: true, url: params.url };
        }
      });

      await expect(client.navigateTo('http://example.com')).resolves.not.toThrow();
    });

    it('should handle interaction commands', async () => {
      // Mock interaction tools
      server.registerTool({
        name: 'browser.click',
        description: 'Click element',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string' }
          },
          required: ['selector']
        },
        handler: async (params) => ({ success: true })
      });

      server.registerTool({
        name: 'browser.type',
        description: 'Type text',
        inputSchema: {
          type: 'object',
          properties: {
            selector: { type: 'string' },
            text: { type: 'string' }
          },
          required: ['selector', 'text']
        },
        handler: async (params) => ({ success: true })
      });

      await expect(client.clickElement('.button')).resolves.not.toThrow();
      await expect(client.typeText('#input', 'test text')).resolves.not.toThrow();
    });

    it('should handle JavaScript evaluation', async () => {
      server.registerTool({
        name: 'browser.eval',
        description: 'Evaluate JavaScript',
        inputSchema: {
          type: 'object',
          properties: {
            script: { type: 'string' }
          },
          required: ['script']
        },
        handler: async (params) => {
          // Simulate JavaScript execution
          if (params.script === 'document.title') {
            return 'Test Page';
          }
          return null;
        }
      });

      const result = await client.evaluateScript('document.title');
      expect(result).toBe('Test Page');
    });
  });

  describe('Real-time Log Streaming', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should receive console log notifications', async () => {
      const logPromise = new Promise((resolve) => {
        client.onConsoleLog((log) => {
          resolve(log);
        });
      });

      // Simulate server sending a console log
      server.broadcastConsoleLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Real-time log message'
      });

      const receivedLog = await logPromise;
      expect(receivedLog).toMatchObject({
        timestamp: expect.any(Date),
        level: 'info',
        message: 'Real-time log message'
      });
    });

    it('should handle multiple log listeners', async () => {
      const logs: any[] = [];
      
      client.onConsoleLog((log) => {
        logs.push(log);
      });

      // Send multiple logs
      for (let i = 0; i < 3; i++) {
        server.broadcastConsoleLog({
          timestamp: new Date(),
          level: 'info',
          message: `Log message ${i}`
        });
      }

      // Wait for logs to be received
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Log message 0');
      expect(logs[2].message).toBe('Log message 2');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should handle tool not found errors', async () => {
      await expect(client.evaluateScript('test')).rejects.toThrow();
    });

    it('should handle tool execution errors', async () => {
      server.registerTool({
        name: 'browser.error',
        description: 'Tool that throws error',
        inputSchema: { type: 'object' },
        handler: async () => {
          throw new Error('Test error');
        }
      });

      const errorClient = client as any;
      await expect(
        errorClient.sendRequest('browser.error')
      ).rejects.toThrow('Test error');
    });

    it('should handle request timeouts', async () => {
      server.registerTool({
        name: 'browser.slow',
        description: 'Slow tool',
        inputSchema: { type: 'object' },
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 35000)); // Longer than timeout
          return { success: true };
        }
      });

      const slowClient = client as any;
      await expect(
        slowClient.sendRequest('browser.slow')
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('Server Information', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('should provide server information', async () => {
      const info = server.getServerInfo();
      
      expect(info).toMatchObject({
        name: 'ai-browser-mcp-websocket',
        version: '1.0.0',
        port: testPort,
        isRunning: true,
        clientCount: 1,
        toolCount: expect.any(Number),
        tools: expect.any(Array)
      });
    });

    it('should track client connections', async () => {
      expect(server.getClientCount()).toBe(1);
      
      const client2 = new MCPClient(testPort);
      await client2.connect();
      
      expect(server.getClientCount()).toBe(2);
      
      await client2.disconnect();
      
      // Wait for disconnection to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(server.getClientCount()).toBe(1);
    });
  });

  describe('Tool Registration', () => {
    it('should notify clients when tools are registered', async () => {
      await client.connect();
      
      const notificationPromise = new Promise((resolve) => {
        const originalOnMessage = (client as any).ws.onmessage;
        (client as any).ws.onmessage = (event: any) => {
          const message = JSON.parse(event.data);
          if (message.method === 'tool.registered') {
            resolve(message.params);
          } else {
            originalOnMessage(event);
          }
        };
      });

      server.registerTool({
        name: 'browser.newTool',
        description: 'New test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ success: true })
      });

      const notification = await notificationPromise;
      expect(notification).toMatchObject({
        name: 'browser.newTool',
        description: 'New test tool'
      });
    });

    it('should notify clients when tools are unregistered', async () => {
      await client.connect();
      
      // First register a tool
      server.registerTool({
        name: 'browser.tempTool',
        description: 'Temporary tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ success: true })
      });

      const notificationPromise = new Promise((resolve) => {
        const originalOnMessage = (client as any).ws.onmessage;
        (client as any).ws.onmessage = (event: any) => {
          const message = JSON.parse(event.data);
          if (message.method === 'tool.unregistered') {
            resolve(message.params);
          } else {
            originalOnMessage(event);
          }
        };
      });

      server.unregisterTool('browser.tempTool');

      const notification = await notificationPromise;
      expect(notification).toMatchObject({
        name: 'browser.tempTool'
      });
    });
  });
});