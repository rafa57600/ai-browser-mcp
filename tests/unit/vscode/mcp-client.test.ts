import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as WebSocket from 'ws';
import { MCPClient } from '../../../vscode-extension/src/mcp-client.js';

// Mock WebSocket
vi.mock('ws', () => {
  const mockWebSocket = vi.fn();
  mockWebSocket.prototype.on = vi.fn();
  mockWebSocket.prototype.send = vi.fn();
  mockWebSocket.prototype.close = vi.fn();
  mockWebSocket.OPEN = 1;
  mockWebSocket.CLOSED = 3;
  return { default: mockWebSocket };
});

describe('MCPClient', () => {
  let client: MCPClient;
  let mockWs: any;
  const testPort = 3000;

  beforeEach(() => {
    client = new MCPClient(testPort);
    mockWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN
    };
    
    // Mock WebSocket constructor to return our mock
    (WebSocket as any).mockImplementation(() => mockWs);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should create WebSocket connection with correct URL', async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
      
      expect(WebSocket).toHaveBeenCalledWith(`ws://localhost:${testPort}/mcp`);
    });

    it('should handle connection errors', async () => {
      const connectPromise = client.connect();
      
      // Simulate connection error
      const errorHandler = mockWs.on.mock.calls.find(call => call[0] === 'error')[1];
      errorHandler(new Error('Connection failed'));
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should handle disconnection', async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
      
      // Simulate disconnection
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
      closeHandler();
      
      // Should attempt reconnection
      expect(setTimeout).toHaveBeenCalled();
    });

    it('should close connection properly', async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
      
      await client.disconnect();
      
      expect(mockWs.close).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
    });

    it('should handle JSON-RPC responses', async () => {
      const requestPromise = client.takeScreenshot();
      
      // Get the message handler
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Simulate response
      const response = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          data: 'base64data',
          format: 'png',
          width: 1280,
          height: 720,
          timestamp: new Date()
        }
      };
      
      messageHandler(JSON.stringify(response));
      
      const result = await requestPromise;
      expect(result).toEqual(response.result);
    });

    it('should handle JSON-RPC errors', async () => {
      const requestPromise = client.takeScreenshot();
      
      // Get the message handler
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Simulate error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32603,
          message: 'Internal error'
        }
      };
      
      messageHandler(JSON.stringify(errorResponse));
      
      await expect(requestPromise).rejects.toThrow('Internal error');
    });

    it('should handle console log notifications', () => {
      const logHandler = vi.fn();
      client.onConsoleLog(logHandler);
      
      // Get the message handler
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Simulate console log notification
      const notification = {
        jsonrpc: '2.0',
        method: 'console.log',
        params: {
          timestamp: new Date(),
          level: 'info',
          message: 'Test log'
        }
      };
      
      messageHandler(JSON.stringify(notification));
      
      expect(logHandler).toHaveBeenCalledWith(notification.params);
    });

    it('should handle malformed messages gracefully', () => {
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')[1];
      
      // Should not throw when receiving malformed JSON
      expect(() => {
        messageHandler('invalid json');
      }).not.toThrow();
    });
  });

  describe('Request Methods', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
    });

    it('should send screenshot requests', async () => {
      client.takeScreenshot({ fullPage: true });
      
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"browser.screenshot"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"fullPage":true')
      );
    });

    it('should send console log requests', async () => {
      client.getConsoleLogs(50);
      
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"browser.console.getRecent"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"limit":50')
      );
    });

    it('should send navigation requests', async () => {
      client.navigateTo('http://example.com');
      
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"browser.goto"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"url":"http://example.com"')
      );
    });

    it('should send interaction requests', async () => {
      client.clickElement('.button');
      client.typeText('#input', 'test');
      
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"browser.click"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"method":"browser.type"')
      );
    });

    it('should handle requests when disconnected', async () => {
      await client.disconnect();
      
      await expect(client.takeScreenshot()).rejects.toThrow('Not connected to MCP server');
    });

    it('should timeout requests', async () => {
      vi.useFakeTimers();
      
      const requestPromise = client.takeScreenshot();
      
      // Fast-forward past timeout
      vi.advanceTimersByTime(35000);
      
      await expect(requestPromise).rejects.toThrow('Request timeout');
      
      vi.useRealTimers();
    });
  });

  describe('Request ID Management', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
    });

    it('should generate unique request IDs', async () => {
      client.takeScreenshot();
      client.getConsoleLogs();
      
      const calls = mockWs.send.mock.calls;
      const request1 = JSON.parse(calls[0][0]);
      const request2 = JSON.parse(calls[1][0]);
      
      expect(request1.id).not.toEqual(request2.id);
    });

    it('should increment request IDs', async () => {
      client.takeScreenshot();
      client.takeScreenshot();
      
      const calls = mockWs.send.mock.calls;
      const request1 = JSON.parse(calls[0][0]);
      const request2 = JSON.parse(calls[1][0]);
      
      expect(request2.id).toBe(request1.id + 1);
    });
  });

  describe('Reconnection Logic', () => {
    it('should attempt reconnection with exponential backoff', async () => {
      vi.useFakeTimers();
      
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
      
      // Simulate disconnection
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
      closeHandler();
      
      // Should schedule reconnection
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
      
      vi.useRealTimers();
    });

    it('should stop reconnecting after max attempts', async () => {
      vi.useFakeTimers();
      
      const connectPromise = client.connect();
      
      // Simulate successful connection
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')[1];
      openHandler();
      
      await connectPromise;
      
      // Simulate multiple disconnections
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
      
      for (let i = 0; i < 6; i++) {
        closeHandler();
        vi.advanceTimersByTime(5000);
      }
      
      // Should not schedule more reconnections after max attempts
      const timeoutCalls = (setTimeout as any).mock.calls.length;
      expect(timeoutCalls).toBeLessThanOrEqual(5);
      
      vi.useRealTimers();
    });
  });
});