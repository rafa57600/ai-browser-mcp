import { 
  MCPBrowserError, 
  RecoveryStrategy, 
  RecoveryConfig, 
  RecoveryResult,
  BrowserError,
  SystemError 
} from '../types/error-types.js';
import { ErrorFactory } from './error-factory.js';
import { SessionManager } from '../browser/session-manager.js';

export class RecoveryManager {
  private recoveryConfigs = new Map<string, RecoveryConfig>();
  private defaultConfigs: Record<RecoveryStrategy, RecoveryConfig> = {
    RETRY: {
      strategy: 'RETRY',
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      maxRetryDelay: 10000
    },
    RECREATE_CONTEXT: {
      strategy: 'RECREATE_CONTEXT',
      maxRetries: 2,
      retryDelay: 2000
    },
    FALLBACK: {
      strategy: 'FALLBACK',
      maxRetries: 1
    },
    CIRCUIT_BREAK: {
      strategy: 'CIRCUIT_BREAK'
    },
    NONE: {
      strategy: 'NONE'
    }
  };

  constructor(private sessionManager?: SessionManager) {}

  async recover<T>(
    error: MCPBrowserError,
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<RecoveryResult> {
    const strategy = this.determineStrategy(error);
    const config = this.getConfig(strategy);

    switch (strategy) {
      case 'RETRY':
        return this.retryOperation(operation, config, error);
      
      case 'RECREATE_CONTEXT':
        return this.recreateContextAndRetry(operation, config, error, context);
      
      case 'FALLBACK':
        return this.fallbackOperation(operation, config, error);
      
      case 'CIRCUIT_BREAK':
        return {
          success: false,
          strategy: 'CIRCUIT_BREAK',
          attempts: 0,
          error
        };
      
      case 'NONE':
      default:
        return {
          success: false,
          strategy: 'NONE',
          attempts: 0,
          error
        };
    }
  }

  private determineStrategy(error: MCPBrowserError): RecoveryStrategy {
    // Check if error is explicitly marked as non-recoverable
    if (!error.recoverable) {
      return 'NONE';
    }

    switch (error.category) {
      case 'browser':
        return this.determineBrowserStrategy(error as BrowserError);
      
      case 'system':
        return this.determineSystemStrategy(error as SystemError);
      
      case 'security':
        // Security errors are generally not recoverable through automatic means
        return error.retryable ? 'RETRY' : 'NONE';
      
      case 'protocol':
        // Protocol errors might be retryable if they're internal errors
        return error.retryable ? 'RETRY' : 'NONE';
      
      default:
        return 'NONE';
    }
  }

  private determineBrowserStrategy(error: BrowserError): RecoveryStrategy {
    switch (error.code) {
      case 'CONTEXT_CRASHED':
      case 'PAGE_CRASHED':
        return 'RECREATE_CONTEXT';
      
      case 'TIMEOUT':
      case 'NAVIGATION_FAILED':
        return 'RETRY';
      
      case 'ELEMENT_NOT_FOUND':
        return 'RETRY'; // Element might appear after a short delay
      
      case 'INTERACTION_FAILED':
        return 'FALLBACK'; // Try alternative interaction methods
      
      case 'EVALUATION_FAILED':
        return 'RETRY'; // JavaScript might succeed on retry
      
      default:
        return 'NONE';
    }
  }

  private determineSystemStrategy(error: SystemError): RecoveryStrategy {
    switch (error.code) {
      case 'NETWORK_ERROR':
      case 'SERVICE_UNAVAILABLE':
        return 'RETRY';
      
      case 'RESOURCE_EXHAUSTED':
        return 'CIRCUIT_BREAK'; // Prevent further resource exhaustion
      
      case 'OUT_OF_MEMORY':
      case 'DISK_FULL':
        return 'NONE'; // These require manual intervention
      
      case 'FILE_SYSTEM_ERROR':
        return 'RETRY'; // Might be temporary
      
      default:
        return 'NONE';
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    config: RecoveryConfig,
    originalError: MCPBrowserError
  ): Promise<RecoveryResult> {
    let lastError = originalError;
    let delay = config.retryDelay || 1000;
    const maxRetries = config.maxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait before retry (except for first attempt)
        if (attempt > 1) {
          await this.sleep(delay);
        }

        await operation();
        
        return {
          success: true,
          strategy: 'RETRY',
          attempts: attempt,
          recoveredAt: new Date()
        };
      } catch (error) {
        lastError = ErrorFactory.fromError(error);
        
        // Increase delay for next attempt with backoff
        if (config.backoffMultiplier && config.maxRetryDelay) {
          delay = Math.min(delay * config.backoffMultiplier, config.maxRetryDelay);
        }
      }
    }

    return {
      success: false,
      strategy: 'RETRY',
      attempts: maxRetries,
      error: lastError
    };
  }

  private async recreateContextAndRetry<T>(
    operation: () => Promise<T>,
    config: RecoveryConfig,
    originalError: MCPBrowserError,
    context?: Record<string, unknown>
  ): Promise<RecoveryResult> {
    if (!this.sessionManager) {
      return {
        success: false,
        strategy: 'RECREATE_CONTEXT',
        attempts: 0,
        error: ErrorFactory.createSystemError(
          'SERVICE_UNAVAILABLE',
          'Session manager not available for context recreation'
        )
      };
    }

    const sessionId = context?.sessionId as string;
    if (!sessionId) {
      return {
        success: false,
        strategy: 'RECREATE_CONTEXT',
        attempts: 0,
        error: ErrorFactory.createBrowserError(
          'CONTEXT_CRASHED',
          'Cannot recreate context: session ID not provided'
        )
      };
    }

    const maxRetries = config.maxRetries || 2;
    let lastError = originalError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait before attempting recreation
        if (config.retryDelay) {
          await this.sleep(config.retryDelay);
        }

        // Recreate the browser context
        await this.sessionManager.recreateSession(sessionId);

        // Retry the operation with the new context
        await operation();

        return {
          success: true,
          strategy: 'RECREATE_CONTEXT',
          attempts: attempt,
          recoveredAt: new Date()
        };
      } catch (error) {
        lastError = ErrorFactory.fromError(error);
      }
    }

    return {
      success: false,
      strategy: 'RECREATE_CONTEXT',
      attempts: maxRetries,
      error: lastError
    };
  }

  private async fallbackOperation<T>(
    operation: () => Promise<T>,
    _config: RecoveryConfig,
    _originalError: MCPBrowserError
  ): Promise<RecoveryResult> {
    // For fallback, we would need specific fallback implementations
    // This is a placeholder that could be extended with specific fallback strategies
    try {
      // Attempt the operation once more with modified parameters
      await operation();
      
      return {
        success: true,
        strategy: 'FALLBACK',
        attempts: 1,
        recoveredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        strategy: 'FALLBACK',
        attempts: 1,
        error: ErrorFactory.fromError(error)
      };
    }
  }

  private getConfig(strategy: RecoveryStrategy): RecoveryConfig {
    return this.recoveryConfigs.get(strategy) || this.defaultConfigs[strategy];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Configuration methods
  setRecoveryConfig(strategy: RecoveryStrategy, config: RecoveryConfig): void {
    this.recoveryConfigs.set(strategy, config);
  }

  getRecoveryConfig(strategy: RecoveryStrategy): RecoveryConfig {
    return this.getConfig(strategy);
  }

  // Utility method to check if an error is recoverable
  static isRecoverable(error: MCPBrowserError): boolean {
    return error.recoverable === true;
  }

  // Utility method to check if an error is retryable
  static isRetryable(error: MCPBrowserError): boolean {
    return error.retryable === true;
  }
}