import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTraceStartTool, createTraceStopTool, createHarExportTool } from '../../../src/tools/tracing-tools.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';
import { TraceData } from '../../../src/types/trace-types.js';
import * as fs from 'fs/promises';

// Mock fs module
vi.mock('fs/promises');

describe('Tracing Tools', () => {
  let sessionManager: SessionManager;
  let mockSession: BrowserSession;

  beforeEach(() => {
    sessionManager = new SessionManager();
    
    // Create mock session
    mockSession = {
      id: 'test-session-123',
      startTrace: vi.fn(),
      stopTrace: vi.fn(),
      getTraceData: vi.fn(),
      isTracing: vi.fn(),
      getRecentNetworkLogs: vi.fn(),
      updateActivity: vi.fn(),
      isDestroyed: false
    } as any;

    // Mock session manager methods
    vi.spyOn(sessionManager, 'getSession').mockReturnValue(mockSession);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('browser.trace.start', () => {
    it('should start tracing with default options', async () => {
      const tool = createTraceStartTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(mockSession.startTrace).toHaveBeenCalledWith({
        screenshots: true,
        snapshots: true,
        sources: false
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBe('test-session-123');
      expect(response.message).toBe('Browser tracing started successfully');
    });

    it('should start tracing with custom options', async () => {
      const tool = createTraceStartTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123',
        screenshots: false,
        snapshots: true,
        sources: true
      });

      expect(mockSession.startTrace).toHaveBeenCalledWith({
        screenshots: false,
        snapshots: true,
        sources: true
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.options).toEqual({
        screenshots: false,
        snapshots: true,
        sources: true
      });
    });

    it('should handle missing sessionId', async () => {
      const tool = createTraceStartTool(sessionManager);
      
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('sessionId is required and must be a string');
    });

    it('should handle session not found', async () => {
      vi.spyOn(sessionManager, 'getSession').mockReturnValue(null);
      const tool = createTraceStartTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'non-existent-session'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe("Session 'non-existent-session' not found or has expired");
    });

    it('should handle trace start error', async () => {
      mockSession.startTrace = vi.fn().mockRejectedValue(new Error('Trace already active'));
      const tool = createTraceStartTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Trace already active');
    });
  });

  describe('browser.trace.stop', () => {
    it('should stop tracing successfully', async () => {
      const mockTraceData: TraceData = {
        sessionId: 'test-session-123',
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T10:05:00Z'),
        traceFile: '/path/to/trace.zip',
        isActive: false,
        metadata: { screenshots: true }
      };

      mockSession.stopTrace = vi.fn().mockResolvedValue(mockTraceData);
      vi.mocked(fs.stat).mockResolvedValue({ size: 1024000 } as any);

      const tool = createTraceStopTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(mockSession.stopTrace).toHaveBeenCalled();
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBe('test-session-123');
      expect(response.traceData.traceFile).toBe('/path/to/trace.zip');
      expect(response.traceData.duration).toBe(300000); // 5 minutes in ms
      expect(response.traceData.size).toBe(1024000);
    });

    it('should handle missing sessionId', async () => {
      const tool = createTraceStopTool(sessionManager);
      
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('sessionId is required and must be a string');
    });

    it('should handle session not found', async () => {
      vi.spyOn(sessionManager, 'getSession').mockReturnValue(null);
      const tool = createTraceStopTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'non-existent-session'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe("Session 'non-existent-session' not found or has expired");
    });

    it('should handle trace stop error', async () => {
      mockSession.stopTrace = vi.fn().mockRejectedValue(new Error('No active trace'));
      const tool = createTraceStopTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('No active trace');
    });

    it('should handle file stat error gracefully', async () => {
      const mockTraceData: TraceData = {
        sessionId: 'test-session-123',
        startTime: new Date('2023-01-01T10:00:00Z'),
        endTime: new Date('2023-01-01T10:05:00Z'),
        traceFile: '/path/to/trace.zip',
        isActive: false
      };

      mockSession.stopTrace = vi.fn().mockResolvedValue(mockTraceData);
      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

      const tool = createTraceStopTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.traceData.size).toBe(0); // Should default to 0 when stat fails
    });
  });

  describe('browser.harExport', () => {
    it('should export HAR data successfully', async () => {
      const mockNetworkLogs = [
        {
          timestamp: new Date('2023-01-01T10:00:00Z'),
          method: 'GET',
          url: 'https://example.com/api/data?param=value',
          status: 200,
          requestHeaders: { 'user-agent': 'test-browser' },
          responseHeaders: { 'content-type': 'application/json' },
          requestBody: undefined,
          responseBody: '{"data": "test"}',
          duration: 150
        }
      ];

      mockSession.getRecentNetworkLogs = vi.fn().mockReturnValue(mockNetworkLogs);

      const tool = createHarExportTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123',
        includeContent: true,
        maxEntries: 100
      });

      expect(mockSession.getRecentNetworkLogs).toHaveBeenCalledWith(100);
      expect(mockSession.updateActivity).toHaveBeenCalled();
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBe('test-session-123');
      expect(response.entriesCount).toBe(1);
      expect(response.harData.log.entries).toHaveLength(1);
      
      const entry = response.harData.log.entries[0];
      expect(entry.request.method).toBe('GET');
      expect(entry.request.url).toBe('https://example.com/api/data?param=value');
      expect(entry.response.status).toBe(200);
      expect(entry.response.content.text).toBe('{"data": "test"}');
    });

    it('should export HAR data without content', async () => {
      const mockNetworkLogs = [
        {
          timestamp: new Date('2023-01-01T10:00:00Z'),
          method: 'POST',
          url: 'https://example.com/api/submit',
          status: 201,
          requestHeaders: { 'content-type': 'application/json' },
          responseHeaders: { 'content-type': 'application/json' },
          requestBody: '{"test": "data"}',
          responseBody: '{"success": true}',
          duration: 200
        }
      ];

      mockSession.getRecentNetworkLogs = vi.fn().mockReturnValue(mockNetworkLogs);

      const tool = createHarExportTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123',
        includeContent: false
      });

      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      const entry = response.harData.log.entries[0];
      expect(entry.response.content.text).toBeUndefined();
      expect(entry.request.postData.text).toBe('{"test": "data"}'); // Request body should still be included
    });

    it('should save HAR file when outputPath is provided', async () => {
      const mockNetworkLogs = [
        {
          timestamp: new Date('2023-01-01T10:00:00Z'),
          method: 'GET',
          url: 'https://example.com/test',
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          duration: 100
        }
      ];

      mockSession.getRecentNetworkLogs = vi.fn().mockReturnValue(mockNetworkLogs);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const tool = createHarExportTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123',
        outputPath: 'export.har'
      });

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.filePath).toContain('export.har');
    });

    it('should handle missing sessionId', async () => {
      const tool = createHarExportTool(sessionManager);
      
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('sessionId is required and must be a string');
    });

    it('should handle session not found', async () => {
      vi.spyOn(sessionManager, 'getSession').mockReturnValue(null);
      const tool = createHarExportTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'non-existent-session'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe("Session 'non-existent-session' not found or has expired");
    });

    it('should handle empty network logs', async () => {
      mockSession.getRecentNetworkLogs = vi.fn().mockReturnValue([]);

      const tool = createHarExportTool(sessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(result.isError).toBe(false);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.entriesCount).toBe(0);
      expect(response.harData.log.entries).toHaveLength(0);
    });

    it('should respect maxEntries limit', async () => {
      const tool = createHarExportTool(sessionManager);
      
      await tool.handler({
        sessionId: 'test-session-123',
        maxEntries: 50
      });

      expect(mockSession.getRecentNetworkLogs).toHaveBeenCalledWith(50);
    });

    it('should use default maxEntries when not specified', async () => {
      const tool = createHarExportTool(sessionManager);
      
      await tool.handler({
        sessionId: 'test-session-123'
      });

      expect(mockSession.getRecentNetworkLogs).toHaveBeenCalledWith(1000);
    });
  });
});