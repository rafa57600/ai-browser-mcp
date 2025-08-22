import { MCPBrowserServer } from './mcp-browser-server.js';
import { WebSocketMCPServer } from './websocket-mcp-server.js';
import { SessionManager } from '../browser/session-manager.js';
import { SecurityManager } from '../security/security-manager.js';
import { NavigationTool } from '../tools/navigation-tool.js';
import { InteractionTools } from '../tools/interaction-tools.js';
import { CaptureTools } from '../tools/capture-tools.js';
import { EvaluationTool } from '../tools/evaluation-tool.js';
import { MonitoringTools } from '../tools/monitoring-tools.js';
import { TracingTools } from '../tools/tracing-tools.js';
import { ReportTools } from '../tools/report-tools.js';
import { MacroTools } from '../tools/macro-tools.js';
import { PerformanceManager } from '../performance/performance-manager.js';
import { ErrorHandler } from '../errors/error-handler.js';

export interface ServerConfig {
  websocketPort?: number;
  enableWebSocket?: boolean;
  enableStdio?: boolean;
  allowedDomains?: string[];
  maxSessions?: number;
  sessionTimeout?: number;
}

export class IntegratedMCPServer {
  private mcpServer?: MCPBrowserServer;
  private wsServer?: WebSocketMCPServer;
  private sessionManager: SessionManager;
  private securityManager: SecurityManager;
  private performanceManager: PerformanceManager;
  private errorHandler: ErrorHandler;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = {
      websocketPort: 3000,
      enableWebSocket: true,
      enableStdio: true,
      allowedDomains: ['localhost', '127.0.0.1'],
      maxSessions: 10,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      ...config
    };

    this.sessionManager = new SessionManager({
      maxSessions: this.config.maxSessions!,
      sessionTimeout: this.config.sessionTimeout!
    });

    this.securityManager = new SecurityManager({
      allowedDomains: this.config.allowedDomains!,
      rateLimits: {
        requestsPerMinute: 60,
        screenshotsPerMinute: 10,
        evaluationsPerMinute: 30
      }
    });

    this.performanceManager = new PerformanceManager({
      maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
      maxCpuUsage: 80,
      maxDiskUsage: 1 * 1024 * 1024 * 1024 // 1GB
    });

    this.errorHandler = new ErrorHandler();

    this.initializeServers();
    this.registerTools();
  }

  private initializeServers(): void {
    if (this.config.enableStdio) {
      this.mcpServer = new MCPBrowserServer();
    }

    if (this.config.enableWebSocket) {
      this.wsServer = new WebSocketMCPServer(this.config.websocketPort!);
      
      // Set up console log streaming
      this.sessionManager.on('consoleLog', (log) => {
        this.wsServer?.broadcastConsoleLog(log);
      });
    }
  }

  private registerTools(): void {
    const tools = [
      new NavigationTool(this.sessionManager, this.securityManager),
      ...InteractionTools.createAll(this.sessionManager, this.securityManager),
      ...CaptureTools.createAll(this.sessionManager, this.securityManager),
      new EvaluationTool(this.sessionManager, this.securityManager),
      ...MonitoringTools.createAll(this.sessionManager),
      ...TracingTools.createAll(this.sessionManager),
      ...ReportTools.createAll(this.sessionManager),
      ...MacroTools.createAll(this.sessionManager)
    ];

    // Register tools with both servers
    tools.forEach(tool => {
      if (this.mcpServer) {
        this.mcpServer.registerTool(tool);
      }
      if (this.wsServer) {
        this.wsServer.registerTool(tool);
      }
    });
  }

  /**
   * Start all enabled servers
   */
  async start(): Promise<void> {
    try {
      // Start performance monitoring
      await this.performanceManager.start();

      // Start session manager
      await this.sessionManager.start();

      // Start servers
      const startPromises: Promise<void>[] = [];

      if (this.mcpServer) {
        startPromises.push(this.mcpServer.start());
      }

      if (this.wsServer) {
        startPromises.push(this.wsServer.start());
      }

      await Promise.all(startPromises);

      console.log('Integrated MCP server started successfully');
      console.log(`- STDIO MCP: ${this.config.enableStdio ? 'enabled' : 'disabled'}`);
      console.log(`- WebSocket MCP: ${this.config.enableWebSocket ? `enabled on port ${this.config.websocketPort}` : 'disabled'}`);
      console.log(`- Max sessions: ${this.config.maxSessions}`);
      console.log(`- Allowed domains: ${this.config.allowedDomains?.join(', ')}`);

    } catch (error) {
      console.error('Failed to start integrated server:', error);
      throw error;
    }
  }

  /**
   * Stop all servers
   */
  async stop(): Promise<void> {
    try {
      const stopPromises: Promise<void>[] = [];

      if (this.mcpServer) {
        stopPromises.push(this.mcpServer.stop());
      }

      if (this.wsServer) {
        stopPromises.push(this.wsServer.stop());
      }

      await Promise.all(stopPromises);

      // Stop other components
      await this.sessionManager.stop();
      await this.performanceManager.stop();

      console.log('Integrated MCP server stopped');

    } catch (error) {
      console.error('Error stopping integrated server:', error);
      throw error;
    }
  }

  /**
   * Get server status information
   */
  getStatus() {
    return {
      stdio: {
        enabled: this.config.enableStdio,
        running: this.mcpServer?.isServerRunning() || false,
        tools: this.mcpServer?.getRegisteredTools() || []
      },
      websocket: {
        enabled: this.config.enableWebSocket,
        running: this.wsServer?.isServerRunning() || false,
        port: this.config.websocketPort,
        clients: this.wsServer?.getClientCount() || 0,
        tools: this.wsServer?.getRegisteredTools() || []
      },
      sessions: {
        active: this.sessionManager.getActiveSessionCount(),
        max: this.config.maxSessions
      },
      performance: this.performanceManager.getMetrics(),
      security: {
        allowedDomains: this.config.allowedDomains,
        rateLimits: this.securityManager.getRateLimitStatus()
      }
    };
  }

  /**
   * Get session manager instance
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get security manager instance
   */
  getSecurityManager(): SecurityManager {
    return this.securityManager;
  }

  /**
   * Get performance manager instance
   */
  getPerformanceManager(): PerformanceManager {
    return this.performanceManager;
  }

  /**
   * Get WebSocket server instance (if enabled)
   */
  getWebSocketServer(): WebSocketMCPServer | undefined {
    return this.wsServer;
  }

  /**
   * Get STDIO MCP server instance (if enabled)
   */
  getStdioServer(): MCPBrowserServer | undefined {
    return this.mcpServer;
  }
}