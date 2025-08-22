import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createNetworkGetRecentTool, createConsoleGetRecentTool } from '../../../src/tools/monitoring-tools.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';
import { NetworkLog, ConsoleLog } from '../../../src/types/log-types.js';

// Mock the SessionManager
vi.mock('../../../src/browser/session-manager.js');

describe('Monitoring Tools', () => {
  let sessionManager: SessionManager;
  let mockSession: BrowserSession;

  beforeEach(() => {
    sessionManager = new SessionManager();
    
    // Create mock session
    mockSession = {
      id: 'test-session',
      updateActivity: vi.fn(),
      getRecentNetworkLogs: vi.fn(),
      getRecentConsoleLogs: vi.fn(),
      isDestroyed: false
    } as unknown as BrowserSession;

    vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createNetworkGetRecentTool', () => {
    it('should create a network monitoring tool with correct properties', () => {
      const tool = createNetworkGetRecentTool(sessionManager);

      expect(tool.name).toBe('browser.network.getRecent');
      expect(tool.description).toContain('network requests and responses');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('properties');
      expect(tool.handler).toBeInstanceOf(Function);
    });

    it('should retrieve network logs successfully', async () => {
      const mockNetworkLogs: NetworkLog[] = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          method: 'GET',
          url: 'https://example.com/api/data',
          status: 200,
          requestHeaders: { 'user-agent': 'test-agent' },
          responseHeaders: { 'content-type': 'application/json' },
          duration: 150
        },
        {
          timestamp: new Date('2024-01-01T10:01:00Z'),
          method: 'POST',
          url: 'https://example.com/api/submit',
          status: 201,
          requestHeaders: { 'authorization': 'Bearer secret-token' },
          responseHeaders: { 'content-type': 'application/json' },
          requestBody: '{"data": "test"}',
          responseBody: '{"success": true}',
          duration: 200
        }
      ];

      vi.mocked(mockSession.getRecentNetworkLogs).mockReturnValue(mockNetworkLogs);

      const tool = createNetworkGetRecentTool(sessionManager);
      const result = await tool.handler({
        sessionId: 'test-session',
        limit: 10,
        includeBody: true
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.networkLogs).toHaveLength(2);
      expect(response.networkLogs[0].url).toBe('https://example.com/api/data');
      expect(response.networkLogs[1].requestBody).toBe('{"data": "test"}');
      expect(response.networkLogs[1].responseBody).toBe('{"success": true}');
      
      // Check that sensitive headers are filtered
      expect(response.networkLogs[1].requestHeaders.authorization).toBe('[REDACTED]');
      
      expect(mockSession.updateActivity).toHaveBeenCalled();
      expect(mockSession.getRecentNetworkLogs).toHaveBeenCalledWith(10);
    });

    it('should retrieve network logs without bodies when includeBody is false', async () => {
      const mockNetworkLogs: NetworkLog[] = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          method: 'POST',
          url: 'https://example.com/api/submit',
          status: 201,
          requestHeaders: { 'content-type': 'application/json' },
          responseHeaders: { 'content-type': 'application/json' },
          requestBody: '{"data": "test"}',
          responseBody: '{"success": true}',
          duration: 200
        }
      ];

      vi.mocked(mockSession.getRecentNetworkLogs).mockReturnValue(mockNetworkLogs);

      const tool = createNetworkGetRecentTool(sessionManager);
      const result = await tool.handler({
        sessionId: 'test-session',
        includeBody: false
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.networkLogs[0]).not.toHaveProperty('requestBody');
      expect(response.networkLogs[0]).not.toHaveProperty('responseBody');
    });

    it('should use default limit when not specified', async () => {
      vi.mocked(mockSession.getRecentNetworkLogs).mockReturnValue([]);

      const tool = createNetworkGetRecentTool(sessionManager);
      await tool.handler({ sessionId: 'test-session' });

      expect(mockSession.getRecentNetworkLogs).toHaveBeenCalledWith(50);
    });

    it('should handle session not found error', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(null);

      const tool = createNetworkGetRecentTool(sessionManager);
      const result = await tool.handler({ sessionId: 'invalid-session' });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle missing sessionId error', async () => {
      const tool = createNetworkGetRecentTool(sessionManager);
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('sessionId is required');
    });

    it('should filter sensitive headers correctly', async () => {
      const mockNetworkLogs: NetworkLog[] = [
        {
          timestamp: new Date(),
          method: 'GET',
          url: 'https://example.com',
          status: 200,
          requestHeaders: {
            'authorization': 'Bearer secret',
            'cookie': 'session=abc123',
            'x-api-key': 'key123',
            'user-agent': 'test-agent',
            'content-type': 'application/json'
          },
          responseHeaders: {
            'set-cookie': 'session=def456',
            'x-auth-token': 'token123',
            'content-type': 'application/json'
          },
          duration: 100
        }
      ];

      vi.mocked(mockSession.getRecentNetworkLogs).mockReturnValue(mockNetworkLogs);

      const tool = createNetworkGetRecentTool(sessionManager);
      const result = await tool.handler({ sessionId: 'test-session' });

      const response = JSON.parse(result.content[0].text);
      const log = response.networkLogs[0];
      
      expect(log.requestHeaders.authorization).toBe('[REDACTED]');
      expect(log.requestHeaders.cookie).toBe('[REDACTED]');
      expect(log.requestHeaders['x-api-key']).toBe('[REDACTED]');
      expect(log.requestHeaders['user-agent']).toBe('test-agent');
      expect(log.requestHeaders['content-type']).toBe('application/json');
      
      expect(log.responseHeaders['set-cookie']).toBe('[REDACTED]');
      expect(log.responseHeaders['x-auth-token']).toBe('[REDACTED]');
      expect(log.responseHeaders['content-type']).toBe('application/json');
    });
  });

  describe('createConsoleGetRecentTool', () => {
    it('should create a console monitoring tool with correct properties', () => {
      const tool = createConsoleGetRecentTool(sessionManager);

      expect(tool.name).toBe('browser.console.getRecent');
      expect(tool.description).toContain('console log entries');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('properties');
      expect(tool.handler).toBeInstanceOf(Function);
    });

    it('should retrieve console logs successfully', async () => {
      const mockConsoleLogs: ConsoleLog[] = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          level: 'info',
          message: 'Application started',
          location: {
            url: 'https://example.com/app.js',
            lineNumber: 10,
            columnNumber: 5
          }
        },
        {
          timestamp: new Date('2024-01-01T10:01:00Z'),
          level: 'error',
          message: 'Failed to load resource'
        },
        {
          timestamp: new Date('2024-01-01T10:02:00Z'),
          level: 'warn',
          message: 'Deprecated API usage'
        }
      ];

      vi.mocked(mockSession.getRecentConsoleLogs).mockReturnValue(mockConsoleLogs);

      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({
        sessionId: 'test-session',
        limit: 10,
        includeLocation: true
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.consoleLogs).toHaveLength(3);
      expect(response.consoleLogs[0].message).toBe('Application started');
      expect(response.consoleLogs[0].location).toBeDefined();
      expect(response.consoleLogs[1].level).toBe('error');
      
      expect(mockSession.updateActivity).toHaveBeenCalled();
      expect(mockSession.getRecentConsoleLogs).toHaveBeenCalled();
    });

    it('should filter console logs by level', async () => {
      const mockConsoleLogs: ConsoleLog[] = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          level: 'info',
          message: 'Info message'
        },
        {
          timestamp: new Date('2024-01-01T10:01:00Z'),
          level: 'error',
          message: 'Error message'
        },
        {
          timestamp: new Date('2024-01-01T10:02:00Z'),
          level: 'error',
          message: 'Another error'
        }
      ];

      vi.mocked(mockSession.getRecentConsoleLogs).mockReturnValue(mockConsoleLogs);

      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({
        sessionId: 'test-session',
        level: 'error'
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.consoleLogs).toHaveLength(2);
      expect(response.consoleLogs[0].level).toBe('error');
      expect(response.consoleLogs[1].level).toBe('error');
      expect(response.levelFilter).toBe('error');
    });

    it('should exclude location when includeLocation is false', async () => {
      const mockConsoleLogs: ConsoleLog[] = [
        {
          timestamp: new Date('2024-01-01T10:00:00Z'),
          level: 'info',
          message: 'Test message',
          location: {
            url: 'https://example.com/app.js',
            lineNumber: 10,
            columnNumber: 5
          }
        }
      ];

      vi.mocked(mockSession.getRecentConsoleLogs).mockReturnValue(mockConsoleLogs);

      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({
        sessionId: 'test-session',
        includeLocation: false
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.consoleLogs[0]).not.toHaveProperty('location');
    });

    it('should use default limit when not specified', async () => {
      const mockConsoleLogs = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date(),
        level: 'info' as const,
        message: `Message ${i}`
      }));

      vi.mocked(mockSession.getRecentConsoleLogs).mockReturnValue(mockConsoleLogs);

      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({ sessionId: 'test-session' });

      const response = JSON.parse(result.content[0].text);
      expect(response.consoleLogs).toHaveLength(50); // Default limit
    });

    it('should handle session not found error', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(null);

      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({ sessionId: 'invalid-session' });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle missing sessionId error', async () => {
      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('sessionId is required');
    });

    it('should apply limit after filtering by level', async () => {
      const mockConsoleLogs: ConsoleLog[] = [
        { timestamp: new Date(), level: 'info', message: 'Info 1' },
        { timestamp: new Date(), level: 'error', message: 'Error 1' },
        { timestamp: new Date(), level: 'error', message: 'Error 2' },
        { timestamp: new Date(), level: 'error', message: 'Error 3' },
        { timestamp: new Date(), level: 'info', message: 'Info 2' }
      ];

      vi.mocked(mockSession.getRecentConsoleLogs).mockReturnValue(mockConsoleLogs);

      const tool = createConsoleGetRecentTool(sessionManager);
      const result = await tool.handler({
        sessionId: 'test-session',
        level: 'error',
        limit: 2
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.consoleLogs).toHaveLength(2);
      expect(response.consoleLogs[0].message).toBe('Error 2'); // Last 2 error messages
      expect(response.consoleLogs[1].message).toBe('Error 3');
    });
  });
});