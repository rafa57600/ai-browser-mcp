// Security-related type definitions

export interface SecurityConfig {
  allowedDomains?: string[];
  rateLimits?: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
  };
  sensitiveHeaders?: string[];
  userPermissionTimeout?: number;
}

export interface RateLimit {
  count: number;
  resetTime: number;
  windowStart: number;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

export interface DomainPermissionRequest {
  domain: string;
  sessionId: string;
  timestamp: Date;
  resolve: (granted: boolean) => void;
  reject: (error: Error) => void;
}

export interface SecurityError extends Error {
  code: 'DOMAIN_DENIED' | 'RATE_LIMIT_EXCEEDED' | 'PERMISSION_TIMEOUT' | 'INVALID_DOMAIN';
  domain?: string;
  operation?: string;
  clientId?: string;
}

export interface SecurityManagerConfig {
  allowedDomains?: string[];
  rateLimits?: RateLimitConfig;
  sensitiveHeaders?: string[];
  userPermissionTimeout?: number;
  autoApproveLocalhost?: boolean;
}