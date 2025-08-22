import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { configManager } from '../config/config-manager.js';
import { logger } from '../monitoring/logger.js';
import { healthCheckService } from '../monitoring/health-check.js';
import { metricsCollector } from '../monitoring/metrics-collector.js';

export class HttpServer {
  private server: ReturnType<typeof createServer> | null = null;
  private isRunning = false;

  constructor() {
    this.server = createServer(this.handleRequest.bind(this));
    this.setupErrorHandlers();
  }

  private setupErrorHandlers(): void {
    if (!this.server) return;

    this.server.on('error', (error) => {
      logger.error('HTTP server error', error);
    });

    this.server.on('clientError', (error, socket) => {
      logger.warn('HTTP client error', { error: error.message });
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const method = req.method || 'GET';
    
    logger.debug('HTTP request received', {
      method,
      path: url.pathname,
      userAgent: req.headers['user-agent']
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const config = configManager.get('monitoring');
      
      switch (url.pathname) {
        case config.healthCheckPath:
          if (config.enableHealthCheck) {
            healthCheckService.handleHealthCheckRequest(req, res);
          } else {
            this.sendNotFound(res);
          }
          break;

        case config.metricsPath:
          if (config.enableMetrics) {
            healthCheckService.handleMetricsRequest(req, res);
          } else {
            this.sendNotFound(res);
          }
          break;

        case '/':
          this.sendServerInfo(res);
          break;

        default:
          this.sendNotFound(res);
          break;
      }
    } catch (error) {
      logger.error('Error handling HTTP request', {
        method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error)
      });
      
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }));
    } finally {
      const duration = Date.now() - startTime;
      logger.debug('HTTP request completed', {
        method,
        path: url.pathname,
        duration,
        statusCode: res.statusCode
      });
    }
  }

  private sendServerInfo(res: ServerResponse): void {
    const info = {
      name: 'MCP Browser Server',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      endpoints: {
        health: configManager.get('monitoring').healthCheckPath,
        metrics: configManager.get('monitoring').metricsPath
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(info, null, 2));
  }

  private sendNotFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not found',
      timestamp: new Date().toISOString()
    }));
  }

  public async start(): Promise<void> {
    if (this.isRunning || !this.server) {
      throw new Error('Server is already running or not initialized');
    }

    const config = configManager.get('server');
    
    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.listen(config.port, config.host, () => {
        this.isRunning = true;
        logger.info('HTTP server started', {
          host: config.host,
          port: config.port,
          healthCheck: `http://${config.host}:${config.port}${configManager.get('monitoring').healthCheckPath}`,
          metrics: `http://${config.host}:${config.port}${configManager.get('monitoring').metricsPath}`
        });
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('Failed to start HTTP server', error);
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          logger.error('Error stopping HTTP server', error);
          reject(error);
        } else {
          this.isRunning = false;
          logger.info('HTTP server stopped');
          resolve();
        }
      });
    });
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }

  public getServerAddress(): { host: string; port: number } | null {
    if (!this.isRunning || !this.server) {
      return null;
    }

    const address = this.server.address();
    if (typeof address === 'string' || !address) {
      return null;
    }

    return {
      host: address.address,
      port: address.port
    };
  }
}

export const httpServer = new HttpServer();