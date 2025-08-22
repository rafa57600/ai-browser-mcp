import type { BrowserContext, Page } from 'playwright';
import type { NetworkLog, ConsoleLog } from './log-types.js';

// Session-related type definitions
export interface SessionOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
  allowedDomains?: string[];
  timeout?: number;
  headless?: boolean;
  clientId?: string;
  pooledContextId?: string;
}

export interface BrowserSessionData {
  id: string;
  context: BrowserContext;
  page: Page;
  createdAt: Date;
  lastActivity: Date;
  allowedDomains: Set<string>;
  networkLogs: NetworkLog[];
  consoleLogs: ConsoleLog[];
  options: SessionOptions;
}

export interface SessionManagerConfig {
  maxSessions?: number;
  sessionTimeout?: number;
  cleanupInterval?: number;
  defaultViewport?: { width: number; height: number };
  defaultUserAgent?: string;
}

export interface SessionPoolStats {
  totalSessions: number;
  activeSessions: number;
  maxSessions: number;
  availableCapacity: number;
  sessionTimeout: number;
  clientCount: number;
  sessionsPerClient: Record<string, number>;
  pendingRequests: number;
  resourceLocked: boolean;
}