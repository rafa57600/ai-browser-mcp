import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecoveryManager } from '../../../src/errors/recovery-manager.js';
import { ErrorFactory } from '../../../src/errors/error-factory.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { RecoveryStrategy } from '../../../src/types/error-types.js';

// Mock SessionManager
vi.mock('../../../src/browser/session-manager.js', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    recreateSession: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('RecoveryManager', () => {
  let recoveryManager: RecoveryManager;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    mockSessionManager = new SessionManager();
    recoveryManager = new RecoveryManager(mockSessionManager);
    
    // Set faster retry delays for tests
    recoveryManager.setRecoveryConfig('RETRY', {
      strategy: 'RETRY',
      maxRetries: 3,
      retryDelay: 10, // Much faster for tests
      backoffMultiplier: 1.5,
      maxRetryDelay: 100
    });
    
    recoveryManager.setRecoveryConfig('RECREATE_CONTEXT', {
      strategy: 'RECREATE_CONTEXT',
      maxRetries: 2,
      retryDelay: 10
    });
  });

  describe('Strategy determination', () => {
    it('should return NONE for non-recoverable errors', async () => {
      const error = ErrorFactory.domainDenied('malicious.com');
      error.recoverable = false;
      
      const operation = vi.fn().mockResolvedValue('success');
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.strategy).toBe('NONE');
      expect(result.success).toBe(false);
      expect(operation).not.toHaveBeenCalled();
    });

    it('should return RECREATE_CONTEXT for context crashed errors', async () => {
      const error = ErrorFactory.contextCrashed('session-123');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation, { sessionId: 'session-123' });
      
      expect(result.strategy).toBe('RECREATE_CONTEXT');
      expect(mockSessionManager.recreateSession).toHaveBeenCalledWith('session-123');
    });

    it('should return RETRY for timeout errors', async () => {
      const error = ErrorFactory.timeout('navigation', 30000);
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Still failing'))
        .mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.strategy).toBe('RETRY');
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should return RETRY for navigation failed errors', async () => {
      const error = ErrorFactory.navigationFailed('https://example.com', 'Network error');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.strategy).toBe('RETRY');
    });

    it('should return FALLBACK for interaction failed errors', async () => {
      const error = ErrorFactory.interactionFailed('click', '#button', 'Element not clickable');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.strategy).toBe('FALLBACK');
    });

    it('should return CIRCUIT_BREAK for resource exhausted errors', async () => {
      const error = ErrorFactory.resourceExhausted('memory', 2048, 1024);
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.strategy).toBe('CIRCUIT_BREAK');
      expect(result.success).toBe(false);
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Retry recovery', () => {
    it('should succeed on first retry', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('RETRY');
      expect(result.attempts).toBe(1);
      expect(result.recoveredAt).toBeInstanceOf(Date);
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should retry multiple times before succeeding', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.success).toBe(false);
      expect(result.strategy).toBe('RETRY');
      expect(result.attempts).toBe(3); // Default max retries
      expect(result.error).toBeDefined();
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should apply backoff delay between retries', async () => {
      const error = ErrorFactory.timeout('operation', 5000);
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      const result = await recoveryManager.recover(error, operation);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      // Should have waited at least 10ms (test retry delay)
      expect(endTime - startTime).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Context recreation recovery', () => {
    it('should recreate context and retry successfully', async () => {
      const error = ErrorFactory.contextCrashed('session-123');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation, { sessionId: 'session-123' });
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('RECREATE_CONTEXT');
      expect(result.attempts).toBe(1);
      expect(mockSessionManager.recreateSession).toHaveBeenCalledWith('session-123');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should fail if session manager is not available', async () => {
      const recoveryManagerWithoutSession = new RecoveryManager();
      const error = ErrorFactory.contextCrashed('session-123');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManagerWithoutSession.recover(error, operation, { sessionId: 'session-123' });
      
      expect(result.success).toBe(false);
      expect(result.strategy).toBe('RECREATE_CONTEXT');
      expect(result.attempts).toBe(0);
      expect(result.error?.message).toContain('Session manager not available');
    });

    it('should fail if session ID is not provided', async () => {
      const error = ErrorFactory.contextCrashed('session-123');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.success).toBe(false);
      expect(result.strategy).toBe('RECREATE_CONTEXT');
      expect(result.attempts).toBe(0);
      expect(result.error?.message).toContain('session ID not provided');
    });

    it('should retry context recreation on failure', async () => {
      const error = ErrorFactory.contextCrashed('session-123');
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Recreation failed'))
        .mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation, { sessionId: 'session-123' });
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(mockSessionManager.recreateSession).toHaveBeenCalledTimes(2);
    });

    it('should fail after max recreation attempts', async () => {
      const error = ErrorFactory.contextCrashed('session-123');
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      const result = await recoveryManager.recover(error, operation, { sessionId: 'session-123' });
      
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // Default max retries for recreation
      expect(mockSessionManager.recreateSession).toHaveBeenCalledTimes(2);
    });
  });

  describe('Fallback recovery', () => {
    it('should attempt fallback operation', async () => {
      const error = ErrorFactory.interactionFailed('click', '#button', 'Not clickable');
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.success).toBe(true);
      expect(result.strategy).toBe('FALLBACK');
      expect(result.attempts).toBe(1);
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should fail if fallback operation fails', async () => {
      const error = ErrorFactory.interactionFailed('click', '#button', 'Not clickable');
      const operation = vi.fn().mockRejectedValue(new Error('Fallback failed'));
      
      const result = await recoveryManager.recover(error, operation);
      
      expect(result.success).toBe(false);
      expect(result.strategy).toBe('FALLBACK');
      expect(result.attempts).toBe(1);
      expect(result.error?.message).toBe('Fallback failed');
    });
  });

  describe('Configuration', () => {
    it('should allow custom recovery configuration', () => {
      const customConfig = {
        strategy: 'RETRY' as RecoveryStrategy,
        maxRetries: 5,
        retryDelay: 2000
      };
      
      recoveryManager.setRecoveryConfig('RETRY', customConfig);
      const retrievedConfig = recoveryManager.getRecoveryConfig('RETRY');
      
      expect(retrievedConfig).toEqual(customConfig);
    });

    it('should use default configuration when not customized', () => {
      // Create a fresh recovery manager to get actual defaults
      const freshRecoveryManager = new RecoveryManager();
      const defaultConfig = freshRecoveryManager.getRecoveryConfig('RETRY');
      
      expect(defaultConfig.strategy).toBe('RETRY');
      expect(defaultConfig.maxRetries).toBe(3);
      expect(defaultConfig.retryDelay).toBe(1000);
    });
  });

  describe('Utility methods', () => {
    it('should identify recoverable errors', () => {
      const recoverableError = ErrorFactory.timeout('operation', 5000);
      const nonRecoverableError = ErrorFactory.domainDenied('malicious.com');
      nonRecoverableError.recoverable = false;
      
      expect(RecoveryManager.isRecoverable(recoverableError)).toBe(true);
      expect(RecoveryManager.isRecoverable(nonRecoverableError)).toBe(false);
    });

    it('should identify retryable errors', () => {
      const retryableError = ErrorFactory.timeout('operation', 5000);
      const nonRetryableError = ErrorFactory.domainDenied('malicious.com');
      
      expect(RecoveryManager.isRetryable(retryableError)).toBe(true);
      expect(RecoveryManager.isRetryable(nonRetryableError)).toBe(false);
    });
  });
});