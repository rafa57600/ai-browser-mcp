import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorHandler } from '../../../src/errors/error-handler.js';
import { ErrorFactory } from '../../../src/errors/error-factory.js';
import { SessionManager } from '../../../src/browser/session-manager.js';

// Mock SessionManager
vi.mock('../../../src/browser/session-manager.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    recreateSession: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockSessionManager = new SessionManager();
    errorHandler = new ErrorHandler(mockSessionManager);
    
    // Configure faster recovery for tests
    errorHandler.updateConfig({
      enableRecovery: true,
      enableCircuitBreaker: true,
      logErrors: true
    });
    
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('Error handling', () => {
    it('should handle successful operations', async () => {
      const recoverableError = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(recoverableError, operation);
      
      expect(result.isError).toBe(false);
      expect(JSON.parse(result.content[0].text as string)).toEqual({
        success: true,
        recovered: true,
        strategy: 'RETRY',
        attempts: 1
      });
    });

    it('should create error response for non-recoverable errors', async () => {
      const error = ErrorFactory.domainDenied('malicious.com');
      error.recoverable = false;
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(error, operation);
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('security');
      expect(errorResponse.error.code).toBe('DOMAIN_DENIED');
    });

    it('should attempt recovery for recoverable errors', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.handleError(error, operation);
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.recovered).toBe(true);
      expect(response.strategy).toBe('RETRY');
    });

    it('should return error response when recovery fails', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      const result = await errorHandler.handleError(error, operation);
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.category).toBe('browser');
    }, 10000); // Increase timeout for this test

    it('should log errors when enabled', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      await errorHandler.handleError(error, operation, { toolName: 'browser.goto' });
      
      expect(console.info).toHaveBeenCalledWith(
        'Browser Error:',
        expect.objectContaining({
          category: 'browser',
          code: 'TIMEOUT',
          message: "Operation 'operation' timed out after 5000ms"
        })
      );
    });

    it('should not log errors when disabled', async () => {
      const errorHandlerNoLog = new ErrorHandler(mockSessionManager, { logErrors: false });
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      await errorHandlerNoLog.handleError(error, operation);
      
      expect(console.info).not.toHaveBeenCalled();
    });
  });

  describe('Circuit breaker execution', () => {
    it('should execute operations with circuit breaker when enabled', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.executeWithCircuitBreaker('test-operation', operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should bypass circuit breaker when disabled', async () => {
      const errorHandlerNoCircuit = new ErrorHandler(mockSessionManager, { enableCircuitBreaker: false });
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandlerNoCircuit.executeWithCircuitBreaker('test-operation', operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should throw circuit breaker errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Trip the circuit breaker
      for (let i = 0; i < 10; i++) {
        try {
          await errorHandler.executeWithCircuitBreaker('test-operation', operation);
        } catch {
          // Expected to fail
        }
      }
      
      // Should now throw circuit breaker error
      await expect(
        errorHandler.executeWithCircuitBreaker('test-operation', operation)
      ).rejects.toThrow('Circuit breaker');
    });
  });

  describe('Tool execution handling', () => {
    it('should handle successful tool execution', async () => {
      const operation = vi.fn().mockResolvedValue({ data: 'test' });
      
      const result = await errorHandler.handleToolExecution('browser.goto', operation);
      
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text as string);
      expect(response.success).toBe(true);
      expect(response.result).toEqual({ data: 'test' });
    });

    it('should handle tool execution errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Tool failed'));
      
      const result = await errorHandler.handleToolExecution('browser.goto', operation, { sessionId: 'test' });
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.message).toBe('Tool failed');
    });
  });

  describe('Error response creation', () => {
    it('should create standardized error responses', () => {
      const error = ErrorFactory.navigationFailed('https://example.com', 'Timeout');
      
      const result = errorHandler.createErrorResponse(error);
      
      expect(result.isError).toBe(true);
      const errorResponse = JSON.parse(result.content[0].text as string);
      expect(errorResponse).toEqual({
        success: false,
        error: {
          category: 'browser',
          code: 'NAVIGATION_FAILED',
          message: "Navigation to 'https://example.com' failed: Timeout",
          timestamp: error.timestamp.toISOString(),
          context: error.context,
          recoverable: error.recoverable,
          retryable: error.retryable
        }
      });
    });
  });

  describe('Circuit breaker management', () => {
    it('should get circuit breaker statistics', () => {
      const stats = errorHandler.getCircuitBreakerStats();
      
      expect(stats).toEqual({});
    });

    it('should reset circuit breakers', () => {
      errorHandler.resetCircuitBreakers();
      
      const stats = errorHandler.getCircuitBreakerStats();
      expect(stats).toEqual({});
    });

    it('should get or create circuit breakers', () => {
      const breaker = errorHandler.getCircuitBreaker('test-breaker');
      
      expect(breaker).toBeDefined();
      expect(breaker.getStats().state).toBe('CLOSED');
    });
  });

  describe('Configuration updates', () => {
    it('should update configuration', () => {
      errorHandler.updateConfig({ enableRecovery: false });
      
      // Test that recovery is disabled by checking that a recoverable error doesn't get recovered
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      errorHandler.handleError(error, operation).then(result => {
        expect(result.isError).toBe(true);
      });
    });
  });

  describe('Wrapper utility', () => {
    it('should wrap successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await errorHandler.wrap(operation, 'test-operation');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe('success');
      }
    });

    it('should wrap failed operations', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      const result = await errorHandler.wrap(operation, 'test-operation');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error?.message).toBe('Operation failed');
      }
    });

    it('should attempt recovery in wrapper', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');
      
      const result = await errorHandler.wrap(operation, 'test-operation');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toBe('success');
      }
      // The operation should be called multiple times due to circuit breaker + recovery
      expect(operation.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('Error logging', () => {
    it('should log system errors with error level', async () => {
      const error = ErrorFactory.outOfMemory(2048, 1024);
      const operation = vi.fn().mockResolvedValue('success');
      
      await errorHandler.handleError(error, operation);
      
      expect(console.error).toHaveBeenCalledWith(
        'System Error:',
        expect.objectContaining({
          category: 'system',
          code: 'OUT_OF_MEMORY'
        })
      );
    });

    it('should log security errors with warn level', async () => {
      const error = ErrorFactory.domainDenied('malicious.com');
      const operation = vi.fn().mockResolvedValue('success');
      
      await errorHandler.handleError(error, operation);
      
      expect(console.warn).toHaveBeenCalledWith(
        'Security Error:',
        expect.objectContaining({
          category: 'security',
          code: 'DOMAIN_DENIED'
        })
      );
    });

    it('should log browser errors with info level', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      await errorHandler.handleError(error, operation);
      
      expect(console.info).toHaveBeenCalledWith(
        'Browser Error:',
        expect.objectContaining({
          category: 'browser',
          code: 'TIMEOUT'
        })
      );
    });

    it('should log protocol errors with debug level', async () => {
      const error = ErrorFactory.invalidRequest('Bad request');
      const operation = vi.fn().mockResolvedValue('success');
      
      await errorHandler.handleError(error, operation);
      
      expect(console.debug).toHaveBeenCalledWith(
        'Protocol Error:',
        expect.objectContaining({
          category: 'protocol',
          code: 'INVALID_REQUEST'
        })
      );
    });
  });
});