import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SecurityManager } from '../../../src/security/security-manager.js';
import type { NetworkLog } from '../../../src/types/log-types.js';
import type { SecurityManagerConfig } from '../../../src/types/security-types.js';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    vi.useFakeTimers();
    securityManager = new SecurityManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Domain Access Control', () => {
    it('should allow access to pre-configured allowed domains', async () => {
      const config: SecurityManagerConfig = {
        allowedDomains: ['example.com', 'test.org']
      };
      securityManager = new SecurityManager(config);

      const result = await securityManager.checkDomainAccess('example.com', 'session1');
      expect(result).toBe(true);
    });

    it('should auto-approve localhost when configured', async () => {
      const config: SecurityManagerConfig = {
        autoApproveLocalhost: true
      };
      securityManager = new SecurityManager(config);

      const result = await securityManager.checkDomainAccess('localhost', 'session1');
      expect(result).toBe(true);
      expect(securityManager.getAllowedDomains()).toContain('localhost');
    });

    it('should normalize domain names correctly', async () => {
      securityManager.addAllowedDomain('https://example.com');
      
      const result = await securityManager.checkDomainAccess('example.com', 'session1');
      expect(result).toBe(true);
    });

    it('should handle permission requests for new domains', async () => {
      const permissionPromise = securityManager.checkDomainAccess('newdomain.com', 'session1');
      
      // Fast-forward past the auto-deny timeout
      vi.advanceTimersByTime(1500);
      
      const result = await permissionPromise;
      expect(result).toBe(false);
    });

    it('should allow manual approval of domain requests', async () => {
      const permissionPromise = securityManager.checkDomainAccess('newdomain.com', 'session1');
      
      // Manually approve the request
      const approved = securityManager.respondToPermissionRequest('newdomain.com', 'session1', true);
      expect(approved).toBe(true);
      
      const result = await permissionPromise;
      expect(result).toBe(true);
      expect(securityManager.getAllowedDomains()).toContain('newdomain.com');
    });

    it('should timeout permission requests', async () => {
      const config: SecurityManagerConfig = {
        userPermissionTimeout: 1000
      };
      securityManager = new SecurityManager(config);

      const permissionPromise = securityManager.checkDomainAccess('timeout.com', 'session1');
      
      // Fast-forward past the timeout
      vi.advanceTimersByTime(1500);
      
      const result = await permissionPromise;
      expect(result).toBe(false);
    });

    it('should manage allowed domains', () => {
      securityManager.addAllowedDomain('new.com');
      expect(securityManager.getAllowedDomains()).toContain('new.com');

      securityManager.removeAllowedDomain('new.com');
      expect(securityManager.getAllowedDomains()).not.toContain('new.com');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limits', () => {
      const result = securityManager.checkRateLimit('client1', 'operation1');
      expect(result).toBe(true);
    });

    it('should enforce minute rate limits', () => {
      const config: SecurityManagerConfig = {
        rateLimits: { requestsPerMinute: 2, requestsPerHour: 100 }
      };
      securityManager = new SecurityManager(config);

      // First two requests should pass
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
      
      // Third request should fail
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(false);
    });

    it('should enforce hourly rate limits', () => {
      const config: SecurityManagerConfig = {
        rateLimits: { requestsPerMinute: 100, requestsPerHour: 2 }
      };
      securityManager = new SecurityManager(config);

      // First two requests should pass
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
      
      // Third request should fail due to hourly limit
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(false);
    });

    it('should reset rate limits after time window', () => {
      const config: SecurityManagerConfig = {
        rateLimits: { requestsPerMinute: 1, requestsPerHour: 100 }
      };
      securityManager = new SecurityManager(config);

      // First request should pass
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
      
      // Second request should fail
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(false);
      
      // Fast-forward past the minute window
      vi.advanceTimersByTime(61000);
      
      // Request should now pass again
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
    });

    it('should track rate limits per client and operation', () => {
      const config: SecurityManagerConfig = {
        rateLimits: { requestsPerMinute: 1, requestsPerHour: 100 }
      };
      securityManager = new SecurityManager(config);

      // Different clients should have separate limits
      expect(securityManager.checkRateLimit('client1', 'operation1')).toBe(true);
      expect(securityManager.checkRateLimit('client2', 'operation1')).toBe(true);
      
      // Different operations should have separate limits
      expect(securityManager.checkRateLimit('client1', 'operation2')).toBe(true);
    });

    it('should provide rate limit status', () => {
      const config: SecurityManagerConfig = {
        rateLimits: { requestsPerMinute: 10, requestsPerHour: 100 }
      };
      securityManager = new SecurityManager(config);

      securityManager.checkRateLimit('client1', 'operation1');
      securityManager.checkRateLimit('client1', 'operation1');

      const status = securityManager.getRateLimitStatus('client1', 'operation1');
      expect(status.minuteCount).toBe(2);
      expect(status.minuteLimit).toBe(10);
      expect(status.hourCount).toBe(2);
      expect(status.hourLimit).toBe(100);
    });

    it('should clear rate limits', () => {
      securityManager.checkRateLimit('client1', 'operation1');
      securityManager.checkRateLimit('client2', 'operation1');

      securityManager.clearRateLimits('client1');
      
      const status1 = securityManager.getRateLimitStatus('client1', 'operation1');
      const status2 = securityManager.getRateLimitStatus('client2', 'operation1');
      
      expect(status1.minuteCount).toBe(0);
      expect(status2.minuteCount).toBe(1);
    });
  });

  describe('Sensitive Data Filtering', () => {
    it('should filter sensitive headers', () => {
      const networkLog: NetworkLog = {
        timestamp: new Date(),
        method: 'GET',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {
          'Authorization': 'Bearer secret-token',
          'Cookie': 'session=abc123',
          'Content-Type': 'application/json',
          'X-API-Key': 'api-key-123'
        },
        responseHeaders: {
          'Set-Cookie': 'session=def456',
          'Content-Type': 'application/json'
        },
        duration: 100
      };

      const filtered = securityManager.filterSensitiveData(networkLog);

      expect(filtered.requestHeaders['Authorization']).toBe('[REDACTED]');
      expect(filtered.requestHeaders['Cookie']).toBe('[REDACTED]');
      expect(filtered.requestHeaders['X-API-Key']).toBe('[REDACTED]');
      expect(filtered.requestHeaders['Content-Type']).toBe('application/json');
      expect(filtered.responseHeaders['Set-Cookie']).toBe('[REDACTED]');
    });

    it('should sanitize JSON request bodies', () => {
      const networkLog: NetworkLog = {
        timestamp: new Date(),
        method: 'POST',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        requestBody: JSON.stringify({
          username: 'user123',
          password: 'secret123',
          token: 'auth-token',
          data: { key: 'value' }
        }),
        duration: 100
      };

      const filtered = securityManager.filterSensitiveData(networkLog);
      const parsedBody = JSON.parse(filtered.requestBody!);

      expect(parsedBody.username).toBe('user123');
      expect(parsedBody.password).toBe('[REDACTED]');
      expect(parsedBody.token).toBe('[REDACTED]');
      expect(parsedBody.data.key).toBe('value');
    });

    it('should sanitize string content', () => {
      const networkLog: NetworkLog = {
        timestamp: new Date(),
        method: 'POST',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        requestBody: 'username=user&password=secret&token=abc123',
        duration: 100
      };

      const filtered = securityManager.filterSensitiveData(networkLog);

      expect(filtered.requestBody).toContain('password=[REDACTED]');
      expect(filtered.requestBody).toContain('token=[REDACTED]');
      expect(filtered.requestBody).toContain('username=user');
    });

    it('should handle nested objects in JSON', () => {
      const networkLog: NetworkLog = {
        timestamp: new Date(),
        method: 'POST',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        requestBody: JSON.stringify({
          user: {
            credentials: {
              password: 'secret',
              api_key: 'key123'
            },
            profile: {
              name: 'John Doe'
            }
          }
        }),
        duration: 100
      };

      const filtered = securityManager.filterSensitiveData(networkLog);
      const parsedBody = JSON.parse(filtered.requestBody!);



      expect(parsedBody.user.credentials.password).toBe('[REDACTED]');
      expect(parsedBody.user.credentials.api_key).toBe('[REDACTED]');
      expect(parsedBody.user.profile.name).toBe('John Doe');
    });

    it('should handle arrays in JSON', () => {
      const networkLog: NetworkLog = {
        timestamp: new Date(),
        method: 'POST',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        requestBody: JSON.stringify([
          { username: 'user1', password: 'pass1' },
          { username: 'user2', token: 'token2' }
        ]),
        duration: 100
      };

      const filtered = securityManager.filterSensitiveData(networkLog);
      const parsedBody = JSON.parse(filtered.requestBody!);

      expect(parsedBody[0].username).toBe('user1');
      expect(parsedBody[0].password).toBe('[REDACTED]');
      expect(parsedBody[1].username).toBe('user2');
      expect(parsedBody[1].token).toBe('[REDACTED]');
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired rate limits', () => {
      securityManager.checkRateLimit('client1', 'operation1');
      
      // Fast-forward past cleanup threshold
      vi.advanceTimersByTime(3600000 + 1000); // 1 hour + 1 second
      
      securityManager.cleanup();
      
      const status = securityManager.getRateLimitStatus('client1', 'operation1');
      expect(status.minuteCount).toBe(0);
    });

    it('should clean up expired permission requests', () => {
      const config: SecurityManagerConfig = {
        userPermissionTimeout: 1000
      };
      securityManager = new SecurityManager(config);

      securityManager.checkDomainAccess('expired.com', 'session1');
      
      expect(securityManager.getPendingPermissionRequests()).toHaveLength(1);
      
      // Fast-forward past timeout
      vi.advanceTimersByTime(2000);
      
      securityManager.cleanup();
      
      expect(securityManager.getPendingPermissionRequests()).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const manager = new SecurityManager();
      
      expect(manager.getAllowedDomains()).toContain('localhost');
      expect(manager.getAllowedDomains()).toContain('127.0.0.1');
    });

    it('should use custom configuration', () => {
      const config: SecurityManagerConfig = {
        allowedDomains: ['custom.com'],
        rateLimits: { requestsPerMinute: 5, requestsPerHour: 50 },
        sensitiveHeaders: ['x-custom-auth'],
        userPermissionTimeout: 5000,
        autoApproveLocalhost: false
      };
      
      const manager = new SecurityManager(config);
      
      expect(manager.getAllowedDomains()).toContain('custom.com');
      expect(manager.getAllowedDomains()).not.toContain('localhost');
    });
  });
});