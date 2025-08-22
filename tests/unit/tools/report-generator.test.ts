import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReportGenerator } from '../../../src/tools/report-generator.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';
import type { ReportOptions, ReportGeneratorConfig } from '../../../src/types/report-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('path');
vi.mock('os');

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);
const mockOs = vi.mocked(os);

describe('ReportGenerator', () => {
  let reportGenerator: ReportGenerator;
  let mockSession: BrowserSession;
  let tempDir: string;

  beforeEach(() => {
    tempDir = '/tmp/test-reports';
    
    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockOs.tmpdir.mockReturnValue('/tmp');
    
    // Setup fs mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1024 } as any);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.rmdir.mockResolvedValue(undefined);
    mockFs.copyFile.mockResolvedValue(undefined);

    const config: ReportGeneratorConfig = {
      outputDir: tempDir,
      tempDir: tempDir + '/temp'
    };

    reportGenerator = new ReportGenerator(config);

    // Mock browser session
    mockSession = {
      id: 'test-session-123',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      lastActivity: new Date('2024-01-01T10:30:00Z'),
      allowedDomains: new Set(['example.com']),
      options: {
        viewport: { width: 1280, height: 720 },
        userAgent: 'Test User Agent'
      },
      page: {
        url: vi.fn().mockReturnValue('https://example.com/test'),
        title: vi.fn().mockResolvedValue('Test Page'),
        viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 }),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-screenshot-data')),
        evaluate: vi.fn().mockResolvedValue({
          snapshot: { nodeType: 1, nodeName: 'HTML' },
          metadata: {
            totalNodes: 100,
            maxNodes: 5000,
            truncated: false,
            url: 'https://example.com/test',
            title: 'Test Page',
            selector: null,
            timestamp: '2024-01-01T10:30:00Z',
            snapshotTime: 50,
            includeStyles: false,
            includeAttributes: true
          }
        })
      },
      getRecentNetworkLogs: vi.fn().mockReturnValue([
        {
          timestamp: new Date('2024-01-01T10:15:00Z'),
          method: 'GET',
          url: 'https://example.com/api/data',
          status: 200,
          requestHeaders: { 'Accept': 'application/json' },
          responseHeaders: { 'Content-Type': 'application/json' },
          duration: 150
        }
      ]),
      getRecentConsoleLogs: vi.fn().mockReturnValue([
        {
          timestamp: new Date('2024-01-01T10:20:00Z'),
          level: 'info' as const,
          message: 'Test console message',
          location: {
            url: 'https://example.com/test',
            lineNumber: 42,
            columnNumber: 10
          }
        }
      ]),
      getTraceData: vi.fn().mockReturnValue({
        sessionId: 'test-session-123',
        startTime: new Date('2024-01-01T10:10:00Z'),
        endTime: new Date('2024-01-01T10:25:00Z'),
        traceFile: '/tmp/trace.zip',
        isActive: false,
        metadata: {}
      }),
      updateActivity: vi.fn()
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateReport', () => {
    it('should generate HTML report successfully', async () => {
      const options: ReportOptions = {
        format: 'html',
        title: 'Test Report',
        description: 'Test report description'
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result).toMatchObject({
        format: 'html',
        size: 1024,
        metadata: {
          sessionId: 'test-session-123',
          screenshotCount: 1,
          domSnapshotCount: 1,
          networkLogCount: 1,
          consoleLogCount: 1,
          hasTraceData: true
        }
      });

      expect(result.reportId).toMatch(/^report-\d+-[a-z0-9]+$/);
      expect(result.filePath).toContain('.html');
      expect(mockFs.mkdir).toHaveBeenCalledWith(tempDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should generate JSON report successfully', async () => {
      const options: ReportOptions = {
        format: 'json',
        includeScreenshots: true,
        includeNetworkLogs: true
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result.format).toBe('json');
      expect(result.filePath).toContain('.json');
      expect(mockFs.writeFile).toHaveBeenCalled();
      
      // Verify JSON content was written
      const writeCall = mockFs.writeFile.mock.calls.find(call => 
        call[0].toString().endsWith('.json')
      );
      expect(writeCall).toBeDefined();
      expect(writeCall![2]).toBe('utf8');
    });

    it('should generate PDF report (placeholder implementation)', async () => {
      const options: ReportOptions = {
        format: 'pdf',
        title: 'PDF Test Report'
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result.format).toBe('pdf');
      expect(result.filePath).toContain('.pdf-note.txt');
      expect(mockFs.copyFile).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.pdf-note.txt'),
        expect.stringContaining('PDF generation requires additional setup'),
        'utf8'
      );
    });

    it('should respect include options', async () => {
      const options: ReportOptions = {
        format: 'html',
        includeScreenshots: false,
        includeDOMSnapshots: false,
        includeNetworkLogs: false,
        includeConsoleLogs: false,
        includeTraceData: false
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result.metadata.screenshotCount).toBe(0);
      expect(result.metadata.domSnapshotCount).toBe(0);
      expect(result.metadata.networkLogCount).toBe(0);
      expect(result.metadata.consoleLogCount).toBe(0);
      expect(result.metadata.hasTraceData).toBe(false);
    });

    it('should respect max limits', async () => {
      // Setup session with more logs
      mockSession.getRecentNetworkLogs = vi.fn().mockReturnValue(
        Array(10).fill(null).map((_, i) => ({
          timestamp: new Date(),
          method: 'GET',
          url: `https://example.com/api/${i}`,
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          duration: 100
        }))
      );

      const options: ReportOptions = {
        format: 'html',
        maxNetworkLogs: 5,
        maxConsoleLogs: 3
      };

      await reportGenerator.generateReport(mockSession, options);

      expect(mockSession.getRecentNetworkLogs).toHaveBeenCalledWith(5);
      expect(mockSession.getRecentConsoleLogs).toHaveBeenCalledWith(3);
    });

    it('should handle screenshot capture errors gracefully', async () => {
      mockSession.page.screenshot = vi.fn().mockRejectedValue(new Error('Screenshot failed'));

      const options: ReportOptions = {
        format: 'html',
        includeScreenshots: true
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result.metadata.screenshotCount).toBe(0);
      expect(mockSession.page.screenshot).toHaveBeenCalled();
    });

    it('should handle DOM snapshot errors gracefully', async () => {
      mockSession.page.evaluate = vi.fn().mockRejectedValue(new Error('DOM snapshot failed'));

      const options: ReportOptions = {
        format: 'html',
        includeDOMSnapshots: true
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result.metadata.domSnapshotCount).toBe(0);
      expect(mockSession.page.evaluate).toHaveBeenCalled();
    });

    it('should throw error for unsupported format', async () => {
      const options: ReportOptions = {
        format: 'xml' as any
      };

      await expect(reportGenerator.generateReport(mockSession, options))
        .rejects.toThrow('Unsupported report format: xml');
    });

    it('should handle file system errors', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      const options: ReportOptions = {
        format: 'html'
      };

      await expect(reportGenerator.generateReport(mockSession, options))
        .rejects.toThrow('Failed to generate report: Permission denied');
    });
  });

  describe('template management', () => {
    it('should have default template available', () => {
      const templates = reportGenerator.getAvailableTemplates();
      expect(templates).toContain('default');
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should allow adding custom templates', () => {
      const customTemplate = {
        name: 'custom',
        description: 'Custom template',
        htmlTemplate: '<html><body>{{title}}</body></html>',
        cssStyles: 'body { color: red; }',
        supportedFormats: ['html' as const]
      };

      reportGenerator.addTemplate(customTemplate);

      const templates = reportGenerator.getAvailableTemplates();
      expect(templates).toContain('custom');
    });
  });

  describe('cleanup', () => {
    it('should clean up old files', async () => {
      const oldTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const recentTime = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago

      mockFs.readdir
        .mockResolvedValueOnce(['old-report.html', 'recent-report.html'] as any)
        .mockResolvedValueOnce(['old-temp.tmp', 'recent-temp.tmp'] as any);
      
      mockFs.stat
        .mockResolvedValueOnce({ mtime: new Date(oldTime) } as any)
        .mockResolvedValueOnce({ mtime: new Date(recentTime) } as any)
        .mockResolvedValueOnce({ mtime: new Date(oldTime) } as any)
        .mockResolvedValueOnce({ mtime: new Date(recentTime) } as any);

      await reportGenerator.cleanup(24 * 60 * 60 * 1000); // 24 hours

      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('old-report.html'));
      expect(mockFs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('recent-report.html'));
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      // Should not throw
      await expect(reportGenerator.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('HTML template rendering', () => {
    it('should replace template variables correctly', async () => {
      const options: ReportOptions = {
        format: 'html',
        title: 'Custom Title',
        description: 'Custom Description'
      };

      await reportGenerator.generateReport(mockSession, options);

      const writeCall = mockFs.writeFile.mock.calls.find(call => 
        call[0].toString().endsWith('.html')
      );
      
      expect(writeCall).toBeDefined();
      const htmlContent = writeCall![1] as string;
      
      expect(htmlContent).toContain('Custom Title');
      expect(htmlContent).toContain('Custom Description');
      expect(htmlContent).toContain('test-session-123');
      expect(htmlContent).toContain('https://example.com/test');
    });

    it('should include custom styles when provided', async () => {
      const options: ReportOptions = {
        format: 'html',
        customStyles: 'body { background: blue; }'
      };

      await reportGenerator.generateReport(mockSession, options);

      const writeCall = mockFs.writeFile.mock.calls.find(call => 
        call[0].toString().endsWith('.html')
      );
      
      expect(writeCall).toBeDefined();
      const htmlContent = writeCall![1] as string;
      
      expect(htmlContent).toContain('body { background: blue; }');
    });
  });

  describe('data collection', () => {
    it('should collect session metadata correctly', async () => {
      const options: ReportOptions = { format: 'json' };

      await reportGenerator.generateReport(mockSession, options);

      expect(mockSession.page.url).toHaveBeenCalled();
      expect(mockSession.page.title).toHaveBeenCalled();
      expect(mockSession.page.viewportSize).toHaveBeenCalled();
    });

    it('should handle missing trace data', async () => {
      mockSession.getTraceData = vi.fn().mockReturnValue(null);

      const options: ReportOptions = {
        format: 'html',
        includeTraceData: true
      };

      const result = await reportGenerator.generateReport(mockSession, options);

      expect(result.metadata.hasTraceData).toBe(false);
    });
  });
});