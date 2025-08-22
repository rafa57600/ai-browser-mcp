import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/browser/session-manager.js';
import type { SessionOptions } from '../../src/types/session-types.js';

describe('Concurrent Sessions Integration', () => {
  let sessionManager: SessionManager;

  beforeEach(async () => {
    sessionManager = new SessionManager({
      maxSessions: 10,
      sessionTimeout: 30000, // 30 seconds
      cleanupInterval: 5000 // 5 seconds
    });
    await sessionManager.initialize();
  });

  afterEach(async () => {
    await sessionManager.shutdown();
  });

  describe('multi-client session isolation', () => {
    it('should create isolated sessions for different clients', async () => {
      const client1Options: SessionOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Client1-Agent',
        allowedDomains: ['client1.example.com']
      };

      const client2Options: SessionOptions = {
        viewport: { width: 1280, height: 720 },
        userAgent: 'Client2-Agent',
        allowedDomains: ['client2.example.com']
      };

      const session1 = await sessionManager.createSession(client1Options, 'client-1');
      const session2 = await sessionManager.createSession(client2Options, 'client-2');

      // Verify complete isolation
      expect(session1.id).not.toBe(session2.id);
      expect(session1.options.userAgent).toBe('Client1-Agent');
      expect(session2.options.userAgent).toBe('Client2-Agent');
      expect(session1.allowedDomains).toEqual(new Set(['client1.example.com']));
      expect(session2.allowedDomains).toEqual(new Set(['client2.example.com']));

      // Verify they have separate browser contexts
      expect(session1.context).not.toBe(session2.context);
      expect(session1.page).not.toBe(session2.page);
    });

    it('should handle concurrent navigation without interference', async () => {
      const session1 = await sessionManager.createSession({}, 'client-1');
      const session2 = await sessionManager.createSession({}, 'client-2');

      // Navigate both sessions concurrently to different pages
      const navigationPromises = [
        session1.page.goto('data:text/html,<h1>Client 1 Page</h1>'),
        session2.page.goto('data:text/html,<h1>Client 2 Page</h1>')
      ];

      await Promise.all(navigationPromises);

      // Verify each session navigated to correct page
      const title1 = await session1.page.textContent('h1');
      const title2 = await session2.page.textContent('h1');

      expect(title1).toBe('Client 1 Page');
      expect(title2).toBe('Client 2 Page');
    });

    it('should maintain separate console logs per session', async () => {
      const session1 = await sessionManager.createSession({}, 'client-1');
      const session2 = await sessionManager.createSession({}, 'client-2');

      // Navigate to different pages and generate console logs
      await session1.page.goto('data:text/html,<h1>Session 1</h1><script>console.log("Session 1 log");</script>');
      await session2.page.goto('data:text/html,<h1>Session 2</h1><script>console.log("Session 2 log");</script>');

      // Wait a bit for console logs to be captured
      await new Promise(resolve => setTimeout(resolve, 200));

      const logs1 = session1.getRecentConsoleLogs();
      const logs2 = session2.getRecentConsoleLogs();

      // Each session should have its own console logs
      expect(logs1.length).toBeGreaterThan(0);
      expect(logs2.length).toBeGreaterThan(0);

      // Verify sessions have different console activity
      const hasSession1Log = logs1.some(log => log.message.includes('Session 1'));
      const hasSession2Log = logs2.some(log => log.message.includes('Session 2'));
      
      expect(hasSession1Log).toBe(true);
      expect(hasSession2Log).toBe(true);

      // Verify logs are isolated (session1 shouldn't have session2 logs and vice versa)
      const session1HasSession2Log = logs1.some(log => log.message.includes('Session 2'));
      const session2HasSession1Log = logs2.some(log => log.message.includes('Session 1'));
      
      expect(session1HasSession2Log).toBe(false);
      expect(session2HasSession1Log).toBe(false);
    });
  });

  describe('resource management under load', () => {
    it('should handle maximum concurrent sessions', async () => {
      const maxSessions = 10;
      const sessions: any[] = [];

      // Create maximum number of sessions
      for (let i = 0; i < maxSessions; i++) {
        const session = await sessionManager.createSession({}, `client-${i}`);
        sessions.push(session);
      }

      expect(sessionManager.getSessionCount()).toBe(maxSessions);
      expect(sessionManager.canCreateSession()).toBe(false);

      // Attempt to create one more should fail
      await expect(sessionManager.createSession()).rejects.toThrow('Maximum number of sessions');

      // Verify all sessions are functional
      const navigationPromises = sessions.map((session, i) => 
        session.page.goto(`data:text/html,<h1>Session ${i}</h1>`)
      );

      await Promise.all(navigationPromises);

      // Verify each session navigated correctly
      for (let i = 0; i < sessions.length; i++) {
        const title = await sessions[i].page.textContent('h1');
        expect(title).toBe(`Session ${i}`);
      }
    });

    it('should handle concurrent session creation and destruction', async () => {
      const numOperations = 20;
      const operations: Promise<any>[] = [];

      // Mix of creation and destruction operations
      for (let i = 0; i < numOperations; i++) {
        if (i % 3 === 0) {
          // Create session
          operations.push(
            sessionManager.createSession({}, `client-${i}`)
              .then(session => ({ type: 'create', session }))
          );
        } else if (i % 3 === 1 && i > 0) {
          // Destroy a session (with delay to ensure it exists)
          operations.push(
            new Promise(resolve => setTimeout(resolve, 50))
              .then(() => {
                const sessions = sessionManager.getAllSessions();
                if (sessions.length > 0) {
                  return sessionManager.destroySession(sessions[0].id);
                }
                return false;
              })
              .then(result => ({ type: 'destroy', result }))
          );
        } else {
          // Get stats
          operations.push(
            Promise.resolve(sessionManager.getStats())
              .then(stats => ({ type: 'stats', stats }))
          );
        }
      }

      const results = await Promise.allSettled(operations);
      
      // All operations should complete successfully
      const failures = results.filter(result => result.status === 'rejected');
      expect(failures).toHaveLength(0);

      // Final state should be consistent
      const finalStats = sessionManager.getStats();
      expect(finalStats.activeSessions).toBeLessThanOrEqual(finalStats.maxSessions);
      expect(finalStats.totalSessions).toBe(finalStats.activeSessions);
    });

    it('should handle rapid session cleanup', async () => {
      // Create multiple sessions
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(await sessionManager.createSession({}, `client-${i}`));
      }

      expect(sessionManager.getSessionCount()).toBe(5);

      // Destroy all sessions concurrently
      const destroyPromises = sessions.map(session => 
        sessionManager.destroySession(session.id)
      );

      const results = await Promise.all(destroyPromises);
      
      // All destructions should succeed
      expect(results.every(result => result === true)).toBe(true);
      expect(sessionManager.getSessionCount()).toBe(0);

      // Should be able to create new sessions after cleanup
      const newSession = await sessionManager.createSession({}, 'new-client');
      expect(newSession).toBeDefined();
      expect(sessionManager.getSessionCount()).toBe(1);
    });
  });

  describe('client-specific operations', () => {
    it('should handle client-specific session management', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';

      // Create multiple sessions for each client
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client2);

      expect(sessionManager.getSessionCountForClient(client1)).toBe(2);
      expect(sessionManager.getSessionCountForClient(client2)).toBe(1);

      // Destroy all sessions for client1
      const destroyed = await sessionManager.destroySessionsForClient(client1);
      expect(destroyed).toBe(2);

      expect(sessionManager.getSessionCountForClient(client1)).toBe(0);
      expect(sessionManager.getSessionCountForClient(client2)).toBe(1);
      expect(sessionManager.getSessionCount()).toBe(1);
    });

    it('should provide accurate client statistics', async () => {
      const clients = ['client-1', 'client-2', 'client-3'];
      
      // Create different numbers of sessions for each client
      for (let i = 0; i < clients.length; i++) {
        for (let j = 0; j <= i; j++) {
          await sessionManager.createSession({}, clients[i]);
        }
      }

      const stats = sessionManager.getStats();
      expect(stats.clientCount).toBe(3);
      expect(stats.sessionsPerClient['client-1']).toBe(1);
      expect(stats.sessionsPerClient['client-2']).toBe(2);
      expect(stats.sessionsPerClient['client-3']).toBe(3);
      expect(stats.totalSessions).toBe(6);
      expect(stats.activeSessions).toBe(6);
    });

    it('should handle detailed session monitoring', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';

      const session1 = await sessionManager.createSession({}, client1);
      const session2 = await sessionManager.createSession({}, client2);

      // Update activity for one session
      session1.updateActivity();
      await new Promise(resolve => setTimeout(resolve, 10));
      session2.updateActivity();

      const detailedStats = sessionManager.getDetailedStats();

      expect(detailedStats.sessions).toHaveLength(2);
      
      const session1Stats = detailedStats.sessions.find(s => s.id === session1.id);
      const session2Stats = detailedStats.sessions.find(s => s.id === session2.id);

      expect(session1Stats?.clientId).toBe(client1);
      expect(session2Stats?.clientId).toBe(client2);
      expect(session1Stats?.isDestroyed).toBe(false);
      expect(session2Stats?.isDestroyed).toBe(false);
      expect(session1Stats?.idleTime).toBeGreaterThanOrEqual(0);
      expect(session2Stats?.idleTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling and recovery', () => {
    it('should handle browser context failures gracefully', async () => {
      const session1 = await sessionManager.createSession({}, 'client-1');
      const session2 = await sessionManager.createSession({}, 'client-2');

      // Simulate context failure by closing one context directly
      await session1.context.close();

      // Session should be marked as destroyed
      expect(session1.isDestroyed).toBe(true);

      // Other sessions should remain unaffected
      expect(session2.isDestroyed).toBe(false);
      expect(sessionManager.getSession(session2.id)).toBe(session2);

      // Should be able to create new sessions
      const newSession = await sessionManager.createSession({}, 'client-3');
      expect(newSession).toBeDefined();
      expect(newSession.isDestroyed).toBe(false);
    });

    it('should recover from resource exhaustion', async () => {
      // Fill to capacity
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(await sessionManager.createSession({}, `client-${i}`));
      }

      expect(sessionManager.canCreateSession()).toBe(false);

      // Clean up some sessions
      await sessionManager.destroySession(sessions[0].id);
      await sessionManager.destroySession(sessions[1].id);

      expect(sessionManager.canCreateSession()).toBe(true);
      expect(sessionManager.getAvailableCapacity()).toBe(2);

      // Should be able to create new sessions
      const newSession1 = await sessionManager.createSession({}, 'new-client-1');
      const newSession2 = await sessionManager.createSession({}, 'new-client-2');

      expect(newSession1).toBeDefined();
      expect(newSession2).toBeDefined();
      expect(sessionManager.getSessionCount()).toBe(10);
    });
  });
});