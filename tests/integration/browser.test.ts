// Integration tests for browser functionality
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/browser/session-manager.js';
import { createNewContextTool, createGotoTool } from '../../src/tools/navigation-tool.js';
import { BrowserSession } from '../../src/browser/browser-session.js';

describe('Navigation Tools Integration', () => {
  let sessionManager: SessionManager;
  let newContextTool: ReturnType<typeof createNewContextTool>;
  let gotoTool: ReturnType<typeof createGotoTool>;

  beforeAll(async () => {
    sessionManager = new SessionManager({
      maxSessions: 5,
      sessionTimeout: 60000, // 1 minute for tests
      cleanupInterval: 30000
    });
    await sessionManager.initialize();
    
    newContextTool = createNewContextTool(sessionManager);
    gotoTool = createGotoTool(sessionManager);
  });

  afterAll(async () => {
    await sessionManager.shutdown();
  });

  beforeEach(async () => {
    // Clean up any existing sessions before each test
    await sessionManager.destroyAllSessions();
  });

  afterEach(async () => {
    // Clean up sessions after each test
    await sessionManager.destroyAllSessions();
  });

  describe('browser.newContext tool', () => {
    it('should create a new browser context with default options', async () => {
      const result = await newContextTool.handler({});
      
      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBeDefined();
      expect(response.viewport).toEqual({ width: 1280, height: 720 });
      expect(response.userAgent).toBeDefined();
      expect(response.createdAt).toBeDefined();
      expect(response.message).toBe('Browser context created successfully');
    });

    it('should create a browser context with custom viewport', async () => {
      const result = await newContextTool.handler({
        viewport: { width: 1920, height: 1080 }
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.viewport).toEqual({ width: 1920, height: 1080 });
    });

    it('should create a browser context with custom user agent', async () => {
      const customUserAgent = 'Mozilla/5.0 (Test Browser)';
      const result = await newContextTool.handler({
        userAgent: customUserAgent
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.userAgent).toBe(customUserAgent);
    });

    it('should create a browser context with allowed domains', async () => {
      const result = await newContextTool.handler({
        allowedDomains: ['example.com', 'test.com']
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      
      // Verify the session was created with allowed domains
      const session = sessionManager.getSession(response.sessionId);
      expect(session).toBeDefined();
      expect(session!.allowedDomains.has('example.com')).toBe(true);
      expect(session!.allowedDomains.has('test.com')).toBe(true);
    });

    it('should handle invalid viewport dimensions', async () => {
      const result = await newContextTool.handler({
        viewport: { width: 50, height: 50 } // Below minimum
      });
      
      // Should still succeed but use default viewport
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should respect session limits', async () => {
      // Create maximum number of sessions
      const maxSessions = 5;
      const sessions: string[] = [];
      
      for (let i = 0; i < maxSessions; i++) {
        const result = await newContextTool.handler({});
        expect(result.isError).toBeFalsy();
        const response = JSON.parse(result.content[0].text);
        sessions.push(response.sessionId);
      }
      
      // Try to create one more session - should fail
      const result = await newContextTool.handler({});
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Maximum number of sessions');
    });
  });

  describe('browser.goto tool', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session for each test
      const result = await newContextTool.handler({});
      const response = JSON.parse(result.content[0].text);
      sessionId = response.sessionId;
    });

    it('should navigate to a valid URL', async () => {
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.url).toBe('https://example.com');
      expect(response.finalUrl).toBeDefined();
      expect(response.status).toBeDefined();
      expect(response.navigationTime).toBeGreaterThan(0);
      expect(response.waitUntil).toBe('load');
      expect(response.message).toBe('Navigation completed successfully');
    });

    it('should handle different wait conditions', async () => {
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://example.com',
        waitUntil: 'domcontentloaded'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.waitUntil).toBe('domcontentloaded');
    });

    it('should handle custom timeout', async () => {
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://example.com',
        timeout: 10000
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should fail with invalid session ID', async () => {
      const result = await gotoTool.handler({
        sessionId: 'invalid-session-id',
        url: 'https://example.com'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Session \'invalid-session-id\' not found');
    });

    it('should fail with invalid URL', async () => {
      const result = await gotoTool.handler({
        sessionId,
        url: 'not-a-valid-url'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Invalid URL format');
    });

    it('should fail with missing required parameters', async () => {
      const result = await gotoTool.handler({
        sessionId
        // Missing url parameter
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('url is required');
    });

    it('should respect domain restrictions', async () => {
      // Create a session with restricted domains
      const restrictedResult = await newContextTool.handler({
        allowedDomains: ['example.com']
      });
      const restrictedResponse = JSON.parse(restrictedResult.content[0].text);
      const restrictedSessionId = restrictedResponse.sessionId;

      // Try to navigate to a restricted domain
      const result = await gotoTool.handler({
        sessionId: restrictedSessionId,
        url: 'https://google.com'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('security');
      expect(response.error.message).toContain('not in the allowed domains list');
    });

    it('should handle navigation to non-existent domain', async () => {
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://this-domain-definitely-does-not-exist-12345.com'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isNetworkError).toBe(true);
    });

    it('should update session activity on successful navigation', async () => {
      const session = sessionManager.getSession(sessionId);
      const initialActivity = session!.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });
      
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });

    it('should add domain to allowed domains on successful navigation', async () => {
      const session = sessionManager.getSession(sessionId);
      expect(session!.isDomainAllowed('example.com')).toBe(false);
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://example.com'
      });
      
      expect(result.isError).toBeFalsy();
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession!.isDomainAllowed('example.com')).toBe(true);
    });
  });

  describe('Tool integration', () => {
    it('should work together to create session and navigate', async () => {
      // Create a new context
      const contextResult = await newContextTool.handler({
        viewport: { width: 1024, height: 768 },
        userAgent: 'Test Browser'
      });
      
      expect(contextResult.isError).toBeFalsy();
      const contextResponse = JSON.parse(contextResult.content[0].text);
      const sessionId = contextResponse.sessionId;
      
      // Navigate using the created session
      const gotoResult = await gotoTool.handler({
        sessionId,
        url: 'https://example.com',
        waitUntil: 'domcontentloaded'
      });
      
      expect(gotoResult.isError).toBeFalsy();
      const gotoResponse = JSON.parse(gotoResult.content[0].text);
      expect(gotoResponse.success).toBe(true);
      
      // Verify session state
      const session = sessionManager.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.page.url()).toBe('https://example.com/');
    });
  });
});