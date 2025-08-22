import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/browser/session-manager.js';
import { ReportGenerator } from '../../src/tools/report-generator.js';
import { createReportGenerateTool, createReportTemplatesListTool, createReportCleanupTool } from '../../src/tools/report-tools.js';
import type { ReportOptions } from '../../src/types/report-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Report Tools Integration', () => {
  let sessionManager: SessionManager;
  let reportGenerator: ReportGenerator;
  let tempDir: string;
  let sessionId: string;

  beforeEach(async () => {
    // Create temporary directory for reports
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-test-'));
    
    // Initialize session manager
    sessionManager = new SessionManager({
      maxSessions: 5,
      sessionTimeout: 30000,
      cleanupInterval: 5000
    });
    await sessionManager.initialize();

    // Initialize report generator with temp directory
    reportGenerator = new ReportGenerator({
      outputDir: path.join(tempDir, 'reports'),
      tempDir: path.join(tempDir, 'temp')
    });

    // Create a test session
    const session = await sessionManager.createSession({
      viewport: { width: 1280, height: 720 },
      headless: true
    });
    sessionId = session.id;

    // Navigate to a test page to have some data
    await session.page.goto('data:text/html,<html><head><title>Test Page</title></head><body><h1>Hello World</h1><p>Test content</p></body></html>');
    
    // Add some console logs
    await session.page.evaluate(() => {
      console.log('Test log message');
      console.warn('Test warning message');
      console.error('Test error message');
    });

    // Wait a bit for logs to be captured
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up sessions
    await sessionManager.cleanup();

    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('browser.report.generate integration', () => {
    it('should generate HTML report with real session data', async () => {
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);

      const args = {
        sessionId: sessionId,
        format: 'html',
        title: 'Integration Test Report',
        description: 'Test report generated during integration testing',
        includeScreenshots: true,
        includeDOMSnapshots: true,
        includeNetworkLogs: true,
        includeConsoleLogs: true
      };

      const result = await reportTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.report.format).toBe('html');
      expect(response.report.filePath).toContain('.html');
      expect(response.report.metadata.sessionId).toBe(sessionId);
      expect(response.report.metadata.screenshotCount).toBeGreaterThan(0);
      expect(response.report.metadata.domSnapshotCount).toBeGreaterThan(0);
      expect(response.report.metadata.consoleLogCount).toBeGreaterThan(0);

      // Verify the file was actually created
      const fileExists = await fs.access(response.report.filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify the file contains expected content
      const fileContent = await fs.readFile(response.report.filePath, 'utf8');
      expect(fileContent).toContain('Integration Test Report');
      expect(fileContent).toContain('Test report generated during integration testing');
      expect(fileContent).toContain(sessionId);
      expect(fileContent).toContain('Test Page');
      expect(fileContent).toContain('Hello World');
    });

    it('should generate JSON report with real session data', async () => {
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);

      const args = {
        sessionId: sessionId,
        format: 'json',
        includeScreenshots: true,
        includeConsoleLogs: true
      };

      const result = await reportTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.report.format).toBe('json');
      expect(response.report.filePath).toContain('.json');

      // Verify the file was created and contains valid JSON
      const fileContent = await fs.readFile(response.report.filePath, 'utf8');
      const reportData = JSON.parse(fileContent);
      
      expect(reportData.sessionId).toBe(sessionId);
      expect(reportData.sessionMetadata.title).toBe('Test Page');
      expect(reportData.screenshots).toHaveLength(1);
      expect(reportData.consoleLogs.length).toBeGreaterThan(0);
      
      // Verify screenshot data is base64 encoded
      expect(reportData.screenshots[0].data).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should handle session with network activity', async () => {
      // Make a network request to generate network logs
      await sessionManager.getSession(sessionId)!.page.goto('https://httpbin.org/json');
      
      // Wait for network activity to be logged
      await new Promise(resolve => setTimeout(resolve, 1000));

      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);

      const args = {
        sessionId: sessionId,
        format: 'html',
        includeNetworkLogs: true,
        maxNetworkLogs: 10
      };

      const result = await reportTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.report.metadata.networkLogCount).toBeGreaterThan(0);

      // Verify network logs are in the HTML
      const fileContent = await fs.readFile(response.report.filePath, 'utf8');
      expect(fileContent).toContain('Network Logs');
      expect(fileContent).toContain('httpbin.org');
    });

    it('should respect include/exclude options', async () => {
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);

      const args = {
        sessionId: sessionId,
        format: 'html',
        includeScreenshots: false,
        includeDOMSnapshots: false,
        includeNetworkLogs: false,
        includeConsoleLogs: true
      };

      const result = await reportTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.report.metadata.screenshotCount).toBe(0);
      expect(response.report.metadata.domSnapshotCount).toBe(0);
      expect(response.report.metadata.networkLogCount).toBe(0);
      expect(response.report.metadata.consoleLogCount).toBeGreaterThan(0);

      // Verify HTML content reflects the options
      const fileContent = await fs.readFile(response.report.filePath, 'utf8');
      expect(fileContent).not.toContain('Screenshots');
      expect(fileContent).not.toContain('DOM Snapshots');
      expect(fileContent).not.toContain('Network Logs');
      expect(fileContent).toContain('Console Logs');
    });

    it('should handle custom styles', async () => {
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);

      const customStyles = 'body { background-color: #f0f0f0; } .custom { color: red; }';

      const args = {
        sessionId: sessionId,
        format: 'html',
        customStyles: customStyles
      };

      const result = await reportTool.handler(args);

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);

      // Verify custom styles are included
      const fileContent = await fs.readFile(response.report.filePath, 'utf8');
      expect(fileContent).toContain(customStyles);
    });

    it('should handle non-existent session gracefully', async () => {
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);

      const args = {
        sessionId: 'non-existent-session',
        format: 'html'
      };

      const result = await reportTool.handler(args);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('not found or has expired');
    });
  });

  describe('browser.report.templates integration', () => {
    it('should list available templates', async () => {
      const templatesTool = createReportTemplatesListTool(reportGenerator);

      const result = await templatesTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.templates).toContain('default');
      expect(response.totalTemplates).toBeGreaterThan(0);
    });

    it('should work with custom templates', async () => {
      // Add a custom template
      const customTemplate = {
        name: 'integration-test',
        description: 'Integration test template',
        htmlTemplate: '<html><body><h1>{{title}}</h1><p>{{description}}</p>{{sections}}</body></html>',
        cssStyles: 'body { font-family: Arial; }',
        supportedFormats: ['html' as const]
      };

      reportGenerator.addTemplate(customTemplate);

      const templatesTool = createReportTemplatesListTool(reportGenerator);
      const result = await templatesTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.templates).toContain('integration-test');

      // Test using the custom template
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);
      const reportArgs = {
        sessionId: sessionId,
        format: 'html',
        template: 'integration-test',
        title: 'Custom Template Test'
      };

      const reportResult = await reportTool.handler(reportArgs);
      expect(reportResult.isError).toBe(false);

      const reportResponse = JSON.parse(reportResult.content[0].text);
      const fileContent = await fs.readFile(reportResponse.report.filePath, 'utf8');
      expect(fileContent).toContain('Custom Template Test');
      expect(fileContent).toContain('font-family: Arial');
    });
  });

  describe('browser.report.cleanup integration', () => {
    it('should cleanup old report files', async () => {
      // Generate a few reports first
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);
      
      const report1 = await reportTool.handler({
        sessionId: sessionId,
        format: 'html',
        title: 'Report 1'
      });
      
      const report2 = await reportTool.handler({
        sessionId: sessionId,
        format: 'json',
        title: 'Report 2'
      });

      expect(report1.isError).toBe(false);
      expect(report2.isError).toBe(false);

      const response1 = JSON.parse(report1.content[0].text);
      const response2 = JSON.parse(report2.content[0].text);

      // Verify files exist
      const file1Exists = await fs.access(response1.report.filePath).then(() => true).catch(() => false);
      const file2Exists = await fs.access(response2.report.filePath).then(() => true).catch(() => false);
      expect(file1Exists).toBe(true);
      expect(file2Exists).toBe(true);

      // Run cleanup with very short maxAge (should clean up all files)
      const cleanupTool = createReportCleanupTool(reportGenerator);
      const cleanupResult = await cleanupTool.handler({
        maxAge: 1 // 1ms - should clean up everything
      });

      expect(cleanupResult.isError).toBe(false);
      const cleanupResponse = JSON.parse(cleanupResult.content[0].text);
      expect(cleanupResponse.success).toBe(true);

      // Wait a bit for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Files should still exist because they were just created
      // (cleanup only removes files older than maxAge)
      const file1ExistsAfter = await fs.access(response1.report.filePath).then(() => true).catch(() => false);
      const file2ExistsAfter = await fs.access(response2.report.filePath).then(() => true).catch(() => false);
      expect(file1ExistsAfter).toBe(true);
      expect(file2ExistsAfter).toBe(true);
    });

    it('should handle cleanup with default maxAge', async () => {
      const cleanupTool = createReportCleanupTool(reportGenerator);
      const result = await cleanupTool.handler({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.maxAge).toBe(24 * 60 * 60 * 1000); // 24 hours
      expect(typeof response.cleanupTime).toBe('number');
    });
  });

  describe('end-to-end report workflow', () => {
    it('should complete full report generation workflow', async () => {
      // 1. Navigate to a more complex page
      await sessionManager.getSession(sessionId)!.page.goto('data:text/html,<html><head><title>Complex Test Page</title></head><body><h1>Main Title</h1><div id="content"><p>Paragraph 1</p><p>Paragraph 2</p></div><script>console.log("Page loaded"); console.warn("Test warning");</script></body></html>');
      
      // Wait for page to load and scripts to execute
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. List available templates
      const templatesTool = createReportTemplatesListTool(reportGenerator);
      const templatesResult = await templatesTool.handler({});
      expect(templatesResult.isError).toBe(false);

      // 3. Generate comprehensive report
      const reportTool = createReportGenerateTool(sessionManager, reportGenerator);
      const reportResult = await reportTool.handler({
        sessionId: sessionId,
        format: 'html',
        title: 'End-to-End Test Report',
        description: 'Comprehensive report testing all features',
        includeScreenshots: true,
        includeDOMSnapshots: true,
        includeNetworkLogs: true,
        includeConsoleLogs: true,
        maxConsoleLogs: 50
      });

      expect(reportResult.isError).toBe(false);
      const reportResponse = JSON.parse(reportResult.content[0].text);
      
      expect(reportResponse.success).toBe(true);
      expect(reportResponse.report.metadata.screenshotCount).toBeGreaterThan(0);
      expect(reportResponse.report.metadata.domSnapshotCount).toBeGreaterThan(0);
      expect(reportResponse.report.metadata.consoleLogCount).toBeGreaterThan(0);

      // 4. Verify report content
      const fileContent = await fs.readFile(reportResponse.report.filePath, 'utf8');
      expect(fileContent).toContain('End-to-End Test Report');
      expect(fileContent).toContain('Complex Test Page');
      expect(fileContent).toContain('Main Title');
      expect(fileContent).toContain('Console Logs');
      expect(fileContent).toContain('Page loaded');
      expect(fileContent).toContain('Test warning');

      // 5. Generate JSON version of the same report
      const jsonReportResult = await reportTool.handler({
        sessionId: sessionId,
        format: 'json',
        includeScreenshots: true,
        includeConsoleLogs: true
      });

      expect(jsonReportResult.isError).toBe(false);
      const jsonResponse = JSON.parse(jsonReportResult.content[0].text);
      
      // 6. Verify JSON report structure
      const jsonContent = await fs.readFile(jsonResponse.report.filePath, 'utf8');
      const jsonData = JSON.parse(jsonContent);
      
      expect(jsonData.sessionId).toBe(sessionId);
      expect(jsonData.sessionMetadata.title).toBe('Complex Test Page');
      expect(jsonData.screenshots).toHaveLength(1);
      expect(jsonData.consoleLogs.length).toBeGreaterThan(0);
      expect(jsonData.domSnapshots).toHaveLength(1);

      // 7. Clean up reports
      const cleanupTool = createReportCleanupTool(reportGenerator);
      const cleanupResult = await cleanupTool.handler({});
      expect(cleanupResult.isError).toBe(false);
    });
  });
});