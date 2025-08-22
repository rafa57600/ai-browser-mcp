import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '../../../src/browser/session-manager.js';
import type { SessionOptions } from '../../../src/types/session-types.js';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        setDefaultTimeout: vi.fn(),
        newPage: vi.fn().mockResolvedValue({
          on: vi.fn(),
          goto: vi.fn()
        }),
        close: vi.fn()
      }),
      close: vi.fn()
    })
  }
}));

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(async () => {
    sessionManager = new SessionManager({
      maxSessions: 5,
      sessionTimeout: 10000, // 10 seconds for testing
      cleanupInterval: 1000 // 1 second for testing
    });
    await sessionManager.initialize();
  });

  afterEach(async () => {
    await sessionManager.shutdown();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newManager = new SessionManager();
      await expect(newManager.initialize()).resolves.not.toThrow();
      await newManager.shutdown();
    });

    it('should not reinitialize if already initialized', async () => {
      // Should not throw when called multiple times
      await expect(sessionManager.initialize()).resolves.not.toThrow();
    });
  });

  describe('session creation', () => {
    it('should create a session with default options', async () => {
      const session = await sessionManager.createSession();
      
      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session_\d+_\d+$/);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.isDestroyed).toBe(false);
    });

    it('should create a session with custom options', async () => {
      const options: SessionOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Custom User Agent',
        allowedDomains: ['example.com', 'test.com'],
        timeout: 60000
      };

      const session = await sessionManager.createSession(options);
      
      expect(session.options.viewport).toEqual(options.viewport);
      expect(session.options.userAgent).toBe(options.userAgent);
      expect(session.allowedDomains).toEqual(new Set(options.allowedDomains));
      expect(session.options.timeout).toBe(options.timeout);
    });

    it('should create a session with client ID tracking', async () => {
      const clientId = 'test-client-1';
      const session = await sessionManager.createSession({}, clientId);
      
      expect(session.options.clientId).toBe(clientId);
      expect(sessionManager.getSessionsForClient(clientId)).toContain(session);
      expect(sessionManager.getSessionCountForClient(clientId)).toBe(1);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedManager = new SessionManager();
      await expect(uninitializedManager.createSession()).rejects.toThrow('SessionManager not initialized');
    });

    it('should throw error when max sessions reached', async () => {
      // Create maximum number of sessions
      for (let i = 0; i < 5; i++) {
        await sessionManager.createSession();
      }

      // Attempt to create one more should fail
      await expect(sessionManager.createSession()).rejects.toThrow('Maximum number of sessions (5) reached');
    });

    it('should generate unique session IDs', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();
      
      expect(session1.id).not.toBe(session2.id);
    });

    it('should handle concurrent session creation safely', async () => {
      const promises = Array.from({ length: 3 }, (_, i) => 
        sessionManager.createSession({}, `client-${i}`)
      );

      const sessions = await Promise.all(promises);
      
      expect(sessions).toHaveLength(3);
      expect(new Set(sessions.map(s => s.id)).size).toBe(3); // All unique IDs
      expect(sessionManager.getSessionCount()).toBe(3);
    });
  });

  describe('session retrieval', () => {
    it('should retrieve existing session', async () => {
      const session = await sessionManager.createSession();
      const retrieved = sessionManager.getSession(session.id);
      
      expect(retrieved).toBe(session);
    });

    it('should return null for non-existent session', () => {
      const retrieved = sessionManager.getSession('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should return null for destroyed session', async () => {
      const session = await sessionManager.createSession();
      await session.destroy();
      
      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeNull();
    });

    it('should get all active sessions', async () => {
      const session1 = await sessionManager.createSession();
      const session2 = await sessionManager.createSession();
      
      const allSessions = sessionManager.getAllSessions();
      expect(allSessions).toHaveLength(2);
      expect(allSessions).toContain(session1);
      expect(allSessions).toContain(session2);
    });

    it('should get sessions for specific client', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      
      const session1 = await sessionManager.createSession({}, client1);
      const session2 = await sessionManager.createSession({}, client1);
      const session3 = await sessionManager.createSession({}, client2);
      
      const client1Sessions = sessionManager.getSessionsForClient(client1);
      const client2Sessions = sessionManager.getSessionsForClient(client2);
      
      expect(client1Sessions).toHaveLength(2);
      expect(client1Sessions).toContain(session1);
      expect(client1Sessions).toContain(session2);
      
      expect(client2Sessions).toHaveLength(1);
      expect(client2Sessions).toContain(session3);
    });

    it('should get correct session count', async () => {
      expect(sessionManager.getSessionCount()).toBe(0);
      
      await sessionManager.createSession();
      expect(sessionManager.getSessionCount()).toBe(1);
      
      await sessionManager.createSession();
      expect(sessionManager.getSessionCount()).toBe(2);
    });

    it('should get correct session count per client', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client2);
      
      expect(sessionManager.getSessionCountForClient(client1)).toBe(2);
      expect(sessionManager.getSessionCountForClient(client2)).toBe(1);
      expect(sessionManager.getSessionCountForClient('non-existent')).toBe(0);
    });
  });

  describe('session destruction', () => {
    it('should destroy specific session', async () => {
      const session = await sessionManager.createSession();
      const sessionId = session.id;
      
      const destroyed = await sessionManager.destroySession(sessionId);
      expect(destroyed).toBe(true);
      expect(session.isDestroyed).toBe(true);
      expect(sessionManager.getSession(sessionId)).toBeNull();
    });

    it('should destroy session and remove from client tracking', async () => {
      const clientId = 'test-client';
      const session = await sessionManager.createSession({}, clientId);
      
      expect(sessionManager.getSessionCountForClient(clientId)).toBe(1);
      
      await sessionManager.destroySession(session.id);
      
      expect(sessionManager.getSessionCountForClient(clientId)).toBe(0);
    });

    it('should destroy all sessions for a client', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client2);
      
      expect(sessionManager.getSessionCountForClient(client1)).toBe(2);
      expect(sessionManager.getSessionCountForClient(client2)).toBe(1);
      
      const destroyed = await sessionManager.destroySessionsForClient(client1);
      
      expect(destroyed).toBe(2);
      expect(sessionManager.getSessionCountForClient(client1)).toBe(0);
      expect(sessionManager.getSessionCountForClient(client2)).toBe(1);
    });

    it('should return false when destroying non-existent session', async () => {
      const destroyed = await sessionManager.destroySession('non-existent');
      expect(destroyed).toBe(false);
    });

    it('should destroy all sessions', async () => {
      await sessionManager.createSession();
      await sessionManager.createSession();
      await sessionManager.createSession();
      
      expect(sessionManager.getSessionCount()).toBe(3);
      
      await sessionManager.destroyAllSessions();
      expect(sessionManager.getSessionCount()).toBe(0);
    });
  });

  describe('session cleanup', () => {
    it('should cleanup idle sessions', async () => {
      const session = await sessionManager.createSession();
      
      // Mock the session's last activity to be old
      vi.spyOn(session, 'lastActivity', 'get').mockReturnValue(new Date(Date.now() - 20000)); // 20 seconds ago
      
      const cleanedUp = await sessionManager.cleanupIdleSessions();
      expect(cleanedUp).toBe(1);
      expect(sessionManager.getSessionCount()).toBe(0);
    });

    it('should not cleanup active sessions', async () => {
      const session = await sessionManager.createSession();
      session.updateActivity(); // Update activity to current time
      
      const cleanedUp = await sessionManager.cleanupIdleSessions();
      expect(cleanedUp).toBe(0);
      expect(sessionManager.getSessionCount()).toBe(1);
    });

    it('should cleanup destroyed sessions', async () => {
      const session = await sessionManager.createSession();
      await session.destroy();
      
      const cleanedUp = await sessionManager.cleanupIdleSessions();
      expect(cleanedUp).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', async () => {
      await sessionManager.createSession();
      await sessionManager.createSession();
      
      const stats = sessionManager.getStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.maxSessions).toBe(5);
      expect(stats.availableCapacity).toBe(3);
      expect(stats.sessionTimeout).toBe(10000);
      expect(stats.clientCount).toBe(0);
      expect(stats.pendingRequests).toBe(0);
      expect(stats.resourceLocked).toBe(false);
    });

    it('should return correct statistics with client tracking', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client2);
      
      const stats = sessionManager.getStats();
      expect(stats.totalSessions).toBe(3);
      expect(stats.activeSessions).toBe(3);
      expect(stats.clientCount).toBe(2);
      expect(stats.sessionsPerClient[client1]).toBe(2);
      expect(stats.sessionsPerClient[client2]).toBe(1);
    });

    it('should return detailed statistics', async () => {
      const client1 = 'client-1';
      const session = await sessionManager.createSession({}, client1);
      
      const detailedStats = sessionManager.getDetailedStats();
      
      expect(detailedStats.sessions).toHaveLength(1);
      expect(detailedStats.sessions[0].id).toBe(session.id);
      expect(detailedStats.sessions[0].clientId).toBe(client1);
      expect(detailedStats.sessions[0].isDestroyed).toBe(false);
      expect(detailedStats.poolStats.totalSessions).toBe(1);
    });
  });

  describe('concurrent session support', () => {
    it('should handle concurrent session creation without interference', async () => {
      const promises = Array.from({ length: 4 }, (_, i) => 
        sessionManager.createSession({}, `client-${i}`)
      );

      const sessions = await Promise.all(promises);
      
      expect(sessions).toHaveLength(4);
      expect(new Set(sessions.map(s => s.id)).size).toBe(4);
      
      // Verify each session is properly isolated
      for (let i = 0; i < sessions.length; i++) {
        expect(sessions[i].options.clientId).toBe(`client-${i}`);
        expect(sessions[i].isDestroyed).toBe(false);
      }
    });

    it('should handle concurrent operations on different sessions', async () => {
      const session1 = await sessionManager.createSession({}, 'client-1');
      const session2 = await sessionManager.createSession({}, 'client-2');
      
      // Simulate concurrent operations
      const operations = [
        session1.updateActivity(),
        session2.updateActivity(),
        sessionManager.getSession(session1.id),
        sessionManager.getSession(session2.id)
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
      
      expect(sessionManager.getSessionCount()).toBe(2);
    });

    it('should handle resource limits correctly', async () => {
      // Fill up to capacity
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push(await sessionManager.createSession({}, `client-${i}`));
      }

      expect(sessionManager.canCreateSession()).toBe(false);
      expect(sessionManager.getAvailableCapacity()).toBe(0);

      // Should reject new session creation
      await expect(sessionManager.createSession()).rejects.toThrow('Maximum number of sessions');
      
      // Destroy one session to free capacity
      await sessionManager.destroySession(sessions[0].id);
      
      expect(sessionManager.canCreateSession()).toBe(true);
      expect(sessionManager.getAvailableCapacity()).toBe(1);
    });

    it('should isolate sessions between clients', async () => {
      const client1Session1 = await sessionManager.createSession({ allowedDomains: ['client1.com'] }, 'client-1');
      const client1Session2 = await sessionManager.createSession({ allowedDomains: ['client1-alt.com'] }, 'client-1');
      const client2Session = await sessionManager.createSession({ allowedDomains: ['client2.com'] }, 'client-2');

      // Verify isolation
      expect(client1Session1.allowedDomains).toEqual(new Set(['client1.com']));
      expect(client1Session2.allowedDomains).toEqual(new Set(['client1-alt.com']));
      expect(client2Session.allowedDomains).toEqual(new Set(['client2.com']));

      // Verify client tracking
      const client1Sessions = sessionManager.getSessionsForClient('client-1');
      const client2Sessions = sessionManager.getSessionsForClient('client-2');

      expect(client1Sessions).toHaveLength(2);
      expect(client2Sessions).toHaveLength(1);
      expect(client1Sessions).toContain(client1Session1);
      expect(client1Sessions).toContain(client1Session2);
      expect(client2Sessions).toContain(client2Session);
    });

    it('should handle concurrent cleanup operations safely', async () => {
      // Create sessions with different clients
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        sessions.push(await sessionManager.createSession({}, `client-${i}`));
      }

      // Mock old activity for cleanup
      sessions.forEach(session => {
        vi.spyOn(session, 'lastActivity', 'get').mockReturnValue(new Date(Date.now() - 20000));
      });

      // Run concurrent cleanup operations
      const cleanupPromises = [
        sessionManager.cleanupIdleSessions(),
        sessionManager.cleanupIdleSessions(),
        sessionManager.cleanupIdleSessions()
      ];

      const results = await Promise.all(cleanupPromises);
      
      // Should have cleaned up all sessions, but safely handle concurrent access
      expect(sessionManager.getSessionCount()).toBe(0);
      expect(results.reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('session pool management', () => {
    it('should track pending requests correctly', async () => {
      const createPromise = sessionManager.createSession({}, 'client-1');
      
      // Check stats while request is pending (though it will be very fast)
      const session = await createPromise;
      
      expect(session).toBeDefined();
      expect(sessionManager.getStats().pendingRequests).toBe(0);
    });

    it('should handle capacity management', async () => {
      expect(sessionManager.canCreateSession()).toBe(true);
      expect(sessionManager.getAvailableCapacity()).toBe(5);

      // Create sessions up to limit
      for (let i = 0; i < 5; i++) {
        await sessionManager.createSession();
      }

      expect(sessionManager.canCreateSession()).toBe(false);
      expect(sessionManager.getAvailableCapacity()).toBe(0);
    });

    it('should provide comprehensive pool statistics', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';
      
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client1);
      await sessionManager.createSession({}, client2);

      const stats = sessionManager.getStats();
      
      expect(stats.totalSessions).toBe(3);
      expect(stats.activeSessions).toBe(3);
      expect(stats.maxSessions).toBe(5);
      expect(stats.availableCapacity).toBe(2);
      expect(stats.clientCount).toBe(2);
      expect(stats.sessionsPerClient[client1]).toBe(2);
      expect(stats.sessionsPerClient[client2]).toBe(1);
      expect(stats.pendingRequests).toBe(0);
      expect(stats.resourceLocked).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await sessionManager.createSession();
      await sessionManager.createSession();
      
      await expect(sessionManager.shutdown()).resolves.not.toThrow();
      expect(sessionManager.getSessionCount()).toBe(0);
    });
  });
});