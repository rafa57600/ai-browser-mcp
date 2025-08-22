// Log-related type definitions
export interface NetworkLog {
  timestamp: Date;
  method: string;
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  duration: number;
}

export interface ConsoleLog {
  timestamp: Date;
  level: 'log' | 'info' | 'warn' | 'warning' | 'error' | 'debug';
  message: string;
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}