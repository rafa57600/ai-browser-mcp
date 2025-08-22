import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LogOutputChannel } from '../../../vscode-extension/src/log-output-channel.js';

// Mock VS Code API
const mockOutputChannel = {
  appendLine: vi.fn(),
  clear: vi.fn(),
  show: vi.fn(),
  dispose: vi.fn()
};

const mockWindow = {
  createOutputChannel: vi.fn(() => mockOutputChannel)
};

vi.mock('vscode', () => ({
  window: mockWindow
}));

describe('LogOutputChannel', () => {
  let logChannel: LogOutputChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    logChannel = new LogOutputChannel();
  });

  describe('Initialization', () => {
    it('should create output channel with correct name', () => {
      expect(mockWindow.createOutputChannel).toHaveBeenCalledWith('AI Browser MCP Logs');
    });
  });

  describe('Log Appending', () => {
    it('should append formatted log messages', () => {
      const log = {
        timestamp: new Date('2023-01-01T12:00:00Z'),
        level: 'info' as const,
        message: 'Test message',
        location: {
          url: 'http://example.com',
          lineNumber: 10,
          columnNumber: 5
        }
      };

      logChannel.appendLog(log);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] INFO  Test message \[http:\/\/example\.com:10\]/)
      );
    });

    it('should format logs without location', () => {
      const log = {
        timestamp: new Date('2023-01-01T12:00:00Z'),
        level: 'warn' as const,
        message: 'Warning message'
      };

      logChannel.appendLog(log);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringMatching(/\[.*\] WARN  Warning message$/)
      );
    });

    it('should auto-show output channel for error logs', () => {
      const errorLog = {
        timestamp: new Date(),
        level: 'error' as const,
        message: 'Error occurred'
      };

      logChannel.appendLog(errorLog);

      expect(mockOutputChannel.show).toHaveBeenCalledWith(true);
    });

    it('should not auto-show for non-error logs', () => {
      const infoLog = {
        timestamp: new Date(),
        level: 'info' as const,
        message: 'Info message'
      };

      logChannel.appendLog(infoLog);

      expect(mockOutputChannel.show).not.toHaveBeenCalled();
    });

    it('should maintain log buffer with size limit', () => {
      // Add logs beyond buffer size
      for (let i = 0; i < 1100; i++) {
        logChannel.appendLog({
          timestamp: new Date(),
          level: 'info' as const,
          message: `Message ${i}`
        });
      }

      const recentLogs = logChannel.getRecentLogs();
      expect(recentLogs).toHaveLength(1000); // Max buffer size
      expect(recentLogs[0].message).toBe('Message 100'); // First 100 should be removed
    });
  });

  describe('Log Updates', () => {
    it('should clear and update with new logs', () => {
      const logs = [
        {
          timestamp: new Date('2023-01-01T12:00:00Z'),
          level: 'info' as const,
          message: 'First message'
        },
        {
          timestamp: new Date('2023-01-01T12:01:00Z'),
          level: 'warn' as const,
          message: 'Second message'
        }
      ];

      logChannel.updateLogs(logs);

      expect(mockOutputChannel.clear).toHaveBeenCalled();
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(2);
      expect(mockOutputChannel.show).toHaveBeenCalledWith(true);
    });

    it('should limit logs to buffer size when updating', () => {
      const logs = Array.from({ length: 1100 }, (_, i) => ({
        timestamp: new Date(),
        level: 'info' as const,
        message: `Message ${i}`
      }));

      logChannel.updateLogs(logs);

      const recentLogs = logChannel.getRecentLogs();
      expect(recentLogs).toHaveLength(1000);
    });
  });

  describe('Log Filtering', () => {
    beforeEach(() => {
      const testLogs = [
        {
          timestamp: new Date(),
          level: 'info' as const,
          message: 'Info message about user'
        },
        {
          timestamp: new Date(),
          level: 'error' as const,
          message: 'Error in authentication',
          location: {
            url: 'http://auth.example.com',
            lineNumber: 1,
            columnNumber: 1
          }
        },
        {
          timestamp: new Date(),
          level: 'warn' as const,
          message: 'Warning about performance'
        }
      ];

      testLogs.forEach(log => logChannel.appendLog(log));
    });

    it('should filter logs by level', () => {
      const errorLogs = logChannel.filterLogs('error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
    });

    it('should filter logs by search term in message', () => {
      const authLogs = logChannel.filterLogs(undefined, 'authentication');
      expect(authLogs).toHaveLength(1);
      expect(authLogs[0].message).toContain('authentication');
    });

    it('should filter logs by search term in URL', () => {
      const authLogs = logChannel.filterLogs(undefined, 'auth.example');
      expect(authLogs).toHaveLength(1);
      expect(authLogs[0].location?.url).toContain('auth.example');
    });

    it('should filter by both level and search term', () => {
      const filteredLogs = logChannel.filterLogs('warn', 'performance');
      expect(filteredLogs).toHaveLength(1);
      expect(filteredLogs[0].level).toBe('warn');
      expect(filteredLogs[0].message).toContain('performance');
    });

    it('should return empty array when no matches', () => {
      const noMatches = logChannel.filterLogs('debug', 'nonexistent');
      expect(noMatches).toHaveLength(0);
    });
  });

  describe('Log Export', () => {
    beforeEach(() => {
      const testLogs = [
        {
          timestamp: new Date('2023-01-01T12:00:00Z'),
          level: 'info' as const,
          message: 'First message'
        },
        {
          timestamp: new Date('2023-01-01T12:01:00Z'),
          level: 'error' as const,
          message: 'Error message',
          location: {
            url: 'http://example.com',
            lineNumber: 10,
            columnNumber: 5
          }
        }
      ];

      testLogs.forEach(log => logChannel.appendLog(log));
    });

    it('should export logs in correct format', () => {
      const exported = logChannel.exportLogs();
      
      expect(exported).toContain('2023-01-01T12:00:00.000Z [INFO] First message');
      expect(exported).toContain('2023-01-01T12:01:00.000Z [ERROR] Error message [http://example.com:10:5]');
    });

    it('should handle logs without location in export', () => {
      logChannel.clearLogs();
      logChannel.appendLog({
        timestamp: new Date('2023-01-01T12:00:00Z'),
        level: 'info' as const,
        message: 'Simple message'
      });

      const exported = logChannel.exportLogs();
      expect(exported).toBe('2023-01-01T12:00:00.000Z [INFO] Simple message');
    });
  });

  describe('Utility Methods', () => {
    it('should clear logs and buffer', () => {
      logChannel.appendLog({
        timestamp: new Date(),
        level: 'info' as const,
        message: 'Test message'
      });

      logChannel.clearLogs();

      expect(mockOutputChannel.clear).toHaveBeenCalled();
      expect(logChannel.getRecentLogs()).toHaveLength(0);
    });

    it('should show logs output channel', () => {
      logChannel.showLogs();
      expect(mockOutputChannel.show).toHaveBeenCalled();
    });

    it('should get recent logs with limit', () => {
      // Add multiple logs
      for (let i = 0; i < 10; i++) {
        logChannel.appendLog({
          timestamp: new Date(),
          level: 'info' as const,
          message: `Message ${i}`
        });
      }

      const recentLogs = logChannel.getRecentLogs(5);
      expect(recentLogs).toHaveLength(5);
      expect(recentLogs[0].message).toBe('Message 5'); // Last 5 messages
    });

    it('should dispose output channel', () => {
      logChannel.dispose();
      expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });
  });

  describe('Level Formatting', () => {
    it('should pad log levels correctly', () => {
      const levels = ['info', 'warn', 'error', 'debug'] as const;
      
      levels.forEach(level => {
        logChannel.appendLog({
          timestamp: new Date(),
          level,
          message: 'Test message'
        });
      });

      const calls = mockOutputChannel.appendLine.mock.calls;
      
      // All level strings should be padded to same width
      calls.forEach(call => {
        const logLine = call[0] as string;
        const levelMatch = logLine.match(/\] (\w+) /);
        expect(levelMatch?.[1]).toHaveLength(5); // Padded to 5 characters
      });
    });
  });
});