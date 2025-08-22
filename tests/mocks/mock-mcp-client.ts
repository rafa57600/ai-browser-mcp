// Mock MCP client implementation for isolated testing
import { EventEmitter } from 'events';

export interface MCPRequest {
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPNotification {
  method: string;
  params?: any;
}

export class MockMCPClient extends EventEmitter {
  private _connected = false;
  private _requestId = 1;
  private _pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }>();
  private _tools: string[] = [];
  private _serverInfo = {
    name: 'mock-mcp-server',
    version: '1.0.0'
  };

  constructor(private mockResponses: Map<string, any> = new Map()) {
    super();
    this.setupDefaultResponses();
  }

  private setupDefaultResponses() {
    // Default mock responses for common MCP methods
    this.mockResponses.set('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      serverInfo: this._serverInfo
    });

    this.mockResponses.set('tools/list', {
      tools: this._tools.map(name => ({
        name,
        description: `Mock tool: ${name}`,
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }))
    });

    // Mock browser tool responses
    this.mockResponses.set('tools/call', (params: any) => {
      const toolName = params.name;
      
      switch (toolName) {
        case 'browser.newContext':
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: `mock-session-${Date.now()}`,
                viewport: params.arguments?.viewport || { width: 1280, height: 720 },
                userAgent: params.arguments?.userAgent || 'Mock Browser',
                createdAt: new Date().toISOString(),
                message: 'Browser context created successfully'
              })
            }]
          };

        case 'browser.goto':
          if (params.arguments?.url?.includes('invalid')) {
            return {
              isError: true,
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: {
                    message: 'Navigation failed',
                    category: 'browser',
                    isNetworkError: true
                  }
                })
              }]
            };
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                url: params.arguments?.url,
                finalUrl: params.arguments?.url,
                status: 200,
                navigationTime: 150,
                waitUntil: params.arguments?.waitUntil || 'load',
                message: 'Navigation completed successfully'
              })
            }]
          };

        case 'browser.screenshot':
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                path: `/tmp/screenshot-${Date.now()}.png`,
                width: 1280,
                height: 720,
                format: 'png',
                timestamp: new Date().toISOString()
              })
            }]
          };

        case 'browser.click':
          if (params.arguments?.selector?.includes('non-existent')) {
            return {
              isError: true,
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: {
                    message: 'Element not found',
                    category: 'browser'
                  }
                })
              }]
            };
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                selector: params.arguments?.selector,
                message: 'Element clicked successfully'
              })
            }]
          };

        case 'browser.eval':
          if (params.arguments?.code?.includes('throw')) {
            return {
              isError: true,
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: {
                    message: 'JavaScript execution error',
                    category: 'browser'
                  }
                })
              }]
            };
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                result: 'Mock Page Title',
                executionTime: 25
              })
            }]
          };

        default:
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Mock response for ${toolName}`
              })
            }]
          };
      }
    });
  }

  async connect(): Promise<void> {
    if (this._connected) {
      throw new Error('Client is already connected');
    }

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    this._connected = true;
    this.emit('connect');
  }

  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }

    // Reject all pending requests
    for (const [id, request] of this._pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
    }
    this._pendingRequests.clear();

    this._connected = false;
    this.emit('disconnect');
  }

  isConnected(): boolean {
    return this._connected;
  }

  async request(method: string, params?: any): Promise<any> {
    if (!this._connected) {
      throw new Error('Client is not connected');
    }

    const id = this._requestId++;
    const request: MCPRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 5000);

      this._pendingRequests.set(id, { resolve, reject, timeout });

      // Simulate async response
      setTimeout(() => {
        this.handleRequest(request);
      }, 10);
    });
  }

  private handleRequest(request: MCPRequest) {
    const pending = this._pendingRequests.get(request.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this._pendingRequests.delete(request.id);

    try {
      let result;
      const mockResponse = this.mockResponses.get(request.method);
      
      if (typeof mockResponse === 'function') {
        result = mockResponse(request.params);
      } else if (mockResponse !== undefined) {
        result = mockResponse;
      } else {
        throw new Error(`Unknown method: ${request.method}`);
      }

      pending.resolve(result);
    } catch (error) {
      pending.reject(error);
    }
  }

  async initialize(): Promise<any> {
    return this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'mock-client',
        version: '1.0.0'
      }
    });
  }

  async listTools(): Promise<any> {
    return this.request('tools/list');
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    return this.request('tools/call', {
      name,
      arguments: arguments_
    });
  }

  // Mock-specific methods for testing
  setMockResponse(method: string, response: any) {
    this.mockResponses.set(method, response);
  }

  addTool(toolName: string) {
    if (!this._tools.includes(toolName)) {
      this._tools.push(toolName);
    }
  }

  removeTool(toolName: string) {
    const index = this._tools.indexOf(toolName);
    if (index > -1) {
      this._tools.splice(index, 1);
    }
  }

  simulateError(method: string, error: any) {
    this.setMockResponse(method, () => {
      throw error;
    });
  }

  simulateTimeout(method: string) {
    this.setMockResponse(method, () => {
      return new Promise(() => {}); // Never resolves
    });
  }

  simulateDisconnect() {
    if (this._connected) {
      this._connected = false;
      this.emit('disconnect');
    }
  }

  getPendingRequestCount(): number {
    return this._pendingRequests.size;
  }

  getRequestHistory(): Array<{ method: string; params: any; timestamp: Date }> {
    // In a real implementation, this would track request history
    return [];
  }
}

// Factory function to create mock MCP client
export function createMockMCPClient(mockResponses?: Map<string, any>): MockMCPClient {
  return new MockMCPClient(mockResponses);
}

// Mock MCP server for testing client interactions
export class MockMCPServer extends EventEmitter {
  private _clients = new Set<MockMCPClient>();
  private _tools = new Map<string, any>();

  addClient(client: MockMCPClient) {
    this._clients.add(client);
    this.emit('clientConnected', client);
  }

  removeClient(client: MockMCPClient) {
    this._clients.delete(client);
    this.emit('clientDisconnected', client);
  }

  registerTool(name: string, handler: any) {
    this._tools.set(name, handler);
  }

  unregisterTool(name: string) {
    this._tools.delete(name);
  }

  getConnectedClientCount(): number {
    return this._clients.size;
  }

  getRegisteredTools(): string[] {
    return Array.from(this._tools.keys());
  }

  broadcastNotification(method: string, params?: any) {
    const notification: MCPNotification = { method, params };
    this._clients.forEach(client => {
      client.emit('notification', notification);
    });
  }
}