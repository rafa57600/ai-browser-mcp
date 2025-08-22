import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { PerformanceManager } from '../../../src/performance/performance-manager.js';
import type { PerformanceConfig } from '../../../src/types/performance-types.js';

describe('PerformanceManager', () => {
  let browser: Browser;
  let performanceManager: PerformanceManager;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterEach(async () => {
    if (performanceManager) {
      await performanceManager.shutdown();
    }
    if (browser) {
      await browser.close();
    }
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      performanceManager = new PerformanceManager();
      await performanceManager.initialize(browser);
      
      expect(performanceManager.isOptimizationEnabled()).toBe(true);
      
      const config = performanceManager.getConfig();
      expect(config.enableOptimizations).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const config: PerformanceConfig = {
        enableOptimizations: false,
        contextPool: { maxPoolSize: 5 },
        memoryLimits: { maxTotalMemoryMB: 1024 }
      };
      
      performanceManager = new PerformanceManager(config);
      await performanceManager.initialize(browser);
      
      expect(performanceManager.isOptimizationEnabled()).toBe(false);
      
      const actualConfig = performanceManager.getConfig();
      expect(actualConfig.enableOptimizations).toBe(false);
    });

    it('should not initialize components when optimizations are disabled', async () => {
      performanceManager = new PerformanceManager({ enableOptimizations: false });
      await performanceManager.initialize(browser);
      
      const stats = performanceManager.getPerformanceStats();
      expect(stats).toBeDefined();
    });
  });

  describe('context management', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager({
        contextPool: { minPoolSize: 1, maxPoolSize: 3 }
      });
      await performanceManager.initialize(browser);
    });

    it('should acquire and release contexts', async () => {
      const context = await performanceManager.acquireContext('session1');
      
      expect(context).toBeDefined();
      expect(context?.id).toBeDefined();
      expect(context?.context).toBeDefined();
      
      if (context) {
        await performanceManager.releaseContext('session1', context.id);
      }
    });

    it('should handle context acquisition when optimizations are disabled', async () => {
      await performanceManager.shutdown();
      performanceManager = new PerformanceManager({ enableOptimizations: false });
      await performanceManager.initialize(browser);
      
      const context = await performanceManager.acquireContext('session1');
      expect(context).toBeNull();
    });

    it('should register sessions for monitoring', async () => {
      await performanceManager.acquireContext('session1');
      
      const sessionStats = performanceManager.getSessionStats('session1');
      expect(sessionStats).toBeDefined();
      expect(sessionStats?.memory).toBeDefined();
      expect(sessionStats?.cpu).toBeDefined();
    });
  });

  describe('execution throttling', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager({
        cpuThrottle: { maxConcurrentExecutions: 2 }
      });
      await performanceManager.initialize(browser);
    });

    it('should throttle JavaScript execution', async () => {
      const operation = vi.fn().mockResolvedValue('test result');
      
      const result = await performanceManager.throttleExecution('session1', operation);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('test result');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(operation).toHaveBeenCalled();
    });

    it('should execute directly when optimizations are disabled', async () => {
      await performanceManager.shutdown();
      performanceManager = new PerformanceManager({ enableOptimizations: false });
      await performanceManager.initialize(browser);
      
      const operation = vi.fn().mockResolvedValue('test result');
      
      const result = await performanceManager.throttleExecution('session1', operation);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('test result');
      expect(result.queueTime).toBe(0);
    });

    it('should handle execution errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));
      
      const result = await performanceManager.throttleExecution('session1', operation);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });
  });

  describe('file management', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager({
        diskManager: { maxSessionSizeMB: 10 }
      });
      await performanceManager.initialize(browser);
    });

    it('should store and retrieve temporary files', async () => {
      const content = 'Hello, world!';
      const filePath = await performanceManager.storeTemporaryFile('session1', 'test.txt', content);
      
      expect(filePath).toBeDefined();
      
      const retrievedContent = await performanceManager.getTemporaryFile(filePath);
      expect(retrievedContent.toString()).toBe(content);
    });

    it('should store files with metadata', async () => {
      const content = Buffer.from('image data');
      const metadata = { type: 'screenshot', width: 1920, height: 1080 };
      
      const filePath = await performanceManager.storeTemporaryFile('session1', 'screenshot.png', content, metadata);
      
      expect(filePath).toBeDefined();
      expect(filePath).toContain('screenshot.png');
    });
  });

  describe('memory management', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager({
        memoryLimits: { maxTotalMemoryMB: 1024 }
      });
      await performanceManager.initialize(browser);
    });

    it('should track memory usage', () => {
      performanceManager.updateSessionMemory('session1', {
        heapUsedMB: 50,
        heapTotalMB: 100
      });
      
      const sessionStats = performanceManager.getSessionStats('session1');
      expect(sessionStats?.memory).toBeDefined();
    });

    it('should report memory pressure', () => {
      const pressure = performanceManager.getMemoryPressure();
      expect(['low', 'medium', 'high', 'critical']).toContain(pressure);
    });

    it('should force garbage collection when available', () => {
      global.gc = vi.fn();
      
      const result = performanceManager.forceGarbageCollection();
      
      expect(result).toBe(true);
      expect(global.gc).toHaveBeenCalled();
      
      delete (global as any).gc;
    });

    it('should handle missing garbage collection', () => {
      const result = performanceManager.forceGarbageCollection();
      expect(result).toBe(false);
    });

    it('should check session creation limits', () => {
      const canCreate = performanceManager.canCreateSession();
      expect(typeof canCreate).toBe('boolean');
    });
  });

  describe('performance statistics', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager();
      await performanceManager.initialize(browser);
    });

    it('should provide comprehensive performance statistics', () => {
      const stats = performanceManager.getPerformanceStats();
      
      expect(stats.contextPool).toBeDefined();
      expect(stats.memory).toBeDefined();
      expect(stats.cpu).toBeDefined();
      expect(stats.disk).toBeDefined();
      expect(stats.timestamp).toBeInstanceOf(Date);
    });

    it('should provide session-specific statistics', async () => {
      await performanceManager.acquireContext('session1');
      
      const sessionStats = performanceManager.getSessionStats('session1');
      
      expect(sessionStats).toBeDefined();
      expect(sessionStats?.memory).toBeDefined();
      expect(sessionStats?.cpu).toBeDefined();
      expect(sessionStats?.disk).toBeDefined();
    });

    it('should return null for session stats when optimizations disabled', async () => {
      await performanceManager.shutdown();
      performanceManager = new PerformanceManager({ enableOptimizations: false });
      await performanceManager.initialize(browser);
      
      const sessionStats = performanceManager.getSessionStats('session1');
      expect(sessionStats).toBeNull();
    });
  });

  describe('optimization operations', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager();
      await performanceManager.initialize(browser);
    });

    it('should perform performance optimization', async () => {
      const result = await performanceManager.optimizePerformance();
      
      expect(result).toBeDefined();
      expect(typeof result.memoryFreed).toBe('boolean');
      expect(result.diskCleaned).toBeDefined();
      expect(typeof result.contextsOptimized).toBe('boolean');
    });

    it('should force disk cleanup', async () => {
      const result = await performanceManager.forceDiskCleanup(10);
      
      expect(result).toBeDefined();
      expect(typeof result.filesDeleted).toBe('number');
      expect(typeof result.spaceFreesMB).toBe('number');
    });

    it('should handle optimization when disabled', async () => {
      await performanceManager.shutdown();
      performanceManager = new PerformanceManager({ enableOptimizations: false });
      await performanceManager.initialize(browser);
      
      const result = await performanceManager.optimizePerformance();
      
      expect(result.memoryFreed).toBe(false);
      expect(result.diskCleaned.filesDeleted).toBe(0);
      expect(result.contextsOptimized).toBe(false);
    });
  });

  describe('session cleanup', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager();
      await performanceManager.initialize(browser);
    });

    it('should clean up session resources', async () => {
      await performanceManager.acquireContext('session1');
      await performanceManager.storeTemporaryFile('session1', 'test.txt', 'content');
      
      await performanceManager.cleanupSession('session1');
      
      // Session should be cleaned up
      const sessionStats = performanceManager.getSessionStats('session1');
      expect(sessionStats?.memory).toBeNull();
    });

    it('should handle cleanup when optimizations disabled', async () => {
      await performanceManager.shutdown();
      performanceManager = new PerformanceManager({ enableOptimizations: false });
      await performanceManager.initialize(browser);
      
      await expect(performanceManager.cleanupSession('session1')).resolves.not.toThrow();
    });
  });

  describe('lifecycle management', () => {
    it('should initialize and shutdown properly', async () => {
      performanceManager = new PerformanceManager();
      
      await performanceManager.initialize(browser);
      expect(performanceManager.isOptimizationEnabled()).toBe(true);
      
      await performanceManager.shutdown();
      // Should be able to shutdown without errors
    });

    it('should handle multiple initializations', async () => {
      performanceManager = new PerformanceManager();
      
      await performanceManager.initialize(browser);
      await performanceManager.initialize(browser); // Second call should not cause issues
      
      expect(performanceManager.isOptimizationEnabled()).toBe(true);
    });

    it('should handle shutdown before initialization', async () => {
      performanceManager = new PerformanceManager();
      
      await expect(performanceManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      performanceManager = new PerformanceManager();
      await performanceManager.initialize(browser);
    });

    it('should handle context acquisition errors', async () => {
      // Mock memory monitor to reject session creation
      performanceManager.updateSessionMemory = vi.fn();
      
      // This should still work as the memory check is internal
      const context = await performanceManager.acquireContext('session1');
      expect(context).toBeDefined();
    });

    it('should handle file storage errors', async () => {
      // Try to store a file with invalid extension
      await expect(
        performanceManager.storeTemporaryFile('session1', 'malicious.exe', 'content')
      ).rejects.toThrow();
    });

    it('should handle missing files gracefully', async () => {
      await expect(
        performanceManager.getTemporaryFile('/non/existent/file.txt')
      ).rejects.toThrow();
    });
  });
});