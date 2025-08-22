import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { ErrorHandler } from '../errors/error-handler.js';
import { ErrorFactory } from '../errors/error-factory.js';
import { CircuitBreakerManager } from '../errors/circuit-breaker.js';
import { getMacroComponents } from './macro-tools.js';
import { SessionOptions } from '../types/session-types.js';

/**
 * Enhanced navigation tools with comprehensive error handling
 */
export class EnhancedNavigationTools {
  private errorHandler: ErrorHandler;

  constructor(
    private sessionManager: SessionManager,
    errorHandler?: ErrorHandler
  ) {
    this.errorHandler = errorHandler || new ErrorHandler(sessionManager);
  }

  /**
   * Creates the browser.newContext tool with enhanced error handling
   */
  createNewContextTool(): BrowserTool {
    return {
      name: 'browser.newContext',
      description: 'Create a new browser context with specified viewport and user agent options',
      inputSchema: {
        type: 'object',
        properties: {
          viewport: {
            type: 'object',
            properties: {
              width: { type: 'number', minimum: 100, maximum: 3840 },
              height: { type: 'number', minimum: 100, maximum: 2160 }
            },
            additionalProperties: false,
            description: 'Viewport dimensions for the browser context'
          },
          userAgent: {
            type: 'string',
            description: 'Custom user agent string for the browser context'
          },
          allowedDomains: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of domains allowed for this session'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            description: 'Default timeout in milliseconds for operations'
          },
          headless: {
            type: 'boolean',
            description: 'Whether to run the browser in headless mode'
          }
        },
        additionalProperties: false
      },
      handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
        return this.errorHandler.handleToolExecution(
          'browser.newContext',
          async () => {
            // Validate and parse options
            const options = this.parseSessionOptions(args);
            
            // Create session with circuit breaker protection
            const session = await this.errorHandler.executeWithCircuitBreaker(
              CircuitBreakerManager.SESSION_CREATION,
              () => this.sessionManager.createSession(options)
            );
            
            return {
              success: true,
              sessionId: session.id,
              viewport: session.options.viewport,
              userAgent: session.options.userAgent,
              createdAt: session.createdAt.toISOString(),
              message: 'Browser context created successfully'
            };
          },
          { operation: 'createContext', ...args }
        );
      }
    };
  }

  /**
   * Creates the browser.goto tool with enhanced error handling
   */
  createGotoTool(): BrowserTool {
    return {
      name: 'browser.goto',
      description: 'Navigate to a specified URL with wait conditions and error handling',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'ID of the browser session to use for navigation'
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'URL to navigate to'
          },
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
            default: 'load',
            description: 'When to consider navigation complete'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            description: 'Navigation timeout in milliseconds (overrides session default)'
          }
        },
        required: ['sessionId', 'url'],
        additionalProperties: false
      },
      handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
        return this.errorHandler.handleToolExecution(
          'browser.goto',
          async () => {
            const { sessionId, url, waitUntil, timeout } = this.parseGotoArgs(args);
            
            // Get session with validation
            const session = this.getValidatedSession(sessionId);
            
            // Validate URL and domain
            const urlObj = this.validateUrl(url);
            const domain = urlObj.hostname;
            
            // Check domain permissions
            this.checkDomainPermissions(session, domain);
            
            const startTime = Date.now();
            
            // Execute navigation with circuit breaker
            const response = await this.errorHandler.executeWithCircuitBreaker(
              CircuitBreakerManager.BROWSER_NAVIGATION,
              async () => {
                const gotoOptions: {
                  waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
                  timeout?: number;
                } = { waitUntil: waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | 'commit' };
                
                if (timeout) {
                  gotoOptions.timeout = timeout;
                }
                
                try {
                  return await session.page.goto(url, gotoOptions);
                } catch (error) {
                  // Convert Playwright errors to our error types
                  throw this.convertNavigationError(error, url, sessionId);
                }
              }
            );

            const endTime = Date.now();
            const navigationTime = endTime - startTime;

            // Record macro if active
            this.recordMacroNavigation(sessionId, url);

            // Update session activity and allowed domains
            session.updateActivity();
            if (response && response.ok()) {
              session.addAllowedDomain(domain);
            }

            return {
              success: true,
              url: url,
              finalUrl: session.page.url(),
              status: response?.status() || null,
              statusText: response?.statusText() || null,
              navigationTime: navigationTime,
              waitUntil: waitUntil,
              timestamp: new Date().toISOString(),
              message: 'Navigation completed successfully'
            };
          },
          { 
            operation: 'navigation',
            sessionId: args.sessionId,
            url: args.url,
            waitUntil: args.waitUntil,
            timeout: args.timeout
          }
        );
      }
    };
  }

  /**
   * Parse and validate session options
   */
  private parseSessionOptions(args: Record<string, unknown>): SessionOptions {
    const options: SessionOptions = {};
    
    if (args.viewport) {
      const viewport = args.viewport as { width?: number; height?: number };
      if (viewport.width !== undefined && viewport.height !== undefined) {
        if (viewport.width < 100 || viewport.width > 3840 || 
            viewport.height < 100 || viewport.height > 2160) {
          throw ErrorFactory.invalidParams('Viewport dimensions must be between 100-3840 (width) and 100-2160 (height)');
        }
        options.viewport = { width: viewport.width, height: viewport.height };
      }
    }
    
    if (args.userAgent && typeof args.userAgent === 'string') {
      if (args.userAgent.length > 500) {
        throw ErrorFactory.invalidParams('User agent string too long (max 500 characters)');
      }
      options.userAgent = args.userAgent;
    }
    
    if (args.allowedDomains && Array.isArray(args.allowedDomains)) {
      const domains = args.allowedDomains.filter(domain => typeof domain === 'string');
      // Validate domain formats
      for (const domain of domains) {
        if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain) && domain !== 'localhost') {
          throw ErrorFactory.invalidParams(`Invalid domain format: ${domain}`);
        }
      }
      options.allowedDomains = domains;
    }
    
    if (args.timeout && typeof args.timeout === 'number') {
      if (args.timeout < 1000 || args.timeout > 300000) {
        throw ErrorFactory.invalidParams('Timeout must be between 1000 and 300000 milliseconds');
      }
      options.timeout = args.timeout;
    }
    
    if (args.headless !== undefined && typeof args.headless === 'boolean') {
      options.headless = args.headless;
    }

    return options;
  }

  /**
   * Parse and validate goto arguments
   */
  private parseGotoArgs(args: Record<string, unknown>) {
    const sessionId = args.sessionId as string;
    const url = args.url as string;
    const waitUntil = (args.waitUntil as string) || 'load';
    const timeout = args.timeout as number | undefined;

    if (!sessionId || typeof sessionId !== 'string') {
      throw ErrorFactory.invalidParams('sessionId is required and must be a string');
    }

    if (!url || typeof url !== 'string') {
      throw ErrorFactory.invalidParams('url is required and must be a string');
    }

    if (!['load', 'domcontentloaded', 'networkidle', 'commit'].includes(waitUntil)) {
      throw ErrorFactory.invalidParams('waitUntil must be one of: load, domcontentloaded, networkidle, commit');
    }

    if (timeout !== undefined && (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000)) {
      throw ErrorFactory.invalidParams('timeout must be a number between 1000 and 300000 milliseconds');
    }

    return { sessionId, url, waitUntil, timeout };
  }

  /**
   * Get and validate session
   */
  private getValidatedSession(sessionId: string) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw ErrorFactory.createBrowserError(
        'CONTEXT_CRASHED',
        `Session '${sessionId}' not found or has expired`,
        { sessionId }
      );
    }
    return session;
  }

  /**
   * Validate URL format
   */
  private validateUrl(url: string): URL {
    try {
      return new URL(url);
    } catch {
      throw ErrorFactory.invalidParams(`Invalid URL format: ${url}`);
    }
  }

  /**
   * Check domain permissions
   */
  private checkDomainPermissions(session: any, domain: string) {
    if (session.allowedDomains.size > 0 && !session.isDomainAllowed(domain)) {
      throw ErrorFactory.domainDenied(domain, session.id);
    }
  }

  /**
   * Convert Playwright navigation errors to our error types
   */
  private convertNavigationError(error: unknown, url: string, sessionId: string) {
    const message = error instanceof Error ? error.message : String(error);
    
    if (message.includes('Timeout') || message.includes('timeout')) {
      const timeoutMatch = message.match(/(\d+)ms/);
      const timeout = timeoutMatch ? parseInt(timeoutMatch[1]) : 30000;
      return ErrorFactory.timeout('navigation', timeout, sessionId);
    }
    
    if (message.includes('net::') || 
        message.includes('DNS') || 
        message.includes('ENOTFOUND') ||
        message.includes('ERR_NAME_NOT_RESOLVED') ||
        message.includes('getaddrinfo')) {
      return ErrorFactory.networkError('navigation', message);
    }
    
    if (message.includes('crashed') || message.includes('disconnected')) {
      return ErrorFactory.contextCrashed(sessionId, message);
    }
    
    return ErrorFactory.navigationFailed(url, message, sessionId);
  }

  /**
   * Record macro navigation if recording is active
   */
  private recordMacroNavigation(sessionId: string, url: string) {
    try {
      const { macroRecorder } = getMacroComponents();
      if (macroRecorder!.isRecording(sessionId)) {
        macroRecorder!.recordNavigation(sessionId, url);
      }
    } catch (error) {
      // Don't fail navigation if macro recording fails
      console.warn('Failed to record macro navigation:', error);
    }
  }

  /**
   * Get the error handler instance
   */
  getErrorHandler(): ErrorHandler {
    return this.errorHandler;
  }

  /**
   * Update error handler configuration
   */
  updateErrorHandlerConfig(config: any) {
    this.errorHandler.updateConfig(config);
  }
}