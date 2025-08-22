import { 
  MCPBrowserError, 
  ProtocolError, 
  SecurityError, 
  BrowserError, 
  SystemError,
  ErrorCategory 
} from '../types/error-types.js';

export class ErrorFactory {
  // Protocol errors
  static createProtocolError(
    code: ProtocolError['code'],
    message: string,
    context?: Record<string, unknown>
  ): ProtocolError {
    const error = new Error(message) as ProtocolError;
    error.category = 'protocol';
    error.code = code;
    error.timestamp = new Date();
    if (context !== undefined) {
      error.context = context;
    }
    error.recoverable = false;
    error.retryable = code === 'INTERNAL_ERROR';
    return error;
  }

  static invalidRequest(message: string, requestId?: string, method?: string): ProtocolError {
    return this.createProtocolError('INVALID_REQUEST', message, { requestId, method });
  }

  static invalidParams(message: string, params?: Record<string, unknown>): ProtocolError {
    return this.createProtocolError('INVALID_PARAMS', message, { params });
  }

  static methodNotFound(method: string): ProtocolError {
    return this.createProtocolError('METHOD_NOT_FOUND', `Method '${method}' not found`, { method });
  }

  static parseError(message: string): ProtocolError {
    return this.createProtocolError('PARSE_ERROR', message);
  }

  static internalError(message: string, originalError?: Error): ProtocolError {
    return this.createProtocolError('INTERNAL_ERROR', message, { 
      originalError: originalError?.message,
      stack: originalError?.stack 
    });
  }

  // Security errors
  static createSecurityError(
    code: SecurityError['code'],
    message: string,
    context?: Record<string, unknown>
  ): SecurityError {
    const error = new Error(message) as SecurityError;
    error.category = 'security';
    error.code = code;
    error.timestamp = new Date();
    if (context !== undefined) {
      error.context = context;
    }
    error.recoverable = code === 'PERMISSION_TIMEOUT';
    error.retryable = code === 'RATE_LIMIT_EXCEEDED' || code === 'PERMISSION_TIMEOUT';
    return error;
  }

  static domainDenied(domain: string, sessionId?: string): SecurityError {
    return this.createSecurityError('DOMAIN_DENIED', `Access to domain '${domain}' is denied`, {
      domain,
      sessionId
    });
  }

  static rateLimitExceeded(clientId: string, operation: string): SecurityError {
    return this.createSecurityError('RATE_LIMIT_EXCEEDED', `Rate limit exceeded for operation '${operation}'`, {
      clientId,
      operation
    });
  }

  static permissionTimeout(domain: string): SecurityError {
    return this.createSecurityError('PERMISSION_TIMEOUT', `Permission request for domain '${domain}' timed out`, {
      domain
    });
  }

  static invalidDomain(domain: string): SecurityError {
    return this.createSecurityError('INVALID_DOMAIN', `Invalid domain format: '${domain}'`, {
      domain
    });
  }

  static unauthorizedAccess(operation: string, sessionId?: string): SecurityError {
    return this.createSecurityError('UNAUTHORIZED_ACCESS', `Unauthorized access to operation '${operation}'`, {
      operation,
      sessionId
    });
  }

  // Browser errors
  static createBrowserError(
    code: BrowserError['code'],
    message: string,
    context?: Record<string, unknown>
  ): BrowserError {
    const error = new Error(message) as BrowserError;
    error.category = 'browser';
    error.code = code;
    error.timestamp = new Date();
    if (context !== undefined) {
      error.context = context;
    }
    error.recoverable = code === 'TIMEOUT' || code === 'CONTEXT_CRASHED';
    error.retryable = code === 'TIMEOUT' || code === 'NAVIGATION_FAILED';
    return error;
  }

  static navigationFailed(url: string, reason: string, sessionId?: string): BrowserError {
    const error = this.createBrowserError('NAVIGATION_FAILED', `Navigation to '${url}' failed: ${reason}`, {
      url,
      sessionId,
      reason
    });
    error.recoverable = true;
    error.retryable = true;
    return error;
  }

  static elementNotFound(selector: string, sessionId?: string): BrowserError {
    return this.createBrowserError('ELEMENT_NOT_FOUND', `Element not found: '${selector}'`, {
      selector,
      sessionId
    });
  }

  static timeout(operation: string, timeoutMs: number, sessionId?: string): BrowserError {
    return this.createBrowserError('TIMEOUT', `Operation '${operation}' timed out after ${timeoutMs}ms`, {
      operation,
      timeoutMs,
      sessionId
    });
  }

  static contextCrashed(sessionId: string, reason?: string): BrowserError {
    return this.createBrowserError('CONTEXT_CRASHED', `Browser context crashed for session '${sessionId}'${reason ? ': ' + reason : ''}`, {
      sessionId,
      reason
    });
  }

  static pageCrashed(sessionId: string, url?: string): BrowserError {
    return this.createBrowserError('PAGE_CRASHED', `Page crashed for session '${sessionId}'${url ? ' at ' + url : ''}`, {
      sessionId,
      url
    });
  }

  static interactionFailed(action: string, selector: string, reason: string, sessionId?: string): BrowserError {
    const error = this.createBrowserError('INTERACTION_FAILED', `${action} failed on '${selector}': ${reason}`, {
      action,
      selector,
      reason,
      sessionId
    });
    error.recoverable = true;
    error.retryable = false; // Use fallback instead of retry
    return error;
  }

  static evaluationFailed(code: string, reason: string, sessionId?: string): BrowserError {
    return this.createBrowserError('EVALUATION_FAILED', `JavaScript evaluation failed: ${reason}`, {
      code: code.substring(0, 100) + (code.length > 100 ? '...' : ''),
      reason,
      sessionId
    });
  }

  // System errors
  static createSystemError(
    code: SystemError['code'],
    message: string,
    context?: Record<string, unknown>
  ): SystemError {
    const error = new Error(message) as SystemError;
    error.category = 'system';
    error.code = code;
    error.timestamp = new Date();
    if (context !== undefined) {
      error.context = context;
    }
    error.recoverable = code !== 'OUT_OF_MEMORY' && code !== 'DISK_FULL';
    error.retryable = code === 'NETWORK_ERROR' || code === 'SERVICE_UNAVAILABLE';
    return error;
  }

  static resourceExhausted(resourceType: string, usage: number, limit: number): SystemError {
    return this.createSystemError('RESOURCE_EXHAUSTED', `${resourceType} resource exhausted: ${usage}/${limit}`, {
      resourceType,
      usage,
      limit
    });
  }

  static fileSystemError(operation: string, path: string, reason: string): SystemError {
    return this.createSystemError('FILE_SYSTEM_ERROR', `File system ${operation} failed for '${path}': ${reason}`, {
      operation,
      path,
      reason
    });
  }

  static networkError(operation: string, reason: string): SystemError {
    return this.createSystemError('NETWORK_ERROR', `Network ${operation} failed: ${reason}`, {
      operation,
      reason
    });
  }

  static outOfMemory(usage: number, limit: number): SystemError {
    return this.createSystemError('OUT_OF_MEMORY', `Out of memory: ${usage}MB used, ${limit}MB limit`, {
      usage,
      limit,
      resourceType: 'memory'
    });
  }

  static diskFull(usage: number, limit: number, path?: string): SystemError {
    return this.createSystemError('DISK_FULL', `Disk full: ${usage}MB used, ${limit}MB available${path ? ' at ' + path : ''}`, {
      usage,
      limit,
      path,
      resourceType: 'disk'
    });
  }

  static serviceUnavailable(service: string, reason?: string): SystemError {
    return this.createSystemError('SERVICE_UNAVAILABLE', `Service '${service}' unavailable${reason ? ': ' + reason : ''}`, {
      service,
      reason
    });
  }

  // Generic error creation from unknown errors
  static fromError(error: unknown, category?: ErrorCategory, code?: string): MCPBrowserError {
    if (this.isMCPBrowserError(error)) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Try to infer category and code from error message if not provided
    const inferredCategory = category || this.inferCategory(message);
    const inferredCode = code || this.inferCode(message, inferredCategory);

    switch (inferredCategory) {
      case 'protocol':
        return this.createProtocolError(inferredCode as ProtocolError['code'], message, { stack });
      case 'security':
        return this.createSecurityError(inferredCode as SecurityError['code'], message, { stack });
      case 'browser':
        return this.createBrowserError(inferredCode as BrowserError['code'], message, { stack });
      case 'system':
        return this.createSystemError(inferredCode as SystemError['code'], message, { stack });
      default:
        return this.internalError(message, error instanceof Error ? error : undefined);
    }
  }

  // Type guard for MCPBrowserError
  static isMCPBrowserError(error: unknown): error is MCPBrowserError {
    return error instanceof Error && 
           'category' in error && 
           'code' in error && 
           'timestamp' in error;
  }

  // Infer error category from message
  private static inferCategory(message: string): ErrorCategory {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('timeout') || 
        lowerMessage.includes('element not found') || 
        lowerMessage.includes('navigation') ||
        lowerMessage.includes('playwright') ||
        lowerMessage.includes('browser') ||
        lowerMessage.includes('page')) {
      return 'browser';
    }
    
    if (lowerMessage.includes('domain') || 
        lowerMessage.includes('permission') || 
        lowerMessage.includes('rate limit') ||
        lowerMessage.includes('unauthorized')) {
      return 'security';
    }
    
    if (lowerMessage.includes('memory') || 
        lowerMessage.includes('disk') || 
        lowerMessage.includes('network') ||
        lowerMessage.includes('file system') ||
        lowerMessage.includes('resource')) {
      return 'system';
    }
    
    return 'protocol';
  }

  // Infer error code from message and category
  private static inferCode(message: string, category: ErrorCategory): string {
    const lowerMessage = message.toLowerCase();
    
    switch (category) {
      case 'protocol':
        if (lowerMessage.includes('invalid')) return 'INVALID_REQUEST';
        if (lowerMessage.includes('parse')) return 'PARSE_ERROR';
        if (lowerMessage.includes('method')) return 'METHOD_NOT_FOUND';
        return 'INTERNAL_ERROR';
        
      case 'security':
        if (lowerMessage.includes('domain')) return 'DOMAIN_DENIED';
        if (lowerMessage.includes('rate limit')) return 'RATE_LIMIT_EXCEEDED';
        if (lowerMessage.includes('permission')) return 'PERMISSION_TIMEOUT';
        return 'UNAUTHORIZED_ACCESS';
        
      case 'browser':
        if (lowerMessage.includes('timeout')) return 'TIMEOUT';
        if (lowerMessage.includes('element not found')) return 'ELEMENT_NOT_FOUND';
        if (lowerMessage.includes('navigation')) return 'NAVIGATION_FAILED';
        if (lowerMessage.includes('crashed')) return 'CONTEXT_CRASHED';
        if (lowerMessage.includes('evaluation')) return 'EVALUATION_FAILED';
        return 'INTERACTION_FAILED';
        
      case 'system':
        if (lowerMessage.includes('memory')) return 'OUT_OF_MEMORY';
        if (lowerMessage.includes('disk')) return 'DISK_FULL';
        if (lowerMessage.includes('network')) return 'NETWORK_ERROR';
        if (lowerMessage.includes('file')) return 'FILE_SYSTEM_ERROR';
        if (lowerMessage.includes('resource')) return 'RESOURCE_EXHAUSTED';
        return 'SERVICE_UNAVAILABLE';
        
      default:
        return 'INTERNAL_ERROR';
    }
  }
}