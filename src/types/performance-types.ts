import type { BrowserContext } from 'playwright';
import type { SessionOptions } from './session-types.js';

// Context Pool Types
export interface ContextPoolConfig {
  minPoolSize?: number;
  maxPoolSize?: number;
  maxIdleTime?: number;
  cleanupInterval?: number;
  warmupOnStart?: boolean;
  reuseThreshold?: number;
}

export interface PooledContext {
  id: string;
  context: BrowserContext;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
  options: SessionOptions;
  isTemporary?: boolean;
}

export interface ContextPoolStats {
  availableContexts: number;
  activeContexts: number;
  totalContexts: number;
  minPoolSize: number;
  maxPoolSize: number;
  averageUseCount: number;
  oldestContextAge: number;
}

// Memory Monitor Types
export interface MemoryLimits {
  maxSessionMemoryMB?: number;
  maxTotalMemoryMB?: number;
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
  monitoringInterval?: number;
}

export interface MemoryUsage {
  timestamp: Date;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMemoryMB: number;
  systemUsedMB: number;
  systemTotalMB: number;
}

export interface SessionMemoryInfo {
  sessionId: string;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  lastUpdated: Date;
  warningIssued: boolean;
  criticalIssued: boolean;
}

export interface MemoryStats {
  process: {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMemoryMB: number;
  };
  system: {
    totalMemoryMB: number;
    freeMemoryMB: number;
    usedMemoryMB: number;
    usagePercent: number;
  };
  sessions: {
    totalSessionMemoryMB: number;
    sessionCount: number;
    averageSessionMemoryMB: number;
    sessionsOverWarning: number;
    sessionsOverCritical: number;
  };
  limits: Required<MemoryLimits>;
  timestamp: Date;
}

// CPU Throttle Types
export interface CPUThrottleConfig {
  maxConcurrentExecutions?: number;
  maxExecutionTimeMs?: number;
  maxSessionExecutionsPerMinute?: number;
  queueTimeout?: number;
  processingInterval?: number;
  priorityLevels?: number;
}

export interface CPUUsageStats {
  activeExecutions: number;
  queuedExecutions: number;
  maxConcurrentExecutions: number;
  totalSessions: number;
  activeSessions: number;
  averageExecutionTime: number;
  totalExecutionTime: number;
  totalExecutionCount: number;
  timestamp: Date;
}

export interface ThrottleResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  executionTime: number;
  queueTime: number;
}

// Disk Manager Types
export interface DiskManagerConfig {
  maxTotalSizeMB?: number;
  maxSessionSizeMB?: number;
  maxFileAgeDays?: number;
  cleanupInterval?: number;
  tempDirPrefix?: string;
  allowedExtensions?: string[];
  compressionEnabled?: boolean;
}

export interface FileInfo {
  path: string;
  sessionId: string;
  filename: string;
  sizeMB: number;
  createdAt: Date;
  lastAccessed: Date;
  metadata: Record<string, any>;
}

export interface DiskUsageStats {
  totalFiles: number;
  totalSizeMB: number;
  maxTotalSizeMB: number;
  usagePercent: number;
  sessionCount: number;
  averageSessionSizeMB: number;
  oldestFile: Date | null;
  newestFile: Date | null;
  sessionsOverLimit: string[];
}

export interface CleanupResult {
  filesDeleted: number;
  spaceFreesMB: number;
}

// Performance Manager Types
export interface PerformanceConfig {
  contextPool?: ContextPoolConfig;
  memoryLimits?: MemoryLimits;
  cpuThrottle?: CPUThrottleConfig;
  diskManager?: DiskManagerConfig;
  enableOptimizations?: boolean;
}

export interface PerformanceStats {
  contextPool: ContextPoolStats;
  memory: MemoryStats;
  cpu: CPUUsageStats;
  disk: DiskUsageStats;
  timestamp: Date;
}