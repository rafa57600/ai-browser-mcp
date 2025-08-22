import { describe, it, expect } from 'vitest';
import { ErrorFactory } from '../../../src/errors/error-factory.js';
import { 
  ProtocolError, 
  SecurityError, 
  BrowserError, 
  SystemError 
} from '../../../src/types/error-types.js';

describe('ErrorFactory', () => {
  describe('Protocol Errors', () => {
    it('should create invalid request error', () => {
      const error = ErrorFactory.invalidRequest('Invalid JSON', 'req-123', 'browser.goto');
      
      expect(error.category).toBe('protocol');
      expect(error.code).toBe('INVALID_REQUEST');
      expect(error.message).toBe('Invalid JSON');
      expect(error.context?.requestId).toBe('req-123');
      expect(error.context?.method).toBe('browser.goto');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create invalid params error', () => {
      const error = ErrorFactory.invalidParams('Missing sessionId', { url: 'test' });
      
      expect(error.category).toBe('protocol');
      expect(error.code).toBe('INVALID_PARAMS');
      expect(error.message).toBe('Missing sessionId');
      expect(error.context?.params).toEqual({ url: 'test' });
    });

    it('should create method not found error', () => {
      const error = ErrorFactory.methodNotFound('browser.invalid');
      
      expect(error.category).toBe('protocol');
      expect(error.code).toBe('METHOD_NOT_FOUND');
      expect(error.message).toBe("Method 'browser.invalid' not found");
      expect(error.context?.method).toBe('browser.invalid');
    });

    it('should create internal error with retry capability', () => {
      const originalError = new Error('Database connection failed');
      const error = ErrorFactory.internalError('Internal server error', originalError);
      
      expect(error.category).toBe('protocol');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.context?.originalError).toBe('Database connection failed');
      expect(error.context?.stack).toBe(originalError.stack);
    });
  });

  describe('Security Errors', () => {
    it('should create domain denied error', () => {
      const error = ErrorFactory.domainDenied('malicious.com', 'session-123');
      
      expect(error.category).toBe('security');
      expect(error.code).toBe('DOMAIN_DENIED');
      expect(error.message).toBe("Access to domain 'malicious.com' is denied");
      expect(error.context?.domain).toBe('malicious.com');
      expect(error.context?.sessionId).toBe('session-123');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
    });

    it('should create rate limit exceeded error', () => {
      const error = ErrorFactory.rateLimitExceeded('client-123', 'browser.screenshot');
      
      expect(error.category).toBe('security');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryable).toBe(true);
      expect(error.context?.clientId).toBe('client-123');
      expect(error.context?.operation).toBe('browser.screenshot');
    });

    it('should create permission timeout error', () => {
      const error = ErrorFactory.permissionTimeout('example.com');
      
      expect(error.category).toBe('security');
      expect(error.code).toBe('PERMISSION_TIMEOUT');
      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(true);
      expect(error.context?.domain).toBe('example.com');
    });
  });

  describe('Browser Errors', () => {
    it('should create navigation failed error', () => {
      const error = ErrorFactory.navigationFailed('https://example.com', 'Timeout', 'session-123');
      
      expect(error.category).toBe('browser');
      expect(error.code).toBe('NAVIGATION_FAILED');
      expect(error.message).toBe("Navigation to 'https://example.com' failed: Timeout");
      expect(error.context?.url).toBe('https://example.com');
      expect(error.context?.sessionId).toBe('session-123');
      expect(error.context?.reason).toBe('Timeout');
      expect(error.retryable).toBe(true);
    });

    it('should create element not found error', () => {
      const error = ErrorFactory.elementNotFound('#submit-button', 'session-123');
      
      expect(error.category).toBe('browser');
      expect(error.code).toBe('ELEMENT_NOT_FOUND');
      expect(error.message).toBe("Element not found: '#submit-button'");
      expect(error.context?.selector).toBe('#submit-button');
      expect(error.context?.sessionId).toBe('session-123');
    });

    it('should create timeout error', () => {
      const error = ErrorFactory.timeout('page load', 30000, 'session-123');
      
      expect(error.category).toBe('browser');
      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe("Operation 'page load' timed out after 30000ms");
      expect(error.context?.operation).toBe('page load');
      expect(error.context?.timeoutMs).toBe(30000);
      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(true);
    });

    it('should create context crashed error', () => {
      const error = ErrorFactory.contextCrashed('session-123', 'Out of memory');
      
      expect(error.category).toBe('browser');
      expect(error.code).toBe('CONTEXT_CRASHED');
      expect(error.message).toBe("Browser context crashed for session 'session-123': Out of memory");
      expect(error.context?.sessionId).toBe('session-123');
      expect(error.context?.reason).toBe('Out of memory');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('System Errors', () => {
    it('should create resource exhausted error', () => {
      const error = ErrorFactory.resourceExhausted('memory', 1024, 2048);
      
      expect(error.category).toBe('system');
      expect(error.code).toBe('RESOURCE_EXHAUSTED');
      expect(error.message).toBe('memory resource exhausted: 1024/2048');
      expect(error.context?.resourceType).toBe('memory');
      expect(error.context?.usage).toBe(1024);
      expect(error.context?.limit).toBe(2048);
      expect(error.recoverable).toBe(true);
    });

    it('should create out of memory error', () => {
      const error = ErrorFactory.outOfMemory(2048, 1024);
      
      expect(error.category).toBe('system');
      expect(error.code).toBe('OUT_OF_MEMORY');
      expect(error.message).toBe('Out of memory: 2048MB used, 1024MB limit');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
    });

    it('should create network error', () => {
      const error = ErrorFactory.networkError('HTTP request', 'Connection refused');
      
      expect(error.category).toBe('system');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network HTTP request failed: Connection refused');
      expect(error.retryable).toBe(true);
      expect(error.context?.operation).toBe('HTTP request');
      expect(error.context?.reason).toBe('Connection refused');
    });
  });

  describe('Error Inference', () => {
    it('should infer browser error from Playwright error', () => {
      const playwrightError = new Error('Timeout 30000ms exceeded');
      const error = ErrorFactory.fromError(playwrightError);
      
      expect(error.category).toBe('browser');
      expect(error.code).toBe('TIMEOUT');
    });

    it('should infer security error from domain message', () => {
      const domainError = new Error('Domain access denied');
      const error = ErrorFactory.fromError(domainError);
      
      expect(error.category).toBe('security');
      expect(error.code).toBe('DOMAIN_DENIED');
    });

    it('should infer system error from memory message', () => {
      const memoryError = new Error('Out of memory');
      const error = ErrorFactory.fromError(memoryError);
      
      expect(error.category).toBe('system');
      expect(error.code).toBe('OUT_OF_MEMORY');
    });

    it('should preserve existing MCPBrowserError', () => {
      const originalError = ErrorFactory.navigationFailed('https://test.com', 'Failed');
      const error = ErrorFactory.fromError(originalError);
      
      expect(error).toBe(originalError);
    });

    it('should handle non-Error objects', () => {
      const error = ErrorFactory.fromError('String error message');
      
      expect(error.category).toBe('protocol');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('String error message');
    });
  });

  describe('Type Guards', () => {
    it('should identify MCPBrowserError correctly', () => {
      const mcpError = ErrorFactory.timeout('test', 1000);
      const regularError = new Error('Regular error');
      
      expect(ErrorFactory.isMCPBrowserError(mcpError)).toBe(true);
      expect(ErrorFactory.isMCPBrowserError(regularError)).toBe(false);
      expect(ErrorFactory.isMCPBrowserError('string')).toBe(false);
      expect(ErrorFactory.isMCPBrowserError(null)).toBe(false);
    });
  });
});