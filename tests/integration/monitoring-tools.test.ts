import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { SessionManager } from '../../src/browser/session-manager.js';
import { createNetworkGetRecentTool, createConsoleGetRecentTool } from '../../src/tools/monitoring-tools.js';
import { createNewContextTool, createGotoTool } from '../../src/tools/navigation-tool.js';

describe('Monitoring Tools Integration', () => {
  let browser: Browser;
  let sessionManager: SessionManager;
  let testServer: any;
  let testServerUrl: string;

  beforeEach(async () => {
    // Start a simple test server
    const { createServer } = await import('http');
    testServer = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.url === '/test-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Test Page</title>
          </head>
          <body>
            <h1>Test Page</h1>
            <script>
              console.log('Page loaded');
              console.warn('This is a warning');
              console.error('This is an error');
              
              // Make some network requests
              fetch('/api/data')
                .then(response => response.json())
                .then(data => console.log('Data received:', data))
                .catch(error => console.error('Fetch error:', error));
              
              fetch('/api/submit', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer secret-token'
                },
                body: JSON.stringify({ test: 'data' })
              });
            </script>
          </body>
          </html>
        `);
      } else if (req.url === '/api/data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Hello from API', timestamp: Date.now() }));
      } else if (req.url === '/api/submit') {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, received: true }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, 'localhost', () => {
        const address = testServer.address();
        testServerUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });

    // Initialize session manager
    sessionManager = new SessionManager();
    await sessionManager.initialize();
  });

  afterEach(async () => {
    if (sessionManager) {
      await sessionManager.shutdown();
    }
    if (testServer) {
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
    }
  });

  describe('Network Monitoring', () => {
    it('should capture and retrieve network requests', async () => {
      // Create a new browser context
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      expect(contextResult.isError).toBe(false);
      
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      // Navigate to test page
      const gotoTool = createGotoTool(sessionManager);
      const gotoResult = await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });
      expect(gotoResult.isError).toBe(false);

      // Wait a bit for network requests to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get network logs
      const networkTool = createNetworkGetRecentTool(sessionManager);
      const networkResult = await networkTool.handler({
        sessionId,
        limit: 10,
        includeBody: true
      });

      expect(networkResult.isError).toBe(false);
      const networkResponse = JSON.parse(networkResult.content[0].text);
      
      expect(networkResponse.success).toBe(true);
      expect(networkResponse.networkLogs).toBeDefined();
      expect(networkResponse.networkLogs.length).toBeGreaterThan(0);

      // Check that we captured the main page request
      const pageRequest = networkResponse.networkLogs.find((log: any) => 
        log.url.includes('/test-page')
      );
      expect(pageRequest).toBeDefined();
      expect(pageRequest.method).toBe('GET');
      expect(pageRequest.status).toBe(200);

      // Check that we captured API requests
      const apiRequests = networkResponse.networkLogs.filter((log: any) => 
        log.url.includes('/api/')
      );
      expect(apiRequests.length).toBeGreaterThanOrEqual(1);

      // Check that sensitive headers are filtered
      const postRequest = networkResponse.networkLogs.find((log: any) => 
        log.method === 'POST' && log.requestHeaders?.authorization
      );
      if (postRequest) {
        expect(postRequest.requestHeaders.authorization).toBe('[REDACTED]');
      }
    });

    it('should respect limit parameter for network logs', async () => {
      // Create session and navigate
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      const gotoTool = createGotoTool(sessionManager);
      await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get limited network logs
      const networkTool = createNetworkGetRecentTool(sessionManager);
      const networkResult = await networkTool.handler({
        sessionId,
        limit: 2
      });

      const networkResponse = JSON.parse(networkResult.content[0].text);
      expect(networkResponse.success).toBe(true);
      expect(networkResponse.networkLogs.length).toBeLessThanOrEqual(2);
      expect(networkResponse.limit).toBe(2);
    });

    it('should exclude bodies when includeBody is false', async () => {
      // Create session and navigate
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      const gotoTool = createGotoTool(sessionManager);
      await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get network logs without bodies
      const networkTool = createNetworkGetRecentTool(sessionManager);
      const networkResult = await networkTool.handler({
        sessionId,
        includeBody: false
      });

      const networkResponse = JSON.parse(networkResult.content[0].text);
      expect(networkResponse.success).toBe(true);
      expect(networkResponse.includeBody).toBe(false);
      
      // Check that no logs have request or response bodies
      networkResponse.networkLogs.forEach((log: any) => {
        expect(log).not.toHaveProperty('requestBody');
        expect(log).not.toHaveProperty('responseBody');
      });
    });
  });

  describe('Console Monitoring', () => {
    it('should capture and retrieve console logs', async () => {
      // Create a new browser context
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      // Navigate to test page
      const gotoTool = createGotoTool(sessionManager);
      const gotoResult = await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });
      expect(gotoResult.isError).toBe(false);

      // Wait for console logs to be generated
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get console logs
      const consoleTool = createConsoleGetRecentTool(sessionManager);
      const consoleResult = await consoleTool.handler({
        sessionId,
        limit: 10,
        includeLocation: true
      });

      expect(consoleResult.isError).toBe(false);
      const consoleResponse = JSON.parse(consoleResult.content[0].text);
      
      expect(consoleResponse.success).toBe(true);
      expect(consoleResponse.consoleLogs).toBeDefined();
      expect(consoleResponse.consoleLogs.length).toBeGreaterThan(0);

      // Check for specific log messages
      const logMessages = consoleResponse.consoleLogs.map((log: any) => log.message);
      expect(logMessages.some((msg: string) => msg.includes('Page loaded'))).toBe(true);
      expect(logMessages.some((msg: string) => msg.includes('This is a warning'))).toBe(true);
      expect(logMessages.some((msg: string) => msg.includes('This is an error'))).toBe(true);

      // Check log levels (Playwright uses 'log' for console.log, 'warning' for console.warn)
      const logLevels = consoleResponse.consoleLogs.map((log: any) => log.level);
      expect(logLevels).toContain('log'); // console.log produces 'log' level
      expect(logLevels).toContain('warning'); // console.warn produces 'warning' level
      expect(logLevels).toContain('error');
    });

    it('should filter console logs by level', async () => {
      // Create session and navigate
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      const gotoTool = createGotoTool(sessionManager);
      await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get only error logs
      const consoleTool = createConsoleGetRecentTool(sessionManager);
      const consoleResult = await consoleTool.handler({
        sessionId,
        level: 'error'
      });

      const consoleResponse = JSON.parse(consoleResult.content[0].text);
      expect(consoleResponse.success).toBe(true);
      expect(consoleResponse.levelFilter).toBe('error');
      
      // All returned logs should be error level
      consoleResponse.consoleLogs.forEach((log: any) => {
        expect(log.level).toBe('error');
      });
    });

    it('should respect limit parameter for console logs', async () => {
      // Create session and navigate
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      const gotoTool = createGotoTool(sessionManager);
      await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get limited console logs
      const consoleTool = createConsoleGetRecentTool(sessionManager);
      const consoleResult = await consoleTool.handler({
        sessionId,
        limit: 2
      });

      const consoleResponse = JSON.parse(consoleResult.content[0].text);
      expect(consoleResponse.success).toBe(true);
      expect(consoleResponse.consoleLogs.length).toBeLessThanOrEqual(2);
      expect(consoleResponse.limit).toBe(2);
    });

    it('should exclude location when includeLocation is false', async () => {
      // Create session and navigate
      const newContextTool = createNewContextTool(sessionManager);
      const contextResult = await newContextTool.handler({});
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;

      const gotoTool = createGotoTool(sessionManager);
      await gotoTool.handler({
        sessionId,
        url: `${testServerUrl}/test-page`,
        waitUntil: 'networkidle'
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get console logs without location
      const consoleTool = createConsoleGetRecentTool(sessionManager);
      const consoleResult = await consoleTool.handler({
        sessionId,
        includeLocation: false
      });

      const consoleResponse = JSON.parse(consoleResult.content[0].text);
      expect(consoleResponse.success).toBe(true);
      expect(consoleResponse.includeLocation).toBe(false);
      
      // Check that no logs have location information
      consoleResponse.consoleLogs.forEach((log: any) => {
        expect(log).not.toHaveProperty('location');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session ID for network tool', async () => {
      const networkTool = createNetworkGetRecentTool(sessionManager);
      const result = await networkTool.handler({
        sessionId: 'invalid-session-id'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle invalid session ID for console tool', async () => {
      const consoleTool = createConsoleGetRecentTool(sessionManager);
      const result = await consoleTool.handler({
        sessionId: 'invalid-session-id'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle missing sessionId parameter', async () => {
      const networkTool = createNetworkGetRecentTool(sessionManager);
      const networkResult = await networkTool.handler({});

      expect(networkResult.isError).toBe(true);
      const networkResponse = JSON.parse(networkResult.content[0].text);
      expect(networkResponse.error.message).toContain('sessionId is required');

      const consoleTool = createConsoleGetRecentTool(sessionManager);
      const consoleResult = await consoleTool.handler({});

      expect(consoleResult.isError).toBe(true);
      const consoleResponse = JSON.parse(consoleResult.content[0].text);
      expect(consoleResponse.error.message).toContain('sessionId is required');
    });
  });
});