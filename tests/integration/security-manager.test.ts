import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityManager } from '../../src/security/security-manager.js';
import type { NetworkLog } from '../../src/types/log-types.js';
import type { SecurityManagerConfig } from '../../src/types/security-types.js';

describe('SecurityManager Integration', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    vi.useFakeTimers();
    securityManager = new SecurityManager({
      allowedDomains: ['example.com'],
      rateLimits: { requestsPerMinute: 5, requestsPerHour: 50 },
      autoApproveLocalhost: true
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Domain Access Integration', () => {
    it('should integrate with session creation for domain validation', async () => {
      // Test that domain validation works with session management
      const sessionId = 'test-session-1';

      const allowedAccess = await securityManager.checkDomainAccess('example.com', sessionId);
      const deniedAccess = securityManager.checkDomainAccess('blocked.com', sessionId);

      expect(allowedAccess).toBe(true);
      
      // Fast-forward past auto-deny timeout
      vi.advanceTimersByTime(1500);
      expect(await deniedAccess).toBe(false);
    });

    it('should handle multiple sessions with different domain permissions', async () => {
      const session1Id = 'test-session-1';
      const session2Id = 'test-session-2';

      // Add domains to security manager
      securityManager.addAllowedDomain('site1.com');
      securityManager.addAllowedDomain('site2.com');

      const session1Access = await securityManager.checkDomainAccess('site1.com', session1Id);
      const session2Access = await securityManager.checkDomainAccess('site2.com', session2Id);

      expect(session1Access).toBe(true);
      expect(session2Access).toBe(true);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should enforce rate limits across multiple operations', () => {
      const sessionId = 'test-session-1';
      const clientId = `session-${sessionId}`;

      // Test rate limiting for the same operation (navigate)
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);

      // Next request should fail due to minute limit (5 requests)
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(false);
      
      // Different operations should have separate limits
      expect(securityManager.checkRateLimit(clientId, 'click')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'screenshot')).toBe(true);
    });

    it('should track rate limits per session', () => {
      const session1Id = 'test-session-1';
      const session2Id = 'test-session-2';
      
      const client1Id = `session-${session1Id}`;
      const client2Id = `session-${session2Id}`;

      // Each session should have independent rate limits
      for (let i = 0; i < 5; i++) {
        expect(securityManager.checkRateLimit(client1Id, 'navigate')).toBe(true);
        expect(securityManager.checkRateLimit(client2Id, 'navigate')).toBe(true);
      }

      // Both should now be at their limits
      expect(securityManager.checkRateLimit(client1Id, 'navigate')).toBe(false);
      expect(securityManager.checkRateLimit(client2Id, 'navigate')).toBe(false);
    });
  });

  describe('Network Log Filtering Integration', () => {
    it('should filter network logs from browser sessions', () => {
      const sessionId = 'test-session-1';

      // Simulate network logs that would be captured by the browser
      const networkLogs: NetworkLog[] = [
        {
          timestamp: new Date(),
          method: 'POST',
          url: 'https://api.example.com/login',
          status: 200,
          requestHeaders: {
            'Authorization': 'Bearer secret-token',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          responseHeaders: {
            'Set-Cookie': 'session=abc123; HttpOnly',
            'Content-Type': 'application/json'
          },
          requestBody: JSON.stringify({
            username: 'testuser',
            password: 'secret123',
            remember: true
          }),
          responseBody: JSON.stringify({
            token: 'jwt-token-here',
            user: { id: 1, name: 'Test User' }
          }),
          duration: 150
        },
        {
          timestamp: new Date(),
          method: 'GET',
          url: 'https://api.example.com/profile',
          status: 200,
          requestHeaders: {
            'Authorization': 'Bearer secret-token',
            'Accept': 'application/json'
          },
          responseHeaders: {
            'Content-Type': 'application/json'
          },
          duration: 75
        }
      ];

      // Filter all network logs
      const filteredLogs = networkLogs.map(log => securityManager.filterSensitiveData(log));

      // Verify sensitive data is filtered
      expect(filteredLogs[0].requestHeaders['Authorization']).toBe('[REDACTED]');
      expect(filteredLogs[0].responseHeaders['Set-Cookie']).toBe('[REDACTED]');
      expect(filteredLogs[0].requestHeaders['User-Agent']).toBe('Mozilla/5.0');

      const requestBody = JSON.parse(filteredLogs[0].requestBody!);
      expect(requestBody.username).toBe('testuser');
      expect(requestBody.password).toBe('[REDACTED]');
      expect(requestBody.remember).toBe(true);

      const responseBody = JSON.parse(filteredLogs[0].responseBody!);
      expect(responseBody.token).toBe('[REDACTED]');
      expect(responseBody.user.name).toBe('Test User');

      expect(filteredLogs[1].requestHeaders['Authorization']).toBe('[REDACTED]');
      expect(filteredLogs[1].requestHeaders['Accept']).toBe('application/json');
    });

    it('should handle complex nested data structures', async () => {
      const complexLog: NetworkLog = {
        timestamp: new Date(),
        method: 'POST',
        url: 'https://api.example.com/complex',
        status: 200,
        requestHeaders: {
          'X-Custom-Auth': 'custom-token',
          'Content-Type': 'application/json'
        },
        responseHeaders: {},
        requestBody: JSON.stringify({
          users: [
            {
              credentials: {
                username: 'user1',
                password: 'pass1',
                api_key: 'key1'
              },
              profile: {
                name: 'User One',
                settings: {
                  theme: 'dark',
                  secret_preference: 'hidden'
                }
              }
            },
            {
              credentials: {
                username: 'user2',
                token: 'token2'
              },
              profile: {
                name: 'User Two'
              }
            }
          ],
          metadata: {
            session_id: 'session123',
            timestamp: '2023-01-01T00:00:00Z'
          }
        }),
        duration: 200
      };

      const filtered = securityManager.filterSensitiveData(complexLog);
      const parsedBody = JSON.parse(filtered.requestBody!);

      // Verify nested sensitive data is filtered
      expect(parsedBody.users[0].credentials.username).toBe('user1');
      expect(parsedBody.users[0].credentials.password).toBe('[REDACTED]');
      expect(parsedBody.users[0].credentials.api_key).toBe('[REDACTED]');
      expect(parsedBody.users[0].profile.name).toBe('User One');
      expect(parsedBody.users[0].profile.settings.theme).toBe('dark');
      expect(parsedBody.users[0].profile.settings.secret_preference).toBe('[REDACTED]');

      expect(parsedBody.users[1].credentials.username).toBe('user2');
      expect(parsedBody.users[1].credentials.token).toBe('[REDACTED]');
      expect(parsedBody.users[1].profile.name).toBe('User Two');

      expect(parsedBody.metadata.session_id).toBe('[REDACTED]');
      expect(parsedBody.metadata.timestamp).toBe('2023-01-01T00:00:00Z');
    });
  });

  describe('Security Policy Enforcement', () => {
    it('should enforce security policies across browser operations', async () => {
      const restrictiveConfig: SecurityManagerConfig = {
        allowedDomains: ['trusted.com'],
        rateLimits: { requestsPerMinute: 2, requestsPerHour: 10 },
        autoApproveLocalhost: false
      };
      
      securityManager = new SecurityManager(restrictiveConfig);
      const sessionId = 'test-session-1';
      const clientId = `session-${sessionId}`;

      // Test domain restrictions
      const trustedAccess = await securityManager.checkDomainAccess('trusted.com', sessionId);
      expect(trustedAccess).toBe(true);

      const untrustedPromise = securityManager.checkDomainAccess('untrusted.com', sessionId);
      vi.advanceTimersByTime(1500);
      const untrustedAccess = await untrustedPromise;
      expect(untrustedAccess).toBe(false);

      // Test rate limiting
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(true);
      expect(securityManager.checkRateLimit(clientId, 'navigate')).toBe(false);
    });

    it('should handle cleanup of security resources', async () => {
      const sessionId = 'test-session-1';
      const clientId = `session-${sessionId}`;

      // Generate some rate limit data
      securityManager.checkRateLimit(clientId, 'navigate');
      
      // Request domain permission
      const permissionPromise = securityManager.checkDomainAccess('cleanup-test.com', sessionId);
      
      // Verify pending requests exist
      expect(securityManager.getPendingPermissionRequests()).toHaveLength(1);

      // Fast-forward to trigger cleanup
      vi.advanceTimersByTime(3600000 + 1000); // 1 hour + 1 second
      
      securityManager.cleanup();
      
      // Verify cleanup occurred
      expect(securityManager.getPendingPermissionRequests()).toHaveLength(0);
      
      const status = securityManager.getRateLimitStatus(clientId, 'navigate');
      expect(status.minuteCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed network logs gracefully', () => {
      const malformedLog: NetworkLog = {
        timestamp: new Date(),
        method: 'POST',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {
          'Authorization': 'Bearer token'
        },
        responseHeaders: {},
        requestBody: 'invalid json {',
        duration: 100
      };

      // Should not throw an error
      const filtered = securityManager.filterSensitiveData(malformedLog);
      
      expect(filtered.requestHeaders['Authorization']).toBe('[REDACTED]');
      // For malformed JSON, it should remain unchanged since string sanitization doesn't apply to this content
      expect(filtered.requestBody).toBe('invalid json {');
    });

    it('should handle null and undefined values in logs', () => {
      const logWithNulls: NetworkLog = {
        timestamp: new Date(),
        method: 'GET',
        url: 'https://example.com',
        status: 200,
        requestHeaders: {},
        responseHeaders: {},
        requestBody: undefined,
        responseBody: null as any,
        duration: 100
      };

      const filtered = securityManager.filterSensitiveData(logWithNulls);
      
      expect(filtered.requestBody).toBeUndefined();
      expect(filtered.responseBody).toBeNull();
    });
  });
});