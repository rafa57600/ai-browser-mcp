// Load testing for the MCP browser server
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MCPBrowserServer } from '../../src/server/mcp-browser-server.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { PerformanceManager } from '../../src/performance/performance-manager.js';
import { SecurityManager } from '../../src/security/security-manager.js';
import { chromium, type Browser } from 'playwright';
import { createMockMCPClient } from '../mocks/mock-mcp-client.js';

describe('Load Testing', () => {
  let server: MCPBrowserServer;
  let browser: Browser;
  let sessionManager: SessionManager;
  let performanceManager: PerformanceManager;
  let securityManager: SecurityManager;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    
    sessionManager = new SessionManager({
      maxSessions: 50,
      sessionTimeout: 300000,
      cleanupInterval: 30000
    });

    performanceManager = new PerformanceManager({
      contextPool: { minPoolSize: 10, maxPoolSize: 30 },
      cpuThrottle: { maxConcurrentExecutions: 20 },
      memoryLimits: { maxTotalMemoryMB: 2048 },
      diskManager: { maxTotalSizeMB: 500 }
    });

    securityManager = new SecurityManager({
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 1000,
        requestsPerHour: 10000
      }
    });

    await sessionManager.initialize();
    await performanceManager.initialize(browser);

    server = new MCPBrowserServer();
    await server.initializeWithManagers(sessionManager, securityManager, performanceManager);
  });

  afterAll(async () => {
    if (server?.isServerRunning()) {
      await server.stop();
    }
    await sessionManager?.shutdown();
    await performanceManager?.shutdown();
    await browser?.close();
  });

  beforeEach(async () => {
    await sessionManager.destroyAllSessions();
  });

  afterEach(async () => {
    await sessionManager.destroyAllSessions();
  });

  describe('Concurrent Session Load Tests', () => {
    it('should handle high concurrent session creation', async () => {
      const concurrentSessions = 25;
      const startTime = performance.now();

      const newContextTool = server.getTool('browser.newContext');
      
      // Create sessions concurrently
      const sessionPromises = Array.from({ length: concurrentSessions }, (_, i) =>
        newContextTool.handler({
          viewport: { width: 1280 + (i * 10), height: 720 + (i * 5) },
          userAgent: `Load Test Browser ${i}`
        })
      );

      const results = await Promise.allSettled(sessionPromises);
      const creationTime = performance.now() - startTime;

      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const failed = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value.isError)
      );

      console.log(`Concurrent session creation (${concurrentSessions} sessions):`);
      console.log(`  Total time: ${creationTime.toFixed(2)}ms`);
      console.log(`  Average per session: ${(creationTime / concurrentSessions).toFixed(2)}ms`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Failed: ${failed.length}`);
      console.log(`  Success rate: ${(successful.length / concurrentSessions * 100).toFixed(1)}%`);

      expect(successful.length).toBeGreaterThan(concurrentSessions * 0.8); // At least 80% success
      expect(creationTime).toBeLessThan(10000); // Should complete within 10 seconds

      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(successful.length);
    });

    it('should handle concurrent navigation operations', async () => {
      const sessionCount = 15;
      const operationsPerSession = 5;

      // Create sessions first
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults
        .filter(r => !r.isError)
        .map(r => JSON.parse(r.content[0].text).sessionId);

      expect(sessionIds.length).toBe(sessionCount);

      // Perform concurrent navigation operations
      const gotoTool = server.getTool('browser.goto');
      const urls = [
        'https://example.com',
        'https://httpbin.org/html',
        'https://httpbin.org/json',
        'https://httpbin.org/xml',
        'https://httpbin.org/robots.txt'
      ];

      const startTime = performance.now();
      const navigationPromises = sessionIds.flatMap(sessionId =>
        Array.from({ length: operationsPerSession }, (_, i) =>
          gotoTool.handler({
            sessionId,
            url: `${urls[i % urls.length]}?session=${sessionId}&op=${i}`
          })
        )
      );

      const results = await Promise.allSettled(navigationPromises);
      const totalTime = performance.now() - startTime;

      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const failed = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value.isError)
      );

      const totalOperations = sessionCount * operationsPerSession;

      console.log(`Concurrent navigation load test:`);
      console.log(`  Sessions: ${sessionCount}`);
      console.log(`  Operations per session: ${operationsPerSession}`);
      console.log(`  Total operations: ${totalOperations}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average per operation: ${(totalTime / totalOperations).toFixed(2)}ms`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Failed: ${failed.length}`);
      console.log(`  Success rate: ${(successful.length / totalOperations * 100).toFixed(1)}%`);

      expect(successful.length).toBeGreaterThan(totalOperations * 0.7); // At least 70% success
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it('should handle mixed operation load test', async () => {
      const sessionCount = 10;
      const operationsPerSession = 8;

      // Create sessions
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults
        .filter(r => !r.isError)
        .map(r => JSON.parse(r.content[0].text).sessionId);

      // Define mixed operations
      const operations = [
        { tool: 'browser.goto', params: (sessionId: string, i: number) => ({ 
          sessionId, 
          url: `https://example.com?op=${i}` 
        })},
        { tool: 'browser.screenshot', params: (sessionId: string) => ({ sessionId })},
        { tool: 'browser.eval', params: (sessionId: string) => ({ 
          sessionId, 
          code: 'document.title' 
        })},
        { tool: 'browser.domSnapshot', params: (sessionId: string) => ({ 
          sessionId, 
          maxNodes: 500 
        })},
        { tool: 'browser.network.getRecent', params: (sessionId: string) => ({ 
          sessionId, 
          limit: 10 
        })},
        { tool: 'browser.console.getRecent', params: (sessionId: string) => ({ 
          sessionId, 
          limit: 10 
        })}
      ];

      const startTime = performance.now();
      const operationPromises = sessionIds.flatMap(sessionId =>
        Array.from({ length: operationsPerSession }, (_, i) => {
          const operation = operations[i % operations.length];
          const tool = server.getTool(operation.tool);
          return tool.handler(operation.params(sessionId, i));
        })
      );

      const results = await Promise.allSettled(operationPromises);
      const totalTime = performance.now() - startTime;

      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const failed = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value.isError)
      );

      const totalOperations = sessionCount * operationsPerSession;

      console.log(`Mixed operation load test:`);
      console.log(`  Sessions: ${sessionCount}`);
      console.log(`  Operations per session: ${operationsPerSession}`);
      console.log(`  Total operations: ${totalOperations}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average per operation: ${(totalTime / totalOperations).toFixed(2)}ms`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Failed: ${failed.length}`);
      console.log(`  Success rate: ${(successful.length / totalOperations * 100).toFixed(1)}%`);

      expect(successful.length).toBeGreaterThan(totalOperations * 0.75); // At least 75% success
      expect(totalTime).toBeLessThan(25000); // Should complete within 25 seconds

      // Check performance stats
      const perfStats = performanceManager.getPerformanceStats();
      console.log(`  Memory usage: ${perfStats.memory.sessions.totalSessionMemoryMB}MB`);
      console.log(`  Active contexts: ${perfStats.contextPool.activeContexts}`);
      console.log(`  Disk usage: ${perfStats.disk.totalSizeMB.toFixed(2)}MB`);
    });
  });

  describe('Memory Pressure Load Tests', () => {
    it('should handle memory pressure gracefully', async () => {
      const sessionCount = 20;
      
      // Create sessions with high memory usage simulation
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults
        .filter(r => !r.isError)
        .map(r => JSON.parse(r.content[0].text).sessionId);

      // Navigate to pages and simulate memory usage
      const gotoTool = server.getTool('browser.goto');
      const evalTool = server.getTool('browser.eval');

      for (const sessionId of sessionIds) {
        await gotoTool.handler({
          sessionId,
          url: 'https://example.com'
        });

        // Simulate memory-intensive operations
        await evalTool.handler({
          sessionId,
          code: `
            // Create large objects to simulate memory usage
            window.testData = [];
            for (let i = 0; i < 1000; i++) {
              window.testData.push(new Array(1000).fill('memory-test-data'));
            }
            'Memory simulation complete';
          `
        });

        // Update memory stats
        performanceManager.updateSessionMemory(sessionId, {
          heapUsedMB: 100 + Math.random() * 50
        });
      }

      // Check memory pressure handling
      const memoryPressure = performanceManager.getMemoryPressure();
      const perfStats = performanceManager.getPerformanceStats();

      console.log(`Memory pressure test:`);
      console.log(`  Sessions created: ${sessionIds.length}`);
      console.log(`  Memory pressure: ${memoryPressure}`);
      console.log(`  Total memory: ${perfStats.memory.sessions.totalSessionMemoryMB}MB`);
      console.log(`  Average per session: ${(perfStats.memory.sessions.totalSessionMemoryMB / sessionIds.length).toFixed(2)}MB`);

      expect(sessionIds.length).toBeGreaterThan(0);
      expect(perfStats.memory.sessions.totalSessionMemoryMB).toBeGreaterThan(0);

      // System should still be responsive under memory pressure
      const screenshotTool = server.getTool('browser.screenshot');
      const screenshotResult = await screenshotTool.handler({
        sessionId: sessionIds[0]
      });
      
      expect(screenshotResult.isError).toBeFalsy();
    });

    it('should handle disk space pressure', async () => {
      const sessionCount = 8;
      const filesPerSession = 10;

      // Create sessions
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults
        .filter(r => !r.isError)
        .map(r => JSON.parse(r.content[0].text).sessionId);

      // Generate many screenshots to fill disk space
      const screenshotTool = server.getTool('browser.screenshot');
      const gotoTool = server.getTool('browser.goto');

      const startTime = performance.now();
      const filePromises: Promise<any>[] = [];

      for (const sessionId of sessionIds) {
        await gotoTool.handler({
          sessionId,
          url: 'https://example.com'
        });

        for (let i = 0; i < filesPerSession; i++) {
          filePromises.push(
            screenshotTool.handler({
              sessionId,
              fullPage: i % 2 === 0 // Alternate between full page and viewport
            })
          );
        }
      }

      const results = await Promise.allSettled(filePromises);
      const totalTime = performance.now() - startTime;

      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const failed = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value.isError)
      );

      const perfStats = performanceManager.getPerformanceStats();

      console.log(`Disk pressure test:`);
      console.log(`  Sessions: ${sessionCount}`);
      console.log(`  Files per session: ${filesPerSession}`);
      console.log(`  Total file operations: ${filePromises.length}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Failed: ${failed.length}`);
      console.log(`  Disk usage: ${perfStats.disk.totalSizeMB.toFixed(2)}MB (${perfStats.disk.usagePercent.toFixed(1)}%)`);
      console.log(`  Total files: ${perfStats.disk.totalFiles}`);

      expect(successful.length).toBeGreaterThan(0);
      expect(perfStats.disk.totalFiles).toBeGreaterThan(0);
      expect(perfStats.disk.totalSizeMB).toBeGreaterThan(0);

      // Test cleanup under pressure
      if (perfStats.disk.usagePercent > 80) {
        const cleanupResult = await performanceManager.forceDiskCleanup(1000);
        console.log(`  Cleanup freed: ${cleanupResult.spaceFreesMB.toFixed(2)}MB`);
        expect(cleanupResult.filesDeleted).toBeGreaterThan(0);
      }
    });
  });

  describe('Sustained Load Tests', () => {
    it('should handle sustained operation load', async () => {
      const duration = 30000; // 30 seconds
      const operationInterval = 100; // 100ms between operations
      const sessionCount = 5;

      // Create sessions
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults
        .filter(r => !r.isError)
        .map(r => JSON.parse(r.content[0].text).sessionId);

      const operations = [
        'browser.goto',
        'browser.screenshot',
        'browser.eval',
        'browser.network.getRecent'
      ];

      let operationCount = 0;
      let successCount = 0;
      let errorCount = 0;
      const startTime = performance.now();

      const sustainedTest = async () => {
        while (performance.now() - startTime < duration) {
          const sessionId = sessionIds[operationCount % sessionIds.length];
          const operationName = operations[operationCount % operations.length];
          const tool = server.getTool(operationName);

          let params: any = { sessionId };
          if (operationName === 'browser.goto') {
            params.url = `https://example.com?op=${operationCount}`;
          } else if (operationName === 'browser.eval') {
            params.code = `Math.random() * ${operationCount}`;
          } else if (operationName === 'browser.network.getRecent') {
            params.limit = 5;
          }

          try {
            const result = await tool.handler(params);
            if (result.isError) {
              errorCount++;
            } else {
              successCount++;
            }
          } catch (error) {
            errorCount++;
          }

          operationCount++;
          await new Promise(resolve => setTimeout(resolve, operationInterval));
        }
      };

      await sustainedTest();
      const totalTime = performance.now() - startTime;

      console.log(`Sustained load test (${duration}ms):`);
      console.log(`  Total operations: ${operationCount}`);
      console.log(`  Operations per second: ${(operationCount / (totalTime / 1000)).toFixed(2)}`);
      console.log(`  Successful: ${successCount}`);
      console.log(`  Errors: ${errorCount}`);
      console.log(`  Success rate: ${(successCount / operationCount * 100).toFixed(1)}%`);

      expect(operationCount).toBeGreaterThan(100); // Should have performed many operations
      expect(successCount / operationCount).toBeGreaterThan(0.8); // At least 80% success rate

      // Check system health after sustained load
      const stats = sessionManager.getStats();
      const perfStats = performanceManager.getPerformanceStats();

      console.log(`  Final session count: ${stats.activeSessions}`);
      console.log(`  Memory usage: ${perfStats.memory.sessions.totalSessionMemoryMB}MB`);
      console.log(`  Context pool health: ${perfStats.contextPool.activeContexts}/${perfStats.contextPool.totalContexts}`);

      expect(stats.activeSessions).toBe(sessionCount);
    });
  });

  describe('Stress Tests', () => {
    it('should handle rapid session creation and destruction', async () => {
      const cycles = 50;
      const sessionsPerCycle = 3;

      let totalCreated = 0;
      let totalDestroyed = 0;
      let creationErrors = 0;
      let destructionErrors = 0;

      const startTime = performance.now();

      for (let cycle = 0; cycle < cycles; cycle++) {
        // Create sessions
        const newContextTool = server.getTool('browser.newContext');
        const createPromises = Array.from({ length: sessionsPerCycle }, () =>
          newContextTool.handler({})
        );

        const createResults = await Promise.allSettled(createPromises);
        const sessionIds: string[] = [];

        createResults.forEach(result => {
          if (result.status === 'fulfilled' && !result.value.isError) {
            const response = JSON.parse(result.value.content[0].text);
            sessionIds.push(response.sessionId);
            totalCreated++;
          } else {
            creationErrors++;
          }
        });

        // Immediately destroy sessions
        const destroyPromises = sessionIds.map(sessionId =>
          sessionManager.destroySession(sessionId)
        );

        const destroyResults = await Promise.allSettled(destroyPromises);
        destroyResults.forEach(result => {
          if (result.status === 'fulfilled') {
            totalDestroyed++;
          } else {
            destructionErrors++;
          }
        });

        // Small delay between cycles
        if (cycle % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      const totalTime = performance.now() - startTime;

      console.log(`Rapid creation/destruction stress test:`);
      console.log(`  Cycles: ${cycles}`);
      console.log(`  Sessions per cycle: ${sessionsPerCycle}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Created: ${totalCreated}`);
      console.log(`  Destroyed: ${totalDestroyed}`);
      console.log(`  Creation errors: ${creationErrors}`);
      console.log(`  Destruction errors: ${destructionErrors}`);
      console.log(`  Creation success rate: ${(totalCreated / (cycles * sessionsPerCycle) * 100).toFixed(1)}%`);

      expect(totalCreated).toBeGreaterThan(cycles * sessionsPerCycle * 0.8); // At least 80% success
      expect(totalDestroyed).toBe(totalCreated); // All created sessions should be destroyed

      // Verify no sessions are left
      const finalStats = sessionManager.getStats();
      expect(finalStats.activeSessions).toBe(0);
    });

    it('should handle error recovery under load', async () => {
      const sessionCount = 8;
      const operationsPerSession = 10;

      // Create sessions
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults
        .filter(r => !r.isError)
        .map(r => JSON.parse(r.content[0].text).sessionId);

      // Mix of valid and invalid operations to trigger errors
      const operations = [
        { tool: 'browser.goto', params: { url: 'https://example.com' }, shouldSucceed: true },
        { tool: 'browser.goto', params: { url: 'https://invalid-domain-12345.com' }, shouldSucceed: false },
        { tool: 'browser.click', params: { selector: 'h1' }, shouldSucceed: true },
        { tool: 'browser.click', params: { selector: '#non-existent' }, shouldSucceed: false },
        { tool: 'browser.eval', params: { code: 'document.title' }, shouldSucceed: true },
        { tool: 'browser.eval', params: { code: 'throw new Error("test")' }, shouldSucceed: false },
        { tool: 'browser.screenshot', params: {}, shouldSucceed: true }
      ];

      let totalOperations = 0;
      let expectedSuccesses = 0;
      let actualSuccesses = 0;
      let expectedErrors = 0;
      let actualErrors = 0;
      let recoverySuccesses = 0;

      const startTime = performance.now();

      for (const sessionId of sessionIds) {
        for (let i = 0; i < operationsPerSession; i++) {
          const operation = operations[i % operations.length];
          const tool = server.getTool(operation.tool);
          const params = { sessionId, ...operation.params };

          totalOperations++;
          if (operation.shouldSucceed) {
            expectedSuccesses++;
          } else {
            expectedErrors++;
          }

          try {
            const result = await tool.handler(params);
            if (result.isError) {
              actualErrors++;
              
              // Test recovery by performing a simple operation
              const screenshotTool = server.getTool('browser.screenshot');
              const recoveryResult = await screenshotTool.handler({ sessionId });
              if (!recoveryResult.isError) {
                recoverySuccesses++;
              }
            } else {
              actualSuccesses++;
            }
          } catch (error) {
            actualErrors++;
          }
        }
      }

      const totalTime = performance.now() - startTime;

      console.log(`Error recovery stress test:`);
      console.log(`  Total operations: ${totalOperations}`);
      console.log(`  Expected successes: ${expectedSuccesses}`);
      console.log(`  Actual successes: ${actualSuccesses}`);
      console.log(`  Expected errors: ${expectedErrors}`);
      console.log(`  Actual errors: ${actualErrors}`);
      console.log(`  Recovery successes: ${recoverySuccesses}`);
      console.log(`  Recovery rate: ${(recoverySuccesses / actualErrors * 100).toFixed(1)}%`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);

      expect(actualSuccesses).toBeGreaterThan(expectedSuccesses * 0.8); // Most valid operations should succeed
      expect(actualErrors).toBeGreaterThan(0); // Should have some errors
      expect(recoverySuccesses / actualErrors).toBeGreaterThan(0.8); // Most sessions should recover

      // Verify all sessions are still functional
      const screenshotTool = server.getTool('browser.screenshot');
      const finalTests = await Promise.all(
        sessionIds.map(sessionId => screenshotTool.handler({ sessionId }))
      );

      const functionalSessions = finalTests.filter(result => !result.isError).length;
      expect(functionalSessions).toBe(sessionIds.length);
    });
  });
});