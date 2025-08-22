import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { 
  MCPBrowserError, 
  ErrorResponse, 
  RecoveryResult,
  CircuitBreakerConfig 
} from '../types/error-types.js';
import { ErrorFactory } from './error-factory.js';
import { CircuitBreaker, CircuitBreakerManager } from './circuit-breaker.js';
import { RecoveryManager } from './recovery-manager.js';
import { SessionManager } from '../browser/session-manager.js';

export interface ErrorHandlerConfig {
  enableRecovery?: boolean;
  enableCircuitBreaker?: boolean;
  logErrors?: boolean;
  circuitBreakerConfigs?: Record<string, Partial<CircuitBreakerConfig>>;
}

export class ErrorHandler {
  private circuitBreakerManager = new CircuitBreakerManager();
  private recoveryManager: RecoveryManager;
  private config: Required<ErrorHandlerConfig>;

  constructor(
    sessionManager?: SessionManager,
    config: ErrorHandlerConfig = {}
  ) {
    this.recoveryManager = new RecoveryManager(sessionManager);
    this.config = {
      enableRecovery: true,
      enableCircuitBreaker: true,
      logErrors: true,
      circuitBreakerConfigs: {},
      ...config
    };
  }

  /**
   * Handle an error with full recovery and circuit breaker support
   */
  async handleError<T>(
    error: unknown,
    operation: () => Promise<T>,
    context?: {
      operationName?: string;
      sessionId?: string;
      toolName?: string;
      [key: string]: unknown;
    }
  ): Promise<CallToolResult> {
    const mcpError = ErrorFactory.fromError(error);
    
    if (this.config.logErrors) {
      this.logError(mcpError, context);
    }

    // Try recovery if enabled and error is recoverable
    if (this.config.enableRecovery && mcpError.recoverable) {
      const recoveryResult = await this.attemptRecovery(mcpError, operation, context);
      if (recoveryResult.success) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              recovered: true,
              strategy: recoveryResult.strategy,
              attempts: recoveryResult.attempts
            })
          }],
          isError: false
        };
      }
    }

    // Return structured error response
    return this.createErrorResponse(mcpError);
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    operationName: string,
    operation: () => Promise<T>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    if (!this.config.enableCircuitBreaker) {
      return operation();
    }

    const breaker = this.circuitBreakerManager.getOrCreate(
      operationName,
      circuitBreakerConfig || this.config.circuitBreakerConfigs[operationName]
    );

    return breaker.execute(operation);
  }

  /**
   * Handle tool execution with full error handling
   */
  async handleToolExecution<T>(
    toolName: string,
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<CallToolResult> {
    try {
      const result = await this.executeWithCircuitBreaker(
        `tool.${toolName}`,
        operation
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, result })
        }],
        isError: false
      };
    } catch (error) {
      return this.handleError(error, operation, {
        ...context,
        toolName,
        operationName: `tool.${toolName}`
      });
    }
  }

  /**
   * Create a standardized error response
   */
  createErrorResponse(error: MCPBrowserError): CallToolResult {
    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        category: error.category,
        code: error.code,
        message: error.message,
        timestamp: error.timestamp.toISOString(),
        ...(error.context !== undefined && { context: error.context }),
        ...(error.recoverable !== undefined && { recoverable: error.recoverable }),
        ...(error.retryable !== undefined && { retryable: error.retryable })
      }
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(errorResponse)
      }],
      isError: true
    };
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery<T>(
    error: MCPBrowserError,
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<RecoveryResult> {
    try {
      return await this.recoveryManager.recover(error, operation, context);
    } catch (recoveryError) {
      if (this.config.logErrors) {
        console.error('Recovery attempt failed:', recoveryError);
      }
      
      return {
        success: false,
        strategy: 'NONE',
        attempts: 0,
        error: ErrorFactory.fromError(recoveryError)
      };
    }
  }

  /**
   * Log error with context
   */
  private logError(error: MCPBrowserError, context?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      category: error.category,
      code: error.code,
      message: error.message,
      context: {
        ...error.context,
        ...context
      },
      recoverable: error.recoverable,
      retryable: error.retryable,
      stack: error.stack
    };

    // Use appropriate log level based on error category
    switch (error.category) {
      case 'system':
        console.error('System Error:', logEntry);
        break;
      case 'security':
        console.warn('Security Error:', logEntry);
        break;
      case 'browser':
        console.info('Browser Error:', logEntry);
        break;
      case 'protocol':
        console.debug('Protocol Error:', logEntry);
        break;
      default:
        console.error('Unknown Error:', logEntry);
    }
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats(): Record<string, any> {
    return this.circuitBreakerManager.getAllStats();
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers(): void {
    this.circuitBreakerManager.reset();
  }

  /**
   * Get or create a circuit breaker for manual control
   */
  getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    return this.circuitBreakerManager.getOrCreate(name, config);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Utility method to wrap any async operation with error handling
   */
  async wrap<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: Record<string, unknown>
  ): Promise<{ success: true; result: T } | { success: false; error: MCPBrowserError }> {
    try {
      const result = await this.executeWithCircuitBreaker(operationName, operation);
      return { success: true, result };
    } catch (error) {
      const mcpError = ErrorFactory.fromError(error);
      
      if (this.config.logErrors) {
        this.logError(mcpError, { ...context, operationName });
      }

      // Try recovery if enabled
      if (this.config.enableRecovery && mcpError.recoverable) {
        const recoveryResult = await this.attemptRecovery(mcpError, operation, context);
        if (recoveryResult.success) {
          try {
            const result = await operation();
            return { success: true, result };
          } catch (retryError) {
            return { success: false, error: ErrorFactory.fromError(retryError) };
          }
        }
      }

      return { success: false, error: mcpError };
    }
  }
}