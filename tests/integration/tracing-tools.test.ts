import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, BrowserContext } from 'playwright';
import { SessionManager } from '../../src/browser/session-manager.js';
import { createTraceStartTool, createTraceStopTool, createHarExportTool } from '../../src/tools/tracing-tools.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Tracing Tools Integration', () => {
  let browser: Browser;
  let sessionManager: SessionManager;
  let sessionId: string;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    sessionManager = new SessionManager({
      maxSessions: 5,
      sessionTimeout: 30000,
      cleanupInterval: 5000
    });
    await sessionManager.initialize();

    // Create a test session
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    
    const session = await sessionManager.createSession({
      viewport: { width: 1280, height: 720 },
      headless: true
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    await sessionManager.shutdown();
    await browser.close();

    // Clean up trace files
    try {
      const tracesDir = path.join(process.cwd(), 'traces');
      await fs.rm(tracesDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('browser.trace.start and browser.trace.stop', () => {
    it('should start and stop tracing successfully', async () => {
      const startTool = createTraceStartTool(sessionManager);
      const stopTool = createTraceStopTool(sessionManager);

      // Start tracing
      const startResult = await startTool.handler({
        sessionId: sessionId,
        screenshots: true,
        snapshots: true,
        sources: false
      });

      expect(startResult.isError).toBe(false);
      const startResponse = JSON.parse(startResult.content[0].text);
      expect(startResponse.success).toBe(true);
      expect(startResponse.sessionId).toBe(sessionId);

      // Verify session is tracing
      const session = sessionManager.getSession(sessionId);
      expect(session?.isTracing()).toBe(true);

      // Perform some browser activity to generate trace data
      const page = session?.page;
      if (page) {
        await page.goto('data:text/html,<html><body><h1>Test Page</h1></body></html>');
        await page.waitForTimeout(100); // Small delay to generate some trace data
      }

      // Stop tracing
      const stopResult = await stopTool.handler({
        sessionId: sessionId
      });

      expect(stopResult.isError).toBe(false);
      const stopResponse = JSON.parse(stopResult.content[0].text);
      expect(stopResponse.success).toBe(true);
      expect(stopResponse.sessionId).toBe(sessionId);
      expect(stopResponse.traceData.traceFile).toBeDefined();
      expect(stopResponse.traceData.startTime).toBeDefined();
      expect(stopResponse.traceData.endTime).toBeDefined();
      expect(stopResponse.traceData.duration).toBeGreaterThan(0);

      // Verify trace file exists
      const traceFile = stopResponse.traceData.traceFile;
      const stats = await fs.stat(traceFile);
      expect(stats.size).toBeGreaterThan(0);

      // Verify session is no longer tracing
      expect(session?.isTracing()).toBe(false);
    });

    it('should handle starting trace when already active', async () => {
      const startTool = createTraceStartTool(sessionManager);

      // Start tracing first time
      await startTool.handler({
        sessionId: sessionId,
        screenshots: true
      });

      // Try to start tracing again
      const result = await startTool.handler({
        sessionId: sessionId,
        screenshots: true
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('already active');
    });

    it('should handle stopping trace when not active', async () => {
      const stopTool = createTraceStopTool(sessionManager);

      const result = await stopTool.handler({
        sessionId: sessionId
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('No active trace');
    });
  });

  describe('browser.harExport', () => {
    it('should export HAR data with network activity', async () => {
      const harTool = createHarExportTool(sessionManager);
      const session = sessionManager.getSession(sessionId);
      
      if (session?.page) {
        // Generate some network activity
        await session.page.goto('data:text/html,<html><body><h1>Test</h1><script>fetch("data:text/plain,test")</script></body></html>');
        await session.page.waitForTimeout(500); // Wait for network activity
      }

      const result = await harTool.handler({
        sessionId: sessionId,
        includeContent: true,
        maxEntries: 100
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBe(sessionId);
      expect(response.harData).toBeDefined();
      expect(response.harData.log).toBeDefined();
      expect(response.harData.log.version).toBe('1.2');
      expect(response.harData.log.creator.name).toBe('AI Browser MCP Server');
      expect(response.harData.log.entries).toBeInstanceOf(Array);
      expect(response.entriesCount).toBeGreaterThanOrEqual(0);
    });

    it('should save HAR file when outputPath is provided', async () => {
      const harTool = createHarExportTool(sessionManager);
      const session = sessionManager.getSession(sessionId);
      
      if (session?.page) {
        await session.page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
        await session.page.waitForTimeout(100);
      }

      const outputPath = 'test-export.har';
      const result = await harTool.handler({
        sessionId: sessionId,
        includeContent: false,
        outputPath: outputPath
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.filePath).toContain(outputPath);

      // Verify file was created
      const filePath = response.filePath;
      const stats = await fs.stat(filePath);
      expect(stats.size).toBeGreaterThan(0);

      // Verify file content is valid JSON
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const harData = JSON.parse(fileContent);
      expect(harData.log).toBeDefined();
      expect(harData.log.version).toBe('1.2');
    });

    it('should handle different content inclusion options', async () => {
      const harTool = createHarExportTool(sessionManager);
      const session = sessionManager.getSession(sessionId);
      
      if (session?.page) {
        await session.page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
        await session.page.waitForTimeout(100);
      }

      // Test with content included
      const resultWithContent = await harTool.handler({
        sessionId: sessionId,
        includeContent: true
      });

      expect(resultWithContent.isError).toBe(false);
      const responseWithContent = JSON.parse(resultWithContent.content[0].text);
      
      // Test without content
      const resultWithoutContent = await harTool.handler({
        sessionId: sessionId,
        includeContent: false
      });

      expect(resultWithoutContent.isError).toBe(false);
      const responseWithoutContent = JSON.parse(resultWithoutContent.content[0].text);
      
      // Both should succeed
      expect(responseWithContent.success).toBe(true);
      expect(responseWithoutContent.success).toBe(true);
    });

    it('should respect maxEntries parameter', async () => {
      const harTool = createHarExportTool(sessionManager);
      const session = sessionManager.getSession(sessionId);
      
      if (session?.page) {
        // Generate multiple network requests
        await session.page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
        await session.page.evaluate(() => {
          for (let i = 0; i < 5; i++) {
            fetch(`data:text/plain,request-${i}`);
          }
        });
        await session.page.waitForTimeout(500);
      }

      const result = await harTool.handler({
        sessionId: sessionId,
        maxEntries: 2
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      
      // Should respect the limit (though actual count may vary based on browser behavior)
      expect(response.entriesCount).toBeLessThanOrEqual(2);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid session IDs', async () => {
      const startTool = createTraceStartTool(sessionManager);
      
      const result = await startTool.handler({
        sessionId: 'invalid-session-id'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle missing required parameters', async () => {
      const startTool = createTraceStartTool(sessionManager);
      
      const result = await startTool.handler({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('sessionId is required');
    });
  });
});