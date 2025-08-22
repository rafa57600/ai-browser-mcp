import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { getMacroComponents } from './macro-tools.js';
import { SessionOptions } from '../types/session-types.js';

/**
 * Creates the browser.newContext tool for creating new browser contexts
 */
export function createNewContextTool(sessionManager: SessionManager): BrowserTool {
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
      try {
        const options: SessionOptions = {};
        
        if (args.viewport) {
          const viewport = args.viewport as { width?: number; height?: number };
          if (viewport.width !== undefined && viewport.height !== undefined) {
            options.viewport = { width: viewport.width, height: viewport.height };
          }
        }
        
        if (args.userAgent && typeof args.userAgent === 'string') {
          options.userAgent = args.userAgent;
        }
        
        if (args.allowedDomains && Array.isArray(args.allowedDomains)) {
          options.allowedDomains = args.allowedDomains.filter(domain => typeof domain === 'string');
        }
        
        if (args.timeout && typeof args.timeout === 'number') {
          options.timeout = args.timeout;
        }
        
        if (args.headless !== undefined && typeof args.headless === 'boolean') {
          options.headless = args.headless;
        }

        const session = await sessionManager.createSession(options);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: session.id,
                viewport: session.options.viewport,
                userAgent: session.options.userAgent,
                createdAt: session.createdAt.toISOString(),
                message: 'Browser context created successfully'
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'browser',
                  message: error instanceof Error ? error.message : String(error),
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}

/**
 * Creates the browser.goto tool for navigating to URLs
 */
export function createGotoTool(sessionManager: SessionManager): BrowserTool {
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
      try {
        const sessionId = args.sessionId as string;
        const url = args.url as string;
        const waitUntil = (args.waitUntil as string) || 'load';
        const timeout = args.timeout as number | undefined;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!url || typeof url !== 'string') {
          throw new Error('url is required and must be a string');
        }

        // Validate URL format
        try {
          new URL(url);
        } catch {
          throw new Error('Invalid URL format');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        // Extract domain for security check
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Check if domain is allowed (if allowedDomains is configured)
        if (session.allowedDomains.size > 0 && !session.isDomainAllowed(domain)) {
          throw new Error(`Domain '${domain}' is not in the allowed domains list for this session`);
        }

        const startTime = Date.now();
        
        try {
          // Navigate to the URL
          const gotoOptions: {
            waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
            timeout?: number;
          } = {
            waitUntil: waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | 'commit'
          };
          
          if (timeout) {
            gotoOptions.timeout = timeout;
          }
          
          const response = await session.page.goto(url, gotoOptions);

          const endTime = Date.now();
          const navigationTime = endTime - startTime;

          // Record the action if macro recording is active
          const { macroRecorder } = getMacroComponents();
          if (macroRecorder!.isRecording(sessionId)) {
            macroRecorder!.recordNavigation(sessionId, url);
          }

          // Update session activity
          session.updateActivity();

          // Add domain to allowed domains if navigation was successful
          if (response && response.ok()) {
            session.addAllowedDomain(domain);
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  url: url,
                  finalUrl: session.page.url(),
                  status: response?.status() || null,
                  statusText: response?.statusText() || null,
                  navigationTime: navigationTime,
                  waitUntil: waitUntil,
                  timestamp: new Date().toISOString(),
                  message: 'Navigation completed successfully'
                }, null, 2)
              }
            ],
            isError: false
          };
        } catch (error) {
          throw error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.toLowerCase().includes('timeout');
        const isNetworkError = errorMessage.includes('net::') || 
                              errorMessage.includes('DNS') || 
                              errorMessage.includes('ENOTFOUND') ||
                              errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
                              errorMessage.includes('getaddrinfo');
        
        let category: 'browser' | 'security' | 'system' = 'browser';
        if (errorMessage.includes('not in the allowed domains')) {
          category = 'security';
        } else if (isNetworkError) {
          category = 'system';
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: category,
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isNetworkError: isNetworkError,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}