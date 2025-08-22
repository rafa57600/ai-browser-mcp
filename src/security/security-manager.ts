import type { 
  SecurityManagerConfig, 
  RateLimit, 
  DomainPermissionRequest, 
  SecurityError
} from '../types/security-types.js';
import type { NetworkLog } from '../types/log-types.js';

export class SecurityManager {
  private allowedDomains: Set<string>;
  private rateLimits: Map<string, RateLimit>;
  private pendingPermissions: Map<string, DomainPermissionRequest>;
  private sensitiveHeaders: Set<string>;
  private config: Required<SecurityManagerConfig>;

  constructor(config: SecurityManagerConfig = {}) {
    this.config = {
      allowedDomains: config.allowedDomains || ['localhost', '127.0.0.1'],
      rateLimits: config.rateLimits || { requestsPerMinute: 60, requestsPerHour: 1000 },
      sensitiveHeaders: config.sensitiveHeaders || [
        'authorization', 'cookie', 'x-api-key', 'x-auth-token', 
        'x-access-token', 'bearer', 'x-csrf-token', 'x-session-id',
        'set-cookie'
      ],
      userPermissionTimeout: config.userPermissionTimeout || 30000, // 30 seconds
      autoApproveLocalhost: config.autoApproveLocalhost ?? true
    };

    this.allowedDomains = new Set(this.config.allowedDomains);
    this.rateLimits = new Map();
    this.pendingPermissions = new Map();
    this.sensitiveHeaders = new Set(this.config.sensitiveHeaders.map(h => h.toLowerCase()));
  }

  /**
   * Check if a domain is allowed for access
   */
  async checkDomainAccess(domain: string, sessionId: string): Promise<boolean> {
    const normalizedDomain = this.normalizeDomain(domain);
    
    // Check if domain is already allowed
    if (this.allowedDomains.has(normalizedDomain)) {
      return true;
    }

    // Auto-approve localhost if configured
    if (this.config.autoApproveLocalhost && this.isLocalhost(normalizedDomain)) {
      this.allowedDomains.add(normalizedDomain);
      return true;
    }

    // Request user permission for new domains
    try {
      const granted = await this.requestUserPermission(normalizedDomain, sessionId);
      if (granted) {
        this.allowedDomains.add(normalizedDomain);
      }
      return granted;
    } catch (error) {
      return false;
    }
  }

  /**
   * Request user permission for a new domain
   */
  private async requestUserPermission(domain: string, sessionId: string): Promise<boolean> {
    const requestKey = `${domain}:${sessionId}`;
    
    // Check if there's already a pending request for this domain
    const existingRequest = this.pendingPermissions.get(requestKey);
    if (existingRequest) {
      return new Promise((resolve, reject) => {
        existingRequest.resolve = resolve;
        existingRequest.reject = reject;
      });
    }

    return new Promise((resolve, reject) => {
      const request: DomainPermissionRequest = {
        domain,
        sessionId,
        timestamp: new Date(),
        resolve,
        reject
      };

      this.pendingPermissions.set(requestKey, request);

      // Set timeout for permission request
      setTimeout(() => {
        if (this.pendingPermissions.has(requestKey)) {
          this.pendingPermissions.delete(requestKey);
          const error = new Error(`Permission request timeout for domain: ${domain}`) as SecurityError;
          error.code = 'PERMISSION_TIMEOUT';
          error.domain = domain;
          reject(error);
        }
      }, this.config.userPermissionTimeout);

      // In a real implementation, this would trigger a UI prompt
      // For now, we'll auto-deny unknown domains for security
      setTimeout(() => {
        if (this.pendingPermissions.has(requestKey)) {
          this.pendingPermissions.delete(requestKey);
          resolve(false);
        }
      }, 1000);
    });
  }

  /**
   * Manually approve or deny a domain permission request
   */
  respondToPermissionRequest(domain: string, sessionId: string, granted: boolean): boolean {
    const requestKey = `${domain}:${sessionId}`;
    const request = this.pendingPermissions.get(requestKey);
    
    if (!request) {
      return false;
    }

    this.pendingPermissions.delete(requestKey);
    request.resolve(granted);
    return true;
  }

  /**
   * Get all pending permission requests
   */
  getPendingPermissionRequests(): DomainPermissionRequest[] {
    return Array.from(this.pendingPermissions.values());
  }

  /**
   * Check rate limits for a client and operation
   */
  checkRateLimit(clientId: string, operation: string): boolean {
    const key = `${clientId}:${operation}`;
    const hourlyKey = `${clientId}:${operation}:hourly`;
    const now = Date.now();
    
    // Check hourly limit first
    const hourStart = now - (now % 3600000); // Start of current hour
    const hourlyLimit = this.rateLimits.get(hourlyKey);
    
    if (!hourlyLimit || hourlyLimit.windowStart < hourStart) {
      // New hour or first request
      this.rateLimits.set(hourlyKey, {
        count: 1,
        resetTime: hourStart + 3600000,
        windowStart: hourStart
      });
    } else {
      if (hourlyLimit.count >= this.config.rateLimits.requestsPerHour) {
        return false;
      }
      hourlyLimit.count++;
    }

    // Check minute limit
    const limit = this.rateLimits.get(key);

    if (!limit) {
      // First request for this client/operation
      this.rateLimits.set(key, {
        count: 1,
        resetTime: now + 60000, // 1 minute window
        windowStart: now
      });
      return true;
    }

    // Check if we need to reset the window
    if (now >= limit.resetTime) {
      limit.count = 1;
      limit.resetTime = now + 60000;
      limit.windowStart = now;
      return true;
    }

    // Check minute limit
    if (limit.count >= this.config.rateLimits.requestsPerMinute) {
      return false;
    }

    limit.count++;
    return true;
  }

  /**
   * Filter sensitive data from network logs
   */
  filterSensitiveData(log: NetworkLog): NetworkLog {
    const filtered: NetworkLog = {
      timestamp: log.timestamp,
      method: log.method,
      url: log.url,
      status: log.status,
      requestHeaders: this.filterHeaders(log.requestHeaders),
      responseHeaders: this.filterHeaders(log.responseHeaders),
      duration: log.duration
    };

    if (log.requestBody !== undefined) {
      const sanitizedRequestBody = this.sanitizeBody(log.requestBody);
      if (sanitizedRequestBody !== undefined) {
        filtered.requestBody = sanitizedRequestBody;
      }
    }

    if (log.responseBody !== undefined) {
      const sanitizedResponseBody = this.sanitizeBody(log.responseBody);
      if (sanitizedResponseBody !== undefined) {
        filtered.responseBody = sanitizedResponseBody;
      }
    }

    return filtered;
  }

  /**
   * Filter sensitive headers
   */
  private filterHeaders(headers: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (this.sensitiveHeaders.has(lowerKey)) {
        filtered[key] = '[REDACTED]';
      } else {
        filtered[key] = value;
      }
    }
    
    return filtered;
  }

  /**
   * Sanitize request/response bodies
   */
  private sanitizeBody(body?: string): string | undefined {
    if (!body) return body;

    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(this.sanitizeObject(parsed));
    } catch {
      // Not JSON, apply basic sanitization
      return this.sanitizeString(body);
    }
  }

  /**
   * Recursively sanitize objects
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (this.isSensitiveField(lowerKey) && typeof value === 'string') {
        // Only redact string values, not objects
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeObject(value);
      }
    }

    return sanitized;
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'token', 'secret', 'auth', 'credential',
      'session', 'cookie', 'csrf', 'api_key', 'access_token',
      'refresh_token', 'bearer', 'authorization'
    ];

    return sensitiveFields.some(field => fieldName.includes(field));
  }

  /**
   * Sanitize string content
   */
  private sanitizeString(content: string): string {
    // Remove potential tokens and keys from string content
    return content
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'bearer [REDACTED]')
      .replace(/token[=:]\s*[a-zA-Z0-9._-]+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*[a-zA-Z0-9._-]+/gi, 'key=[REDACTED]')
      .replace(/password[=:]\s*[^\s&]+/gi, 'password=[REDACTED]');
  }

  /**
   * Normalize domain name
   */
  private normalizeDomain(domain: string): string {
    try {
      const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
      return url.hostname.toLowerCase();
    } catch {
      return domain.toLowerCase();
    }
  }

  /**
   * Check if domain is localhost
   */
  private isLocalhost(domain: string): boolean {
    const localhostPatterns = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    return localhostPatterns.includes(domain) || domain.endsWith('.localhost');
  }

  /**
   * Add a domain to the allowlist
   */
  addAllowedDomain(domain: string): void {
    this.allowedDomains.add(this.normalizeDomain(domain));
  }

  /**
   * Remove a domain from the allowlist
   */
  removeAllowedDomain(domain: string): void {
    this.allowedDomains.delete(this.normalizeDomain(domain));
  }

  /**
   * Get all allowed domains
   */
  getAllowedDomains(): string[] {
    return Array.from(this.allowedDomains);
  }

  /**
   * Clear rate limit data for a client
   */
  clearRateLimits(clientId?: string): void {
    if (clientId) {
      const keysToDelete = Array.from(this.rateLimits.keys())
        .filter(key => key.startsWith(`${clientId}:`));
      keysToDelete.forEach(key => this.rateLimits.delete(key));
    } else {
      this.rateLimits.clear();
    }
  }

  /**
   * Get current rate limit status for a client
   */
  getRateLimitStatus(clientId: string, operation: string): {
    minuteCount: number;
    minuteLimit: number;
    hourCount: number;
    hourLimit: number;
    resetTime: number;
  } {
    const minuteKey = `${clientId}:${operation}`;
    const hourlyKey = `${clientId}:${operation}:hourly`;
    const now = Date.now();
    
    const minuteLimit = this.rateLimits.get(minuteKey);
    const hourlyLimit = this.rateLimits.get(hourlyKey);

    // Reset counts if windows have expired
    let minuteCount = 0;
    let hourCount = 0;

    if (minuteLimit && now < minuteLimit.resetTime) {
      minuteCount = minuteLimit.count;
    }

    if (hourlyLimit) {
      const hourStart = now - (now % 3600000);
      if (hourlyLimit.windowStart >= hourStart) {
        hourCount = hourlyLimit.count;
      }
    }

    return {
      minuteCount,
      minuteLimit: this.config.rateLimits.requestsPerMinute,
      hourCount,
      hourLimit: this.config.rateLimits.requestsPerHour,
      resetTime: minuteLimit?.resetTime || 0
    };
  }

  /**
   * Cleanup expired rate limits and permission requests
   */
  cleanup(): void {
    const now = Date.now();
    
    // Clean up expired rate limits
    for (const [key, limit] of this.rateLimits.entries()) {
      if (now >= limit.resetTime + 3600000) { // Keep for 1 hour after reset
        this.rateLimits.delete(key);
      }
    }

    // Clean up expired permission requests
    for (const [key, request] of this.pendingPermissions.entries()) {
      if (now - request.timestamp.getTime() > this.config.userPermissionTimeout) {
        this.pendingPermissions.delete(key);
        const error = new Error(`Permission request expired for domain: ${request.domain}`) as SecurityError;
        error.code = 'PERMISSION_TIMEOUT';
        error.domain = request.domain;
        request.reject(error);
      }
    }
  }
}