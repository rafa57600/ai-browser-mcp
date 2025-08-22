// Comprehensive error handling types

export type ErrorCategory = 'protocol' | 'security' | 'browser' | 'system';

export interface BaseError extends Error {
  category: ErrorCategory;
  code: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  recoverable?: boolean;
  retryable?: boolean;
}

// Protocol errors - JSON-RPC and MCP related
export interface ProtocolError extends BaseError {
  category: 'protocol';
  code: 'INVALID_REQUEST' | 'INVALID_PARAMS' | 'METHOD_NOT_FOUND' | 'PARSE_ERROR' | 'INTERNAL_ERROR';
  requestId?: string;
  method?: string;
}

// Security errors - domain access, rate limiting, permissions
export interface SecurityError extends BaseError {
  category: 'security';
  code: 'DOMAIN_DENIED' | 'RATE_LIMIT_EXCEEDED' | 'PERMISSION_TIMEOUT' | 'INVALID_DOMAIN' | 'UNAUTHORIZED_ACCESS';
  domain?: string;
  operation?: string;
  clientId?: string;
}

// Browser errors - Playwright, navigation, interaction failures
export interface BrowserError extends BaseError {
  category: 'browser';
  code: 'NAVIGATION_FAILED' | 'ELEMENT_NOT_FOUND' | 'TIMEOUT' | 'CONTEXT_CRASHED' | 'PAGE_CRASHED' | 'INTERACTION_FAILED' | 'EVALUATION_FAILED';
  sessionId?: string;
  url?: string;
  selector?: string;
}

// System errors - resource exhaustion, file system, network
export interface SystemError extends BaseError {
  category: 'system';
  code: 'RESOURCE_EXHAUSTED' | 'FILE_SYSTEM_ERROR' | 'NETWORK_ERROR' | 'OUT_OF_MEMORY' | 'DISK_FULL' | 'SERVICE_UNAVAILABLE';
  resourceType?: string;
  usage?: number;
  limit?: number;
}

// Union type for all error types
export type MCPBrowserError = ProtocolError | SecurityError | BrowserError | SystemError;

// Error response format for MCP tools
export interface ErrorResponse {
  success: false;
  error: {
    category: ErrorCategory;
    code: string;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
    recoverable?: boolean;
    retryable?: boolean;
  };
}

// Circuit breaker states
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringWindow: number;
  minimumRequests: number;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date | undefined;
  nextRetryTime?: Date | undefined;
  totalRequests: number;
  windowStart: Date;
}

// Recovery strategy types
export type RecoveryStrategy = 'RETRY' | 'RECREATE_CONTEXT' | 'FALLBACK' | 'CIRCUIT_BREAK' | 'NONE';

export interface RecoveryConfig {
  strategy: RecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  maxRetryDelay?: number;
}

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  attempts: number;
  error?: MCPBrowserError;
  recoveredAt?: Date;
}