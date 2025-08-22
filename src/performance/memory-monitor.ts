import * as os from 'os';
import type { MemoryUsage, MemoryLimits, MemoryStats, SessionMemoryInfo } from '../types/performance-types.js';

/**
 * MemoryMonitor tracks and enforces memory usage limits per session and globally
 */
export class MemoryMonitor {
  private sessionMemoryUsage: Map<string, SessionMemoryInfo> = new Map();
  private monitoringTimer: NodeJS.Timeout | null = null;
  private readonly limits: Required<MemoryLimits>;
  private memoryHistory: MemoryUsage[] = [];
  private readonly maxHistorySize = 100;

  constructor(limits: MemoryLimits = {}) {
    this.limits = {
      maxSessionMemoryMB: limits.maxSessionMemoryMB ?? 512,
      maxTotalMemoryMB: limits.maxTotalMemoryMB ?? 2048,
      warningThresholdPercent: limits.warningThresholdPercent ?? 80,
      criticalThresholdPercent: limits.criticalThresholdPercent ?? 95,
      monitoringInterval: limits.monitoringInterval ?? 30000 // 30 seconds
    };
  }

  /**
   * Starts memory monitoring
   */
  start(): void {
    if (this.monitoringTimer) {
      return;
    }

    this.monitoringTimer = setInterval(() => {
      this.updateMemoryStats();
      this.checkMemoryLimits();
    }, this.limits.monitoringInterval);

    // Initial measurement
    this.updateMemoryStats();
  }

  /**
   * Stops memory monitoring
   */
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * Registers a new session for memory tracking
   */
  registerSession(sessionId: string): void {
    if (!this.sessionMemoryUsage.has(sessionId)) {
      this.sessionMemoryUsage.set(sessionId, {
        sessionId,
        heapUsedMB: 0,
        heapTotalMB: 0,
        externalMB: 0,
        lastUpdated: new Date(),
        warningIssued: false,
        criticalIssued: false
      });
    }
  }

  /**
   * Unregisters a session from memory tracking
   */
  unregisterSession(sessionId: string): void {
    this.sessionMemoryUsage.delete(sessionId);
  }

  /**
   * Updates memory usage for a specific session
   */
  updateSessionMemory(sessionId: string, memoryUsage: Partial<SessionMemoryInfo>): void {
    const sessionInfo = this.sessionMemoryUsage.get(sessionId);
    if (sessionInfo) {
      Object.assign(sessionInfo, memoryUsage, { lastUpdated: new Date() });
    }
  }

  /**
   * Gets current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };

    const totalSessionMemory = Array.from(this.sessionMemoryUsage.values())
      .reduce((sum, session) => sum + session.heapUsedMB, 0);

    return {
      process: {
        heapUsedMB: Math.round(processMemory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(processMemory.heapTotal / 1024 / 1024),
        externalMB: Math.round(processMemory.external / 1024 / 1024),
        rssMemoryMB: Math.round(processMemory.rss / 1024 / 1024)
      },
      system: {
        totalMemoryMB: Math.round(systemMemory.total / 1024 / 1024),
        freeMemoryMB: Math.round(systemMemory.free / 1024 / 1024),
        usedMemoryMB: Math.round(systemMemory.used / 1024 / 1024),
        usagePercent: Math.round((systemMemory.used / systemMemory.total) * 100)
      },
      sessions: {
        totalSessionMemoryMB: Math.round(totalSessionMemory),
        sessionCount: this.sessionMemoryUsage.size,
        averageSessionMemoryMB: this.sessionMemoryUsage.size > 0 
          ? Math.round(totalSessionMemory / this.sessionMemoryUsage.size) 
          : 0,
        sessionsOverWarning: this.getSessionsOverThreshold('warning').length,
        sessionsOverCritical: this.getSessionsOverThreshold('critical').length
      },
      limits: this.limits,
      timestamp: new Date()
    };
  }

  /**
   * Gets memory usage history
   */
  getMemoryHistory(): MemoryUsage[] {
    return [...this.memoryHistory];
  }

  /**
   * Gets sessions that exceed memory thresholds
   */
  getSessionsOverThreshold(threshold: 'warning' | 'critical'): SessionMemoryInfo[] {
    const thresholdMB = threshold === 'warning' 
      ? this.limits.maxSessionMemoryMB * (this.limits.warningThresholdPercent / 100)
      : this.limits.maxSessionMemoryMB * (this.limits.criticalThresholdPercent / 100);

    return Array.from(this.sessionMemoryUsage.values())
      .filter(session => session.heapUsedMB > thresholdMB);
  }

  /**
   * Checks if a session can be created based on memory limits
   */
  canCreateSession(): boolean {
    const stats = this.getMemoryStats();
    
    // Check if total memory would exceed limits
    const projectedMemory = stats.sessions.totalSessionMemoryMB + (this.limits.maxSessionMemoryMB * 0.5);
    if (projectedMemory > this.limits.maxTotalMemoryMB) {
      return false;
    }

    // Check system memory usage
    if (stats.system.usagePercent > this.limits.criticalThresholdPercent) {
      return false;
    }

    return true;
  }

  /**
   * Gets memory usage for a specific session
   */
  getSessionMemory(sessionId: string): SessionMemoryInfo | null {
    return this.sessionMemoryUsage.get(sessionId) || null;
  }

  /**
   * Forces garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * Gets memory pressure level
   */
  getMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const stats = this.getMemoryStats();
    const totalUsagePercent = (stats.sessions.totalSessionMemoryMB / this.limits.maxTotalMemoryMB) * 100;

    if (totalUsagePercent > this.limits.criticalThresholdPercent) {
      return 'critical';
    } else if (totalUsagePercent > this.limits.warningThresholdPercent) {
      return 'high';
    } else if (totalUsagePercent > 50) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Updates memory statistics and history
   */
  private updateMemoryStats(): void {
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem()
    };

    const memoryUsage: MemoryUsage = {
      timestamp: new Date(),
      heapUsedMB: Math.round(processMemory.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(processMemory.heapTotal / 1024 / 1024),
      externalMB: Math.round(processMemory.external / 1024 / 1024),
      rssMemoryMB: Math.round(processMemory.rss / 1024 / 1024),
      systemUsedMB: Math.round((systemMemory.total - systemMemory.free) / 1024 / 1024),
      systemTotalMB: Math.round(systemMemory.total / 1024 / 1024)
    };

    this.memoryHistory.push(memoryUsage);
    
    // Keep only recent history
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory = this.memoryHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Checks memory limits and issues warnings
   */
  private checkMemoryLimits(): void {
    const stats = this.getMemoryStats();
    
    // Check global memory limits
    if (stats.system.usagePercent > this.limits.criticalThresholdPercent) {
      console.error(`CRITICAL: System memory usage at ${stats.system.usagePercent}%`);
    } else if (stats.system.usagePercent > this.limits.warningThresholdPercent) {
      console.warn(`WARNING: System memory usage at ${stats.system.usagePercent}%`);
    }

    // Check session memory limits
    for (const session of this.sessionMemoryUsage.values()) {
      const warningThreshold = this.limits.maxSessionMemoryMB * (this.limits.warningThresholdPercent / 100);
      const criticalThreshold = this.limits.maxSessionMemoryMB * (this.limits.criticalThresholdPercent / 100);

      if (session.heapUsedMB > criticalThreshold && !session.criticalIssued) {
        console.error(`CRITICAL: Session ${session.sessionId} using ${session.heapUsedMB}MB (limit: ${this.limits.maxSessionMemoryMB}MB)`);
        session.criticalIssued = true;
        session.warningIssued = true;
      } else if (session.heapUsedMB > warningThreshold && !session.warningIssued) {
        console.warn(`WARNING: Session ${session.sessionId} using ${session.heapUsedMB}MB (limit: ${this.limits.maxSessionMemoryMB}MB)`);
        session.warningIssued = true;
      }

      // Reset flags if memory usage drops
      if (session.heapUsedMB < warningThreshold) {
        session.warningIssued = false;
        session.criticalIssued = false;
      }
    }
  }
}