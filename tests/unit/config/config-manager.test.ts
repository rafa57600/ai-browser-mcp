import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from '../../../src/config/config-manager.js';
import { existsSync, readFileSync } from 'fs';

vi.mock('fs');

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const mockExistsSync = vi.mocked(existsSync);
  const mockReadFileSync = vi.mocked(readFileSync);

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.LOG_LEVEL;
    delete process.env.HEADLESS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should load default configuration when no config file exists', () => {
      mockExistsSync.mockReturnValue(false);
      
      configManager = new ConfigManager();
      const config = configManager.getConfig();
      
      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
      expect(config.browser.headless).toBe(true);
    });

    it('should load configuration from file when it exists', () => {
      const mockConfig = {
        server: { port: 8080, host: '0.0.0.0' },
        browser: { headless: false }
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      configManager = new ConfigManager();
      const config = configManager.getConfig();
      
      expect(config.server.port).toBe(8080);
      expect(config.server.host).toBe('0.0.0.0');
      expect(config.browser.headless).toBe(false);
    });

    it('should use environment variables for defaults', () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '9000';
      process.env.HOST = 'test.local';
      process.env.LOG_LEVEL = 'debug';
      process.env.HEADLESS = 'false';
      
      mockExistsSync.mockReturnValue(false);
      
      configManager = new ConfigManager();
      const config = configManager.getConfig();
      
      expect(config.server.port).toBe(9000);
      expect(config.server.host).toBe('test.local');
      expect(config.logging.level).toBe('debug');
      expect(config.browser.headless).toBe(false);
    });

    it('should handle invalid JSON in config file', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      configManager = new ConfigManager();
      const config = configManager.getConfig();
      
      // Should fall back to defaults
      expect(config.server.port).toBe(3000);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('getConfig', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
      configManager = new ConfigManager();
    });

    it('should return complete configuration object', () => {
      const config = configManager.getConfig();
      
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('browser');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('monitoring');
      expect(config).toHaveProperty('performance');
    });
  });

  describe('get', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
      configManager = new ConfigManager();
    });

    it('should return specific configuration section', () => {
      const serverConfig = configManager.get('server');
      
      expect(serverConfig).toHaveProperty('port');
      expect(serverConfig).toHaveProperty('host');
      expect(serverConfig).toHaveProperty('timeout');
      expect(serverConfig).toHaveProperty('maxConnections');
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
      configManager = new ConfigManager();
    });

    it('should return valid for default configuration', () => {
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid port number', () => {
      const mockConfig = {
        server: { port: 70000 } // Invalid port
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      configManager = new ConfigManager();
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Server port must be between 1 and 65535');
    });

    it('should detect invalid browser maxSessions', () => {
      const mockConfig = {
        browser: { maxSessions: 0 } // Invalid value
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      configManager = new ConfigManager();
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Browser maxSessions must be at least 1');
    });

    it('should detect invalid rate limit', () => {
      const mockConfig = {
        security: {
          rateLimit: { requests: 0 } // Invalid value
        }
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      configManager = new ConfigManager();
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Rate limit requests must be at least 1');
    });

    it('should detect invalid memory limit', () => {
      const mockConfig = {
        performance: { memoryLimit: 50 } // Too low
      };
      
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
      
      configManager = new ConfigManager();
      const validation = configManager.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Memory limit must be at least 100MB');
    });
  });

  describe('reload', () => {
    it('should reload configuration from file', () => {
      mockExistsSync.mockReturnValue(false);
      configManager = new ConfigManager();
      
      const initialConfig = configManager.getConfig();
      expect(initialConfig.server.port).toBe(3000);
      
      // Mock file now exists with different config
      const newConfig = { server: { port: 4000 } };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(newConfig));
      
      configManager.reload();
      const reloadedConfig = configManager.getConfig();
      
      expect(reloadedConfig.server.port).toBe(4000);
    });
  });
});