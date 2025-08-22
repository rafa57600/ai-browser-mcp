import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { ContextPool } from '../../../src/performance/context-pool.js';
import type { ContextPoolConfig } from '../../../src/types/performance-types.js';

describe('ContextPool', () => {
  let browser: Browser;
  let contextPool: ContextPool;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterEach(async () => {
    if (contextPool) {
      await contextPool.shutdown();
    }
    if (browser) {
      await browser.close();
    }
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      contextPool = new ContextPool();
      await contextPool.initialize(browser);
      
      const stats = contextPool.getStats();
      expect(stats.minPoolSize).toBe(2);
      expect(stats.maxPoolSize).toBe(10);
    });

    it('should initialize with custom configuration', async () => {
      const config: ContextPoolConfig = {
        minPoolSize: 1,
        maxPoolSize: 5,
        warmupOnStart: false
      };
      
      contextPool = new ContextPool(config);
      await contextPool.initialize(browser);
      
      const stats = contextPool.getStats();
      expect(stats.minPoolSize).toBe(1);
      expect(stats.maxPoolSize).toBe(5);
    });

    it('should warm up pool on start when enabled', async () => {
      const config: ContextPoolConfig = {
        minPoolSize: 3,
        warmupOnStart: true
      };
      
      contextPool = new ContextPool(config);
      await contextPool.initialize(browser);
      
      // Wait a bit for warmup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = contextPool.getStats();
      expect(stats.availableContexts).toBeGreaterThanOrEqual(3);
    });
  });

  describe('context acquisition and release', () => {
    beforeEach(async () => {
      contextPool = new ContextPool({
        minPoolSize: 2,
        maxPoolSize: 5,
        warmupOnStart: true
      });
      await contextPool.initialize(browser);
      
      // Wait for warmup
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should acquire context from pool', async () => {
      const context = await contextPool.acquireContext();
      
      expect(context).toBeDefined();
      expect(context.id).toBeDefined();
      expect(context.context).toBeDefined();
      expect(context.useCount).toBe(1);
      
      const stats = contextPool.getStats();
      expect(stats.activeContexts).toBe(1);
    });

    it('should release context back to pool', async () => {
      const context = await contextPool.acquireContext();
      const contextId = context.id;
      
      await contextPool.releaseContext(contextId);
      
      const stats = contextPool.getStats();
      expect(stats.activeContexts).toBe(0);
      expect(stats.availableContexts).toBeGreaterThan(0);
    });

    it('should reuse compatible contexts', async () => {
      const options = { viewport: { width: 1920, height: 1080 } };
      
      const context1 = await contextPool.acquireContext(options);
      await contextPool.releaseContext(context1.id);
      
      const context2 = await contextPool.acquireContext(options);
      
      // Should reuse the same context
      expect(context2.id).toBe(context1.id);
      expect(context2.useCount).toBe(2);
    });

    it('should create new context for incompatible options', async () => {
      const options1 = { viewport: { width: 1920, height: 1080 } };
      const options2 = { viewport: { width: 1280, height: 720 } };
      
      const context1 = await contextPool.acquireContext(options1);
      await contextPool.releaseContext(context1.id);
      
      const context2 = await contextPool.acquireContext(options2);
      
      // Should create new context due to different viewport
      expect(context2.id).not.toBe(context1.id);
    });

    it('should create temporary context when pool is full', async () => {
      const contexts = [];
      
      // Fill up the pool
      for (let i = 0; i < 5; i++) {
        contexts.push(await contextPool.acquireContext());
      }
      
      // This should create a temporary context
      const tempContext = await contextPool.acquireContext();
      expect(tempContext.isTemporary).toBe(true);
      
      // Clean up
      for (const ctx of contexts) {
        await contextPool.releaseContext(ctx.id);
      }
      await contextPool.releaseContext(tempContext.id);
    });

    it('should destroy context after reuse threshold', async () => {
      const config: ContextPoolConfig = {
        reuseThreshold: 2
      };
      
      await contextPool.shutdown();
      contextPool = new ContextPool(config);
      await contextPool.initialize(browser);
      
      const context = await contextPool.acquireContext();
      await contextPool.releaseContext(context.id);
      
      const context2 = await contextPool.acquireContext();
      expect(context2.id).toBe(context.id);
      expect(context2.useCount).toBe(2);
      
      await contextPool.releaseContext(context2.id);
      
      // Should be destroyed after reaching threshold
      const stats = contextPool.getStats();
      expect(stats.availableContexts).toBe(0);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      contextPool = new ContextPool({
        minPoolSize: 2,
        maxPoolSize: 5
      });
      await contextPool.initialize(browser);
    });

    it('should provide accurate statistics', async () => {
      const context1 = await contextPool.acquireContext();
      const context2 = await contextPool.acquireContext();
      
      const stats = contextPool.getStats();
      
      expect(stats.activeContexts).toBe(2);
      expect(stats.totalContexts).toBe(2);
      expect(stats.maxPoolSize).toBe(5);
      expect(stats.averageUseCount).toBe(1);
      
      await contextPool.releaseContext(context1.id);
      await contextPool.releaseContext(context2.id);
    });

    it('should track context age', async () => {
      const context = await contextPool.acquireContext();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stats = contextPool.getStats();
      expect(stats.oldestContextAge).toBeGreaterThan(0);
      
      await contextPool.releaseContext(context.id);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      contextPool = new ContextPool({
        minPoolSize: 1,
        maxPoolSize: 3,
        maxIdleTime: 50, // Very short for testing
        cleanupInterval: 25
      });
      await contextPool.initialize(browser);
    });

    it('should clean up idle contexts', async () => {
      const context = await contextPool.acquireContext();
      await contextPool.releaseContext(context.id);
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = contextPool.getStats();
      // Should maintain minimum pool size
      expect(stats.availableContexts).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('should handle context creation errors', async () => {
      contextPool = new ContextPool();
      
      // Try to use without initialization
      await expect(contextPool.acquireContext()).rejects.toThrow('ContextPool not initialized');
    });

    it('should handle context release errors gracefully', async () => {
      contextPool = new ContextPool();
      await contextPool.initialize(browser);
      
      // Try to release non-existent context
      await expect(contextPool.releaseContext('non-existent')).resolves.not.toThrow();
    });
  });
});