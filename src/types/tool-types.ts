import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Tool-related type definitions
export interface BrowserTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export interface ScreenshotResult {
  data: Buffer;
  format: 'png' | 'jpeg';
  width: number;
  height: number;
  timestamp: Date;
}

export interface ErrorResponse {
  code: number;
  message: string;
  data?: {
    category: 'protocol' | 'security' | 'browser' | 'system';
    details: unknown;
    timestamp: Date;
  };
}