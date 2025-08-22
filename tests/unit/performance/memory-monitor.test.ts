import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryMonitor } from '../../../src/performance/memory-monitor.js';
import type { MemoryLimits } from '../../../src/types/performance-types.js';

describe('MemoryMonitor', () => {
  let memoryMonitor: MemoryMonitor;

  beforeEach(() => {
    // Mock global.gc for testing
    global.gc = vi.fn();
  });

  afterEach(() => {
    if (memoryMonitor) {
      memoryMonitor.stop();
    }
    delete (global as any).gc;
  });

  describe('initialization', () => {
    it('should initialize with default limits', () => {
      memoryMonitor = new MemoryMonitor();
      
      const stats = memoryMonitor.getMemoryStats();
      expect(stats.limits.maxSessionMemoryMB).toBe(512);
      expect(stats.limits.maxTotalMemoryMB).toBe(2048);
      expect(stats.limits.warningThresholdPercent).toBe(80);
      expect(stats.limits.criticalThresholdPercent).toBe(95);
    });

    it('should initialize with custom limits', () => {
      const limits: MemoryLimits = {
        maxSessionMemoryMB: 256,
        maxTotalMemoryMB: 1024,
        warningThresholdPercent: 70,
        criticalThresholdPercent: 90
      };
      
      memoryMonitor = new MemoryMonitor(limits);
      
      const stats = memoryMonitor.getMemoryStats();
      expect(stats.limits.maxSessionMemoryMB).toBe(256);
      expect(stats.limits.maxTotalMemoryMB).toBe(1024);
      expect(stats.limits.warningThresholdPercent).toBe(70);
      expect(stats.limits.criticalThresholdPercent).toBe(90);
    });
  });

  describe('session management', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor({
        maxSessionMemoryMB: 100,
        maxTotalMemoryMB: 500
      });
    });

    it('should register and track sessions', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.registerSession('session2');
      
      const stats = memoryMonitor.getMemoryStats();
      expect(stats.sessions.sessionCount).toBe(2);
    });

    it('should unregister sessions', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.registerSession('session2');
      
      memoryMonitor.unregisterSession('session1');
      
      const stats = memoryMonitor.getMemoryStats();
      expect(stats.sessions.sessionCount).toBe(1);
    });

    it('should update session memory usage', () => {
      memoryMonitor.registerSession('session1');
      
      memoryMonitor.updateSessionMemory('session1', {
        heapUsedMB: 50,
        heapTotalMB: 100,
        externalMB: 10
      });
      
      const sessionMemory = memoryMonitor.getSessionMemory('session1');
      expect(sessionMemory?.heapUsedMB).toBe(50);
      expect(sessionMemory?.heapTotalMB).toBe(100);
      expect(sessionMemory?.externalMB).toBe(10);
    });
  });

  describe('memory statistics', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor();
    });

    it('should provide comprehensive memory statistics', () => {
      const stats = memoryMonitor.getMemoryStats();
      
      expect(stats.process).toBeDefined();
      expect(stats.system).toBeDefined();
      expect(stats.sessions).toBeDefined();
      expect(stats.limits).toBeDefined();
      expect(stats.timestamp).toBeInstanceOf(Date);
      
      expect(typeof stats.process.heapUsedMB).toBe('number');
      expect(typeof stats.system.totalMemoryMB).toBe('number');
      expect(typeof stats.sessions.sessionCount).toBe('number');
    });

    it('should track memory history', () => {
      memoryMonitor.start();
      
      // Wait for at least one measurement
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const history = memoryMonitor.getMemoryHistory();
          expect(history.length).toBeGreaterThan(0);
          expect(history[0]).toHaveProperty('timestamp');
          expect(history[0]).toHaveProperty('heapUsedMB');
          resolve();
        }, 100);
      });
    });
  });

  describe('threshold detection', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor({
        maxSessionMemoryMB: 100,
        warningThresholdPercent: 80,
        criticalThresholdPercent: 95
      });
    });

    it('should detect sessions over warning threshold', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.registerSession('session2');
      
      // Set session1 over warning threshold (80MB)
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 85 });
      // Set session2 under threshold
      memoryMonitor.updateSessionMemory('session2', { heapUsedMB: 50 });
      
      const warningSessions = memoryMonitor.getSessionsOverThreshold('warning');
      expect(warningSessions).toHaveLength(1);
      expect(warningSessions[0].sessionId).toBe('session1');
    });

    it('should detect sessions over critical threshold', () => {
      memoryMonitor.registerSession('session1');
      
      // Set session over critical threshold (95MB)
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 98 });
      
      const criticalSessions = memoryMonitor.getSessionsOverThreshold('critical');
      expect(criticalSessions).toHaveLength(1);
      expect(criticalSessions[0].sessionId).toBe('session1');
    });
  });

  describe('session creation limits', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor({
        maxTotalMemoryMB: 200,
        maxSessionMemoryMB: 50
      });
    });

    it('should allow session creation when under limits', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 30 });
      
      expect(memoryMonitor.canCreateSession()).toBe(true);
    });

    it('should prevent session creation when approaching limits', () => {
      // Create sessions that would exceed total limit
      memoryMonitor.registerSession('session1');
      memoryMonitor.registerSession('session2');
      memoryMonitor.registerSession('session3');
      memoryMonitor.registerSession('session4');
      
      // Each session uses 50MB, total would be 200MB + 25MB (projected) = 225MB > 200MB limit
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 50 });
      memoryMonitor.updateSessionMemory('session2', { heapUsedMB: 50 });
      memoryMonitor.updateSessionMemory('session3', { heapUsedMB: 50 });
      memoryMonitor.updateSessionMemory('session4', { heapUsedMB: 50 });
      
      expect(memoryMonitor.canCreateSession()).toBe(false);
    });
  });

  describe('memory pressure', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor({
        maxTotalMemoryMB: 100,
        warningThresholdPercent: 80,
        criticalThresholdPercent: 95
      });
    });

    it('should report low pressure when usage is low', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 20 });
      
      expect(memoryMonitor.getMemoryPressure()).toBe('low');
    });

    it('should report medium pressure when usage is moderate', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 60 });
      
      expect(memoryMonitor.getMemoryPressure()).toBe('medium');
    });

    it('should report high pressure when over warning threshold', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 85 });
      
      expect(memoryMonitor.getMemoryPressure()).toBe('high');
    });

    it('should report critical pressure when over critical threshold', () => {
      memoryMonitor.registerSession('session1');
      memoryMonitor.updateSessionMemory('session1', { heapUsedMB: 98 });
      
      expect(memoryMonitor.getMemoryPressure()).toBe('critical');
    });
  });

  describe('garbage collection', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor();
    });

    it('should force garbage collection when available', () => {
      const result = memoryMonitor.forceGarbageCollection();
      
      expect(result).toBe(true);
      expect(global.gc).toHaveBeenCalled();
    });

    it('should handle missing garbage collection gracefully', () => {
      delete (global as any).gc;
      
      const result = memoryMonitor.forceGarbageCollection();
      
      expect(result).toBe(false);
    });
  });

  describe('monitoring lifecycle', () => {
    beforeEach(() => {
      memoryMonitor = new MemoryMonitor({
        monitoringInterval: 50 // Short interval for testing
      });
    });

    it('should start and stop monitoring', () => {
      memoryMonitor.start();
      
      // Should be monitoring
      expect(memoryMonitor.getMemoryHistory().length).toBeGreaterThanOrEqual(0);
      
      memoryMonitor.stop();
      
      // Should stop monitoring (no new entries after stop)
      const historyLength = memoryMonitor.getMemoryHistory().length;
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const newHistoryLength = memoryMonitor.getMemoryHistory().length;
          expect(newHistoryLength).toBe(historyLength);
          resolve();
        }, 100);
      });
    });
  });
});