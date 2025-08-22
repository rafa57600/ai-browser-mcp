import { type Browser } from 'playwright';
import type { SessionOptions } from '../types/session-types.js';
import type { ContextPoolConfig, PooledContext, ContextPoolStats } from '../types/performance-types.js';

/**
 * ContextPool manages a pool of reusable browser contexts for performance optimization
 */
export class ContextPool {
  private browser: Browser | null = null;
  private availableContexts: PooledContext[] = [];
  private activeContexts: Map<string, PooledContext> = new Map();
  private contextCounter = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  private readonly config: Required<ContextPoolConfig>;

  constructor(config: ContextPoolConfig = {}) {
    this.config = {
      minPoolSize: config.minPoolSize ?? 2,
      maxPoolSize: config.maxPoolSize ?? 10,
      maxIdleTime: config.maxIdleTime ?? 5 * 60 * 1000, // 5 minutes
      cleanupInterval: config.cleanupInterval ?? 2 * 60 * 1000, // 2 minutes
      warmupOnStart: config.warmupOnStart ?? true,
      reuseThreshold: config.reuseThreshold ?? 10 // Reuse context after 10 uses
    };
  }

  /**
   * Initializes the context pool
   */
  async initialize(browser: Browser): Promise<void> {
    this.browser = browser;
    
    if (this.config.warmupOnStart) {
      await this.warmupPool();
    }
    
    this.startCleanupTimer();
  }

  /**
   * Gets a context from the pool or creates a new one
   */
  async acquireContext(options: SessionOptions = {}): Promise<PooledContext> {
    if (!this.browser) {
      throw new Error('ContextPool not initialized');
    }

    // Try to find a compatible context in the pool
    const compatibleContext = this.findCompatibleContext(options);
    
    if (compatibleContext) {
      // Move from available to active
      const index = this.availableContexts.indexOf(compatibleContext);
      this.availableContexts.splice(index, 1);
      
      compatibleContext.lastUsed = new Date();
      compatibleContext.useCount++;
      
      this.activeContexts.set(compatibleContext.id, compatibleContext);
      return compatibleContext;
    }

    // Create new context if pool isn't full
    if (this.getTotalContextCount() < this.config.maxPoolSize) {
      return await this.createNewContext(options);
    }

    // Pool is full, create a temporary context (not pooled)
    const contextOptions: any = {
      viewport: options.viewport ?? { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      bypassCSP: true
    };
    
    if (options.userAgent) {
      contextOptions.userAgent = options.userAgent;
    }
    
    const context = await this.browser.newContext(contextOptions);

    const pooledContext: PooledContext = {
      id: `temp_${++this.contextCounter}_${Date.now()}`,
      context,
      createdAt: new Date(),
      lastUsed: new Date(),
      useCount: 1,
      options,
      isTemporary: true
    };

    this.activeContexts.set(pooledContext.id, pooledContext);
    return pooledContext;
  }

  /**
   * Returns a context to the pool
   */
  async releaseContext(contextId: string): Promise<void> {
    const pooledContext = this.activeContexts.get(contextId);
    if (!pooledContext) {
      return;
    }

    this.activeContexts.delete(contextId);

    // If it's temporary or has exceeded reuse threshold, destroy it
    if (pooledContext.isTemporary || pooledContext.useCount >= this.config.reuseThreshold) {
      await this.destroyContext(pooledContext);
      return;
    }

    // Reset context state for reuse
    try {
      await this.resetContextState(pooledContext);
      
      // Return to available pool
      pooledContext.lastUsed = new Date();
      this.availableContexts.push(pooledContext);
      
      // Maintain pool size
      await this.maintainPoolSize();
    } catch (error) {
      // If reset fails, destroy the context
      console.error(`Error resetting context ${contextId}:`, error);
      await this.destroyContext(pooledContext);
    }
  }

  /**
   * Gets pool statistics
   */
  getStats(): ContextPoolStats {
    return {
      availableContexts: this.availableContexts.length,
      activeContexts: this.activeContexts.size,
      totalContexts: this.getTotalContextCount(),
      minPoolSize: this.config.minPoolSize,
      maxPoolSize: this.config.maxPoolSize,
      averageUseCount: this.calculateAverageUseCount(),
      oldestContextAge: this.getOldestContextAge()
    };
  }

  /**
   * Shuts down the context pool
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Destroy all contexts
    const allContexts = [...this.availableContexts, ...this.activeContexts.values()];
    await Promise.allSettled(allContexts.map(ctx => this.destroyContext(ctx)));
    
    this.availableContexts.length = 0;
    this.activeContexts.clear();
  }

  /**
   * Finds a compatible context from the available pool
   */
  private findCompatibleContext(options: SessionOptions): PooledContext | null {
    return this.availableContexts.find(ctx => {
      // Check viewport compatibility
      const ctxViewport = ctx.options.viewport;
      const reqViewport = options.viewport;
      
      if (reqViewport && ctxViewport) {
        if (ctxViewport.width !== reqViewport.width || ctxViewport.height !== reqViewport.height) {
          return false;
        }
      }

      // Check user agent compatibility
      if (options.userAgent && ctx.options.userAgent !== options.userAgent) {
        return false;
      }

      return true;
    }) || null;
  }

  /**
   * Creates a new context and adds it to the active pool
   */
  private async createNewContext(options: SessionOptions): Promise<PooledContext> {
    if (!this.browser) {
      throw new Error('Browser not available');
    }

    const contextOptions: any = {
      viewport: options.viewport ?? { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      bypassCSP: true
    };
    
    if (options.userAgent) {
      contextOptions.userAgent = options.userAgent;
    }
    
    const context = await this.browser.newContext(contextOptions);

    const pooledContext: PooledContext = {
      id: `pooled_${++this.contextCounter}_${Date.now()}`,
      context,
      createdAt: new Date(),
      lastUsed: new Date(),
      useCount: 1,
      options,
      isTemporary: false
    };

    this.activeContexts.set(pooledContext.id, pooledContext);
    return pooledContext;
  }

  /**
   * Resets context state for reuse
   */
  private async resetContextState(pooledContext: PooledContext): Promise<void> {
    const { context } = pooledContext;
    
    try {
      // Close all pages except one
      const pages = context.pages();
      if (pages.length > 1) {
        await Promise.allSettled(pages.slice(1).map(page => page.close()));
      }

      // Clear the remaining page
      if (pages.length > 0) {
        const page = pages[0];
        try {
          await page.goto('about:blank');
          
          // Try to clear storage, but don't fail if it's not accessible
          try {
            await page.evaluate(() => {
              try {
                if (typeof localStorage !== 'undefined') {
                  localStorage.clear();
                }
              } catch (e) {
                // Ignore localStorage errors
              }
              
              try {
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.clear();
                }
              } catch (e) {
                // Ignore sessionStorage errors
              }
            });
          } catch (error) {
            // Ignore evaluation errors - storage might not be accessible
          }
        } catch (error) {
          // If page operations fail, the context might be corrupted
          throw new Error(`Failed to reset page state: ${error}`);
        }
      }

      // Clear cookies
      try {
        await context.clearCookies();
      } catch (error) {
        // Ignore cookie clearing errors
      }
    } catch (error) {
      // If any reset operation fails, throw to destroy the context
      throw new Error(`Context reset failed: ${error}`);
    }
  }

  /**
   * Destroys a context and cleans up resources
   */
  private async destroyContext(pooledContext: PooledContext): Promise<void> {
    try {
      await pooledContext.context.close();
    } catch (error) {
      console.error(`Error closing context ${pooledContext.id}:`, error);
    }
  }

  /**
   * Warms up the pool by creating minimum number of contexts
   */
  private async warmupPool(): Promise<void> {
    const contextsToCreate = Math.max(0, this.config.minPoolSize - this.availableContexts.length);
    
    const createPromises = Array.from({ length: contextsToCreate }, async () => {
      try {
        if (!this.browser) {
          throw new Error('Browser not available');
        }

        const context = await this.browser.newContext({
          viewport: { width: 1280, height: 720 },
          ignoreHTTPSErrors: true,
          bypassCSP: true
        });

        const pooledContext: PooledContext = {
          id: `warmup_${++this.contextCounter}_${Date.now()}`,
          context,
          createdAt: new Date(),
          lastUsed: new Date(),
          useCount: 0,
          options: {},
          isTemporary: false
        };

        this.availableContexts.push(pooledContext);
      } catch (error) {
        console.error('Error creating warmup context:', error);
      }
    });

    await Promise.allSettled(createPromises);
  }

  /**
   * Maintains pool size by cleaning up old contexts and creating new ones
   */
  private async maintainPoolSize(): Promise<void> {
    // Remove old contexts that exceed max idle time
    const now = Date.now();
    const contextsToRemove = this.availableContexts.filter(ctx => 
      now - ctx.lastUsed.getTime() > this.config.maxIdleTime
    );

    // Don't remove contexts if it would go below minimum
    const canRemove = Math.max(0, this.availableContexts.length - this.config.minPoolSize);
    const toRemove = contextsToRemove.slice(0, canRemove);

    for (const context of toRemove) {
      const index = this.availableContexts.indexOf(context);
      this.availableContexts.splice(index, 1);
      await this.destroyContext(context);
    }

    // Add contexts if below minimum
    const contextsToAdd = Math.max(0, this.config.minPoolSize - this.availableContexts.length);
    if (contextsToAdd > 0) {
      await this.warmupPool();
    }
  }

  /**
   * Starts the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        await this.maintainPoolSize();
      } catch (error) {
        console.error('Error during context pool cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Gets total number of contexts (available + active)
   */
  private getTotalContextCount(): number {
    return this.availableContexts.length + this.activeContexts.size;
  }

  /**
   * Calculates average use count across all contexts
   */
  private calculateAverageUseCount(): number {
    const allContexts = [...this.availableContexts, ...this.activeContexts.values()];
    if (allContexts.length === 0) return 0;
    
    const totalUseCount = allContexts.reduce((sum, ctx) => sum + ctx.useCount, 0);
    return totalUseCount / allContexts.length;
  }

  /**
   * Gets the age of the oldest context in milliseconds
   */
  private getOldestContextAge(): number {
    const allContexts = [...this.availableContexts, ...this.activeContexts.values()];
    if (allContexts.length === 0) return 0;
    
    const now = Date.now();
    return Math.max(...allContexts.map(ctx => now - ctx.createdAt.getTime()));
  }
}