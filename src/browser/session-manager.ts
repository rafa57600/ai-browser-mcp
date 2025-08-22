import { chromium, type Browser } from 'playwright';
import { BrowserSession } from './browser-session.js';
import { PerformanceManager } from '../performance/performance-manager.js';
import type { SessionOptions, SessionManagerConfig, BrowserSessionData, SessionPoolStats } from '../types/session-types.js';
import type { PerformanceConfig } from '../types/performance-types.js';

/**
 * SessionManager handles the lifecycle of browser sessions with concurrent support
 */
export class SessionManager {
  private browser: Browser | null = null;
  private sessions: Map<string, BrowserSession> = new Map();
  private sessionsByClient: Map<string, Set<string>> = new Map();
  private pendingRequests: Map<string, Promise<BrowserSession>> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private sessionCounter = 0;
  private resourceLock = false;
  private performanceManager: PerformanceManager;
  
  private readonly config: Required<SessionManagerConfig>;

  constructor(config: SessionManagerConfig = {}, performanceConfig?: PerformanceConfig) {
    this.config = {
      maxSessions: config.maxSessions ?? 10,
      sessionTimeout: config.sessionTimeout ?? 30 * 60 * 1000, // 30 minutes
      cleanupInterval: config.cleanupInterval ?? 5 * 60 * 1000, // 5 minutes
      defaultViewport: config.defaultViewport ?? { width: 1280, height: 720 },
      defaultUserAgent: config.defaultUserAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    this.performanceManager = new PerformanceManager(performanceConfig);
  }

  /**
   * Initializes the browser instance
   */
  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    // Initialize performance manager
    await this.performanceManager.initialize(this.browser);

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Creates a new browser session with concurrent support
   */
  async createSession(options: SessionOptions = {}, clientId?: string): Promise<BrowserSession> {
    if (!this.browser) {
      throw new Error('SessionManager not initialized. Call initialize() first.');
    }

    // Check session limit
    if (this.sessions.size >= this.config.maxSessions) {
      throw new Error(`Maximum number of sessions (${this.config.maxSessions}) reached`);
    }

    // Check if performance manager allows new session
    if (!this.performanceManager.canCreateSession()) {
      throw new Error('Cannot create session due to resource constraints');
    }

    // Generate unique session ID
    const sessionId = `session_${++this.sessionCounter}_${Date.now()}`;

    // Check if there's already a pending request for this session
    if (this.pendingRequests.has(sessionId)) {
      return this.pendingRequests.get(sessionId)!;
    }

    // Create session creation promise
    const sessionPromise = this.createSessionInternal(sessionId, options, clientId);
    this.pendingRequests.set(sessionId, sessionPromise);

    try {
      const session = await sessionPromise;
      
      // Track session by client if provided
      if (clientId) {
        if (!this.sessionsByClient.has(clientId)) {
          this.sessionsByClient.set(clientId, new Set());
        }
        this.sessionsByClient.get(clientId)!.add(sessionId);
      }

      return session;
    } finally {
      this.pendingRequests.delete(sessionId);
    }
  }

  /**
   * Internal method to create a session with resource isolation
   */
  private async createSessionInternal(sessionId: string, options: SessionOptions, clientId?: string): Promise<BrowserSession> {
    // Wait for resource lock if needed
    while (this.resourceLock) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.resourceLock = true;

    try {
      // Merge options with defaults
      const sessionOptions: SessionOptions = {
        viewport: options.viewport ?? this.config.defaultViewport,
        userAgent: options.userAgent ?? this.config.defaultUserAgent,
        allowedDomains: options.allowedDomains ?? [],
        timeout: options.timeout ?? 30000,
        headless: options.headless ?? true,
        ...(clientId !== undefined && { clientId })
      };

      // Try to acquire optimized context from performance manager
      const pooledContext = await this.performanceManager.acquireContext(sessionId, sessionOptions);
      
      let context, page;
      if (pooledContext) {
        // Use pooled context
        context = pooledContext.context;
        
        // Set default timeout
        context.setDefaultTimeout(sessionOptions.timeout!);
        
        const pages = context.pages();
        page = pages.length > 0 ? pages[0] : await context.newPage();
      } else {
        // Create new context if pooling is disabled or unavailable
        context = await this.browser!.newContext({
          viewport: sessionOptions.viewport!,
          userAgent: sessionOptions.userAgent!,
          ignoreHTTPSErrors: true,
          bypassCSP: true
        });

        // Set default timeout
        context.setDefaultTimeout(sessionOptions.timeout!);

        // Create a new page
        page = await context.newPage();
      }

      // Create session data
      const sessionData: BrowserSessionData = {
        id: sessionId,
        context,
        page,
        createdAt: new Date(),
        lastActivity: new Date(),
        allowedDomains: new Set(sessionOptions.allowedDomains),
        networkLogs: [],
        consoleLogs: [],
        options: sessionOptions
      };

      // Store pooled context ID if available
      if (pooledContext) {
        sessionData.options.pooledContextId = pooledContext.id;
      }

      // Create and store session
      const session = new BrowserSession(sessionData, this.performanceManager);
      this.sessions.set(sessionId, session);

      return session;
    } finally {
      this.resourceLock = false;
    }
  }

  /**
   * Gets a session by ID
   */
  getSession(sessionId: string): BrowserSession | null {
    const session = this.sessions.get(sessionId);
    return session && !session.isDestroyed ? session : null;
  }

  /**
   * Gets all active sessions
   */
  getAllSessions(): BrowserSession[] {
    return Array.from(this.sessions.values()).filter(session => !session.isDestroyed);
  }

  /**
   * Gets sessions for a specific client
   */
  getSessionsForClient(clientId: string): BrowserSession[] {
    const sessionIds = this.sessionsByClient.get(clientId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((session): session is BrowserSession => session !== undefined && !session.isDestroyed);
  }

  /**
   * Gets the number of active sessions
   */
  getSessionCount(): number {
    return this.getAllSessions().length;
  }

  /**
   * Gets the number of sessions for a specific client
   */
  getSessionCountForClient(clientId: string): number {
    return this.getSessionsForClient(clientId).length;
  }

  /**
   * Recreates a session with the same configuration (for error recovery)
   */
  async recreateSession(sessionId: string): Promise<BrowserSession> {
    const existingSession = this.sessions.get(sessionId);
    if (!existingSession) {
      throw new Error(`Session '${sessionId}' not found`);
    }

    // Store the original options and client ID
    const originalOptions = existingSession.options;
    const clientId = originalOptions.clientId;

    // Destroy the existing session
    await this.destroySession(sessionId);

    // Create a new session with the same ID and options
    const sessionPromise = this.createSessionInternal(sessionId, originalOptions, clientId);
    this.pendingRequests.set(sessionId, sessionPromise);

    try {
      const newSession = await sessionPromise;
      
      // Track session by client if provided
      if (clientId) {
        if (!this.sessionsByClient.has(clientId)) {
          this.sessionsByClient.set(clientId, new Set());
        }
        this.sessionsByClient.get(clientId)!.add(sessionId);
      }

      return newSession;
    } finally {
      this.pendingRequests.delete(sessionId);
    }
  }

  /**
   * Destroys a specific session
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove from client tracking
    for (const [clientId, sessionIds] of this.sessionsByClient) {
      if (sessionIds.has(sessionId)) {
        sessionIds.delete(sessionId);
        if (sessionIds.size === 0) {
          this.sessionsByClient.delete(clientId);
        }
        break;
      }
    }

    // Release pooled context if available
    const pooledContextId = session.options.pooledContextId;
    if (pooledContextId) {
      await this.performanceManager.releaseContext(sessionId, pooledContextId);
    }
    
    // Clean up performance resources
    await this.performanceManager.cleanupSession(sessionId);
    
    await session.destroy();
    this.sessions.delete(sessionId);
    return true;
  }

  /**
   * Destroys all sessions for a specific client
   */
  async destroySessionsForClient(clientId: string): Promise<number> {
    const sessionIds = this.sessionsByClient.get(clientId);
    if (!sessionIds) return 0;

    const destroyPromises = Array.from(sessionIds).map(sessionId => this.destroySession(sessionId));
    const results = await Promise.allSettled(destroyPromises);
    
    return results.filter(result => result.status === 'fulfilled' && result.value === true).length;
  }

  /**
   * Destroys all sessions
   */
  async destroyAllSessions(): Promise<void> {
    const destroyPromises = Array.from(this.sessions.values()).map(session => session.destroy());
    await Promise.allSettled(destroyPromises);
    this.sessions.clear();
    this.sessionsByClient.clear();
    this.pendingRequests.clear();
  }

  /**
   * Cleans up idle sessions based on timeout with concurrent safety
   */
  async cleanupIdleSessions(): Promise<number> {
    const now = Date.now();
    const idleSessions: string[] = [];

    // Collect idle sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.isDestroyed) {
        idleSessions.push(sessionId);
        continue;
      }

      const idleTime = now - session.lastActivity.getTime();
      if (idleTime > this.config.sessionTimeout) {
        idleSessions.push(sessionId);
      }
    }

    // Destroy idle sessions concurrently but safely
    const destroyPromises = idleSessions.map(sessionId => 
      this.destroySession(sessionId).catch(error => {
        console.error(`Error destroying idle session ${sessionId}:`, error);
        return false;
      })
    );
    
    const results = await Promise.allSettled(destroyPromises);
    const successCount = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length;

    return successCount;
  }

  /**
   * Checks if the session manager can handle more sessions
   */
  canCreateSession(): boolean {
    return this.sessions.size < this.config.maxSessions && !this.resourceLock;
  }

  /**
   * Gets available session capacity
   */
  getAvailableCapacity(): number {
    return Math.max(0, this.config.maxSessions - this.sessions.size);
  }

  /**
   * Shuts down the session manager and cleans up all resources
   */
  async shutdown(): Promise<void> {
    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Destroy all sessions
    await this.destroyAllSessions();

    // Shutdown performance manager
    await this.performanceManager.shutdown();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Gets comprehensive session pool statistics
   */
  getStats(): SessionPoolStats {
    const activeSessions = this.getSessionCount();
    const clientStats = new Map<string, number>();
    
    for (const [clientId, sessionIds] of this.sessionsByClient) {
      const activeCount = Array.from(sessionIds)
        .map(id => this.sessions.get(id))
        .filter(session => session && !session.isDestroyed).length;
      clientStats.set(clientId, activeCount);
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      maxSessions: this.config.maxSessions,
      availableCapacity: this.getAvailableCapacity(),
      sessionTimeout: this.config.sessionTimeout,
      clientCount: this.sessionsByClient.size,
      sessionsPerClient: Object.fromEntries(clientStats),
      pendingRequests: this.pendingRequests.size,
      resourceLocked: this.resourceLock
    };
  }

  /**
   * Gets detailed session information for monitoring
   */
  getDetailedStats(): {
    sessions: Array<{
      id: string;
      clientId?: string;
      createdAt: Date;
      lastActivity: Date;
      idleTime: number;
      isDestroyed: boolean;
    }>;
    poolStats: SessionPoolStats;
  } {
    const now = Date.now();
    const sessions = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      ...(session.options.clientId !== undefined && { clientId: session.options.clientId }),
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      idleTime: now - session.lastActivity.getTime(),
      isDestroyed: session.isDestroyed
    }));

    return {
      sessions,
      poolStats: this.getStats()
    };
  }

  /**
   * Starts the cleanup timer for idle sessions
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        const cleanedUp = await this.cleanupIdleSessions();
        if (cleanedUp > 0) {
          console.log(`Cleaned up ${cleanedUp} idle sessions`);
        }
      } catch (error) {
        console.error('Error during session cleanup:', error);
      }
    }, this.config.cleanupInterval);
  }
}