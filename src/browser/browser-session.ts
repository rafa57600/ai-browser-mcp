import type { BrowserContext, Page } from 'playwright';
import type { BrowserSessionData, SessionOptions } from '../types/session-types.js';
import type { NetworkLog, ConsoleLog } from '../types/log-types.js';
import type { TraceData, TraceOptions } from '../types/trace-types.js';
import type { PerformanceManager } from '../performance/performance-manager.js';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * BrowserSession wraps a Playwright browser context and manages session state
 */
export class BrowserSession {
  public readonly id: string;
  public readonly context: BrowserContext;
  public readonly page: Page;
  public readonly createdAt: Date;
  public readonly options: SessionOptions;
  
  private _lastActivity: Date;
  private _allowedDomains: Set<string>;
  private _networkLogs: NetworkLog[] = [];
  private _consoleLogs: ConsoleLog[] = [];
  private _isDestroyed = false;
  private _traceData: TraceData | null = null;
  private _traceDir: string;
  private performanceManager: PerformanceManager | undefined;

  constructor(data: BrowserSessionData, performanceManager?: PerformanceManager) {
    this.id = data.id;
    this.context = data.context;
    this.page = data.page;
    this.createdAt = data.createdAt;
    this._lastActivity = data.lastActivity;
    this._allowedDomains = data.allowedDomains;
    this._networkLogs = data.networkLogs;
    this._consoleLogs = data.consoleLogs;
    this.options = data.options;
    this._traceDir = path.join(process.cwd(), 'traces', this.id);
    this.performanceManager = performanceManager || undefined;

    this.setupEventListeners();
  }

  get lastActivity(): Date {
    return this._lastActivity;
  }

  get allowedDomains(): Set<string> {
    return new Set(this._allowedDomains);
  }

  get networkLogs(): NetworkLog[] {
    return [...this._networkLogs];
  }

  get consoleLogs(): ConsoleLog[] {
    return [...this._consoleLogs];
  }

  get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Updates the last activity timestamp
   */
  updateActivity(): void {
    if (this._isDestroyed) {
      throw new Error('Cannot update activity on destroyed session');
    }
    this._lastActivity = new Date();
  }

  /**
   * Adds a domain to the allowed domains set
   */
  addAllowedDomain(domain: string): void {
    if (this._isDestroyed) {
      throw new Error('Cannot modify destroyed session');
    }
    this._allowedDomains.add(domain);
  }

  /**
   * Checks if a domain is allowed for this session
   */
  isDomainAllowed(domain: string): boolean {
    return this._allowedDomains.has(domain);
  }

  /**
   * Adds a network log entry
   */
  addNetworkLog(log: NetworkLog): void {
    if (this._isDestroyed) return;
    
    this._networkLogs.push(log);
    // Keep only the last 1000 network logs to prevent memory issues
    if (this._networkLogs.length > 1000) {
      this._networkLogs = this._networkLogs.slice(-1000);
    }
    this.updateActivity();
  }

  /**
   * Adds a console log entry
   */
  addConsoleLog(log: ConsoleLog): void {
    if (this._isDestroyed) return;
    
    this._consoleLogs.push(log);
    // Keep only the last 1000 console logs to prevent memory issues
    if (this._consoleLogs.length > 1000) {
      this._consoleLogs = this._consoleLogs.slice(-1000);
    }
    this.updateActivity();
  }

  /**
   * Gets recent network logs with optional limit
   */
  getRecentNetworkLogs(limit?: number): NetworkLog[] {
    const logs = this._networkLogs.slice();
    return limit ? logs.slice(-limit) : logs;
  }

  /**
   * Gets recent console logs with optional limit
   */
  getRecentConsoleLogs(limit?: number): ConsoleLog[] {
    const logs = this._consoleLogs.slice();
    return limit ? logs.slice(-limit) : logs;
  }

  /**
   * Starts browser tracing
   */
  async startTrace(options: TraceOptions = {}): Promise<void> {
    if (this._isDestroyed) {
      throw new Error('Cannot start trace on destroyed session');
    }

    if (this._traceData?.isActive) {
      throw new Error('Trace is already active for this session');
    }

    // Ensure trace directory exists
    await fs.mkdir(this._traceDir, { recursive: true });

    const traceFile = path.join(this._traceDir, `trace-${Date.now()}.zip`);

    // Start Playwright tracing
    await this.context.tracing.start({
      screenshots: options.screenshots !== false,
      snapshots: options.snapshots !== false,
      sources: options.sources === true
    });

    this._traceData = {
      sessionId: this.id,
      startTime: new Date(),
      traceFile,
      isActive: true,
      metadata: options
    };

    this.updateActivity();
  }

  /**
   * Stops browser tracing and returns trace data
   */
  async stopTrace(): Promise<TraceData> {
    if (this._isDestroyed) {
      throw new Error('Cannot stop trace on destroyed session');
    }

    if (!this._traceData?.isActive) {
      throw new Error('No active trace found for this session');
    }

    // Stop Playwright tracing and save to file
    if (this._traceData.traceFile) {
      await this.context.tracing.stop({ path: this._traceData.traceFile });
    } else {
      await this.context.tracing.stop();
    }

    const endTime = new Date();
    this._traceData.endTime = endTime;
    this._traceData.isActive = false;

    this.updateActivity();

    return { ...this._traceData };
  }

  /**
   * Gets current trace data
   */
  getTraceData(): TraceData | null {
    return this._traceData ? { ...this._traceData } : null;
  }

  /**
   * Checks if tracing is currently active
   */
  isTracing(): boolean {
    return this._traceData?.isActive || false;
  }

  /**
   * Destroys the session and cleans up resources
   */
  async destroy(): Promise<void> {
    if (this._isDestroyed) return;

    this._isDestroyed = true;
    
    try {
      // Stop any active tracing before closing context
      if (this._traceData?.isActive) {
        try {
          if (this._traceData.traceFile) {
            await this.context.tracing.stop({ path: this._traceData.traceFile });
          } else {
            await this.context.tracing.stop();
          }
        } catch (error) {
          console.error(`Error stopping trace for session ${this.id}:`, error);
        }
      }

      // Close the browser context which will also close all pages
      await this.context.close();
    } catch (error) {
      // Log error but don't throw - we want cleanup to continue
      console.error(`Error closing browser context for session ${this.id}:`, error);
    }

    // Clear log arrays to free memory
    this._networkLogs.length = 0;
    this._consoleLogs.length = 0;
    this._allowedDomains.clear();
    this._traceData = null;
  }

  /**
   * Sets up event listeners for network and console logging
   */
  private setupEventListeners(): void {
    // Listen for context close events to mark session as destroyed (if available)
    if (typeof this.context.on === 'function') {
      this.context.on('close', () => {
        this._isDestroyed = true;
      });
    }

    // Listen for network requests
    this.page.on('request', (request) => {
      const startTime = Date.now();
      
      request.response().then((response) => {
        if (response) {
          const endTime = Date.now();
          const networkLog: NetworkLog = {
            timestamp: new Date(startTime),
            method: request.method(),
            url: request.url(),
            status: response.status(),
            requestHeaders: request.headers(),
            responseHeaders: response.headers(),
            ...(request.postData() && { requestBody: request.postData()! }),
            duration: endTime - startTime
          };
          
          // Get response body if it's not too large
          response.text().then((body) => {
            if (body.length < 10000) { // Limit response body size
              networkLog.responseBody = body;
            }
            this.addNetworkLog(networkLog);
          }).catch(() => {
            // Ignore errors getting response body
            this.addNetworkLog(networkLog);
          });
        }
      }).catch(() => {
        // Handle failed requests
        const networkLog: NetworkLog = {
          timestamp: new Date(startTime),
          method: request.method(),
          url: request.url(),
          status: 0,
          requestHeaders: request.headers(),
          responseHeaders: {},
          ...(request.postData() && { requestBody: request.postData()! }),
          duration: Date.now() - startTime
        };
        this.addNetworkLog(networkLog);
      });
    });

    // Listen for console messages
    this.page.on('console', (message) => {
      const location = message.location();
      const consoleLog: ConsoleLog = {
        timestamp: new Date(),
        level: message.type() as ConsoleLog['level'],
        message: message.text(),
        ...(location && {
          location: {
            url: location.url,
            lineNumber: location.lineNumber,
            columnNumber: location.columnNumber
          }
        })
      };
      this.addConsoleLog(consoleLog);
    });

    // Listen for page errors
    this.page.on('pageerror', (error) => {
      const consoleLog: ConsoleLog = {
        timestamp: new Date(),
        level: 'error',
        message: error.message
      };
      this.addConsoleLog(consoleLog);
    });
  }
}