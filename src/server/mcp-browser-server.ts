import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/index.js';
import { configManager } from '../config/config-manager.js';
import { logger } from '../monitoring/logger.js';
import { metricsCollector } from '../monitoring/metrics-collector.js';

export class MCPBrowserServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private tools: Map<string, BrowserTool> = new Map();
  private isRunning = false;

  constructor() {
    // Validate configuration on startup
    const validation = configManager.validate();
    if (!validation.valid) {
      logger.error('Configuration validation failed', { errors: validation.errors });
      throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
    }

    logger.info('Starting MCP Browser Server', {
      environment: process.env.NODE_ENV || 'development',
      config: configManager.getConfig()
    });

    this.server = new Server(
      {
        name: 'ai-browser-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();
      
      const tool = this.tools.get(name);
      if (!tool) {
        const error = new McpError(
          ErrorCode.MethodNotFound,
          `Tool '${name}' not found`
        );
        
        // Record failed request metrics
        metricsCollector.recordRequest({
          method: 'CallTool',
          tool: name,
          duration: Date.now() - startTime,
          success: false,
          error: error.message,
          timestamp: new Date()
        });
        
        logger.warn('Tool not found', { toolName: name, availableTools: Array.from(this.tools.keys()) });
        throw error;
      }

      try {
        logger.debug('Executing tool', { toolName: name, args });
        const result = await tool.handler((args as Record<string, unknown>) || {});
        
        // Record successful request metrics
        metricsCollector.recordRequest({
          method: 'CallTool',
          tool: name,
          duration: Date.now() - startTime,
          success: true,
          timestamp: new Date()
        });
        
        logger.debug('Tool execution completed', { toolName: name, duration: Date.now() - startTime });
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Record failed request metrics
        metricsCollector.recordRequest({
          method: 'CallTool',
          tool: name,
          duration: Date.now() - startTime,
          success: false,
          error: errorMessage,
          timestamp: new Date()
        });
        
        logger.error('Tool execution failed', { toolName: name, error: errorMessage, args });
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
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
  }

  /**
   * Unregister a browser tool from the server
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get all registered tools
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    try {
      logger.info('Starting MCP server transport');
      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);
      this.isRunning = true;
      
      logger.info('MCP Browser Server started successfully', {
        toolCount: this.tools.size,
        tools: Array.from(this.tools.keys())
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start server', { error: errorMessage });
      throw new Error(`Failed to start server: ${errorMessage}`);
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('Stopping MCP Browser Server');
      
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
      
      // Stop metrics collection
      metricsCollector.stop();
      
      this.isRunning = false;
      logger.info('MCP Browser Server stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to stop server', { error: errorMessage });
      throw new Error(`Failed to stop server: ${errorMessage}`);
    }
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
      name: 'ai-browser-mcp',
      version: '1.0.0',
      isRunning: this.isRunning,
      toolCount: this.tools.size,
      tools: this.getRegisteredTools(),
    };
  }
}