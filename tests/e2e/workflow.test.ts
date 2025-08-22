// End-to-end workflow tests
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MCPBrowserServer } from '../../src/server/mcp-browser-server.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { SecurityManager } from '../../src/security/security-manager.js';
import { PerformanceManager } from '../../src/performance/performance-manager.js';
import { chromium, type Browser } from 'playwright';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

describe('E2E Complete Workflow Tests', () => {
  let server: MCPBrowserServer;
  let browser: Browser;
  let sessionManager: SessionManager;
  let securityManager: SecurityManager;
  let performanceManager: PerformanceManager;

  beforeAll(async () => {
    // Initialize browser
    browser = await chromium.launch({ headless: true });
    
    // Initialize managers
    sessionManager = new SessionManager({
      maxSessions: 10,
      sessionTimeout: 300000, // 5 minutes
      cleanupInterval: 60000
    });
    
    securityManager = new SecurityManager({
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerHour: 1000
      }
    });
    
    performanceManager = new PerformanceManager({
      contextPool: { minPoolSize: 2, maxPoolSize: 8 },
      memoryLimits: { maxSessionMemoryMB: 256, maxTotalMemoryMB: 1024 },
      diskManager: { maxTotalSizeMB: 100 }
    });

    await sessionManager.initialize();
    await performanceManager.initialize(browser);
    
    // Initialize server with all tools
    server = new MCPBrowserServer();
    await server.initializeWithManagers(sessionManager, securityManager, performanceManager);
  });

  afterAll(async () => {
    if (server?.isServerRunning()) {
      await server.stop();
    }
    await sessionManager?.shutdown();
    await performanceManager?.shutdown();
    await browser?.close();
  });

  beforeEach(async () => {
    // Clean up any existing sessions
    await sessionManager.destroyAllSessions();
  });

  afterEach(async () => {
    // Clean up sessions after each test
    await sessionManager.destroyAllSessions();
  });

  describe('Complete Web Automation Workflow', () => {
    it('should execute a complete web scraping workflow', async () => {
      // Step 1: Create browser context
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({
        viewport: { width: 1280, height: 720 },
        userAgent: 'E2E Test Browser'
      });
      
      expect(contextResult.isError).toBeFalsy();
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      // Step 2: Navigate to test page
      const gotoTool = server.getTool('browser.goto');
      const gotoResult = await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/html',
        waitUntil: 'domcontentloaded'
      });
      
      expect(gotoResult.isError).toBeFalsy();
      const gotoResponse = JSON.parse(gotoResult.content[0].text);
      expect(gotoResponse.success).toBe(true);

      // Step 3: Take screenshot
      const screenshotTool = server.getTool('browser.screenshot');
      const screenshotResult = await screenshotTool.handler({
        sessionId,
        fullPage: true
      });
      
      expect(screenshotResult.isError).toBeFalsy();
      const screenshotResponse = JSON.parse(screenshotResult.content[0].text);
      expect(screenshotResponse.success).toBe(true);
      expect(screenshotResponse.path).toBeDefined();

      // Step 4: Extract DOM content
      const domSnapshotTool = server.getTool('browser.domSnapshot');
      const domResult = await domSnapshotTool.handler({
        sessionId,
        maxNodes: 1000
      });
      
      expect(domResult.isError).toBeFalsy();
      const domResponse = JSON.parse(domResult.content[0].text);
      expect(domResponse.success).toBe(true);
      expect(domResponse.snapshot).toBeDefined();

      // Step 5: Execute JavaScript to extract data
      const evalTool = server.getTool('browser.eval');
      const evalResult = await evalTool.handler({
        sessionId,
        code: 'document.title'
      });
      
      expect(evalResult.isError).toBeFalsy();
      const evalResponse = JSON.parse(evalResult.content[0].text);
      expect(evalResponse.success).toBe(true);
      expect(evalResponse.result).toContain('Herman Melville');

      // Step 6: Get network logs
      const networkTool = server.getTool('browser.network.getRecent');
      const networkResult = await networkTool.handler({
        sessionId,
        limit: 10
      });
      
      expect(networkResult.isError).toBeFalsy();
      const networkResponse = JSON.parse(networkResult.content[0].text);
      expect(networkResponse.success).toBe(true);
      expect(networkResponse.logs).toBeDefined();

      // Step 7: Generate report
      const reportTool = server.getTool('browser.report.generate');
      const reportResult = await reportTool.handler({
        sessionId,
        format: 'html',
        includeScreenshots: true,
        includeLogs: true
      });
      
      expect(reportResult.isError).toBeFalsy();
      const reportResponse = JSON.parse(reportResult.content[0].text);
      expect(reportResponse.success).toBe(true);
      expect(reportResponse.reportPath).toBeDefined();

      // Verify report file exists
      expect(existsSync(reportResponse.reportPath)).toBe(true);
    });

    it('should handle form interaction workflow', async () => {
      // Create session and navigate to form page
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/forms/post'
      });

      // Fill out form fields
      const typeTool = server.getTool('browser.type');
      await typeTool.handler({
        sessionId,
        selector: 'input[name="custname"]',
        text: 'John Doe'
      });

      await typeTool.handler({
        sessionId,
        selector: 'input[name="custtel"]',
        text: '555-1234'
      });

      await typeTool.handler({
        sessionId,
        selector: 'input[name="custemail"]',
        text: 'john@example.com'
      });

      // Select dropdown option
      const selectTool = server.getTool('browser.select');
      await selectTool.handler({
        sessionId,
        selector: 'select[name="size"]',
        value: 'medium'
      });

      // Take screenshot before submission
      const screenshotTool = server.getTool('browser.screenshot');
      const beforeResult = await screenshotTool.handler({
        sessionId,
        selector: 'form'
      });
      expect(beforeResult.isError).toBeFalsy();

      // Submit form
      const clickTool = server.getTool('browser.click');
      const submitResult = await clickTool.handler({
        sessionId,
        selector: 'input[type="submit"]'
      });
      
      expect(submitResult.isError).toBeFalsy();

      // Verify form submission by checking URL or content
      const evalTool = server.getTool('browser.eval');
      const urlResult = await evalTool.handler({
        sessionId,
        code: 'window.location.href'
      });
      
      const urlResponse = JSON.parse(urlResult.content[0].text);
      expect(urlResponse.result).toContain('httpbin.org');
    });

    it('should handle macro recording and playback workflow', async () => {
      // Create session
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Start macro recording
      const startRecordingTool = server.getTool('browser.macro.startRecording');
      const recordingResult = await startRecordingTool.handler({
        sessionId,
        macroName: 'test-workflow'
      });
      
      expect(recordingResult.isError).toBeFalsy();
      const macroId = JSON.parse(recordingResult.content[0].text).macroId;

      // Perform actions that will be recorded
      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const clickTool = server.getTool('browser.click');
      await clickTool.handler({
        sessionId,
        selector: 'h1'
      });

      const evalTool = server.getTool('browser.eval');
      await evalTool.handler({
        sessionId,
        code: 'document.title'
      });

      // Stop recording
      const stopRecordingTool = server.getTool('browser.macro.stopRecording');
      const stopResult = await stopRecordingTool.handler({
        sessionId,
        macroId
      });
      
      expect(stopResult.isError).toBeFalsy();

      // Create new session for playback
      const newSessionResult = await newContextTool.handler({});
      const playbackSessionId = JSON.parse(newSessionResult.content[0].text).sessionId;

      // Play back the macro
      const playMacroTool = server.getTool('browser.macro.play');
      const playResult = await playMacroTool.handler({
        sessionId: playbackSessionId,
        macroId
      });
      
      expect(playResult.isError).toBeFalsy();
      const playResponse = JSON.parse(playResult.content[0].text);
      expect(playResponse.success).toBe(true);
      expect(playResponse.stepsExecuted).toBeGreaterThan(0);

      // Verify the macro executed correctly by checking final state
      const finalEvalResult = await evalTool.handler({
        sessionId: playbackSessionId,
        code: 'document.title'
      });
      
      const finalResponse = JSON.parse(finalEvalResult.content[0].text);
      expect(finalResponse.result).toContain('Example Domain');
    });

    it('should handle concurrent session workflow', async () => {
      const sessionCount = 5;
      const newContextTool = server.getTool('browser.newContext');
      const gotoTool = server.getTool('browser.goto');
      const screenshotTool = server.getTool('browser.screenshot');

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: sessionCount }, (_, i) =>
        newContextTool.handler({
          viewport: { width: 1280 + i * 100, height: 720 + i * 50 }
        })
      );

      const sessionResults = await Promise.all(sessionPromises);
      const sessionIds = sessionResults.map(result => 
        JSON.parse(result.content[0].text).sessionId
      );

      expect(sessionIds).toHaveLength(sessionCount);

      // Navigate each session to different pages concurrently
      const urls = [
        'https://example.com',
        'https://httpbin.org/html',
        'https://httpbin.org/json',
        'https://httpbin.org/xml',
        'https://httpbin.org/robots.txt'
      ];

      const navigationPromises = sessionIds.map((sessionId, i) =>
        gotoTool.handler({
          sessionId,
          url: urls[i]
        })
      );

      const navigationResults = await Promise.all(navigationPromises);
      navigationResults.forEach(result => {
        expect(result.isError).toBeFalsy();
      });

      // Take screenshots concurrently
      const screenshotPromises = sessionIds.map(sessionId =>
        screenshotTool.handler({ sessionId })
      );

      const screenshotResults = await Promise.all(screenshotPromises);
      screenshotResults.forEach(result => {
        expect(result.isError).toBeFalsy();
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      });

      // Verify all sessions are still active
      const stats = sessionManager.getStats();
      expect(stats.activeSessions).toBe(sessionCount);
    });

    it('should handle error recovery workflow', async () => {
      // Create session
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Test navigation to invalid URL
      const gotoTool = server.getTool('browser.goto');
      const invalidResult = await gotoTool.handler({
        sessionId,
        url: 'https://this-domain-does-not-exist-12345.com'
      });
      
      expect(invalidResult.isError).toBe(true);
      const errorResponse = JSON.parse(invalidResult.content[0].text);
      expect(errorResponse.error.isNetworkError).toBe(true);

      // Verify session is still functional after error
      const validResult = await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });
      
      expect(validResult.isError).toBeFalsy();

      // Test interaction with non-existent element
      const clickTool = server.getTool('browser.click');
      const clickResult = await clickTool.handler({
        sessionId,
        selector: '#non-existent-element'
      });
      
      expect(clickResult.isError).toBe(true);

      // Verify session is still functional
      const screenshotTool = server.getTool('browser.screenshot');
      const screenshotResult = await screenshotTool.handler({ sessionId });
      expect(screenshotResult.isError).toBeFalsy();

      // Test JavaScript execution error
      const evalTool = server.getTool('browser.eval');
      const jsErrorResult = await evalTool.handler({
        sessionId,
        code: 'throw new Error("Test error")'
      });
      
      expect(jsErrorResult.isError).toBe(true);

      // Verify session is still functional
      const validEvalResult = await evalTool.handler({
        sessionId,
        code: 'document.title'
      });
      
      expect(validEvalResult.isError).toBeFalsy();
    });

    it('should handle performance monitoring workflow', async () => {
      // Create session with performance monitoring
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Start tracing
      const traceStartTool = server.getTool('browser.trace.start');
      const traceResult = await traceStartTool.handler({
        sessionId,
        categories: ['devtools.timeline', 'blink.user_timing']
      });
      
      expect(traceResult.isError).toBeFalsy();

      // Perform operations to generate trace data
      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const evalTool = server.getTool('browser.eval');
      await evalTool.handler({
        sessionId,
        code: `
          // Simulate some work
          for (let i = 0; i < 1000; i++) {
            document.createElement('div');
          }
          performance.mark('test-mark');
        `
      });

      // Stop tracing
      const traceStopTool = server.getTool('browser.trace.stop');
      const stopResult = await traceStopTool.handler({ sessionId });
      
      expect(stopResult.isError).toBeFalsy();
      const stopResponse = JSON.parse(stopResult.content[0].text);
      expect(stopResponse.tracePath).toBeDefined();

      // Export HAR data
      const harExportTool = server.getTool('browser.harExport');
      const harResult = await harExportTool.handler({ sessionId });
      
      expect(harResult.isError).toBeFalsy();
      const harResponse = JSON.parse(harResult.content[0].text);
      expect(harResponse.harPath).toBeDefined();

      // Verify files exist
      expect(existsSync(stopResponse.tracePath)).toBe(true);
      expect(existsSync(harResponse.harPath)).toBe(true);

      // Check performance stats
      const stats = performanceManager.getPerformanceStats();
      expect(stats.memory.sessions.sessionCount).toBeGreaterThan(0);
      expect(stats.contextPool.totalContexts).toBeGreaterThan(0);
    });
  });

  describe('Security Workflow Tests', () => {
    it('should enforce domain restrictions workflow', async () => {
      // Create session with restricted domains
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({
        allowedDomains: ['example.com']
      });
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Try to navigate to allowed domain - should succeed
      const gotoTool = server.getTool('browser.goto');
      const allowedResult = await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });
      
      expect(allowedResult.isError).toBeFalsy();

      // Try to navigate to restricted domain - should fail
      const restrictedResult = await gotoTool.handler({
        sessionId,
        url: 'https://google.com'
      });
      
      expect(restrictedResult.isError).toBe(true);
      const errorResponse = JSON.parse(restrictedResult.content[0].text);
      expect(errorResponse.error.category).toBe('security');
    });

    it('should handle rate limiting workflow', async () => {
      // Create session
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Make many rapid requests to trigger rate limiting
      const gotoTool = server.getTool('browser.goto');
      const requests = Array.from({ length: 20 }, (_, i) =>
        gotoTool.handler({
          sessionId,
          url: `https://example.com?page=${i}`
        })
      );

      const results = await Promise.allSettled(requests);
      
      // Some requests should succeed, some should be rate limited
      const successful = results.filter(r => r.status === 'fulfilled' && !r.value.isError);
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.isError && 
        JSON.parse(r.value.content[0].text).error.category === 'security'
      );

      expect(successful.length).toBeGreaterThan(0);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Workflow Tests', () => {
    it('should handle VS Code extension integration workflow', async () => {
      // This test simulates the VS Code extension workflow
      // Note: In a real scenario, this would test WebSocket communication
      
      // Create session as if from VS Code
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'VS Code Extension Browser'
      });
      
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Navigate to a development page
      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      // Take screenshot for VS Code webview
      const screenshotTool = server.getTool('browser.screenshot');
      const screenshotResult = await screenshotTool.handler({
        sessionId,
        format: 'png'
      });
      
      expect(screenshotResult.isError).toBeFalsy();

      // Get console logs for VS Code output panel
      const consoleTool = server.getTool('browser.console.getRecent');
      const consoleResult = await consoleTool.handler({
        sessionId,
        limit: 50
      });
      
      expect(consoleResult.isError).toBeFalsy();

      // Generate development report
      const reportTool = server.getTool('browser.report.generate');
      const reportResult = await reportTool.handler({
        sessionId,
        format: 'html',
        includeScreenshots: true,
        includeLogs: true,
        includeNetworkData: true
      });
      
      expect(reportResult.isError).toBeFalsy();
      const reportResponse = JSON.parse(reportResult.content[0].text);
      expect(existsSync(reportResponse.reportPath)).toBe(true);
    });
  });
});