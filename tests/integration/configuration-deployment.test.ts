import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from '../../src/config/config-manager.js';
import { HttpServer } from '../../src/server/http-server.js';
import { HealthCheckService } from '../../src/monitoring/health-check.js';
import { Logger } from '../../src/monitoring/logger.js';
import { MetricsCollector } from '../../src/monitoring/metrics-collector.js';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('Configuration and Deployment Integration', () => {
  const testConfigDir = 'test-config';
  const testConfigPath = join(testConfigDir, 'test.json');
  
  beforeEach(() => {
    // Create test config directory
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('Configuration Management', () => {
    it('should load and validate configuration from file', () => {
      const testConfig = {
        server: {
          port: 4000,
          host: 'test.local',
          timeout: 15000,
          maxConnections: 50
        },
        browser: {
          headless: true,
          maxSessions: 5,
          sessionTimeout: 900000
        },
        security: {
          allowedDomains: ['test.com'],
          rateLimit: {
            requests: 30,
            window: 30000
          }
        },
        logging: {
          level: 'debug',
          enableConsole: true
        },
        monitoring: {
          enableHealthCheck: true,
          enableMetrics: true
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.getConfig();
      
      expect(config.server.port).toBe(4000);
      expect(config.server.host).toBe('test.local');
      expect(config.browser.maxSessions).toBe(5);
      expect(config.security.allowedDomains).toContain('test.com');
      
      const validation = configManager.validate();
      expect(validation.valid).toBe(true);
    });

    it('should detect configuration validation errors', () => {
      const invalidConfig = {
        server: {
          port: 70000, // Invalid port
          maxConnections: -1 // Invalid value
        },
        browser: {
          maxSessions: 0 // Invalid value
        },
        security: {
          rateLimit: {
            requests: 0 // Invalid value
          }
        },
        performance: {
          memoryLimit: 50 // Too low
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(invalidConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors).toContain('Server port must be between 1 and 65535');
      expect(validation.errors).toContain('Browser maxSessions must be at least 1');
      expect(validation.errors).toContain('Rate limit requests must be at least 1');
      expect(validation.errors).toContain('Memory limit must be at least 100MB');
    });

    it('should merge configuration with environment variables', () => {
      process.env.PORT = '5000';
      process.env.HOST = 'env.local';
      process.env.LOG_LEVEL = 'warn';
      process.env.HEADLESS = 'false';

      const testConfig = {
        server: {
          timeout: 20000
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      const config = configManager.getConfig();
      
      expect(config.server.port).toBe(5000); // From env
      expect(config.server.host).toBe('env.local'); // From env
      expect(config.server.timeout).toBe(20000); // From file
      expect(config.logging.level).toBe('warn'); // From env
      expect(config.browser.headless).toBe(false); // From env

      // Clean up
      delete process.env.PORT;
      delete process.env.HOST;
      delete process.env.LOG_LEVEL;
      delete process.env.HEADLESS;
    });
  });

  describe('HTTP Server Integration', () => {
    let httpServer: HttpServer;

    afterEach(async () => {
      if (httpServer && httpServer.isServerRunning()) {
        await httpServer.stop();
      }
    });

    it('should start HTTP server with health check endpoint', async () => {
      const testConfig = {
        server: {
          port: 0, // Use random available port
          host: 'localhost'
        },
        monitoring: {
          enableHealthCheck: true,
          healthCheckPath: '/health',
          enableMetrics: false
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      // Create new config manager with test config
      const configManager = new ConfigManager(testConfigPath);
      
      // Mock the config manager module
      vi.doMock('../../src/config/config-manager.js', () => ({
        configManager
      }));

      httpServer = new HttpServer();
      await httpServer.start();
      
      expect(httpServer.isServerRunning()).toBe(true);
      
      const address = httpServer.getServerAddress();
      expect(address).toBeTruthy();
      expect(address!.port).toBeGreaterThan(0);
      
      // Test health check endpoint
      const response = await fetch(`http://${address!.host}:${address!.port}/health`);
      expect(response.ok).toBe(true);
      
      const healthData = await response.json();
      expect(healthData).toHaveProperty('status');
      expect(healthData).toHaveProperty('timestamp');
      expect(healthData).toHaveProperty('checks');
    });

    it('should handle metrics endpoint when enabled', async () => {
      const testConfig = {
        server: {
          port: 0,
          host: 'localhost'
        },
        monitoring: {
          enableHealthCheck: true,
          enableMetrics: true,
          metricsPath: '/metrics'
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      
      vi.doMock('../../src/config/config-manager.js', () => ({
        configManager
      }));

      httpServer = new HttpServer();
      await httpServer.start();
      
      const address = httpServer.getServerAddress();
      
      // Test metrics endpoint
      const response = await fetch(`http://${address!.host}:${address!.port}/metrics`);
      expect(response.ok).toBe(true);
      
      const metricsData = await response.json();
      expect(metricsData).toHaveProperty('timestamp');
      expect(metricsData).toHaveProperty('memory');
      expect(metricsData).toHaveProperty('health');
    });

    it('should return 404 for disabled endpoints', async () => {
      const testConfig = {
        server: {
          port: 0,
          host: 'localhost'
        },
        monitoring: {
          enableHealthCheck: false,
          enableMetrics: false
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      
      vi.doMock('../../src/config/config-manager.js', () => ({
        configManager
      }));

      httpServer = new HttpServer();
      await httpServer.start();
      
      const address = httpServer.getServerAddress();
      
      // Test disabled health check endpoint
      const healthResponse = await fetch(`http://${address!.host}:${address!.port}/health`);
      expect(healthResponse.status).toBe(404);
      
      // Test disabled metrics endpoint
      const metricsResponse = await fetch(`http://${address!.host}:${address!.port}/metrics`);
      expect(metricsResponse.status).toBe(404);
    });
  });

  describe('Logging Integration', () => {
    it('should create logger with configuration settings', () => {
      const testConfig = {
        logging: {
          level: 'debug',
          enableConsole: true,
          file: 'test-logs/app.log',
          maxSize: '5m',
          maxFiles: 3
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      
      vi.doMock('../../src/config/config-manager.js', () => ({
        configManager
      }));

      // Create logger (this would normally be done during module import)
      const logger = new Logger();
      
      // Test that logger methods work
      expect(() => {
        logger.debug('Test debug message');
        logger.info('Test info message');
        logger.warn('Test warning message');
        logger.error('Test error message');
      }).not.toThrow();
    });
  });

  describe('Metrics Collection Integration', () => {
    let metricsCollector: MetricsCollector;

    afterEach(() => {
      if (metricsCollector) {
        metricsCollector.stop();
      }
    });

    it('should collect and provide system metrics', async () => {
      metricsCollector = new MetricsCollector();
      
      // Wait a bit for initial metrics collection
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('sessions');
      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('browser');
      
      expect(metrics.memory.used).toBeGreaterThan(0);
      expect(metrics.memory.total).toBeGreaterThan(0);
      expect(metrics.memory.percentage).toBeGreaterThanOrEqual(0);
    });

    it('should record request metrics', () => {
      metricsCollector = new MetricsCollector();
      
      metricsCollector.recordRequest({
        method: 'CallTool',
        tool: 'browser.goto',
        duration: 150,
        success: true,
        timestamp: new Date()
      });
      
      metricsCollector.recordRequest({
        method: 'CallTool',
        tool: 'browser.click',
        duration: 75,
        success: false,
        error: 'Element not found',
        timestamp: new Date()
      });
      
      const metrics = metricsCollector.getMetrics();
      
      expect(metrics.requests.total).toBe(2);
      expect(metrics.requests.successful).toBe(1);
      expect(metrics.requests.failed).toBe(1);
      expect(metrics.requests.averageResponseTime).toBeGreaterThan(0);
      
      const history = metricsCollector.getRequestHistory();
      expect(history).toHaveLength(2);
    });

    it('should provide health status based on metrics', () => {
      metricsCollector = new MetricsCollector();
      
      // Simulate high error rate
      for (let i = 0; i < 20; i++) {
        metricsCollector.recordRequest({
          method: 'CallTool',
          tool: 'test.tool',
          duration: 100,
          success: i < 5, // 75% failure rate
          error: i >= 5 ? 'Test error' : undefined,
          timestamp: new Date()
        });
      }
      
      const healthStatus = metricsCollector.getHealthStatus();
      
      expect(healthStatus.status).toBe('unhealthy');
      expect(healthStatus.details.issues.length).toBeGreaterThan(0);
      expect(healthStatus.details.issues.some(issue => 
        issue.includes('High error rate')
      )).toBe(true);
    });
  });

  describe('End-to-End Configuration Flow', () => {
    it('should load configuration and start all services', async () => {
      const testConfig = {
        server: {
          port: 0,
          host: 'localhost',
          timeout: 10000
        },
        browser: {
          headless: true,
          maxSessions: 3
        },
        security: {
          allowedDomains: ['localhost'],
          enableDomainValidation: false
        },
        logging: {
          level: 'info',
          enableConsole: false
        },
        monitoring: {
          enableHealthCheck: true,
          enableMetrics: true
        },
        performance: {
          memoryLimit: 512,
          enableContextPooling: true
        }
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
      
      const configManager = new ConfigManager(testConfigPath);
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(true);
      
      // Test that all configuration sections are properly loaded
      const config = configManager.getConfig();
      expect(config.server.port).toBe(0);
      expect(config.browser.maxSessions).toBe(3);
      expect(config.security.allowedDomains).toContain('localhost');
      expect(config.logging.level).toBe('info');
      expect(config.monitoring.enableHealthCheck).toBe(true);
      expect(config.performance.memoryLimit).toBe(512);
    });
  });
});