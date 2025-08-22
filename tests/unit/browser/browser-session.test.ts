import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserSession } from '../../../src/browser/browser-session.js';
import type { BrowserSessionData } from '../../../src/types/session-types.js';
import type { NetworkLog, ConsoleLog } from '../../../src/types/log-types.js';
import * as fs from 'fs/promises';

// Mock fs module
vi.mock('fs/promises');

// Mock Playwright types
const mockPage = {
  on: vi.fn(),
  goto: vi.fn()
};

const mockTracing = {
  start: vi.fn(),
  stop: vi.fn()
};

const mockContext = {
  close: vi.fn(),
  newPage: vi.fn().mockResolvedValue(mockPage),
  tracing: mockTracing
};

describe('BrowserSession', () => {
  let sessionData: BrowserSessionData;
  let session: BrowserSession;

  beforeEach(() => {
    vi.clearAllMocks();
    
    sessionData = {
      id: 'test-session-1',
      context: mockContext as any,
      page: mockPage as any,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      lastActivity: new Date('2024-01-01T00:00:00Z'),
      allowedDomains: new Set(['example.com', 'test.com']),
      networkLogs: [],
      consoleLogs: [],
      options: {
        viewport: { width: 1280, height: 720 },
        userAgent: 'Test User Agent',
        timeout: 30000
      }
    };

    session = new BrowserSession(sessionData);
  });

  describe('initialization', () => {
    it('should initialize with provided data', () => {
      expect(session.id).toBe('test-session-1');
      expect(session.context).toBe(mockContext);
      expect(session.page).toBe(mockPage);
      expect(session.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(session.lastActivity).toEqual(new Date('2024-01-01T00:00:00Z'));
      expect(session.allowedDomains).toEqual(new Set(['example.com', 'test.com']));
      expect(session.isDestroyed).toBe(false);
    });

    it('should setup event listeners on page', () => {
      expect(mockPage.on).toHaveBeenCalledWith('request', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('console', expect.any(Function));
      expect(mockPage.on).toHaveBeenCalledWith('pageerror', expect.any(Function));
    });
  });

  describe('activity management', () => {
    it('should update last activity', async () => {
      const beforeUpdate = session.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1));
      session.updateActivity();
      expect(session.lastActivity.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });

    it('should throw error when updating activity on destroyed session', async () => {
      await session.destroy();
      expect(() => session.updateActivity()).toThrow('Cannot update activity on destroyed session');
    });
  });

  describe('domain management', () => {
    it('should check if domain is allowed', () => {
      expect(session.isDomainAllowed('example.com')).toBe(true);
      expect(session.isDomainAllowed('test.com')).toBe(true);
      expect(session.isDomainAllowed('forbidden.com')).toBe(false);
    });

    it('should add allowed domain', () => {
      session.addAllowedDomain('newdomain.com');
      expect(session.isDomainAllowed('newdomain.com')).toBe(true);
    });

    it('should return copy of allowed domains', () => {
      const domains = session.allowedDomains;
      domains.add('modified.com');
      
      // Original should not be modified
      expect(session.isDomainAllowed('modified.com')).toBe(false);
    });

    it('should throw error when modifying destroyed session', async () => {
      await session.destroy();
      expect(() => session.addAllowedDomain('test.com')).toThrow('Cannot modify destroyed session');
    });
  });

  describe('network log management', () => {
    it('should add network log', () => {
      const networkLog: NetworkLog = {
        timestamp: new Date(),
        method: 'GET',
        url: 'https://example.com',
        status: 200,
        requestHeaders: { 'User-Agent': 'Test' },
        responseHeaders: { 'Content-Type': 'text/html' },
        duration: 100
      };

      session.addNetworkLog(networkLog);
      
      const logs = session.networkLogs;
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(networkLog);
    });

    it('should limit network logs to 1000 entries', () => {
      // Add 1001 logs
      for (let i = 0; i < 1001; i++) {
        const log: NetworkLog = {
          timestamp: new Date(),
          method: 'GET',
          url: `https://example.com/${i}`,
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          duration: 100
        };
        session.addNetworkLog(log);
      }

      expect(session.networkLogs).toHaveLength(1000);
      // Should keep the most recent logs
      expect(session.networkLogs[999].url).toBe('https://example.com/1000');
    });

    it('should get recent network logs with limit', () => {
      // Add 5 logs
      for (let i = 0; i < 5; i++) {
        const log: NetworkLog = {
          timestamp: new Date(),
          method: 'GET',
          url: `https://example.com/${i}`,
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          duration: 100
        };
        session.addNetworkLog(log);
      }

      const recentLogs = session.getRecentNetworkLogs(3);
      expect(recentLogs).toHaveLength(3);
      expect(recentLogs[2].url).toBe('https://example.com/4');
    });

    it('should return copy of network logs', () => {
      const log: NetworkLog = {
        timestamp: new Date(),
        method: 'GET',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        duration: 100
      };
      session.addNetworkLog(log);

      const logs = session.networkLogs;
      logs.push({} as NetworkLog);
      
      // Original should not be modified
      expect(session.networkLogs).toHaveLength(1);
    });

    it('should not add logs to destroyed session', async () => {
      await session.destroy();
      
      const log: NetworkLog = {
        timestamp: new Date(),
        method: 'GET',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        duration: 100
      };
      
      session.addNetworkLog(log);
      expect(session.networkLogs).toHaveLength(0);
    });
  });

  describe('console log management', () => {
    it('should add console log', () => {
      const consoleLog: ConsoleLog = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test message',
        location: {
          url: 'https://example.com',
          lineNumber: 10,
          columnNumber: 5
        }
      };

      session.addConsoleLog(consoleLog);
      
      const logs = session.consoleLogs;
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual(consoleLog);
    });

    it('should limit console logs to 1000 entries', () => {
      // Add 1001 logs
      for (let i = 0; i < 1001; i++) {
        const log: ConsoleLog = {
          timestamp: new Date(),
          level: 'info',
          message: `Message ${i}`
        };
        session.addConsoleLog(log);
      }

      expect(session.consoleLogs).toHaveLength(1000);
      // Should keep the most recent logs
      expect(session.consoleLogs[999].message).toBe('Message 1000');
    });

    it('should get recent console logs with limit', () => {
      // Add 5 logs
      for (let i = 0; i < 5; i++) {
        const log: ConsoleLog = {
          timestamp: new Date(),
          level: 'info',
          message: `Message ${i}`
        };
        session.addConsoleLog(log);
      }

      const recentLogs = session.getRecentConsoleLogs(3);
      expect(recentLogs).toHaveLength(3);
      expect(recentLogs[2].message).toBe('Message 4');
    });

    it('should return copy of console logs', () => {
      const log: ConsoleLog = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test message'
      };
      session.addConsoleLog(log);

      const logs = session.consoleLogs;
      logs.push({} as ConsoleLog);
      
      // Original should not be modified
      expect(session.consoleLogs).toHaveLength(1);
    });

    it('should not add logs to destroyed session', async () => {
      await session.destroy();
      
      const log: ConsoleLog = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test message'
      };
      
      session.addConsoleLog(log);
      expect(session.consoleLogs).toHaveLength(0);
    });
  });

  describe('session destruction', () => {
    it('should destroy session and cleanup resources', async () => {
      session.addNetworkLog({
        timestamp: new Date(),
        method: 'GET',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        duration: 100
      });

      session.addConsoleLog({
        timestamp: new Date(),
        level: 'info',
        message: 'Test message'
      });

      await session.destroy();

      expect(session.isDestroyed).toBe(true);
      expect(mockContext.close).toHaveBeenCalled();
      expect(session.networkLogs).toHaveLength(0);
      expect(session.consoleLogs).toHaveLength(0);
      expect(session.allowedDomains.size).toBe(0);
    });

    it('should handle context close errors gracefully', async () => {
      mockContext.close.mockRejectedValue(new Error('Close failed'));
      
      // Mock console.error to suppress error output in tests
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(session.destroy()).resolves.not.toThrow();
      expect(session.isDestroyed).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error closing browser context for session test-session-1:'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should not throw when destroying already destroyed session', async () => {
      // Mock console.error to suppress error output in tests
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await session.destroy();
      await expect(session.destroy()).resolves.not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });

  describe('tracing functionality', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    });

    it('should start tracing with default options', async () => {
      await session.startTrace();

      expect(fs.mkdir).toHaveBeenCalled();
      expect(mockTracing.start).toHaveBeenCalledWith({
        screenshots: true,
        snapshots: true,
        sources: false
      });
      expect(session.isTracing()).toBe(true);

      const traceData = session.getTraceData();
      expect(traceData).toBeDefined();
      expect(traceData?.sessionId).toBe('test-session-1');
      expect(traceData?.isActive).toBe(true);
      expect(traceData?.startTime).toBeInstanceOf(Date);
    });

    it('should start tracing with custom options', async () => {
      const options = {
        screenshots: false,
        snapshots: true,
        sources: true
      };

      await session.startTrace(options);

      expect(mockTracing.start).toHaveBeenCalledWith(options);
      expect(session.isTracing()).toBe(true);

      const traceData = session.getTraceData();
      expect(traceData?.metadata).toEqual(options);
    });

    it('should stop tracing and return trace data', async () => {
      await session.startTrace();
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const traceData = await session.stopTrace();

      expect(mockTracing.stop).toHaveBeenCalledWith({
        path: expect.stringContaining('trace-')
      });
      expect(session.isTracing()).toBe(false);
      expect(traceData.sessionId).toBe('test-session-1');
      expect(traceData.isActive).toBe(false);
      expect(traceData.endTime).toBeInstanceOf(Date);
      expect(traceData.endTime!.getTime()).toBeGreaterThan(traceData.startTime.getTime());
    });

    it('should throw error when starting trace on destroyed session', async () => {
      await session.destroy();
      
      await expect(session.startTrace()).rejects.toThrow('Cannot start trace on destroyed session');
    });

    it('should throw error when stopping trace on destroyed session', async () => {
      await session.destroy();
      
      await expect(session.stopTrace()).rejects.toThrow('Cannot stop trace on destroyed session');
    });

    it('should throw error when starting trace when already active', async () => {
      await session.startTrace();
      
      await expect(session.startTrace()).rejects.toThrow('Trace is already active for this session');
    });

    it('should throw error when stopping trace when not active', async () => {
      await expect(session.stopTrace()).rejects.toThrow('No active trace found for this session');
    });

    it('should return null trace data when no trace is active', () => {
      const traceData = session.getTraceData();
      expect(traceData).toBeNull();
    });

    it('should return false for isTracing when no trace is active', () => {
      expect(session.isTracing()).toBe(false);
    });

    it('should stop active trace during session destruction', async () => {
      await session.startTrace();
      expect(session.isTracing()).toBe(true);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await session.destroy();

      expect(mockTracing.stop).toHaveBeenCalled();
      expect(session.isDestroyed).toBe(true);
      
      consoleSpy.mockRestore();
    });

    it('should handle trace stop error during destruction gracefully', async () => {
      await session.startTrace();
      mockTracing.stop.mockRejectedValue(new Error('Stop failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      await expect(session.destroy()).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error stopping trace for session test-session-1:'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });
});