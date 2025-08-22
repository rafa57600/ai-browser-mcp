import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { ReportOptions } from '../types/report-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { ReportGenerator } from './report-generator.js';

/**
 * Creates the browser.report.generate tool for generating comprehensive reports
 */
export function createReportGenerateTool(
  sessionManager: SessionManager,
  reportGenerator: ReportGenerator
): BrowserTool {
  return {
    name: 'browser.report.generate',
    description: 'Generate a comprehensive report with screenshots, logs, and DOM snapshots',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to generate report for'
        },
        format: {
          type: 'string',
          enum: ['html', 'pdf', 'json'],
          default: 'html',
          description: 'Output format for the report'
        },
        title: {
          type: 'string',
          description: 'Custom title for the report'
        },
        description: {
          type: 'string',
          description: 'Custom description for the report'
        },
        template: {
          type: 'string',
          description: 'Template name to use for report generation'
        },
        includeScreenshots: {
          type: 'boolean',
          default: true,
          description: 'Whether to include screenshots in the report'
        },
        includeDOMSnapshots: {
          type: 'boolean',
          default: true,
          description: 'Whether to include DOM snapshots in the report'
        },
        includeNetworkLogs: {
          type: 'boolean',
          default: true,
          description: 'Whether to include network logs in the report'
        },
        includeConsoleLogs: {
          type: 'boolean',
          default: true,
          description: 'Whether to include console logs in the report'
        },
        includeTraceData: {
          type: 'boolean',
          default: true,
          description: 'Whether to include trace data in the report'
        },
        maxScreenshots: {
          type: 'number',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of screenshots to include'
        },
        maxNetworkLogs: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
          description: 'Maximum number of network logs to include'
        },
        maxConsoleLogs: {
          type: 'number',
          minimum: 1,
          maximum: 10000,
          description: 'Maximum number of console logs to include'
        },
        customStyles: {
          type: 'string',
          description: 'Custom CSS styles to apply to HTML reports'
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

        // Build report options
        const options: ReportOptions = {
          format: (args.format as 'html' | 'pdf' | 'json') || 'html',
          title: args.title as string,
          description: args.description as string,
          template: args.template as string,
          includeScreenshots: args.includeScreenshots !== false,
          includeDOMSnapshots: args.includeDOMSnapshots !== false,
          includeNetworkLogs: args.includeNetworkLogs !== false,
          includeConsoleLogs: args.includeConsoleLogs !== false,
          includeTraceData: args.includeTraceData !== false,
          maxScreenshots: args.maxScreenshots as number,
          maxNetworkLogs: args.maxNetworkLogs as number,
          maxConsoleLogs: args.maxConsoleLogs as number,
          customStyles: args.customStyles as string
        };

        const startTime = Date.now();

        // Generate the report
        const reportResult = await reportGenerator.generateReport(session, options);

        const endTime = Date.now();
        const generationTime = endTime - startTime;

        // Update session activity
        session.updateActivity();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                report: {
                  reportId: reportResult.reportId,
                  format: reportResult.format,
                  filePath: reportResult.filePath,
                  size: reportResult.size,
                  sizeFormatted: formatFileSize(reportResult.size),
                  timestamp: reportResult.timestamp.toISOString(),
                  metadata: reportResult.metadata
                },
                generationTime: generationTime,
                message: `Report generated successfully in ${generationTime}ms`
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'system',
                  message: errorMessage,
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
 * Creates the browser.report.templates tool for listing available report templates
 */
export function createReportTemplatesListTool(reportGenerator: ReportGenerator): BrowserTool {
  return {
    name: 'browser.report.templates',
    description: 'List available report templates and their descriptions',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    handler: async (): Promise<CallToolResult> => {
      try {
        const templates = reportGenerator.getAvailableTemplates();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                templates: templates,
                totalTemplates: templates.length,
                message: `Found ${templates.length} available report templates`
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'system',
                  message: errorMessage,
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
 * Creates the browser.report.cleanup tool for cleaning up old reports
 */
export function createReportCleanupTool(reportGenerator: ReportGenerator): BrowserTool {
  return {
    name: 'browser.report.cleanup',
    description: 'Clean up old report files and temporary data',
    inputSchema: {
      type: 'object',
      properties: {
        maxAge: {
          type: 'number',
          minimum: 3600000, // 1 hour minimum
          description: 'Maximum age of files to keep in milliseconds (default: 24 hours)'
        }
      },
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const maxAge = args.maxAge as number;
        const startTime = Date.now();

        await reportGenerator.cleanup(maxAge);

        const endTime = Date.now();
        const cleanupTime = endTime - startTime;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                cleanupTime: cleanupTime,
                maxAge: maxAge || 24 * 60 * 60 * 1000,
                message: `Report cleanup completed in ${cleanupTime}ms`
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'system',
                  message: errorMessage,
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
 * Formats file size in bytes to human readable format
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}