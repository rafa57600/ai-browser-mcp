import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createReportGenerateTool, createReportTemplatesListTool, createReportCleanupTool } from '../../../src/tools/report-tools.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { ReportGenerator } from '../../../src/tools/report-generator.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';
import type { ReportResult } from '../../../src/types/report-types.js';

describe('Report Tools', () => {
  let sessionManager: SessionManager;
  let reportGenerator: ReportGenerator;
  let mockSession: BrowserSession;

  beforeEach(() => {
    sessionManager = {
      getSession: vi.fn()
    } as any;

    reportGenerator = {
      generateReport: vi.fn(),
      getAvailableTemplates: vi.fn(),
      cleanup: vi.fn()
    } as any;

    mockSession = {
      id: 'test-session-123',
      updateActivity: vi.fn()
    } as any;
  });

  describe('browser.report.generate', () => {
    let reportGenerateTool: any;

    beforeEach(() => {
      reportGenerateTool = createReportGenerateTool(sessionManager, reportGenerator);
    });

    it('should have correct tool definition', () => {
      expect(reportGenerateTool.name).toBe('browser.report.generate');
      expect(reportGenerateTool.description).toContain('comprehensive report');
      expect(reportGenerateTool.inputSchema.type).toBe('object');
      expect(reportGenerateTool.inputSchema.required).toContain('sessionId');
    });

    it('should generate HTML report successfully', async () => {
      const mockReportResult: ReportResult = {
        reportId: 'report-123',
        format: 'html',
        filePath: '/tmp/report-123.html',
        size: 2048,
        timestamp: new Date('2024-01-01T12:00:00Z'),
        metadata: {
          sessionId: 'test-session-123',
          screenshotCount: 2,
          domSnapshotCount: 1,
          networkLogCount: 5,
          consoleLogCount: 3,
          hasTraceData: true,
          generationTime: 1500
        }
      };

      vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
      vi.mocked(reportGenerator.generateReport).mockResolvedValue(mockReportResult);

      const args = {
        sessionId: 'test-session-123',
        format: 'html',
        title: 'Test Report',
        includeScreenshots: true
      };

      const result = await reportGenerateTool.handler(args);

      // Debug the actual result
      if (result.isError) {
        console.log('Error result:', result.content[0].text);
      }

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.report.reportId).toBe('report-123');
      expect(response.report.format).toBe('html');
      expect(response.report.sizeFormatted).toBe('2.0 KB');
      expect(response.message).toContain('Report generated successfully');

      expect(sessionManager.getSession).toHaveBeenCalledWith('test-session-123');
      expect(reportGenerator.generateReport).toHaveBeenCalledWith(mockSession, {
        format: 'html',
        title: 'Test Report',
        description: undefined,
        template: undefined,
        includeScreenshots: true,
        includeDOMSnapshots: true,
        includeNetworkLogs: true,
        includeConsoleLogs: true,
        includeTraceData: true,
        maxScreenshots: undefined,
        maxNetworkLogs: undefined,
        maxConsoleLogs: undefined,
        customStyles: undefined
      });
      expect(mockSession.updateActivity).toHaveBeenCalled();
    });

    it('should generate PDF report successfully', async () => {
      const mockReportResult: ReportResult = {
        reportId: 'report-456',
        format: 'pdf',
        filePath: '/tmp/report-456.pdf-note.txt',
        size: 1024,
        timestamp: new Date(),
        metadata: {
          sessionId: 'test-session-123',
          screenshotCount: 1,
          domSnapshotCount: 1,
          networkLogCount: 0,
          consoleLogCount: 0,
          hasTraceData: false,
          generationTime: 800
        }
      };

      vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
      vi.mocked(reportGenerator.generateReport).mockResolvedValue(mockReportResult);

      const args = {
        sessionId: 'test-session-123',
        format: 'pdf',
        includeNetworkLogs: false,
        includeConsoleLogs: false
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.report.format).toBe('pdf');
    });

    it('should generate JSON report with custom options', async () => {
      const mockReportResult: ReportResult = {
        reportId: 'report-789',
        format: 'json',
        filePath: '/tmp/report-789.json',
        size: 5120,
        timestamp: new Date(),
        metadata: {
          sessionId: 'test-session-123',
          screenshotCount: 0,
          domSnapshotCount: 0,
          networkLogCount: 10,
          consoleLogCount: 5,
          hasTraceData: false,
          generationTime: 300
        }
      };

      vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
      vi.mocked(reportGenerator.generateReport).mockResolvedValue(mockReportResult);

      const args = {
        sessionId: 'test-session-123',
        format: 'json',
        includeScreenshots: false,
        includeDOMSnapshots: false,
        maxNetworkLogs: 10,
        maxConsoleLogs: 5,
        customStyles: 'body { color: red; }'
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.report.format).toBe('json');

      expect(reportGenerator.generateReport).toHaveBeenCalledWith(mockSession, {
        format: 'json',
        title: undefined,
        description: undefined,
        template: undefined,
        includeScreenshots: false,
        includeDOMSnapshots: false,
        includeNetworkLogs: true,
        includeConsoleLogs: true,
        includeTraceData: true,
        maxScreenshots: undefined,
        maxNetworkLogs: 10,
        maxConsoleLogs: 5,
        customStyles: 'body { color: red; }'
      });
    });

    it('should return error for missing sessionId', async () => {
      const args = {
        format: 'html'
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('sessionId is required');
    });

    it('should return error for invalid sessionId type', async () => {
      const args = {
        sessionId: 123,
        format: 'html'
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('sessionId is required and must be a string');
    });

    it('should return error for non-existent session', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(null);

      const args = {
        sessionId: 'non-existent-session',
        format: 'html'
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Session \'non-existent-session\' not found');
    });

    it('should return error when report generation fails', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
      vi.mocked(reportGenerator.generateReport).mockRejectedValue(new Error('Report generation failed'));

      const args = {
        sessionId: 'test-session-123',
        format: 'html'
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Report generation failed');
    });

    it('should use default values for optional parameters', async () => {
      const mockReportResult: ReportResult = {
        reportId: 'report-default',
        format: 'html',
        filePath: '/tmp/report-default.html',
        size: 1024,
        timestamp: new Date(),
        metadata: {
          sessionId: 'test-session-123',
          screenshotCount: 1,
          domSnapshotCount: 1,
          networkLogCount: 1,
          consoleLogCount: 1,
          hasTraceData: false,
          generationTime: 500
        }
      };

      vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
      vi.mocked(reportGenerator.generateReport).mockResolvedValue(mockReportResult);

      const args = {
        sessionId: 'test-session-123'
      };

      const result = await reportGenerateTool.handler(args);

      expect(result.isError).toBe(false);
      expect(reportGenerator.generateReport).toHaveBeenCalledWith(mockSession, {
        format: 'html',
        title: undefined,
        description: undefined,
        template: undefined,
        includeScreenshots: true,
        includeDOMSnapshots: true,
        includeNetworkLogs: true,
        includeConsoleLogs: true,
        includeTraceData: true,
        maxScreenshots: undefined,
        maxNetworkLogs: undefined,
        maxConsoleLogs: undefined,
        customStyles: undefined
      });
    });
  });

  describe('browser.report.templates', () => {
    let templatesListTool: any;

    beforeEach(() => {
      templatesListTool = createReportTemplatesListTool(reportGenerator);
    });

    it('should have correct tool definition', () => {
      expect(templatesListTool.name).toBe('browser.report.templates');
      expect(templatesListTool.description).toContain('available report templates');
      expect(templatesListTool.inputSchema.type).toBe('object');
    });

    it('should list available templates successfully', async () => {
      const mockTemplates = ['default', 'minimal', 'detailed'];
      vi.mocked(reportGenerator.getAvailableTemplates).mockReturnValue(mockTemplates);

      const result = await templatesListTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.templates).toEqual(mockTemplates);
      expect(response.totalTemplates).toBe(3);
      expect(response.message).toContain('Found 3 available report templates');
    });

    it('should handle empty template list', async () => {
      vi.mocked(reportGenerator.getAvailableTemplates).mockReturnValue([]);

      const result = await templatesListTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.templates).toEqual([]);
      expect(response.totalTemplates).toBe(0);
    });

    it('should handle errors when listing templates', async () => {
      vi.mocked(reportGenerator.getAvailableTemplates).mockImplementation(() => {
        throw new Error('Template listing failed');
      });

      const result = await templatesListTool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Template listing failed');
    });
  });

  describe('browser.report.cleanup', () => {
    let cleanupTool: any;

    beforeEach(() => {
      cleanupTool = createReportCleanupTool(reportGenerator);
    });

    it('should have correct tool definition', () => {
      expect(cleanupTool.name).toBe('browser.report.cleanup');
      expect(cleanupTool.description).toContain('Clean up old report files');
      expect(cleanupTool.inputSchema.type).toBe('object');
    });

    it('should cleanup reports successfully with default maxAge', async () => {
      vi.mocked(reportGenerator.cleanup).mockResolvedValue(undefined);

      const result = await cleanupTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.maxAge).toBe(24 * 60 * 60 * 1000); // 24 hours
      expect(response.message).toContain('Report cleanup completed');

      expect(reportGenerator.cleanup).toHaveBeenCalledWith(undefined);
    });

    it('should cleanup reports successfully with custom maxAge', async () => {
      vi.mocked(reportGenerator.cleanup).mockResolvedValue(undefined);

      const args = {
        maxAge: 7200000 // 2 hours
      };

      const result = await cleanupTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.maxAge).toBe(7200000);

      expect(reportGenerator.cleanup).toHaveBeenCalledWith(7200000);
    });

    it('should handle cleanup errors', async () => {
      vi.mocked(reportGenerator.cleanup).mockRejectedValue(new Error('Cleanup failed'));

      const result = await cleanupTool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Cleanup failed');
    });

    it('should include cleanup time in response', async () => {
      vi.mocked(reportGenerator.cleanup).mockImplementation(async () => {
        // Simulate some cleanup time
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const result = await cleanupTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(typeof response.cleanupTime).toBe('number');
      expect(response.cleanupTime).toBeGreaterThan(0);
    });
  });
});