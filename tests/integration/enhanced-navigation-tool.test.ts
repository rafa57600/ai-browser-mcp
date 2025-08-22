import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromium, Browser } from 'playwright';
import { SessionManager } from '../../src/browser/session-manager.js';
import { EnhancedNavigationTools } from '../../src/tools/enhanced-navigation-tool.js';
import { ErrorHandler } from '../../src/errors/error-handler.js';
import { ErrorFactory } from '../../src/errors/error-factory.js';

describe('Enhanced Navigation Tool Integration', () => {
  let browser: Browser;
  let sessionManager: SessionManager;
  let errorHandler: ErrorHandler;
  let navigationTools: EnhancedNavigationTools;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    sessionManager = new SessionManager();
    await sessionManager.initialize();
    
    errorHandler = new ErrorHandler(sessionManager, {
      enableRecovery: true,
      enableCircuitBreaker: true,
      logErrors: false // Disable logging in tests
    });
    
    navigationTools = new EnhancedNavigationTools(sessionManager, errorHandler);
    
    // Mock console to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await sessionManager.shutdown();
    await browser.close();
  });

  describe('Enhanced newContext tool', () => {
    it('should create context successfully with valid parameters', async () => {
      const newContextTool = navigationTools.createNewContextTool();
      
      const result = await newContextTool.handler({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Test Browser',
        allowedDomains: ['example.com', 'localhost'],
        timeout: 30000,
        headless: true
      });
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBeDefined();
      expect(response.viewport).toEqual({ width: 1920, height: 1080 });
      expect(response.userAgent).toBe('Test Browser');
    });

    it('should handle invalid viewport dimensions', async () => {
      const newContextTool = navigationTools.createNewContextTool();
      
      const result = await newContextTool.handler({
        viewport: { width: 50, height: 50 } // Below minimum
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('protocol');
      expect(errorResponse.error.code).toBe('INVALID_PARAMS');
    });

    it('should handle invalid domain formats', async () => {
      const newContextTool = navigationTools.createNewContextTool();
      
      const result = await newContextTool.handler({
        allowedDomains: ['invalid-domain', 'example.com']
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.message).toContain('Invalid domain format');
    });

    it('should handle session creation failures with circuit breaker', async () => {
      // Mock session manager to fail
      const mockSessionManager = {
        createSession: vi.fn().mockRejectedValue(new Error('Resource exhausted'))
      } as any;
      
      const failingNavigationTools = new EnhancedNavigationTools(mockSessionManager, errorHandler);
      const newContextTool = failingNavigationTools.createNewContextTool();
      
      // Try multiple times to trip circuit breaker
      for (let i = 0; i < 15; i++) {
        try {
          await newContextTool.handler({});
        } catch {
          // Expected to fail
        }
      }
      
      const result = await newContextTool.handler({});
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.message).toContain('Circuit breaker');
    });
  });

  describe('Enhanced goto tool', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await sessionManager.createSession();
      sessionId = session.id;
    });

    it('should navigate successfully to valid URL', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/html',
        waitUntil: 'load',
        timeout: 30000
      });
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.url).toBe('https://httpbin.org/html');
      expect(response.status).toBe(200);
      expect(response.navigationTime).toBeGreaterThan(0);
    });

    it('should handle invalid session ID', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId: 'invalid-session',
        url: 'https://example.com'
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('browser');
      expect(errorResponse.error.code).toBe('CONTEXT_CRASHED');
    });

    it('should handle invalid URL format', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'not-a-valid-url'
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('protocol');
      expect(errorResponse.error.code).toBe('INVALID_PARAMS');
    });

    it('should handle domain restrictions', async () => {
      // Create session with restricted domains
      const restrictedSession = await sessionManager.createSession({
        allowedDomains: ['example.com']
      });
      
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId: restrictedSession.id,
        url: 'https://google.com'
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('security');
      expect(errorResponse.error.code).toBe('DOMAIN_DENIED');
    });

    it('should handle navigation timeout with retry', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      // Use a URL that will timeout
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/delay/10', // 10 second delay
        timeout: 2000 // 2 second timeout
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('browser');
      expect(errorResponse.error.code).toBe('TIMEOUT');
    });

    it('should handle network errors', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://non-existent-domain-12345.com'
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('system');
      expect(errorResponse.error.code).toBe('NETWORK_ERROR');
    });

    it('should validate waitUntil parameter', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://example.com',
        waitUntil: 'invalid-wait-condition'
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('protocol');
      expect(errorResponse.error.code).toBe('INVALID_PARAMS');
    });

    it('should validate timeout parameter', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://example.com',
        timeout: 500 // Below minimum
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('protocol');
      expect(errorResponse.error.code).toBe('INVALID_PARAMS');
    });

    it('should handle different waitUntil conditions', async () => {
      const gotoTool = navigationTools.createGotoTool();
      
      const conditions = ['load', 'domcontentloaded', 'networkidle', 'commit'];
      
      for (const waitUntil of conditions) {
        const result = await gotoTool.handler({
          sessionId,
          url: 'https://httpbin.org/html',
          waitUntil
        });
        
        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.waitUntil).toBe(waitUntil);
      }
    });

    it('should update session activity on successful navigation', async () => {
      const session = sessionManager.getSession(sessionId);
      const initialActivity = session!.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/html'
      });
      
      expect(result.isError).toBe(false);
      
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });

    it('should add domain to allowed domains on successful navigation', async () => {
      const session = sessionManager.getSession(sessionId);
      expect(session!.isDomainAllowed('httpbin.org')).toBe(false);
      
      const gotoTool = navigationTools.createGotoTool();
      
      const result = await gotoTool.handler({
        sessionId,
        url: 'https://httpbin.org/html'
      });
      
      expect(result.isError).toBe(false);
      expect(session!.isDomainAllowed('httpbin.org')).toBe(true);
    });
  });

  describe('Circuit breaker integration', () => {
    it('should trip circuit breaker on repeated navigation failures', async () => {
      const gotoTool = navigationTools.createGotoTool();
      const session = await sessionManager.createSession();
      
      // Cause multiple navigation failures
      for (let i = 0; i < 15; i++) {
        try {
          await gotoTool.handler({
            sessionId: session.id,
            url: 'https://non-existent-domain-12345.com'
          });
        } catch {
          // Expected to fail
        }
      }
      
      // Should now be circuit broken
      const result = await gotoTool.handler({
        sessionId: session.id,
        url: 'https://example.com'
      });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.message).toContain('Circuit breaker');
    });

    it('should provide circuit breaker statistics', () => {
      const stats = navigationTools.getErrorHandler().getCircuitBreakerStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    it('should allow circuit breaker reset', () => {
      navigationTools.getErrorHandler().resetCircuitBreakers();
      const stats = navigationTools.getErrorHandler().getCircuitBreakerStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });

  describe('Error handler configuration', () => {
    it('should allow updating error handler configuration', () => {
      navigationTools.updateErrorHandlerConfig({
        enableRecovery: false,
        enableCircuitBreaker: false
      });
      
      // Configuration update should be successful
      expect(navigationTools.getErrorHandler()).toBeDefined();
    });
  });
});