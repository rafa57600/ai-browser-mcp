import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthCheckService } from '../../../src/monitoring/health-check.js';
import { IncomingMessage, ServerResponse } from 'http';

// Mock dependencies
vi.mock('../../../src/config/config-manager.js', () => ({
  configManager: {
    validate: vi.fn(() => ({ valid: true, errors: [] })),
    get: vi.fn(() => ({
      enableHealthCheck: true,
      healthCheckPath: '/health',
      metricsPath: '/metrics',
      enableMetrics: true
    }))
  }
}));

vi.mock('../../../src/monitoring/metrics-collector.js', () => ({
  metricsCollector: {
    getMetrics: vi.fn(() => ({
      timestamp: new Date(),
      memory: { used: 256, total: 1024, percentage: 25 },
      cpu: { usage: 0.5 },
      sessions: { active: 2, total: 5 },
      requests: { total: 100, successful: 95, failed: 5, averageResponseTime: 150 },
      browser: { contexts: 2, pages: 3 }
    })),
    getHealthStatus: vi.fn(() => ({
      status: 'healthy',
      details: {
        memory: { used: 256, total: 1024, percentage: 25 },
        errorRate: '5.0',
        activeSessions: 2,
        issues: []
      }
    }))
  }
}));

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(() => Promise.resolve({
      close: vi.fn(() => Promise.resolve())
    }))
  }
}));

describe('HealthCheckService', () => {
  let healthCheckService: HealthCheckService;
  let mockRequest: Partial<IncomingMessage>;
  let mockResponse: Partial<ServerResponse>;

  beforeEach(() => {
    healthCheckService = new HealthCheckService();
    
    mockRequest = {
      method: 'GET',
      url: '/health',
      headers: {}
    };

    mockResponse = {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn()
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('performHealthCheck', () => {
    it('should return healthy status when all checks pass', async () => {
      const result = await healthCheckService.performHealthCheck();
      
      expect(result.status).toBe('healthy');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('checks');
      
      expect(result.checks).toHaveProperty('memory');
      expect(result.checks).toHaveProperty('configuration');
      expect(result.checks).toHaveProperty('browser');
      expect(result.checks).toHaveProperty('disk');
    });

    it('should return degraded status when memory usage is high', async () => {
      // Mock high memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 0,
        heapTotal: 1024 * 1024 * 1024, // 1GB
        heapUsed: 850 * 1024 * 1024,   // 850MB (83%)
        external: 0,
        arrayBuffers: 0
      });

      const result = await healthCheckService.performHealthCheck();
      
      expect(result.status).toBe('degraded');
      expect(result.checks.memory.status).toBe('warn');
      expect(result.checks.memory.message).toContain('High memory usage');
    });

    it('should return unhealthy status when memory usage is critical', async () => {
      // Mock critical memory usage
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 0,
        heapTotal: 1024 * 1024 * 1024, // 1GB
        heapUsed: 950 * 1024 * 1024,   // 950MB (93%)
        external: 0,
        arrayBuffers: 0
      });

      const result = await healthCheckService.performHealthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.memory.status).toBe('fail');
      expect(result.checks.memory.message).toContain('Critical memory usage');
    });

    it('should return unhealthy status when configuration is invalid', async () => {
      const { configManager } = await import('../../../src/config/config-manager.js');
      vi.mocked(configManager.validate).mockReturnValue({
        valid: false,
        errors: ['Invalid port number']
      });

      const result = await healthCheckService.performHealthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.configuration.status).toBe('fail');
      expect(result.checks.configuration.message).toContain('Configuration errors');
    });

    it('should return unhealthy status when browser is unavailable', async () => {
      const { chromium } = await import('playwright');
      vi.mocked(chromium.launch).mockRejectedValue(new Error('Browser not found'));

      const result = await healthCheckService.performHealthCheck();
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.browser.status).toBe('fail');
      expect(result.checks.browser.message).toContain('Browser unavailable');
    });

    it('should include duration for each check', async () => {
      const result = await healthCheckService.performHealthCheck();
      
      Object.values(result.checks).forEach(check => {
        expect(check).toHaveProperty('duration');
        expect(typeof check.duration).toBe('number');
        expect(check.duration).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('handleHealthCheckRequest', () => {
    it('should respond with 200 status for healthy service', async () => {
      await new Promise<void>((resolve) => {
        mockResponse.end = vi.fn((data) => {
          const response = JSON.parse(data as string);
          expect(response.status).toBe('healthy');
          expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
          resolve();
        });

        healthCheckService.handleHealthCheckRequest(
          mockRequest as IncomingMessage,
          mockResponse as ServerResponse
        );
      });
    });

    it('should respond with 503 status for unhealthy service', async () => {
      // Mock unhealthy state
      vi.spyOn(process, 'memoryUsage').mockReturnValue({
        rss: 0,
        heapTotal: 1024 * 1024 * 1024,
        heapUsed: 950 * 1024 * 1024, // Critical memory usage
        external: 0,
        arrayBuffers: 0
      });

      await new Promise<void>((resolve) => {
        mockResponse.end = vi.fn((data) => {
          const response = JSON.parse(data as string);
          expect(response.status).toBe('unhealthy');
          expect(mockResponse.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
          resolve();
        });

        healthCheckService.handleHealthCheckRequest(
          mockRequest as IncomingMessage,
          mockResponse as ServerResponse
        );
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock an error in health check
      vi.spyOn(healthCheckService, 'performHealthCheck').mockRejectedValue(
        new Error('Health check failed')
      );

      await new Promise<void>((resolve) => {
        mockResponse.end = vi.fn((data) => {
          const response = JSON.parse(data as string);
          expect(response).toHaveProperty('error');
          expect(mockResponse.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
          resolve();
        });

        healthCheckService.handleHealthCheckRequest(
          mockRequest as IncomingMessage,
          mockResponse as ServerResponse
        );
      });
    });
  });

  describe('handleMetricsRequest', () => {
    it('should respond with metrics data', async () => {
      await new Promise<void>((resolve) => {
        mockResponse.end = vi.fn((data) => {
          const response = JSON.parse(data as string);
          expect(response).toHaveProperty('timestamp');
          expect(response).toHaveProperty('memory');
          expect(response).toHaveProperty('health');
          expect(mockResponse.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
          resolve();
        });

        healthCheckService.handleMetricsRequest(
          mockRequest as IncomingMessage,
          mockResponse as ServerResponse
        );
      });
    });

    it('should handle metrics errors gracefully', async () => {
      const { metricsCollector } = await import('../../../src/monitoring/metrics-collector.js');
      vi.mocked(metricsCollector.getMetrics).mockImplementation(() => {
        throw new Error('Metrics collection failed');
      });

      await new Promise<void>((resolve) => {
        mockResponse.end = vi.fn((data) => {
          const response = JSON.parse(data as string);
          expect(response).toHaveProperty('error');
          expect(mockResponse.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
          resolve();
        });

        healthCheckService.handleMetricsRequest(
          mockRequest as IncomingMessage,
          mockResponse as ServerResponse
        );
      });
    });
  });
});