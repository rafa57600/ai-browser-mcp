import type { Browser } from 'playwright';
import { ContextPool } from './context-pool.js';
import { MemoryMonitor } from './memory-monitor.js';
import { CPUThrottle } from './cpu-throttle.js';
import { DiskManager } from './disk-manager.js';
import type { 
  PerformanceConfig, 
  PerformanceStats, 
  PooledContext,
  ThrottleResult
} from '../types/performance-types.js';
import type { SessionOptions } from '../types/session-types.js';

/**
 * PerformanceManager coordinates all performance optimization features
 */
export class PerformanceManager {
  private contextPool: ContextPool;
  private memoryMonitor: MemoryMonitor;
  private cpuThrottle: CPUThrottle;
  private diskManager: DiskManager;
  private isInitialized = false;
  private readonly config: Required<PerformanceConfig>;

  constructor(config: PerformanceConfig = {}) {
    this.config = {
      contextPool: config.contextPool ?? {},
      memoryLimits: config.memoryLimits ?? {},
      cpuThrottle: config.cpuThrottle ?? {},
      diskManager: config.diskManager ?? {},
      enableOptimizations: config.enableOptimizations ?? true
    };

    this.contextPool = new ContextPool(this.config.contextPool);
    this.memoryMonitor = new MemoryMonitor(this.config.memoryLimits);
    this.cpuThrottle = new CPUThrottle(this.config.cpuThrottle);
    this.diskManager = new DiskManager(this.config.diskManager);
  }

  /**
   * Initializes all performance optimization components
   */
  async initialize(browser: Browser): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.config.enableOptimizations) {
      // Initialize context pool
      await this.contextPool.initialize(browser);
      
      // Start memory monitoring
      this.memoryMonitor.start();
      
      // Start CPU throttling
      this.cpuThrottle.start();
      
      // Initialize disk manager
      await this.diskManager.initialize();
    }

    this.isInitialized = true;
  }

  /**
   * Acquires an optimized browser context
   */
  async acquireContext(sessionId: string, options: SessionOptions = {}): Promise<PooledContext | null> {
    if (!this.config.enableOptimizations) {
      return null;
    }

    // Check memory limits before creating context
    if (!this.memoryMonitor.canCreateSession()) {
      throw new Error('Cannot create session: memory limits exceeded');
    }

    // Register session for monitoring
    this.memoryMonitor.registerSession(sessionId);
    this.cpuThrottle.registerSession(sessionId);
    await this.diskManager.createSessionTempDir(sessionId);

    try {
      return await this.contextPool.acquireContext(options);
    } catch (error) {
      // Clean up if context acquisition fails
      this.memoryMonitor.unregisterSession(sessionId);
      this.cpuThrottle.unregisterSession(sessionId);
      await this.diskManager.cleanupSession(sessionId);
      throw error;
    }
  }

  /**
   * Releases a browser context back to the pool
   */
  async releaseContext(sessionId: string, contextId: string): Promise<void> {
    if (!this.config.enableOptimizations) {
      return;
    }

    await this.contextPool.releaseContext(contextId);
  }

  /**
   * Throttles JavaScript execution for performance
   */
  async throttleExecution<T>(
    sessionId: string,
    operation: () => Promise<T>,
    priority: number = 1
  ): Promise<ThrottleResult<T>> {
    if (!this.config.enableOptimizations) {
      // Execute directly without throttling
      try {
        const startTime = Date.now();
        const result = await operation();
        const executionTime = Date.now() - startTime;
        return {
          success: true,
          result,
          executionTime,
          queueTime: 0
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          executionTime: 0,
          queueTime: 0
        };
      }
    }

    return await this.cpuThrottle.throttleExecution(sessionId, operation, priority);
  }

  /**
   * Stores a temporary file with disk management
   */
  async storeTemporaryFile(
    sessionId: string,
    filename: string,
    data: Buffer | string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return await this.diskManager.storeTemporaryFile(sessionId, filename, data, metadata);
  }

  /**
   * Retrieves a temporary file
   */
  async getTemporaryFile(filePath: string): Promise<Buffer> {
    return await this.diskManager.getTemporaryFile(filePath);
  }

  /**
   * Updates memory usage for a session
   */
  updateSessionMemory(sessionId: string, memoryUsage: any): void {
    if (this.config.enableOptimizations) {
      this.memoryMonitor.updateSessionMemory(sessionId, memoryUsage);
    }
  }

  /**
   * Cleans up all resources for a session
   */
  async cleanupSession(sessionId: string): Promise<void> {
    if (!this.config.enableOptimizations) {
      return;
    }

    // Unregister from monitoring
    this.memoryMonitor.unregisterSession(sessionId);
    this.cpuThrottle.unregisterSession(sessionId);
    
    // Clean up disk resources
    await this.diskManager.cleanupSession(sessionId);
  }

  /**
   * Gets comprehensive performance statistics
   */
  getPerformanceStats(): PerformanceStats {
    return {
      contextPool: this.contextPool.getStats(),
      memory: this.memoryMonitor.getMemoryStats(),
      cpu: this.cpuThrottle.getStats(),
      disk: this.diskManager.getTotalDiskUsage(),
      timestamp: new Date()
    };
  }

  /**
   * Gets memory pressure level
   */
  getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    if (!this.config.enableOptimizations) {
      return 'low';
    }
    return this.memoryMonitor.getMemoryPressure();
  }

  /**
   * Forces garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (!this.config.enableOptimizations) {
      return false;
    }
    return this.memoryMonitor.forceGarbageCollection();
  }

  /**
   * Forces disk cleanup to free space
   */
  async forceDiskCleanup(targetFreeMB: number): Promise<{ filesDeleted: number; spaceFreesMB: number }> {
    if (!this.config.enableOptimizations) {
      return { filesDeleted: 0, spaceFreesMB: 0 };
    }
    return await this.diskManager.forceCleanup(targetFreeMB);
  }

  /**
   * Checks if the system can handle a new session
   */
  canCreateSession(): boolean {
    if (!this.config.enableOptimizations) {
      return true;
    }

    return this.memoryMonitor.canCreateSession();
  }

  /**
   * Gets session-specific performance statistics
   */
  getSessionStats(sessionId: string): {
    memory: any;
    cpu: any;
    disk: any;
  } | null {
    if (!this.config.enableOptimizations) {
      return null;
    }

    return {
      memory: this.memoryMonitor.getSessionMemory(sessionId),
      cpu: this.cpuThrottle.getSessionStats(sessionId),
      disk: this.diskManager.getSessionDiskUsage(sessionId)
    };
  }

  /**
   * Optimizes performance based on current system state
   */
  async optimizePerformance(): Promise<{
    memoryFreed: boolean;
    diskCleaned: { filesDeleted: number; spaceFreesMB: number };
    contextsOptimized: boolean;
  }> {
    if (!this.config.enableOptimizations) {
      return {
        memoryFreed: false,
        diskCleaned: { filesDeleted: 0, spaceFreesMB: 0 },
        contextsOptimized: false
      };
    }

    const results = {
      memoryFreed: false,
      diskCleaned: { filesDeleted: 0, spaceFreesMB: 0 },
      contextsOptimized: false
    };

    // Check memory pressure and force GC if needed
    const memoryPressure = this.getMemoryPressure();
    if (memoryPressure === 'high' || memoryPressure === 'critical') {
      results.memoryFreed = this.forceGarbageCollection();
    }

    // Clean up old disk files
    results.diskCleaned = await this.diskManager.cleanupOldFiles();

    // Context pool is self-optimizing, so just mark as optimized
    results.contextsOptimized = true;

    return results;
  }

  /**
   * Shuts down all performance optimization components
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    if (this.config.enableOptimizations) {
      // Stop monitoring
      this.memoryMonitor.stop();
      this.cpuThrottle.stop();
      
      // Shutdown components
      await this.contextPool.shutdown();
      await this.diskManager.shutdown();
    }

    this.isInitialized = false;
  }

  /**
   * Checks if optimizations are enabled
   */
  isOptimizationEnabled(): boolean {
    return this.config.enableOptimizations;
  }

  /**
   * Gets the current configuration
   */
  getConfig(): Required<PerformanceConfig> {
    return { ...this.config };
  }
}