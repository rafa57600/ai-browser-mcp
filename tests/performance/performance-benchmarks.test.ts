import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { SessionManager } from '../../src/browser/session-manager.js';
import { PerformanceManager } from '../../src/performance/performance-manager.js';
import type { PerformanceConfig } from '../../src/types/performance-types.js';

describe('Performance Benchmarks', () => {
  let browser: Browser;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterEach(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Context Pool Performance', () => {
    it('should benchmark context creation with and without pooling', async () => {
      const iterations = 10;
      const results = {
        withoutPooling: 0,
        withPooling: 0
      };

      // Benchmark without pooling
      const sessionManagerWithoutPool = new SessionManager({}, { enableOptimizations: false });
      await sessionManagerWithoutPool.initialize();

      const startWithoutPool = performance.now();
      for (let i = 0; i < iterations; i++) {
        const session = await sessionManagerWithoutPool.createSession({});
        await sessionManagerWithoutPool.destroySession(session.id);
      }
      results.withoutPooling = performance.now() - startWithoutPool;
      await sessionManagerWithoutPool.shutdown();

      // Benchmark with pooling
      const sessionManagerWithPool = new SessionManager({}, {
        enableOptimizations: true,
        contextPool: { minPoolSize: 5, maxPoolSize: 10, warmupOnStart: true }
      });
      await sessionManagerWithPool.initialize();
      
      // Wait for warmup
      await new Promise(resolve => setTimeout(resolve, 200));

      const startWithPool = performance.now();
      for (let i = 0; i < iterations; i++) {
        const session = await sessionManagerWithPool.createSession({});
        await sessionManagerWithPool.destroySession(session.id);
      }
      results.withPooling = performance.now() - startWithPool;
      await sessionManagerWithPool.shutdown();

      console.log(`Context creation benchmark (${iterations} iterations):`);
      console.log(`  Without pooling: ${results.withoutPooling.toFixed(2)}ms`);
      console.log(`  With pooling: ${results.withPooling.toFixed(2)}ms`);
      console.log(`  Improvement: ${((results.withoutPooling - results.withPooling) / results.withoutPooling * 100).toFixed(1)}%`);

      // Pooling should provide some performance benefit
      expect(results.withPooling).toBeLessThanOrEqual(results.withoutPooling);
    });

    it('should benchmark concurrent context creation', async () => {
      const concurrentSessions = 8;
      const results = {
        withoutPooling: 0,
        withPooling: 0
      };

      // Benchmark without pooling
      const sessionManagerWithoutPool = new SessionManager({}, { enableOptimizations: false });
      await sessionManagerWithoutPool.initialize();

      const startWithoutPool = performance.now();
      const sessionsWithoutPool = await Promise.all(
        Array.from({ length: concurrentSessions }, () => sessionManagerWithoutPool.createSession({}))
      );
      results.withoutPooling = performance.now() - startWithoutPool;
      
      await Promise.all(sessionsWithoutPool.map(s => sessionManagerWithoutPool.destroySession(s.id)));
      await sessionManagerWithoutPool.shutdown();

      // Benchmark with pooling
      const sessionManagerWithPool = new SessionManager({}, {
        enableOptimizations: true,
        contextPool: { minPoolSize: 4, maxPoolSize: 12, warmupOnStart: true }
      });
      await sessionManagerWithPool.initialize();
      
      // Wait for warmup
      await new Promise(resolve => setTimeout(resolve, 200));

      const startWithPool = performance.now();
      const sessionsWithPool = await Promise.all(
        Array.from({ length: concurrentSessions }, () => sessionManagerWithPool.createSession({}))
      );
      results.withPooling = performance.now() - startWithPool;
      
      await Promise.all(sessionsWithPool.map(s => sessionManagerWithPool.destroySession(s.id)));
      await sessionManagerWithPool.shutdown();

      console.log(`Concurrent context creation benchmark (${concurrentSessions} sessions):`);
      console.log(`  Without pooling: ${results.withoutPooling.toFixed(2)}ms`);
      console.log(`  With pooling: ${results.withPooling.toFixed(2)}ms`);
      console.log(`  Improvement: ${((results.withoutPooling - results.withPooling) / results.withoutPooling * 100).toFixed(1)}%`);

      expect(results.withPooling).toBeLessThanOrEqual(results.withoutPooling * 1.2); // Allow some variance
    });
  });

  describe('CPU Throttling Performance', () => {
    it('should benchmark JavaScript execution with throttling', async () => {
      const performanceManager = new PerformanceManager({
        cpuThrottle: { maxConcurrentExecutions: 3 }
      });
      await performanceManager.initialize(browser);

      const operations = Array.from({ length: 20 }, (_, i) => 
        () => new Promise(resolve => setTimeout(() => resolve(`result${i}`), Math.random() * 50))
      );

      const startTime = performance.now();
      const results = await Promise.all(
        operations.map((op, i) => performanceManager.throttleExecution(`session${i % 4}`, op))
      );
      const totalTime = performance.now() - startTime;

      const successfulResults = results.filter(r => r.success);
      const averageExecutionTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
      const averageQueueTime = results.reduce((sum, r) => sum + r.queueTime, 0) / results.length;

      console.log(`CPU throttling benchmark (20 operations, 3 concurrent):`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Successful operations: ${successfulResults.length}/20`);
      console.log(`  Average execution time: ${averageExecutionTime.toFixed(2)}ms`);
      console.log(`  Average queue time: ${averageQueueTime.toFixed(2)}ms`);

      expect(successfulResults.length).toBe(20);
      expect(averageQueueTime).toBeGreaterThan(0); // Some operations should have been queued

      await performanceManager.shutdown();
    });

    it('should benchmark execution priority handling', async () => {
      const performanceManager = new PerformanceManager({
        cpuThrottle: { maxConcurrentExecutions: 1 } // Force queuing
      });
      await performanceManager.initialize(browser);

      const results: Array<{ priority: number; startTime: number; endTime: number }> = [];
      
      // Start a long-running operation to block the queue
      const blockingOp = () => new Promise(resolve => setTimeout(resolve, 100));
      performanceManager.throttleExecution('session1', blockingOp);

      // Queue operations with different priorities
      const priorities = [1, 3, 2, 1, 3, 2];
      const operationPromises = priorities.map((priority, i) => {
        const startTime = performance.now();
        return performanceManager.throttleExecution('session1', 
          () => {
            const endTime = performance.now();
            results.push({ priority, startTime, endTime });
            return Promise.resolve(`result${i}`);
          }, 
          priority
        );
      });

      await Promise.all(operationPromises);

      // Sort by end time to see execution order
      results.sort((a, b) => a.endTime - b.endTime);
      
      console.log('Priority execution order:');
      results.forEach((result, i) => {
        console.log(`  ${i + 1}. Priority ${result.priority} (queue time: ${(result.endTime - result.startTime).toFixed(2)}ms)`);
      });

      // Higher priority operations should generally execute first
      const highPriorityResults = results.filter(r => r.priority === 3);
      const lowPriorityResults = results.filter(r => r.priority === 1);
      
      if (highPriorityResults.length > 0 && lowPriorityResults.length > 0) {
        const avgHighPriorityIndex = highPriorityResults.reduce((sum, r) => sum + results.indexOf(r), 0) / highPriorityResults.length;
        const avgLowPriorityIndex = lowPriorityResults.reduce((sum, r) => sum + results.indexOf(r), 0) / lowPriorityResults.length;
        
        expect(avgHighPriorityIndex).toBeLessThan(avgLowPriorityIndex);
      }

      await performanceManager.shutdown();
    });
  });

  describe('Memory Monitoring Performance', () => {
    it('should benchmark memory monitoring overhead', async () => {
      const iterations = 1000;
      
      // Test without monitoring
      const performanceManagerWithoutMonitoring = new PerformanceManager({ enableOptimizations: false });
      await performanceManagerWithoutMonitoring.initialize(browser);

      const startWithoutMonitoring = performance.now();
      for (let i = 0; i < iterations; i++) {
        performanceManagerWithoutMonitoring.updateSessionMemory(`session${i % 10}`, {
          heapUsedMB: Math.random() * 100
        });
      }
      const timeWithoutMonitoring = performance.now() - startWithoutMonitoring;
      await performanceManagerWithoutMonitoring.shutdown();

      // Test with monitoring
      const performanceManagerWithMonitoring = new PerformanceManager({
        memoryLimits: { monitoringInterval: 50 }
      });
      await performanceManagerWithMonitoring.initialize(browser);

      const startWithMonitoring = performance.now();
      for (let i = 0; i < iterations; i++) {
        performanceManagerWithMonitoring.updateSessionMemory(`session${i % 10}`, {
          heapUsedMB: Math.random() * 100
        });
      }
      const timeWithMonitoring = performance.now() - startWithMonitoring;
      await performanceManagerWithMonitoring.shutdown();

      console.log(`Memory monitoring overhead benchmark (${iterations} updates):`);
      console.log(`  Without monitoring: ${timeWithoutMonitoring.toFixed(2)}ms`);
      console.log(`  With monitoring: ${timeWithMonitoring.toFixed(2)}ms`);
      console.log(`  Overhead: ${(timeWithMonitoring - timeWithoutMonitoring).toFixed(2)}ms`);

      // Monitoring should have minimal overhead
      expect(timeWithMonitoring).toBeLessThan(timeWithoutMonitoring * 2);
    });
  });

  describe('Disk Management Performance', () => {
    it('should benchmark file storage and retrieval', async () => {
      const performanceManager = new PerformanceManager({
        diskManager: { maxTotalSizeMB: 100 }
      });
      await performanceManager.initialize(browser);

      const fileCount = 50;
      const fileSize = 1024; // 1KB files
      const content = 'x'.repeat(fileSize);

      // Benchmark file storage
      const startStorage = performance.now();
      const filePaths = await Promise.all(
        Array.from({ length: fileCount }, (_, i) =>
          performanceManager.storeTemporaryFile(`session${i % 5}`, `file${i}.txt`, content)
        )
      );
      const storageTime = performance.now() - startStorage;

      // Benchmark file retrieval
      const startRetrieval = performance.now();
      const retrievedContents = await Promise.all(
        filePaths.map(path => performanceManager.getTemporaryFile(path))
      );
      const retrievalTime = performance.now() - startRetrieval;

      console.log(`Disk management benchmark (${fileCount} files, ${fileSize} bytes each):`);
      console.log(`  Storage time: ${storageTime.toFixed(2)}ms (${(storageTime / fileCount).toFixed(2)}ms per file)`);
      console.log(`  Retrieval time: ${retrievalTime.toFixed(2)}ms (${(retrievalTime / fileCount).toFixed(2)}ms per file)`);

      expect(filePaths).toHaveLength(fileCount);
      expect(retrievedContents).toHaveLength(fileCount);
      retrievedContents.forEach(content => {
        expect(content.toString()).toHaveLength(fileSize);
      });

      await performanceManager.shutdown();
    });

    it('should benchmark cleanup performance', async () => {
      const performanceManager = new PerformanceManager({
        diskManager: { maxFileAgeDays: 0.001 } // Very short for testing
      });
      await performanceManager.initialize(browser);

      const fileCount = 100;
      const content = 'test content';

      // Create many files
      const filePaths = await Promise.all(
        Array.from({ length: fileCount }, (_, i) =>
          performanceManager.storeTemporaryFile(`session${i % 10}`, `file${i}.txt`, content)
        )
      );

      expect(filePaths).toHaveLength(fileCount);

      // Wait for files to become "old"
      await new Promise(resolve => setTimeout(resolve, 100));

      // Benchmark cleanup
      const startCleanup = performance.now();
      const cleanupResult = await performanceManager.forceDiskCleanup(1000); // Force cleanup
      const cleanupTime = performance.now() - startCleanup;

      console.log(`Disk cleanup benchmark (${fileCount} files):`);
      console.log(`  Cleanup time: ${cleanupTime.toFixed(2)}ms`);
      console.log(`  Files deleted: ${cleanupResult.filesDeleted}`);
      console.log(`  Space freed: ${cleanupResult.spaceFreesMB.toFixed(2)}MB`);

      expect(cleanupResult.filesDeleted).toBeGreaterThan(0);
      expect(cleanupTime).toBeLessThan(5000); // Should complete within 5 seconds

      await performanceManager.shutdown();
    });
  });

  describe('End-to-End Performance', () => {
    it('should benchmark complete session lifecycle with optimizations', async () => {
      const sessionCount = 10;
      const operationsPerSession = 5;

      const performanceConfig: PerformanceConfig = {
        contextPool: { minPoolSize: 3, maxPoolSize: 15 },
        cpuThrottle: { maxConcurrentExecutions: 5 },
        memoryLimits: { maxTotalMemoryMB: 1024 },
        diskManager: { maxTotalSizeMB: 100 }
      };

      const sessionManager = new SessionManager({}, performanceConfig);
      await sessionManager.initialize();

      const startTime = performance.now();

      // Create sessions
      const sessions = await Promise.all(
        Array.from({ length: sessionCount }, (_, i) =>
          sessionManager.createSession({ viewport: { width: 1280, height: 720 } }, `client${i}`)
        )
      );

      // Perform operations on each session
      const operationPromises = sessions.flatMap(session =>
        Array.from({ length: operationsPerSession }, async (_, i) => {
          await session.page.goto(`data:text/html,<html><body><h1>Page ${i}</h1><p>Session ${session.id}</p></body></html>`);
          await session.page.screenshot({ path: `temp-${session.id}-${i}.png` });
          return session.page.title();
        })
      );

      const results = await Promise.all(operationPromises);

      // Clean up sessions
      await Promise.all(sessions.map(session => sessionManager.destroySession(session.id)));

      const totalTime = performance.now() - startTime;
      const stats = sessionManager.getStats();

      console.log(`End-to-end performance benchmark:`);
      console.log(`  Sessions: ${sessionCount}`);
      console.log(`  Operations per session: ${operationsPerSession}`);
      console.log(`  Total operations: ${results.length}`);
      console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
      console.log(`  Average time per operation: ${(totalTime / results.length).toFixed(2)}ms`);
      console.log(`  Peak active sessions: ${stats.totalSessions}`);

      expect(results).toHaveLength(sessionCount * operationsPerSession);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds

      await sessionManager.shutdown();
    });

    it('should measure resource usage under load', async () => {
      const performanceManager = new PerformanceManager({
        memoryLimits: { monitoringInterval: 100 }
      });
      await performanceManager.initialize(browser);

      const sessionCount = 8;
      const contexts = await Promise.all(
        Array.from({ length: sessionCount }, (_, i) =>
          performanceManager.acquireContext(`session${i}`)
        )
      );

      // Simulate memory usage
      contexts.forEach((context, i) => {
        if (context) {
          performanceManager.updateSessionMemory(`session${i}`, {
            heapUsedMB: 50 + Math.random() * 50
          });
        }
      });

      // Store some files
      const filePromises = contexts.map((context, i) =>
        context ? performanceManager.storeTemporaryFile(`session${i}`, `data${i}.txt`, 'x'.repeat(10000)) : Promise.resolve('')
      );
      await Promise.all(filePromises);

      // Get performance statistics
      const stats = performanceManager.getPerformanceStats();

      console.log('Resource usage under load:');
      console.log(`  Active contexts: ${stats.contextPool.activeContexts}`);
      console.log(`  Total memory usage: ${stats.memory.sessions.totalSessionMemoryMB}MB`);
      console.log(`  Memory pressure: ${performanceManager.getMemoryPressure()}`);
      console.log(`  Total disk files: ${stats.disk.totalFiles}`);
      console.log(`  Disk usage: ${stats.disk.totalSizeMB.toFixed(2)}MB (${stats.disk.usagePercent.toFixed(1)}%)`);

      expect(stats.contextPool.activeContexts).toBe(sessionCount);
      expect(stats.memory.sessions.sessionCount).toBe(sessionCount);
      expect(stats.disk.sessionCount).toBe(sessionCount);

      // Clean up
      for (let i = 0; i < sessionCount; i++) {
        const context = contexts[i];
        if (context) {
          await performanceManager.releaseContext(`session${i}`, context.id);
        }
        await performanceManager.cleanupSession(`session${i}`);
      }

      await performanceManager.shutdown();
    });
  });
});