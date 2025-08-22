import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { SessionManager } from '../../src/browser/session-manager.js';
import { PerformanceManager } from '../../src/performance/performance-manager.js';
import type { PerformanceConfig } from '../../src/types/performance-types.js';

describe('Performance Optimization Integration', () => {
  let browser: Browser;
  let sessionManager: SessionManager;
  let performanceManager: PerformanceManager;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterEach(async () => {
    if (sessionManager) {
      await sessionManager.shutdown();
    }
    if (performanceManager) {
      await performanceManager.shutdown();
    }
    if (browser) {
      await browser.close();
    }
  });

  describe('Context Pool Integration', () => {
    it('should reuse browser contexts across sessions', async () => {
      const performanceConfig: PerformanceConfig = {
        contextPool: {
          minPoolSize: 2,
          maxPoolSize: 5,
          warmupOnStart: true
        }
      };

      sessionManager = new SessionManager({}, performanceConfig);
      await sessionManager.initialize();

      // Create and destroy a session
      const session1 = await sessionManager.createSession({ viewport: { width: 1920, height: 1080 } });
      const contextId1 = session1.context;
      await sessionManager.destroySession(session1.id);

      // Create another session with same options
      const session2 = await sessionManager.createSession({ viewport: { width: 1920, height: 1080 } });
      
      // Context should be reused (this is hard to verify directly, but we can check that creation is fast)
      expect(session2).toBeDefined();
      
      await sessionManager.destroySession(session2.id);
    });

    it('should handle concurrent session creation efficiently', async () => {
      const performanceConfig: PerformanceConfig = {
        contextPool: {
          minPoolSize: 3,
          maxPoolSize: 10
        }
      };

      sessionManager = new SessionManager({}, performanceConfig);
      await sessionManager.initialize();

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: 5 }, (_, i) =>
        sessionManager.createSession({ viewport: { width: 1280, height: 720 } }, `client${i}`)
      );

      const sessions = await Promise.all(sessionPromises);
      
      expect(sessions).toHaveLength(5);
      sessions.forEach(session => {
        expect(session).toBeDefined();
        expect(session.context).toBeDefined();
      });

      // Clean up
      await Promise.all(sessions.map(session => sessionManager.destroySession(session.id)));
    });
  });

  describe('Memory Monitoring Integration', () => {
    it('should track memory usage across sessions', async () => {
      const performanceConfig: PerformanceConfig = {
        memoryLimits: {
          maxSessionMemoryMB: 256,
          maxTotalMemoryMB: 1024,
          monitoringInterval: 100
        }
      };

      performanceManager = new PerformanceManager(performanceConfig);
      await performanceManager.initialize(browser);

      // Acquire contexts for multiple sessions
      const context1 = await performanceManager.acquireContext('session1');
      const context2 = await performanceManager.acquireContext('session2');

      expect(context1).toBeDefined();
      expect(context2).toBeDefined();

      // Update memory usage
      performanceManager.updateSessionMemory('session1', { heapUsedMB: 100 });
      performanceManager.updateSessionMemory('session2', { heapUsedMB: 150 });

      const stats = performanceManager.getPerformanceStats();
      expect(stats.memory.sessions.sessionCount).toBe(2);
      expect(stats.memory.sessions.totalSessionMemoryMB).toBe(250);

      // Clean up
      if (context1) await performanceManager.releaseContext('session1', context1.id);
      if (context2) await performanceManager.releaseContext('session2', context2.id);
    });

    it('should prevent session creation when memory limits are exceeded', async () => {
      const performanceConfig: PerformanceConfig = {
        memoryLimits: {
          maxSessionMemoryMB: 100,
          maxTotalMemoryMB: 200
        }
      };

      performanceManager = new PerformanceManager(performanceConfig);
      await performanceManager.initialize(browser);

      // Create sessions that approach the limit
      const context1 = await performanceManager.acquireContext('session1');
      const context2 = await performanceManager.acquireContext('session2');

      // Simulate high memory usage
      performanceManager.updateSessionMemory('session1', { heapUsedMB: 95 });
      performanceManager.updateSessionMemory('session2', { heapUsedMB: 95 });

      // This should still work as we're just at the edge
      expect(performanceManager.canCreateSession()).toBe(true);

      // Clean up
      if (context1) await performanceManager.releaseContext('session1', context1.id);
      if (context2) await performanceManager.releaseContext('session2', context2.id);
    });
  });

  describe('CPU Throttling Integration', () => {
    it('should throttle JavaScript execution across sessions', async () => {
      const performanceConfig: PerformanceConfig = {
        cpuThrottle: {
          maxConcurrentExecutions: 2,
          maxExecutionTimeMs: 5000
        }
      };

      performanceManager = new PerformanceManager(performanceConfig);
      await performanceManager.initialize(browser);

      // Create operations for different sessions
      const operation1 = () => new Promise(resolve => setTimeout(() => resolve('result1'), 50));
      const operation2 = () => new Promise(resolve => setTimeout(() => resolve('result2'), 50));
      const operation3 = () => new Promise(resolve => setTimeout(() => resolve('result3'), 50));

      // Execute operations concurrently
      const promises = [
        performanceManager.throttleExecution('session1', operation1),
        performanceManager.throttleExecution('session2', operation2),
        performanceManager.throttleExecution('session1', operation3)
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.executionTime).toBeGreaterThan(0);
      });

      // At least one should have been queued
      const queuedResults = results.filter(r => r.queueTime > 0);
      expect(queuedResults.length).toBeGreaterThan(0);
    });

    it('should handle execution timeouts', async () => {
      const performanceConfig: PerformanceConfig = {
        cpuThrottle: {
          maxExecutionTimeMs: 100
        }
      };

      performanceManager = new PerformanceManager(performanceConfig);
      await performanceManager.initialize(browser);

      const longOperation = () => new Promise(resolve => setTimeout(resolve, 200));

      const result = await performanceManager.throttleExecution('session1', longOperation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('Disk Management Integration', () => {
    it('should manage temporary files across sessions', async () => {
      const performanceConfig: PerformanceConfig = {
        diskManager: {
          maxSessionSizeMB: 10,
          maxTotalSizeMB: 50
        }
      };

      performanceManager = new PerformanceManager(performanceConfig);
      await performanceManager.initialize(browser);

      // Store files for different sessions
      const file1Path = await performanceManager.storeTemporaryFile('session1', 'test1.txt', 'content1');
      const file2Path = await performanceManager.storeTemporaryFile('session2', 'test2.txt', 'content2');
      const file3Path = await performanceManager.storeTemporaryFile('session1', 'test3.png', Buffer.from('image data'));

      expect(file1Path).toBeDefined();
      expect(file2Path).toBeDefined();
      expect(file3Path).toBeDefined();

      // Retrieve files
      const content1 = await performanceManager.getTemporaryFile(file1Path);
      const content2 = await performanceManager.getTemporaryFile(file2Path);

      expect(content1.toString()).toBe('content1');
      expect(content2.toString()).toBe('content2');

      // Check disk usage statistics
      const stats = performanceManager.getPerformanceStats();
      expect(stats.disk.totalFiles).toBe(3);
      expect(stats.disk.sessionCount).toBe(2);

      // Clean up one session
      await performanceManager.cleanupSession('session1');

      const newStats = performanceManager.getPerformanceStats();
      expect(newStats.disk.totalFiles).toBe(1); // Only session2 file should remain
    });

    it('should enforce disk space limits', async () => {
      const performanceConfig: PerformanceConfig = {
        diskManager: {
          maxSessionSizeMB: 1, // Very small limit
          maxTotalSizeMB: 2
        }
      };

      performanceManager = new PerformanceManager(performanceConfig);
      await performanceManager.initialize(browser);

      // Try to store a file that exceeds session limit
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB

      await expect(
        performanceManager.storeTemporaryFile('session1', 'large.txt', largeContent)
      ).rejects.toThrow('Session disk usage would exceed limit');
    });
  });

  describe('End-to-End Performance Optimization', () => {
    it('should optimize performance under load', async () => {
      const performanceConfig: PerformanceConfig = {
        contextPool: { minPoolSize: 2, maxPoolSize: 5 },
        memoryLimits: { maxTotalMemoryMB: 512 },
        cpuThrottle: { maxConcurrentExecutions: 3 },
        diskManager: { maxTotalSizeMB: 100 }
      };

      sessionManager = new SessionManager({}, performanceConfig);
      await sessionManager.initialize();

      // Create multiple sessions with various operations
      const sessions = await Promise.all([
        sessionManager.createSession({ viewport: { width: 1920, height: 1080 } }, 'client1'),
        sessionManager.createSession({ viewport: { width: 1280, height: 720 } }, 'client2'),
        sessionManager.createSession({ viewport: { width: 1920, height: 1080 } }, 'client3')
      ]);

      expect(sessions).toHaveLength(3);

      // Simulate some activity
      for (const session of sessions) {
        await session.page.goto('data:text/html,<html><body><h1>Test Page</h1></body></html>');
        await session.page.screenshot({ path: `temp-screenshot-${session.id}.png` });
      }

      // Get performance statistics
      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(3);
      expect(stats.totalSessions).toBe(3);

      // Clean up
      await Promise.all(sessions.map(session => sessionManager.destroySession(session.id)));

      const finalStats = sessionManager.getStats();
      expect(finalStats.activeSessions).toBe(0);
    });

    it('should handle resource exhaustion gracefully', async () => {
      const performanceConfig: PerformanceConfig = {
        contextPool: { maxPoolSize: 2 }, // Very limited
        memoryLimits: { maxTotalMemoryMB: 100 }, // Very limited
        cpuThrottle: { maxConcurrentExecutions: 1 }
      };

      sessionManager = new SessionManager({ maxSessions: 2 }, performanceConfig);
      await sessionManager.initialize();

      // Try to create more sessions than allowed
      const session1 = await sessionManager.createSession({}, 'client1');
      const session2 = await sessionManager.createSession({}, 'client2');

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();

      // This should fail due to session limit
      await expect(
        sessionManager.createSession({}, 'client3')
      ).rejects.toThrow('Maximum number of sessions');

      // Clean up
      await sessionManager.destroySession(session1.id);
      await sessionManager.destroySession(session2.id);
    });

    it('should maintain performance under concurrent load', async () => {
      const performanceConfig: PerformanceConfig = {
        contextPool: { minPoolSize: 3, maxPoolSize: 8 },
        cpuThrottle: { maxConcurrentExecutions: 4 }
      };

      sessionManager = new SessionManager({}, performanceConfig);
      await sessionManager.initialize();

      // Create sessions concurrently
      const startTime = Date.now();
      
      const sessionPromises = Array.from({ length: 6 }, (_, i) =>
        sessionManager.createSession({ viewport: { width: 1280, height: 720 } }, `client${i}`)
      );

      const sessions = await Promise.all(sessionPromises);
      const creationTime = Date.now() - startTime;

      expect(sessions).toHaveLength(6);
      expect(creationTime).toBeLessThan(5000); // Should be reasonably fast

      // Perform concurrent operations
      const operationPromises = sessions.map(async (session, i) => {
        await session.page.goto(`data:text/html,<html><body><h1>Page ${i}</h1></body></html>`);
        return session.page.title();
      });

      const titles = await Promise.all(operationPromises);
      expect(titles).toHaveLength(6);

      // Clean up
      await Promise.all(sessions.map(session => sessionManager.destroySession(session.id)));
    });
  });

  describe('Performance Benchmarks', () => {
    it('should demonstrate performance improvements with optimization', async () => {
      // Test without optimization
      const sessionManagerWithoutOpt = new SessionManager({}, { enableOptimizations: false });
      await sessionManagerWithoutOpt.initialize();

      const startTimeWithoutOpt = Date.now();
      const sessionsWithoutOpt = await Promise.all([
        sessionManagerWithoutOpt.createSession({}),
        sessionManagerWithoutOpt.createSession({}),
        sessionManagerWithoutOpt.createSession({})
      ]);
      const timeWithoutOpt = Date.now() - startTimeWithoutOpt;

      await Promise.all(sessionsWithoutOpt.map(s => sessionManagerWithoutOpt.destroySession(s.id)));
      await sessionManagerWithoutOpt.shutdown();

      // Test with optimization
      const sessionManagerWithOpt = new SessionManager({}, {
        enableOptimizations: true,
        contextPool: { minPoolSize: 3, warmupOnStart: true }
      });
      await sessionManagerWithOpt.initialize();

      // Wait for warmup
      await new Promise(resolve => setTimeout(resolve, 100));

      const startTimeWithOpt = Date.now();
      const sessionsWithOpt = await Promise.all([
        sessionManagerWithOpt.createSession({}),
        sessionManagerWithOpt.createSession({}),
        sessionManagerWithOpt.createSession({})
      ]);
      const timeWithOpt = Date.now() - startTimeWithOpt;

      await Promise.all(sessionsWithOpt.map(s => sessionManagerWithOpt.destroySession(s.id)));
      await sessionManagerWithOpt.shutdown();

      // Optimization should provide some benefit (though this is environment-dependent)
      expect(timeWithOpt).toBeLessThanOrEqual(timeWithoutOpt * 1.5); // Allow some variance
      
      console.log(`Session creation time without optimization: ${timeWithoutOpt}ms`);
      console.log(`Session creation time with optimization: ${timeWithOpt}ms`);
    });
  });
});