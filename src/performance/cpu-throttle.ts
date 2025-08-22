import type { CPUThrottleConfig, CPUUsageStats, ThrottleResult } from '../types/performance-types.js';

/**
 * CPUThrottle manages CPU usage limits for JavaScript execution and browser operations
 */
export class CPUThrottle {
  private executionQueue: Array<{
    id: string;
    sessionId: string;
    operation: () => Promise<any>;
    priority: number;
    createdAt: Date;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  
  private activeExecutions: Map<string, {
    sessionId: string;
    startTime: Date;
    timeoutId: NodeJS.Timeout;
  }> = new Map();
  
  private sessionUsage: Map<string, {
    totalExecutionTime: number;
    executionCount: number;
    lastReset: Date;
    currentlyExecuting: number;
  }> = new Map();
  
  private processingTimer: NodeJS.Timeout | null = null;
  private executionCounter = 0;
  
  private readonly config: Required<CPUThrottleConfig>;

  constructor(config: CPUThrottleConfig = {}) {
    this.config = {
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 3,
      maxExecutionTimeMs: config.maxExecutionTimeMs ?? 30000, // 30 seconds
      maxSessionExecutionsPerMinute: config.maxSessionExecutionsPerMinute ?? 60,
      queueTimeout: config.queueTimeout ?? 60000, // 1 minute
      processingInterval: config.processingInterval ?? 100, // 100ms
      priorityLevels: config.priorityLevels ?? 3
    };
  }

  /**
   * Starts the CPU throttle processor
   */
  start(): void {
    if (this.processingTimer) {
      return;
    }

    this.processingTimer = setInterval(() => {
      this.processQueue();
      this.cleanupExpiredEntries();
    }, this.config.processingInterval);
  }

  /**
   * Stops the CPU throttle processor
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    // Cancel all active executions
    for (const [id, execution] of this.activeExecutions) {
      clearTimeout(execution.timeoutId);
    }
    this.activeExecutions.clear();

    // Reject all queued operations
    for (const item of this.executionQueue) {
      item.reject(new Error('CPU throttle stopped'));
    }
    this.executionQueue.length = 0;
  }

  /**
   * Throttles a JavaScript execution operation
   */
  async throttleExecution<T>(
    sessionId: string,
    operation: () => Promise<T>,
    priority: number = 1
  ): Promise<ThrottleResult<T>> {
    // Check if session can execute more operations
    if (!this.canSessionExecute(sessionId)) {
      return {
        success: false,
        error: 'Session execution limit exceeded',
        executionTime: 0,
        queueTime: 0
      };
    }

    const startTime = Date.now();
    const executionId = `exec_${++this.executionCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      // Add to queue
      this.executionQueue.push({
        id: executionId,
        sessionId,
        operation: async () => {
          const execStartTime = Date.now();
          const queueTime = execStartTime - startTime;
          try {
            const result = await operation();
            const executionTime = Date.now() - execStartTime;
            
            this.updateSessionUsage(sessionId, executionTime);
            
            return {
              success: true,
              result,
              executionTime,
              queueTime
            };
          } catch (error) {
            const executionTime = Date.now() - execStartTime;
            this.updateSessionUsage(sessionId, executionTime);
            
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
              executionTime,
              queueTime
            };
          }
        },
        priority: Math.max(1, Math.min(priority, this.config.priorityLevels)),
        createdAt: new Date(),
        resolve,
        reject
      });

      // Sort queue by priority (higher priority first)
      this.executionQueue.sort((a, b) => b.priority - a.priority);

      // Set timeout for queue item
      setTimeout(() => {
        const index = this.executionQueue.findIndex(item => item.id === executionId);
        if (index !== -1) {
          this.executionQueue.splice(index, 1);
          reject(new Error('Operation timed out in queue'));
        }
      }, this.config.queueTimeout);
    });
  }

  /**
   * Gets CPU usage statistics
   */
  getStats(): CPUUsageStats {
    const now = Date.now();
    const totalSessions = this.sessionUsage.size;
    let totalExecutionTime = 0;
    let totalExecutionCount = 0;
    let activeSessions = 0;

    for (const usage of this.sessionUsage.values()) {
      totalExecutionTime += usage.totalExecutionTime;
      totalExecutionCount += usage.executionCount;
      if (usage.currentlyExecuting > 0) {
        activeSessions++;
      }
    }

    return {
      activeExecutions: this.activeExecutions.size,
      queuedExecutions: this.executionQueue.length,
      maxConcurrentExecutions: this.config.maxConcurrentExecutions,
      totalSessions,
      activeSessions,
      averageExecutionTime: totalExecutionCount > 0 ? totalExecutionTime / totalExecutionCount : 0,
      totalExecutionTime,
      totalExecutionCount,
      timestamp: new Date()
    };
  }

  /**
   * Gets usage statistics for a specific session
   */
  getSessionStats(sessionId: string): {
    totalExecutionTime: number;
    executionCount: number;
    currentlyExecuting: number;
    averageExecutionTime: number;
    canExecute: boolean;
  } | null {
    const usage = this.sessionUsage.get(sessionId);
    if (!usage) {
      return null;
    }

    return {
      totalExecutionTime: usage.totalExecutionTime,
      executionCount: usage.executionCount,
      currentlyExecuting: usage.currentlyExecuting,
      averageExecutionTime: usage.executionCount > 0 ? usage.totalExecutionTime / usage.executionCount : 0,
      canExecute: this.canSessionExecute(sessionId)
    };
  }

  /**
   * Registers a session for CPU tracking
   */
  registerSession(sessionId: string): void {
    if (!this.sessionUsage.has(sessionId)) {
      this.sessionUsage.set(sessionId, {
        totalExecutionTime: 0,
        executionCount: 0,
        lastReset: new Date(),
        currentlyExecuting: 0
      });
    }
  }

  /**
   * Unregisters a session from CPU tracking
   */
  unregisterSession(sessionId: string): void {
    // Cancel any active executions for this session
    for (const [id, execution] of this.activeExecutions) {
      if (execution.sessionId === sessionId) {
        clearTimeout(execution.timeoutId);
        this.activeExecutions.delete(id);
      }
    }

    // Remove queued operations for this session
    this.executionQueue = this.executionQueue.filter(item => {
      if (item.sessionId === sessionId) {
        item.reject(new Error('Session unregistered'));
        return false;
      }
      return true;
    });

    this.sessionUsage.delete(sessionId);
  }

  /**
   * Checks if a session can execute more operations
   */
  private canSessionExecute(sessionId: string): boolean {
    const usage = this.sessionUsage.get(sessionId);
    if (!usage) {
      return true; // New session
    }

    const now = Date.now();
    const timeSinceReset = now - usage.lastReset.getTime();
    
    // Reset counters if more than a minute has passed
    if (timeSinceReset > 60000) {
      usage.executionCount = 0;
      usage.lastReset = new Date();
    }

    return usage.executionCount < this.config.maxSessionExecutionsPerMinute;
  }

  /**
   * Updates session usage statistics
   */
  private updateSessionUsage(sessionId: string, executionTime: number): void {
    let usage = this.sessionUsage.get(sessionId);
    if (!usage) {
      usage = {
        totalExecutionTime: 0,
        executionCount: 0,
        lastReset: new Date(),
        currentlyExecuting: 0
      };
      this.sessionUsage.set(sessionId, usage);
    }

    usage.totalExecutionTime += executionTime;
    usage.executionCount++;
    usage.currentlyExecuting = Math.max(0, usage.currentlyExecuting - 1);
  }

  /**
   * Processes the execution queue
   */
  private processQueue(): void {
    // Process as many items as we can up to the concurrent limit
    while (
      this.executionQueue.length > 0 && 
      this.activeExecutions.size < this.config.maxConcurrentExecutions
    ) {
      const item = this.executionQueue.shift()!;
      
      // Update session usage
      const usage = this.sessionUsage.get(item.sessionId);
      if (usage) {
        usage.currentlyExecuting++;
      }

      // Set up timeout for execution
      const timeoutId = setTimeout(() => {
        this.activeExecutions.delete(item.id);
        item.reject(new Error('Execution timed out'));
      }, this.config.maxExecutionTimeMs);

      // Track active execution
      this.activeExecutions.set(item.id, {
        sessionId: item.sessionId,
        startTime: new Date(),
        timeoutId
      });

      // Execute the operation
      item.operation()
        .then(result => {
          clearTimeout(timeoutId);
          this.activeExecutions.delete(item.id);
          item.resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          this.activeExecutions.delete(item.id);
          item.reject(error);
        });
    }
  }

  /**
   * Cleans up expired queue entries and resets session counters
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    
    // Remove expired queue items
    this.executionQueue = this.executionQueue.filter(item => {
      const age = now - item.createdAt.getTime();
      if (age > this.config.queueTimeout) {
        item.reject(new Error('Operation expired in queue'));
        return false;
      }
      return true;
    });

    // Reset session counters if needed
    for (const usage of this.sessionUsage.values()) {
      const timeSinceReset = now - usage.lastReset.getTime();
      if (timeSinceReset > 60000) {
        usage.executionCount = 0;
        usage.lastReset = new Date();
      }
    }
  }
}