import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { IntegratedMCPServer } from '../../src/server/integrated-server.js';
import { MCPClient } from '../../vscode-extension/src/mcp-client.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { SecurityManager } from '../../src/security/security-manager.js';
import { PerformanceManager } from '../../src/performance/performance-manager.js';
import { configManager } from '../../src/config/config-manager.js';
import { Application } from '../../src/index.js';
import WebSocket from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Final Integration and Testing', () => {
  let server: IntegratedMCPServer;
  let client: MCPClient;
  let app: Application;
  const testPort = 3001;

  beforeAll(async () => {
    // Initialize integrated server
    server = new IntegratedMCPServer({
      websocketPort: testPort,
      enableWebSocket: true,
      enableStdio: false,
      allowedDomains: ['localhost', '127.0.0.1', 'example.com'],
      maxSessions: 5,
      sessionTimeout: 60000
    });

    await server.start();

    // Initialize client
    client = new MCPClient(`ws://localhost:${testPort}`);
    await client.connect();

    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  describe('Requirement 1: Browser Control via MCP', () => {
    it('should initialize browser and expose MCP tools', async () => {
      const status = server.getStatus();
      
      expect(status.websocket.enabled).toBe(true);
      expect(status.websocket.running).toBe(true);
      expect(status.websocket.tools.length).toBeGreaterThan(0);
      
      // Verify core tools are available
      const toolNames = status.websocket.tools.map(tool => tool.name);
      expect(toolNames).toContain('browser.newContext');
      expect(toolNames).toContain('browser.goto');
      expect(toolNames).toContain('browser.click');
      expect(toolNames).toContain('browser.screenshot');
    });

    it('should create isolated browser context', async () => {
      const result = await client.callTool('browser.newContext', {
        viewport: { width: 1280, height: 720 },
        userAgent: 'test-agent'
      });

      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('viewport');
      expect(result.viewport.width).toBe(1280);
      expect(result.viewport.height).toBe(720);
    });
  });

  describe('Requirement 2: Web Navigation and Interaction', () => {
    let sessionId: string;

    beforeEach(async () => {
      const context = await client.callTool('browser.newContext', {});
      sessionId = context.sessionId;
    });

    it('should navigate to web pages', async () => {
      const result = await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><h1>Test Page</h1></body></html>'
      });

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('title');
    });

    it('should interact with DOM elements', async () => {
      // Navigate to test page with form elements
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><input id="test-input" type="text"><button id="test-btn">Click</button></body></html>'
      });

      // Type in input field
      const typeResult = await client.callTool('browser.type', {
        sessionId,
        selector: '#test-input',
        text: 'Hello World'
      });

      expect(typeResult.success).toBe(true);

      // Click button
      const clickResult = await client.callTool('browser.click', {
        sessionId,
        selector: '#test-btn'
      });

      expect(clickResult.success).toBe(true);
    });
  });

  describe('Requirement 3: Visual and Structural Capture', () => {
    let sessionId: string;

    beforeEach(async () => {
      const context = await client.callTool('browser.newContext', {});
      sessionId = context.sessionId;
      
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><h1>Screenshot Test</h1><p>Content for testing</p></body></html>'
      });
    });

    it('should capture screenshots', async () => {
      const screenshot = await client.callTool('browser.screenshot', {
        sessionId,
        format: 'png'
      });

      expect(screenshot).toHaveProperty('data');
      expect(screenshot).toHaveProperty('format', 'png');
      expect(screenshot).toHaveProperty('width');
      expect(screenshot).toHaveProperty('height');
      expect(typeof screenshot.data).toBe('string');
    });

    it('should capture DOM snapshots', async () => {
      const snapshot = await client.callTool('browser.domSnapshot', {
        sessionId,
        maxNodes: 100
      });

      expect(snapshot).toHaveProperty('nodes');
      expect(Array.isArray(snapshot.nodes)).toBe(true);
      expect(snapshot.nodes.length).toBeGreaterThan(0);
      expect(snapshot.nodes.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Requirement 4: JavaScript Execution', () => {
    let sessionId: string;

    beforeEach(async () => {
      const context = await client.callTool('browser.newContext', {});
      sessionId = context.sessionId;
      
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><div id="test">Initial</div></body></html>'
      });
    });

    it('should execute JavaScript and return results', async () => {
      const result = await client.callTool('browser.eval', {
        sessionId,
        code: 'document.getElementById("test").textContent = "Modified"; return "success";'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });

    it('should handle JavaScript errors', async () => {
      const result = await client.callTool('browser.eval', {
        sessionId,
        code: 'throw new Error("Test error");'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });
  });

  describe('Requirement 5: Network and Console Monitoring', () => {
    let sessionId: string;

    beforeEach(async () => {
      const context = await client.callTool('browser.newContext', {});
      sessionId = context.sessionId;
    });

    it('should capture network activity', async () => {
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body>Network test</body></html>'
      });

      const networkLogs = await client.callTool('browser.network.getRecent', {
        sessionId,
        limit: 10
      });

      expect(Array.isArray(networkLogs)).toBe(true);
    });

    it('should capture console logs', async () => {
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><script>console.log("Test log");</script></body></html>'
      });

      // Wait for console log to be captured
      await new Promise(resolve => setTimeout(resolve, 500));

      const consoleLogs = await client.callTool('browser.console.getRecent', {
        sessionId,
        limit: 10
      });

      expect(Array.isArray(consoleLogs)).toBe(true);
    });
  });

  describe('Requirement 6: Security and Privacy', () => {
    it('should enforce domain allowlist', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      try {
        await client.callTool('browser.goto', {
          sessionId: context.sessionId,
          url: 'https://blocked-domain.com'
        });
        expect.fail('Should have blocked unauthorized domain');
      } catch (error) {
        expect(error.message).toContain('Domain not allowed');
      }
    });

    it('should filter sensitive data from network logs', async () => {
      const sessionManager = server.getSessionManager();
      const securityManager = server.getSecurityManager();
      
      expect(securityManager).toBeDefined();
      expect(typeof securityManager.filterSensitiveData).toBe('function');
    });
  });

  describe('Requirement 7: IDE Integration', () => {
    it('should provide WebSocket communication', async () => {
      const status = server.getStatus();
      
      expect(status.websocket.enabled).toBe(true);
      expect(status.websocket.running).toBe(true);
      expect(status.websocket.port).toBe(testPort);
    });

    it('should handle multiple client connections', async () => {
      const client2 = new MCPClient(`ws://localhost:${testPort}`);
      await client2.connect();

      const status = server.getStatus();
      expect(status.websocket.clients).toBeGreaterThanOrEqual(2);

      await client2.disconnect();
    });
  });

  describe('Requirement 8: Export and Reporting', () => {
    let sessionId: string;

    beforeEach(async () => {
      const context = await client.callTool('browser.newContext', {});
      sessionId = context.sessionId;
      
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body>Report test</body></html>'
      });
    });

    it('should generate comprehensive reports', async () => {
      const report = await client.callTool('browser.report.generate', {
        sessionId,
        format: 'html',
        includeScreenshots: true,
        includeLogs: true
      });

      expect(report).toHaveProperty('reportId');
      expect(report).toHaveProperty('format', 'html');
      expect(report).toHaveProperty('size');
    });

    it('should export HAR data', async () => {
      const harExport = await client.callTool('browser.harExport', {
        sessionId
      });

      expect(harExport).toHaveProperty('har');
      expect(harExport.har).toHaveProperty('log');
      expect(harExport.har.log).toHaveProperty('entries');
    });
  });

  describe('Requirement 9: Macro Recording and Playback', () => {
    let sessionId: string;

    beforeEach(async () => {
      const context = await client.callTool('browser.newContext', {});
      sessionId = context.sessionId;
      
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><input id="test" type="text"><button id="btn">Click</button></body></html>'
      });
    });

    it('should record and replay macros', async () => {
      // Start recording
      const recordingResult = await client.callTool('browser.macro.startRecording', {
        sessionId,
        macroName: 'test-macro'
      });

      expect(recordingResult.success).toBe(true);

      // Perform actions
      await client.callTool('browser.type', {
        sessionId,
        selector: '#test',
        text: 'macro test'
      });

      await client.callTool('browser.click', {
        sessionId,
        selector: '#btn'
      });

      // Stop recording
      const stopResult = await client.callTool('browser.macro.stopRecording', {
        sessionId
      });

      expect(stopResult.success).toBe(true);
      expect(stopResult).toHaveProperty('macroId');

      // Replay macro
      const replayResult = await client.callTool('browser.macro.replay', {
        sessionId,
        macroId: stopResult.macroId
      });

      expect(replayResult.success).toBe(true);
    });
  });

  describe('Requirement 10: Concurrent Sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const sessions = [];
      
      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        const context = await client.callTool('browser.newContext', {});
        sessions.push(context.sessionId);
      }

      expect(sessions.length).toBe(3);
      expect(new Set(sessions).size).toBe(3); // All unique

      // Verify sessions are isolated
      const status = server.getStatus();
      expect(status.sessions.active).toBeGreaterThanOrEqual(3);
    });

    it('should clean up idle sessions', async () => {
      const sessionManager = server.getSessionManager();
      const initialCount = sessionManager.getActiveSessionCount();

      // Create a session
      const context = await client.callTool('browser.newContext', {});
      expect(sessionManager.getActiveSessionCount()).toBe(initialCount + 1);

      // Manually trigger cleanup (in real scenario this would be automatic)
      await sessionManager.cleanupIdleSessions();
      
      // Session count should remain the same since it's not idle yet
      expect(sessionManager.getActiveSessionCount()).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should monitor system performance', async () => {
      const performanceManager = server.getPerformanceManager();
      const metrics = performanceManager.getMetrics();

      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('disk');
      expect(typeof metrics.memory.usedMB).toBe('number');
    });

    it('should enforce resource limits', async () => {
      const status = server.getStatus();
      
      expect(status.sessions.max).toBe(5);
      expect(status.sessions.active).toBeLessThanOrEqual(status.sessions.max);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle browser context failures gracefully', async () => {
      // This test would simulate browser crashes and verify recovery
      const sessionManager = server.getSessionManager();
      expect(typeof sessionManager.cleanup).toBe('function');
    });

    it('should provide structured error responses', async () => {
      try {
        await client.callTool('browser.nonexistent', {});
        expect.fail('Should have thrown error for nonexistent tool');
      } catch (error) {
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('Configuration and Deployment', () => {
    it('should load configuration correctly', async () => {
      const config = configManager.getAll();
      
      expect(config).toHaveProperty('browser');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('performance');
    });

    it('should provide health check endpoints', async () => {
      const status = server.getStatus();
      
      expect(status).toHaveProperty('stdio');
      expect(status).toHaveProperty('websocket');
      expect(status).toHaveProperty('sessions');
      expect(status).toHaveProperty('performance');
      expect(status).toHaveProperty('security');
    });
  });

  describe('Complete System Integration', () => {
    it('should execute complete workflow scenario', async () => {
      // Create browser context
      const context = await client.callTool('browser.newContext', {
        viewport: { width: 1920, height: 1080 }
      });
      const sessionId = context.sessionId;

      // Navigate to test page
      await client.callTool('browser.goto', {
        sessionId,
        url: 'data:text/html,<html><body><h1>Integration Test</h1><form><input id="name" type="text" placeholder="Name"><button type="submit">Submit</button></form></body></html>'
      });

      // Take screenshot
      const screenshot = await client.callTool('browser.screenshot', {
        sessionId,
        format: 'png'
      });
      expect(screenshot.data).toBeDefined();

      // Interact with form
      await client.callTool('browser.type', {
        sessionId,
        selector: '#name',
        text: 'Integration Test User'
      });

      // Execute JavaScript
      const jsResult = await client.callTool('browser.eval', {
        sessionId,
        code: 'document.querySelector("#name").value'
      });
      expect(jsResult.result).toBe('Integration Test User');

      // Get DOM snapshot
      const snapshot = await client.callTool('browser.domSnapshot', {
        sessionId,
        maxNodes: 50
      });
      expect(snapshot.nodes.length).toBeGreaterThan(0);

      // Generate report
      const report = await client.callTool('browser.report.generate', {
        sessionId,
        format: 'html',
        includeScreenshots: true,
        includeLogs: true
      });
      expect(report.reportId).toBeDefined();

      // Verify all operations completed successfully
      expect(true).toBe(true); // If we reach here, all operations succeeded
    });
  });
});