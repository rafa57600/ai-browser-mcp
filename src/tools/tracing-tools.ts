import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { TraceOptions, HARFile, HAREntry, HARLog } from '../types/trace-types.js';
import { NetworkLog } from '../types/log-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Creates the browser.trace.start tool for starting browser tracing
 */
export function createTraceStartTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.trace.start',
    description: 'Start browser tracing to record browser activity including screenshots, snapshots, and sources',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to start tracing for'
        },
        screenshots: {
          type: 'boolean',
          default: true,
          description: 'Whether to capture screenshots during tracing'
        },
        snapshots: {
          type: 'boolean',
          default: true,
          description: 'Whether to capture DOM snapshots during tracing'
        },
        sources: {
          type: 'boolean',
          default: false,
          description: 'Whether to capture source code during tracing'
        }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const options: TraceOptions = {
          screenshots: (args.screenshots as boolean) !== false,
          snapshots: (args.snapshots as boolean) !== false,
          sources: (args.sources as boolean) || false
        };

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        await session.startTrace(options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: sessionId,
                message: 'Browser tracing started successfully',
                options: options,
                timestamp: new Date().toISOString()
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
 * Creates the browser.trace.stop tool for stopping browser tracing
 */
export function createTraceStopTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.trace.stop',
    description: 'Stop browser tracing and return trace file information',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to stop tracing for'
        }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const traceData = await session.stopTrace();

        // Get file size
        let fileSize = 0;
        try {
          const stats = await fs.stat(traceData.traceFile!);
          fileSize = stats.size;
        } catch (error) {
          // File size not critical, continue without it
        }

        const duration = traceData.endTime && traceData.startTime 
          ? traceData.endTime.getTime() - traceData.startTime.getTime()
          : 0;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: sessionId,
                traceData: {
                  traceFile: traceData.traceFile,
                  startTime: traceData.startTime,
                  endTime: traceData.endTime,
                  duration: duration,
                  size: fileSize,
                  metadata: traceData.metadata
                },
                message: 'Browser tracing stopped successfully',
                timestamp: new Date().toISOString()
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
 * Creates the browser.harExport tool for exporting network activity in HAR format
 */
export function createHarExportTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.harExport',
    description: 'Export network activity from the session in HAR (HTTP Archive) format',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to export HAR data from'
        },
        includeContent: {
          type: 'boolean',
          default: false,
          description: 'Whether to include response content in the HAR export'
        },
        maxEntries: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
          description: 'Maximum number of network entries to include (default: 1000)'
        },
        outputPath: {
          type: 'string',
          description: 'Optional file path to save the HAR file (relative to traces directory)'
        }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const includeContent = (args.includeContent as boolean) || false;
        const maxEntries = (args.maxEntries as number) || 1000;
        const outputPath = args.outputPath as string;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        // Get network logs
        const networkLogs = session.getRecentNetworkLogs(maxEntries);
        
        // Convert network logs to HAR format
        const harFile = await convertNetworkLogsToHAR(networkLogs, includeContent, sessionId);

        let filePath: string | undefined;
        if (outputPath) {
          // Ensure traces directory exists
          const tracesDir = path.join(process.cwd(), 'traces', sessionId);
          await fs.mkdir(tracesDir, { recursive: true });
          
          filePath = path.join(tracesDir, outputPath);
          await fs.writeFile(filePath, JSON.stringify(harFile, null, 2));
        }

        // Update session activity
        session.updateActivity();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sessionId: sessionId,
                harData: harFile,
                ...(filePath && { filePath }),
                entriesCount: harFile.log.entries.length,
                includeContent: includeContent,
                timestamp: new Date().toISOString(),
                message: `HAR export completed with ${harFile.log.entries.length} entries`
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
 * Converts network logs to HAR format
 */
async function convertNetworkLogsToHAR(
  networkLogs: NetworkLog[], 
  includeContent: boolean,
  sessionId: string
): Promise<HARFile> {
  const entries: HAREntry[] = networkLogs.map((log) => {
    // Parse URL for query string
    const url = new URL(log.url);
    const queryString = Array.from(url.searchParams.entries()).map(([name, value]) => ({
      name,
      value
    }));

    // Convert headers to HAR format
    const requestHeaders = Object.entries(log.requestHeaders).map(([name, value]) => ({
      name,
      value
    }));

    const responseHeaders = Object.entries(log.responseHeaders).map(([name, value]) => ({
      name,
      value
    }));

    // Calculate sizes
    const requestHeadersSize = requestHeaders.reduce((size, header) => 
      size + header.name.length + header.value.length + 4, 0); // +4 for ": " and "\r\n"
    
    const responseHeadersSize = responseHeaders.reduce((size, header) => 
      size + header.name.length + header.value.length + 4, 0);

    const requestBodySize = log.requestBody ? Buffer.byteLength(log.requestBody, 'utf8') : 0;
    const responseBodySize = log.responseBody ? Buffer.byteLength(log.responseBody, 'utf8') : 0;

    // Create HAR entry
    const entry: HAREntry = {
      startedDateTime: log.timestamp.toISOString(),
      time: log.duration,
      request: {
        method: log.method,
        url: log.url,
        httpVersion: 'HTTP/1.1',
        headers: requestHeaders,
        queryString: queryString,
        ...(log.requestBody && {
          postData: {
            mimeType: log.requestHeaders['content-type'] || 'application/octet-stream',
            text: log.requestBody
          }
        }),
        headersSize: requestHeadersSize,
        bodySize: requestBodySize
      },
      response: {
        status: log.status,
        statusText: getStatusText(log.status),
        httpVersion: 'HTTP/1.1',
        headers: responseHeaders,
        content: {
          size: responseBodySize,
          mimeType: log.responseHeaders['content-type'] || 'application/octet-stream',
          ...(includeContent && log.responseBody && { text: log.responseBody })
        },
        redirectURL: log.responseHeaders['location'] || '',
        headersSize: responseHeadersSize,
        bodySize: responseBodySize
      },
      cache: {},
      timings: {
        blocked: -1,
        dns: -1,
        connect: -1,
        send: 0,
        wait: log.duration,
        receive: 0,
        ssl: -1
      }
    };

    return entry;
  });

  const harLog: HARLog = {
    version: '1.2',
    creator: {
      name: 'AI Browser MCP Server',
      version: '1.0.0'
    },
    browser: {
      name: 'Chromium',
      version: 'Unknown'
    },
    pages: [{
      startedDateTime: entries.length > 0 ? entries[0].startedDateTime : new Date().toISOString(),
      id: `page_${sessionId}`,
      title: 'Browser Session',
      pageTimings: {
        onContentLoad: -1,
        onLoad: -1
      }
    }],
    entries: entries
  };

  return {
    log: harLog
  };
}

/**
 * Gets HTTP status text for a given status code
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };

  return statusTexts[status] || 'Unknown';
}