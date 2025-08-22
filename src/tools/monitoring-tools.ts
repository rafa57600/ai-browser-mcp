import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { NetworkLog, ConsoleLog } from '../types/log-types.js';

/**
 * Creates the browser.network.getRecent tool for retrieving recent network logs
 */
export function createNetworkGetRecentTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.network.getRecent',
    description: 'Retrieve recent network requests and responses with optional limit parameter',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to get network logs from'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum number of recent network logs to return (default: 50)'
        },
        includeBody: {
          type: 'boolean',
          default: false,
          description: 'Whether to include request/response bodies in the logs'
        }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const limit = (args.limit as number) || 50;
        const includeBody = (args.includeBody as boolean) || false;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        // Get recent network logs
        const networkLogs = session.getRecentNetworkLogs(limit);

        // Filter sensitive data and optionally exclude bodies
        const sanitizedLogs = networkLogs.map((log: NetworkLog) => {
          const sanitized: Partial<NetworkLog> = {
            timestamp: log.timestamp,
            method: log.method,
            url: log.url,
            status: log.status,
            duration: log.duration,
            requestHeaders: filterSensitiveHeaders(log.requestHeaders),
            responseHeaders: filterSensitiveHeaders(log.responseHeaders)
          };

          // Include bodies only if requested
          if (includeBody) {
            if (log.requestBody) {
              sanitized.requestBody = log.requestBody;
            }
            if (log.responseBody) {
              sanitized.responseBody = log.responseBody;
            }
          }

          return sanitized;
        });

        // Update session activity
        session.updateActivity();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: sessionId,
                networkLogs: sanitizedLogs,
                totalLogs: networkLogs.length,
                limit: limit,
                includeBody: includeBody,
                timestamp: new Date().toISOString(),
                message: `Retrieved ${sanitizedLogs.length} network log entries`
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
 * Creates the browser.console.getRecent tool for retrieving recent console logs
 */
export function createConsoleGetRecentTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.console.getRecent',
    description: 'Retrieve recent console log entries with optional filtering and limit parameter',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to get console logs from'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum number of recent console logs to return (default: 50)'
        },
        level: {
          type: 'string',
          enum: ['log', 'info', 'warn', 'warning', 'error', 'debug'],
          description: 'Filter logs by specific level (optional)'
        },
        includeLocation: {
          type: 'boolean',
          default: true,
          description: 'Whether to include location information in the logs'
        }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const limit = (args.limit as number) || 50;
        const levelFilter = args.level as ConsoleLog['level'] | undefined;
        const includeLocation = (args.includeLocation as boolean) !== false;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        // Get recent console logs
        let consoleLogs = session.getRecentConsoleLogs();

        // Filter by level if specified
        if (levelFilter) {
          consoleLogs = consoleLogs.filter(log => log.level === levelFilter);
        }

        // Apply limit after filtering
        if (consoleLogs.length > limit) {
          consoleLogs = consoleLogs.slice(-limit);
        }

        // Format logs for output
        const formattedLogs = consoleLogs.map((log: ConsoleLog) => {
          const formatted: Partial<ConsoleLog> = {
            timestamp: log.timestamp,
            level: log.level,
            message: log.message
          };

          // Include location only if requested
          if (includeLocation && log.location) {
            formatted.location = log.location;
          }

          return formatted;
        });

        // Update session activity
        session.updateActivity();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: sessionId,
                consoleLogs: formattedLogs,
                totalLogs: formattedLogs.length,
                limit: limit,
                levelFilter: levelFilter || 'all',
                includeLocation: includeLocation,
                timestamp: new Date().toISOString(),
                message: `Retrieved ${formattedLogs.length} console log entries`
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
 * Filters sensitive headers from network logs
 */
function filterSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
    'bearer',
    'proxy-authorization'
  ];

  const filtered: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.some(sensitive => lowerKey.includes(sensitive))) {
      filtered[key] = '[REDACTED]';
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}