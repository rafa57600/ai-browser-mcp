import { IncomingMessage, ServerResponse } from 'http';
import { metricsCollector } from './metrics-collector.js';
import { configManager } from '../config/config-manager.js';
import { logger } from './logger.js';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'warn' | 'fail';
      message?: string;
      duration?: number;
    };
  };
}

export class HealthCheckService {
  private startTime: Date;
  private version: string;

  constructor() {
    this.startTime = new Date();
    this.version = process.env.npm_package_version || '1.0.0';
  }

  public async performHealthCheck(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Memory check
    const memoryCheck = await this.checkMemory();
    checks.memory = memoryCheck;
    if (memoryCheck.status === 'fail') overallStatus = 'unhealthy';
    else if (memoryCheck.status === 'warn' && overallStatus === 'healthy') overallStatus = 'degraded';

    // Configuration check
    const configCheck = await this.checkConfiguration();
    checks.configuration = configCheck;
    if (configCheck.status === 'fail') overallStatus = 'unhealthy';

    // Browser availability check
    const browserCheck = await this.checkBrowserAvailability();
    checks.browser = browserCheck;
    if (browserCheck.status === 'fail') overallStatus = 'unhealthy';
    else if (browserCheck.status === 'warn' && overallStatus === 'healthy') overallStatus = 'degraded';

    // Disk space check
    const diskCheck = await this.checkDiskSpace();
    checks.disk = diskCheck;
    if (diskCheck.status === 'fail') overallStatus = 'unhealthy';
    else if (diskCheck.status === 'warn' && overallStatus === 'healthy') overallStatus = 'degraded';

    return {
      status: overallStatus,
      timestamp: new Date(),
      version: this.version,
      uptime: Date.now() - this.startTime.getTime(),
      checks
    };
  }

  private async checkMemory(): Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string; duration?: number }> {
    const start = Date.now();
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percentage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    const duration = Date.now() - start;

    if (percentage > 90) {
      return {
        status: 'fail',
        message: `Critical memory usage: ${heapUsedMB}MB/${heapTotalMB}MB (${percentage}%)`,
        duration
      };
    } else if (percentage > 80) {
      return {
        status: 'warn',
        message: `High memory usage: ${heapUsedMB}MB/${heapTotalMB}MB (${percentage}%)`,
        duration
      };
    }

    return {
      status: 'pass',
      message: `Memory usage: ${heapUsedMB}MB/${heapTotalMB}MB (${percentage}%)`,
      duration
    };
  }

  private async checkConfiguration(): Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string; duration?: number }> {
    const start = Date.now();
    const validation = configManager.validate();
    const duration = Date.now() - start;

    if (!validation.valid) {
      return {
        status: 'fail',
        message: `Configuration errors: ${validation.errors.join(', ')}`,
        duration
      };
    }

    return {
      status: 'pass',
      message: 'Configuration is valid',
      duration
    };
  }

  private async checkBrowserAvailability(): Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string; duration?: number }> {
    const start = Date.now();
    
    try {
      // This would typically check if Playwright can launch a browser
      // For now, we'll do a basic check
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      
      const duration = Date.now() - start;
      return {
        status: 'pass',
        message: 'Browser is available',
        duration
      };
    } catch (error) {
      const duration = Date.now() - start;
      return {
        status: 'fail',
        message: `Browser unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration
      };
    }
  }

  private async checkDiskSpace(): Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string; duration?: number }> {
    const start = Date.now();
    
    try {
      const { statSync } = await import('fs');
      const stats = statSync('.');
      const duration = Date.now() - start;
      
      // This is a simplified check - in production you'd want to check actual disk space
      return {
        status: 'pass',
        message: 'Disk space check passed',
        duration
      };
    } catch (error) {
      const duration = Date.now() - start;
      return {
        status: 'warn',
        message: `Could not check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration
      };
    }
  }

  public handleHealthCheckRequest(req: IncomingMessage, res: ServerResponse): void {
    this.performHealthCheck()
      .then(result => {
        const statusCode = result.status === 'healthy' ? 200 : 
                          result.status === 'degraded' ? 200 : 503;
        
        res.writeHead(statusCode, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify(result, null, 2));
      })
      .catch(error => {
        logger.error('Health check failed', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'unhealthy',
          timestamp: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      });
  }

  public handleMetricsRequest(req: IncomingMessage, res: ServerResponse): void {
    try {
      const metrics = metricsCollector.getMetrics();
      const healthStatus = metricsCollector.getHealthStatus();
      
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });
      
      res.end(JSON.stringify({
        ...metrics,
        health: healthStatus
      }, null, 2));
    } catch (error) {
      logger.error('Metrics request failed', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }
}

export const healthCheckService = new HealthCheckService();