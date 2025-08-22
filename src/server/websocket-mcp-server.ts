import WebSocket, { WebSocketServer } from 'ws';
import * as http from 'http';
import { EventEmitter } from 'events';
import { BrowserTool } from '../types/index.js';

export interface JSONRPCRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JSONRPCNotification {
  jsonrpc: string;
  method: string;
  params?: any;
}

export class WebSocketMCPServer extends EventEmitter {
  private server: http.Server;
  private wss: WebSocketServer;
  private tools: Map<string, BrowserTool> = new Map();
  private clients: Set<WebSocket> = new Set();
  private isRunning = false;
  private port: number;

  constructor(port: number = 3000) {
    super();
    this.port = port;
    this.server = http.createServer();
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/mcp'
    });

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');
      this.clients.add(ws);

      ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as JSONRPCRequest;
          const response = await this.handleRequest(message);
          if (response) {
            ws.send(JSON.stringify(response));
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          const errorResponse: JSONRPCResponse = {
            jsonrpc: '2.0',
            id: 'unknown',
            error: {
              code: -32700,
              message: 'Parse error'
            }
          };
          ws.send(JSON.stringify(errorResponse));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      this.sendToClient(ws, {
        jsonrpc: '2.0',
        method: 'connection.established',
        params: {
          serverInfo: this.getServerInfo()
        }
      });
    });
  }

  private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse | null> {
    const { id, method, params } = request;

    try {
      switch (method) {
        case 'tools.list':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              tools: Array.from(this.tools.values()).map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
              }))
            }
          };

        case 'tools.call':
          const { name, arguments: args } = params;
          const tool = this.tools.get(name);
          
          if (!tool) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32601,
                message: `Tool '${name}' not found`
              }
            };
          }

          const result = await tool.handler((args as Record<string, unknown>) || {});
          return {
            jsonrpc: '2.0',
            id,
            result
          };

        case 'server.info':
          return {
            jsonrpc: '2.0',
            id,
            result: this.getServerInfo()
          };

        default:
          // Check if it's a direct tool call (e.g., browser.screenshot)
          const directTool = this.tools.get(method);
          if (directTool) {
            const result = await directTool.handler(params || {});
            return {
              jsonrpc: '2.0',
              id,
              result
            };
          }

          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method '${method}' not found`
            }
          };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Internal error: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }

  private sendToClient(client: WebSocket, message: JSONRPCNotification): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a notification to all connected clients
   */
  broadcast(notification: JSONRPCNotification): void {
    this.clients.forEach(client => {
      this.sendToClient(client, notification);
    });
  }

  /**
   * Send console log to all connected clients
   */
  broadcastConsoleLog(log: any): void {
    this.broadcast({
      jsonrpc: '2.0',
      method: 'console.log',
      params: log
    });
  }

  /**
   * Register a browser tool with the server
   */
  registerTool(tool: BrowserTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    
    this.tools.set(tool.name, tool);
    
    // Notify clients about new tool
    this.broadcast({
      jsonrpc: '2.0',
      method: 'tool.registered',
      params: {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }
    });
  }

  /**
   * Unregister a browser tool from the server
   */
  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    
    if (removed) {
      // Notify clients about removed tool
      this.broadcast({
        jsonrpc: '2.0',
        method: 'tool.unregistered',
        params: { name }
      });
    }
    
    return removed;
  }

  /**
   * Get all registered tools
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Start the WebSocket MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        this.isRunning = true;
        console.log(`WebSocket MCP server started on port ${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the WebSocket MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.clients.forEach(client => {
        client.close();
      });
      this.clients.clear();

      // Close WebSocket server
      this.wss.close(() => {
        // Close HTTP server
        this.server.close(() => {
          this.isRunning = false;
          console.log('WebSocket MCP server stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Check if the server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return {
      name: 'ai-browser-mcp-websocket',
      version: '1.0.0',
      port: this.port,
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      toolCount: this.tools.size,
      tools: this.getRegisteredTools(),
    };
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}