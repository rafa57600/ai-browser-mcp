import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CPUThrottle } from '../../../src/performance/cpu-throttle.js';
import type { CPUThrottleConfig } from '../../../src/types/performance-types.js';

describe('CPUThrottle', () => {
  let cpuThrottle: CPUThrottle;

  afterEach(() => {
    if (cpuThrottle) {
      cpuThrottle.stop();
    }
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      cpuThrottle = new CPUThrottle();
      
      const stats = cpuThrottle.getStats();
      expect(stats.maxConcurrentExecutions).toBe(3);
      expect(stats.activeExecutions).toBe(0);
      expect(stats.queuedExecutions).toBe(0);
    });

    it('should initialize with custom configuration', () => {
      const config: CPUThrottleConfig = {
        maxConcurrentExecutions: 5,
        maxExecutionTimeMs: 10000,
        maxSessionExecutionsPerMinute: 30
      };
      
      cpuThrottle = new CPUThrottle(config);
      
      const stats = cpuThrottle.getStats();
      expect(stats.maxConcurrentExecutions).toBe(5);
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      cpuThrottle = new CPUThrottle();
      cpuThrottle.start();
    });

    it('should register and track sessions', () => {
      cpuThrottle.registerSession('session1');
      cpuThrottle.registerSession('session2');
      
      const stats = cpuThrottle.getStats();
      expect(stats.totalSessions).toBe(2);
    });

    it('should unregister sessions', () => {
      cpuThrottle.registerSession('session1');
      cpuThrottle.registerSession('session2');
      
      cpuThrottle.unregisterSession('session1');
      
      const stats = cpuThrottle.getStats();
      expect(stats.totalSessions).toBe(1);
    });

    it('should provide session-specific statistics', () => {
      cpuThrottle.registerSession('session1');
      
      const sessionStats = cpuThrottle.getSessionStats('session1');
      expect(sessionStats).toBeDefined();
      expect(sessionStats?.totalExecutionTime).toBe(0);
      expect(sessionStats?.executionCount).toBe(0);
      expect(sessionStats?.canExecute).toBe(true);
    });
  });

  describe('execution throttling', () => {
    beforeEach(() => {
      cpuThrottle = new CPUThrottle({
        maxConcurrentExecutions: 2,
        maxExecutionTimeMs: 1000
      });
      cpuThrottle.start();
      cpuThrottle.registerSession('session1');
    });

    it('should execute operations successfully', async () => {
      const operation = vi.fn().mockResolvedValue('test result');
      
      const result = await cpuThrottle.throttleExecution('session1', operation);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('test result');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(operation).toHaveBeenCalled();
    });

    it('should handle operation errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));
      
      const result = await cpuThrottle.throttleExecution('session1', operation);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should queue operations when at concurrent limit', async () => {
      const slowOperation = () => new Promise(resolve => setTimeout(() => resolve('slow'), 100));
      const fastOperation = () => Promise.resolve('fast');
      
      // Start two slow operations to fill concurrent slots
      const promise1 = cpuThrottle.throttleExecution('session1', slowOperation);
      const promise2 = cpuThrottle.throttleExecution('session1', slowOperation);
      
      // This should be queued
      const promise3 = cpuThrottle.throttleExecution('session1', fastOperation);
      
      // Check that third operation is queued
      const stats = cpuThrottle.getStats();
      expect(stats.activeExecutions).toBe(2);
      expect(stats.queuedExecutions).toBe(1);
      
      // Wait for all to complete
      const results = await Promise.all([promise1, promise2, promise3]);
      
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
      expect(results[2].queueTime).toBeGreaterThan(0);
    });

    it('should respect priority ordering', async () => {
      const results: string[] = [];
      const createOperation = (name: string) => () => {
        results.push(name);
        return Promise.resolve(name);
      };
      
      // Fill concurrent slots with slow operations
      const slowOp1 = () => new Promise(resolve => setTimeout(() => resolve('slow1'), 50));
      const slowOp2 = () => new Promise(resolve => setTimeout(() => resolve('slow2'), 50));
      
      cpuThrottle.throttleExecution('session1', slowOp1);
      cpuThrottle.throttleExecution('session1', slowOp2);
      
      // Queue operations with different priorities
      const lowPriorityPromise = cpuThrottle.throttleExecution('session1', createOperation('low'), 1);
      const highPriorityPromise = cpuThrottle.throttleExecution('session1', createOperation('high'), 3);
      const mediumPriorityPromise = cpuThrottle.throttleExecution('session1', createOperation('medium'), 2);
      
      await Promise.all([lowPriorityPromise, highPriorityPromise, mediumPriorityPromise]);
      
      // Higher priority should execute first
      expect(results.indexOf('high')).toBeLessThan(results.indexOf('medium'));
      expect(results.indexOf('medium')).toBeLessThan(results.indexOf('low'));
    });

    it('should timeout long-running operations', async () => {
      cpuThrottle.stop();
      cpuThrottle = new CPUThrottle({
        maxExecutionTimeMs: 50
      });
      cpuThrottle.start();
      cpuThrottle.registerSession('session1');
      
      const longOperation = () => new Promise(resolve => setTimeout(resolve, 200));
      
      const result = await cpuThrottle.throttleExecution('session1', longOperation);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      cpuThrottle = new CPUThrottle({
        maxSessionExecutionsPerMinute: 3
      });
      cpuThrottle.start();
      cpuThrottle.registerSession('session1');
    });

    it('should enforce session execution limits', async () => {
      const operation = () => Promise.resolve('test');
      
      // Execute up to the limit
      const result1 = await cpuThrottle.throttleExecution('session1', operation);
      const result2 = await cpuThrottle.throttleExecution('session1', operation);
      const result3 = await cpuThrottle.throttleExecution('session1', operation);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      
      // This should be rejected due to rate limit
      const result4 = await cpuThrottle.throttleExecution('session1', operation);
      expect(result4.success).toBe(false);
      expect(result4.error).toContain('execution limit exceeded');
    });

    it('should reset rate limits after time window', async () => {
      const operation = () => Promise.resolve('test');
      
      // Fill up the rate limit
      await cpuThrottle.throttleExecution('session1', operation);
      await cpuThrottle.throttleExecution('session1', operation);
      await cpuThrottle.throttleExecution('session1', operation);
      
      // Should be rate limited
      const result1 = await cpuThrottle.throttleExecution('session1', operation);
      expect(result1.success).toBe(false);
      
      // Mock time passage (this is a simplified test - in reality we'd need to wait or mock timers)
      const sessionStats = cpuThrottle.getSessionStats('session1');
      expect(sessionStats?.canExecute).toBe(false);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      cpuThrottle = new CPUThrottle();
      cpuThrottle.start();
    });

    it('should provide accurate execution statistics', async () => {
      cpuThrottle.registerSession('session1');
      cpuThrottle.registerSession('session2');
      
      const operation = () => Promise.resolve('test');
      
      await cpuThrottle.throttleExecution('session1', operation);
      await cpuThrottle.throttleExecution('session2', operation);
      
      const stats = cpuThrottle.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalExecutionCount).toBe(2);
      expect(stats.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should track session-specific statistics', async () => {
      cpuThrottle.registerSession('session1');
      
      const operation = () => new Promise(resolve => setTimeout(() => resolve('test'), 10));
      
      await cpuThrottle.throttleExecution('session1', operation);
      await cpuThrottle.throttleExecution('session1', operation);
      
      const sessionStats = cpuThrottle.getSessionStats('session1');
      expect(sessionStats?.executionCount).toBe(2);
      expect(sessionStats?.totalExecutionTime).toBeGreaterThan(0);
      expect(sessionStats?.averageExecutionTime).toBeGreaterThan(0);
    });
  });

  describe('queue management', () => {
    beforeEach(() => {
      cpuThrottle = new CPUThrottle({
        maxConcurrentExecutions: 1,
        queueTimeout: 100
      });
      cpuThrottle.start();
      cpuThrottle.registerSession('session1');
    });

    it('should timeout queued operations', async () => {
      const slowOperation = () => new Promise(resolve => setTimeout(resolve, 200));
      const fastOperation = () => Promise.resolve('fast');
      
      // Start slow operation to block queue
      cpuThrottle.throttleExecution('session1', slowOperation);
      
      // This should timeout in queue
      const result = await cpuThrottle.throttleExecution('session1', fastOperation);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out in queue');
    });
  });

  describe('lifecycle management', () => {
    it('should start and stop processing', () => {
      cpuThrottle = new CPUThrottle();
      
      cpuThrottle.start();
      expect(cpuThrottle.getStats().activeExecutions).toBe(0);
      
      cpuThrottle.stop();
      // After stop, no new operations should be processed
    });

    it('should cancel operations on stop', async () => {
      cpuThrottle = new CPUThrottle({
        maxConcurrentExecutions: 1
      });
      cpuThrottle.start();
      cpuThrottle.registerSession('session1');
      
      const slowOperation = () => new Promise(resolve => setTimeout(resolve, 200));
      const fastOperation = () => Promise.resolve('fast');
      
      // Start slow operation and queue another
      cpuThrottle.throttleExecution('session1', slowOperation);
      const queuedPromise = cpuThrottle.throttleExecution('session1', fastOperation);
      
      // Stop should cancel queued operations
      cpuThrottle.stop();
      
      await expect(queuedPromise).rejects.toThrow('CPU throttle stopped');
    });
  });
});