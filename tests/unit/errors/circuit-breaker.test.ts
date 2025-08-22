import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerManager } from '../../../src/errors/circuit-breaker.js';
import { CircuitBreakerConfig } from '../../../src/types/error-types.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    config = {
      failureThreshold: 50, // 50% failure rate
      recoveryTimeout: 1000, // 1 second
      monitoringWindow: 5000, // 5 seconds
      minimumRequests: 3
    };
    circuitBreaker = new CircuitBreaker('test-breaker', config);
  });

  describe('CLOSED state', () => {
    it('should execute operations successfully when closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
      expect(circuitBreaker.getStats().state).toBe('CLOSED');
    });

    it('should track successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);
      
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(0);
      expect(stats.totalRequests).toBe(2);
    });

    it('should track failed operations', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Operation failed');
      
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(2);
      expect(stats.totalRequests).toBe(2);
    });

    it('should not trip with insufficient requests', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));
      
      // Only 2 requests, below minimum of 3
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      
      expect(circuitBreaker.getStats().state).toBe('CLOSED');
    });

    it('should trip when failure threshold is exceeded', async () => {
      const failingOperation = vi.fn().mockRejectedValue(new Error('Failed'));
      
      // Need at least 3 requests (minimum) with 75% failure rate to trip
      // 3 failures out of 4 total = 75% failure rate (above 50% threshold)
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      
      // The circuit should trip after 3 failures with minimum requests met
      expect(circuitBreaker.getStats().state).toBe('OPEN');
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit breaker
      const failingOperation = vi.fn().mockRejectedValue(new Error('Failed'));
      
      for (let i = 0; i < 4; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getStats().state).toBe('OPEN');
    });

    it('should reject operations immediately when open', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker \'test-breaker\' is OPEN');
      
      expect(operation).not.toHaveBeenCalled();
    });

    it('should have nextRetryTime set', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.nextRetryTime).toBeInstanceOf(Date);
      expect(stats.nextRetryTime!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, config.recoveryTimeout + 100));
      
      const operation = vi.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);
      
      expect(circuitBreaker.getStats().state).toBe('CLOSED');
      expect(operation).toHaveBeenCalledOnce();
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Trip the circuit breaker
      const failingOperation = vi.fn().mockRejectedValue(new Error('Failed'));
      
      for (let i = 0; i < 4; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch {
          // Expected to fail
        }
      }
      
      // Wait for recovery timeout to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, config.recoveryTimeout + 100));
    });

    it('should reset to CLOSED on successful operation', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(operation);
      
      expect(circuitBreaker.getStats().state).toBe('CLOSED');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should return to OPEN on failed operation', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Still failing'));
      
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Still failing');
      
      expect(circuitBreaker.getStats().state).toBe('OPEN');
    });
  });

  describe('Manual control', () => {
    it('should force open state', () => {
      circuitBreaker.forceOpen();
      
      expect(circuitBreaker.getStats().state).toBe('OPEN');
      expect(circuitBreaker.getStats().nextRetryTime).toBeInstanceOf(Date);
    });

    it('should force close state', () => {
      circuitBreaker.forceOpen();
      circuitBreaker.forceClose();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe('CLOSED');
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Monitoring window', () => {
    it('should reset counters after monitoring window expires', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getStats().totalRequests).toBe(1);
      
      // Fast-forward time beyond monitoring window
      vi.useFakeTimers();
      vi.advanceTimersByTime(config.monitoringWindow + 1000);
      
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getStats().totalRequests).toBe(1); // Reset
      
      vi.useRealTimers();
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager();
  });

  it('should create new circuit breakers', () => {
    const breaker = manager.getOrCreate('test-breaker');
    
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.getStats().state).toBe('CLOSED');
  });

  it('should return existing circuit breakers', () => {
    const breaker1 = manager.getOrCreate('test-breaker');
    const breaker2 = manager.getOrCreate('test-breaker');
    
    expect(breaker1).toBe(breaker2);
  });

  it('should create circuit breakers with custom config', () => {
    const customConfig = { failureThreshold: 75 };
    const breaker = manager.getOrCreate('custom-breaker', customConfig);
    
    expect(breaker).toBeInstanceOf(CircuitBreaker);
  });

  it('should get circuit breaker by name', () => {
    const breaker = manager.getOrCreate('test-breaker');
    const retrieved = manager.get('test-breaker');
    
    expect(retrieved).toBe(breaker);
  });

  it('should return undefined for non-existent breakers', () => {
    const breaker = manager.get('non-existent');
    
    expect(breaker).toBeUndefined();
  });

  it('should remove circuit breakers', () => {
    manager.getOrCreate('test-breaker');
    const removed = manager.remove('test-breaker');
    
    expect(removed).toBe(true);
    expect(manager.get('test-breaker')).toBeUndefined();
  });

  it('should return false when removing non-existent breakers', () => {
    const removed = manager.remove('non-existent');
    
    expect(removed).toBe(false);
  });

  it('should get stats for all breakers', async () => {
    const breaker1 = manager.getOrCreate('breaker-1');
    const breaker2 = manager.getOrCreate('breaker-2');
    
    const operation = vi.fn().mockResolvedValue('success');
    await breaker1.execute(operation);
    await breaker2.execute(operation);
    
    const allStats = manager.getAllStats();
    
    expect(allStats).toHaveProperty('breaker-1');
    expect(allStats).toHaveProperty('breaker-2');
    expect(allStats['breaker-1'].successCount).toBe(1);
    expect(allStats['breaker-2'].successCount).toBe(1);
  });

  it('should reset all breakers', () => {
    manager.getOrCreate('breaker-1');
    manager.getOrCreate('breaker-2');
    
    manager.reset();
    
    expect(manager.get('breaker-1')).toBeUndefined();
    expect(manager.get('breaker-2')).toBeUndefined();
    expect(Object.keys(manager.getAllStats())).toHaveLength(0);
  });

  it('should have predefined breaker names', () => {
    expect(CircuitBreakerManager.BROWSER_NAVIGATION).toBe('browser.navigation');
    expect(CircuitBreakerManager.BROWSER_INTERACTION).toBe('browser.interaction');
    expect(CircuitBreakerManager.BROWSER_EVALUATION).toBe('browser.evaluation');
    expect(CircuitBreakerManager.BROWSER_SCREENSHOT).toBe('browser.screenshot');
    expect(CircuitBreakerManager.SESSION_CREATION).toBe('session.creation');
    expect(CircuitBreakerManager.FILE_OPERATIONS).toBe('file.operations');
  });
});