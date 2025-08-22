#!/usr/bin/env node

import { MCPBrowserServer } from './server/mcp-browser-server.js';
import { HttpServer } from './server/http-server.js';
import { SessionManager } from './browser/session-manager.js';
import { SecurityManager } from './security/security-manager.js';
import { createNewContextTool, createGotoTool } from './tools/navigation-tool.js';
import { createClickTool, createTypeTool, createSelectTool } from './tools/interaction-tools.js';
import { createScreenshotTool, createDOMSnapshotTool } from './tools/capture-tools.js';
import { createEvalTool } from './tools/evaluation-tool.js';
import { createNetworkGetRecentTool, createConsoleGetRecentTool } from './tools/monitoring-tools.js';
import { createTraceStartTool, createTraceStopTool, createHarExportTool } from './tools/tracing-tools.js';
import { createReportGenerateTool } from './tools/report-tools.js';
import { createMacroStartRecordingTool, createMacroStopRecordingTool, createMacroPlayTool } from './tools/macro-tools.js';
import { configManager } from './config/config-manager.js';
import { logger } from './monitoring/logger.js';
import { metricsCollector } from './monitoring/metrics-collector.js';

class Application {
  private mcpServer: MCPBrowserServer;
  private httpServer: HttpServer;
  private sessionManager: SessionManager;
  private securityManager: SecurityManager;
  private isShuttingDown = false;

  constructor() {
    this.mcpServer = new MCPBrowserServer();
    this.httpServer = new HttpServer();
    this.sessionManager = new SessionManager();
    this.securityManager = new SecurityManager();
    
    this.setupSignalHandlers();
    this.registerTools();
  }

  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          logger.warn(`Received ${signal} during shutdown, forcing exit`);
          process.exit(1);
        }
        
        logger.info(`Received ${signal}, starting graceful shutdown`);
        await this.shutdown();
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      this.shutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      this.shutdown().finally(() => process.exit(1));
    });
  }

  private registerTools(): void {
    try {
      logger.info('Registering browser tools');

      // Navigation tools
      this.mcpServer.registerTool(createNewContextTool(this.sessionManager));
      this.mcpServer.registerTool(createGotoTool(this.sessionManager));

      // Interaction tools
      this.mcpServer.registerTool(createClickTool(this.sessionManager));
      this.mcpServer.registerTool(createTypeTool(this.sessionManager));
      this.mcpServer.registerTool(createSelectTool(this.sessionManager));

      // Capture tools
      this.mcpServer.registerTool(createScreenshotTool(this.sessionManager));
      this.mcpServer.registerTool(createDOMSnapshotTool(this.sessionManager));

      // Evaluation tool
      this.mcpServer.registerTool(createEvalTool(this.sessionManager));

      // Monitoring tools
      this.mcpServer.registerTool(createNetworkGetRecentTool(this.sessionManager));
      this.mcpServer.registerTool(createConsoleGetRecentTool(this.sessionManager));

      // Tracing tools
      this.mcpServer.registerTool(createTraceStartTool(this.sessionManager));
      this.mcpServer.registerTool(createTraceStopTool(this.sessionManager));
      this.mcpServer.registerTool(createHarExportTool(this.sessionManager));

      // Report tools
      // Register report tools with report generator
      const reportGenerator = new (await import('./tools/report-generator.js')).ReportGenerator();
      this.mcpServer.registerTool(createReportGenerateTool(this.sessionManager, reportGenerator));

      // Macro tools
      this.mcpServer.registerTool(createMacroStartRecordingTool(this.sessionManager));
      this.mcpServer.registerTool(createMacroStopRecordingTool(this.sessionManager));
      this.mcpServer.registerTool(createMacroPlayTool(this.sessionManager));

      logger.info('All browser tools registered successfully', {
        toolCount: this.mcpServer.getRegisteredTools().length,
        tools: this.mcpServer.getRegisteredTools()
      });
    } catch (error) {
      logger.error('Failed to register tools', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      logger.info('Starting MCP Browser Server application');

      // Start HTTP server for health checks and metrics
      const monitoringConfig = configManager.get('monitoring');
      if (monitoringConfig.enableHealthCheck || monitoringConfig.enableMetrics) {
        await this.httpServer.start();
      }

      // Start MCP server
      await this.mcpServer.start();

      // Log startup completion
      const serverAddress = this.httpServer.getServerAddress();
      logger.info('MCP Browser Server started successfully', {
        mcpServer: 'stdio',
        httpServer: serverAddress ? `http://${serverAddress.host}:${serverAddress.port}` : 'disabled',
        environment: process.env.NODE_ENV || 'development',
        toolCount: this.mcpServer.getRegisteredTools().length
      });

      // Start metrics collection
      metricsCollector.on('metrics', (metrics) => {
        logger.debug('System metrics collected', metrics);
      });

    } catch (error) {
      logger.error('Failed to start application', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting application shutdown');

    try {
      // Stop accepting new requests
      await this.httpServer.stop();
      
      // Stop MCP server
      await this.mcpServer.stop();
      
      // Clean up browser sessions
      await this.sessionManager.cleanupIdleSessions();
      
      // Stop metrics collection
      metricsCollector.stop();
      
      logger.info('Application shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown', error);
    }
  }
}

// Start the application
async function main(): Promise<void> {
  try {
    const app = new Application();
    await app.start();
  } catch (error) {
    logger.error('Failed to start application', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { Application };