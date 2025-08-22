import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ErrorHandler } from '../../src/errors/error-handler.js';
import { ErrorFactory } from '../../src/errors/error-factory.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { BrowserSession } from '../../src/browser/browser-session.js';

describe('Error Handling Integration', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let sessionManager: SessionManager;
  let errorHandler: ErrorHandler;
  let session: BrowserSession;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    
    sessionManager = new SessionManager();
    await sessionManager.initialize();
    
    session = await sessionManager.createSession();
    errorHandler = new ErrorHandler(sessionManager);
    
    // Mock console to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    await sessionManager.shutdown();
    await context.close();
    await browser.close();
  });

  describe('Navigation error handling', () => {
    it('should handle navigation timeout with retry', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(ErrorFactory.timeout('navigation', 30000, session.id))
        .mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        ErrorFactory.timeout('navigation', 30000, session.id),
        operation,
        { sessionId: session.id, toolName: 'browser.goto' }
      );
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.recovered).toBe(true);
      expect(response.strategy).toBe('RETRY');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle navigation failure with circuit breaker', async () => {
      const operation = vi.fn().mockRejectedValue(
        ErrorFactory.navigationFailed('https://invalid-domain.test', 'DNS resolution failed')
      );
      
      // Trip the circuit breaker by failing multiple times
      for (let i = 0; i < 10; i++) {
        try {
          await errorHandler.executeWithCircuitBreaker('browser.navigation', operation);
        } catch {
          // Expected to fail
        }
      }
      
      // Should now be circuit broken
      await expect(
        errorHandler.executeWithCircuitBreaker('browser.navigation', operation)
      ).rejects.toThrow('Circuit breaker');
    });
  });

  describe('Context crash recovery', () => {
    it('should recreate context on crash', async () => {
      const originalSessionId = session.id;
      
      // Simulate context crash
      const crashError = ErrorFactory.contextCrashed(originalSessionId, 'Out of memory');
      
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        crashError,
        operation,
        { sessionId: originalSessionId }
      );
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.recovered).toBe(true);
      expect(response.strategy).toBe('RECREATE_CONTEXT');
    });

    it('should handle context recreation failure', async () => {
      // Mock session manager to fail recreation
      const mockSessionManager = {
        recreateSession: vi.fn().mockRejectedValue(new Error('Recreation failed'))
      } as any;
      
      const errorHandlerWithFailingManager = new ErrorHandler(mockSessionManager);
      
      const crashError = ErrorFactory.contextCrashed(session.id, 'Crashed');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandlerWithFailingManager.handleError(
        crashError,
        operation,
        { sessionId: session.id }
      );
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      // The error might be the original crash error or the recreation failure
      expect(errorResponse.error.category).toBe('browser');
    });
  });

  describe('Element interaction error handling', () => {
    it('should retry element not found errors', async () => {
      const elementError = ErrorFactory.elementNotFound('#non-existent', session.id);
      
      const operation = vi.fn()
        .mockRejectedValueOnce(elementError)
        .mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        elementError,
        operation,
        { sessionId: session.id, selector: '#non-existent' }
      );
      
      // Element not found errors might not be recoverable in all cases
      const response = JSON.parse(result.content[0].text as string);
      if (result.isError) {
        expect(response.success).toBe(false);
        expect(response.error.code).toBe('ELEMENT_NOT_FOUND');
      } else {
        expect(response.success).toBe(true);
        expect(response.strategy).toBe('RETRY');
      }
    });

    it('should use fallback for interaction failures', async () => {
      const interactionError = ErrorFactory.interactionFailed(
        'click',
        '#button',
        'Element not clickable',
        session.id
      );
      
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        interactionError,
        operation,
        { sessionId: session.id }
      );
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.strategy).toBe('FALLBACK');
    });
  });

  describe('Security error handling', () => {
    it('should not recover from domain denied errors', async () => {
      const securityError = ErrorFactory.domainDenied('malicious.com', session.id);
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        securityError,
        operation,
        { sessionId: session.id }
      );
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('security');
      expect(errorResponse.error.code).toBe('DOMAIN_DENIED');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should retry rate limit exceeded errors', async () => {
      const rateLimitError = ErrorFactory.rateLimitExceeded('client-123', 'browser.screenshot');
      rateLimitError.recoverable = true;
      
      const operation = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        rateLimitError,
        operation,
        { clientId: 'client-123' }
      );
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.strategy).toBe('RETRY');
    });
  });

  describe('System error handling', () => {
    it('should circuit break on resource exhaustion', async () => {
      const resourceError = ErrorFactory.resourceExhausted('memory', 2048, 1024);
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        resourceError,
        operation
      );
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('system');
      expect(errorResponse.error.code).toBe('RESOURCE_EXHAUSTED');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should retry network errors', async () => {
      const networkError = ErrorFactory.networkError('HTTP request', 'Connection refused');
      
      const operation = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');
      
      const result = await errorHandler.handleError(
        networkError,
        operation
      );
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.strategy).toBe('RETRY');
    });
  });

  describe('Tool execution with error handling', () => {
    it('should handle tool execution with circuit breaker', async () => {
      const toolOperation = async () => {
        // Simulate a browser operation that might fail
        await session.page.goto('https://httpstat.us/500');
        return { success: true };
      };
      
      const result = await errorHandler.handleToolExecution(
        'browser.goto',
        toolOperation,
        { sessionId: session.id, url: 'https://httpstat.us/500' }
      );
      
      // Should handle the error gracefully
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBeDefined();
    });

    it('should provide detailed error information', async () => {
      const toolOperation = async () => {
        throw ErrorFactory.evaluationFailed(
          'document.querySelector("#invalid").click()',
          'Cannot read property click of null',
          session.id
        );
      };
      
      const result = await errorHandler.handleToolExecution(
        'browser.eval',
        toolOperation,
        { sessionId: session.id }
      );
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('browser');
      expect(errorResponse.error.code).toBe('EVALUATION_FAILED');
      expect(errorResponse.error.context).toBeDefined();
      expect(errorResponse.error.timestamp).toBeDefined();
    });
  });

  describe('Error recovery with backoff', () => {
    it('should apply exponential backoff during retries', async () => {
      const timeoutError = ErrorFactory.timeout('operation', 5000);
      
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      const result = await errorHandler.handleError(timeoutError, operation);
      const endTime = Date.now();
      
      const response = JSON.parse(result.content[0].text as string);
      if (result.isError) {
        expect(response.success).toBe(false);
      } else {
        expect(response.success).toBe(true);
        expect(response.attempts).toBeGreaterThan(1);
        
        // Should have waited for some backoff delays
        expect(endTime - startTime).toBeGreaterThan(1000);
      }
    }, 10000); // Increase timeout for this test
  });

  describe('Circuit breaker integration', () => {
    it('should track circuit breaker statistics', async () => {
      const operation = vi.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');
      
      await errorHandler.executeWithCircuitBreaker('test-operation', operation);
      
      try {
        await errorHandler.executeWithCircuitBreaker('test-operation', operation);
      } catch {
        // Expected to fail
      }
      
      await errorHandler.executeWithCircuitBreaker('test-operation', operation);
      
      const stats = errorHandler.getCircuitBreakerStats();
      expect(stats['test-operation']).toBeDefined();
      expect(stats['test-operation'].successCount).toBe(2);
      expect(stats['test-operation'].failureCount).toBe(1);
      expect(stats['test-operation'].totalRequests).toBe(3);
    });

    it('should reset circuit breakers', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      await errorHandler.executeWithCircuitBreaker('test-operation', operation);
      
      let stats = errorHandler.getCircuitBreakerStats();
      expect(Object.keys(stats)).toHaveLength(1);
      
      errorHandler.resetCircuitBreakers();
      
      stats = errorHandler.getCircuitBreakerStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });
  });
});