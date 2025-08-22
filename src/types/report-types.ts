// Report-related type definitions
import type { NetworkLog, ConsoleLog } from './log-types.js';
import type { ScreenshotResult } from './tool-types.js';

export interface ReportData {
  sessionId: string;
  sessionMetadata: SessionMetadata;
  screenshots: ScreenshotResult[];
  domSnapshots: DOMSnapshotData[];
  networkLogs: NetworkLog[];
  consoleLogs: ConsoleLog[];
  traceData?: TraceReportData;
  timestamp: Date;
  reportId: string;
}

export interface SessionMetadata {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  userAgent: string;
  allowedDomains: string[];
  duration: number; // in milliseconds
}

export interface DOMSnapshotData {
  snapshot: any;
  metadata: {
    totalNodes: number;
    maxNodes: number;
    truncated: boolean;
    url: string;
    title: string;
    selector: string | null;
    timestamp: string;
    snapshotTime: number;
    includeStyles: boolean;
    includeAttributes: boolean;
  };
  timestamp: Date;
}

export interface TraceReportData {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  traceFile?: string;
  isActive: boolean;
  metadata?: any;
}

export interface ReportOptions {
  format: 'html' | 'pdf' | 'json';
  includeScreenshots?: boolean;
  includeDOMSnapshots?: boolean;
  includeNetworkLogs?: boolean;
  includeConsoleLogs?: boolean;
  includeTraceData?: boolean;
  template?: string;
  customStyles?: string;
  title?: string;
  description?: string;
  maxScreenshots?: number;
  maxNetworkLogs?: number;
  maxConsoleLogs?: number;
}

export interface ReportTemplate {
  name: string;
  description: string;
  htmlTemplate: string;
  cssStyles: string;
  supportedFormats: ('html' | 'pdf')[];
}

export interface ReportResult {
  reportId: string;
  format: 'html' | 'pdf' | 'json';
  filePath: string;
  size: number;
  timestamp: Date;
  metadata: {
    sessionId: string;
    screenshotCount: number;
    domSnapshotCount: number;
    networkLogCount: number;
    consoleLogCount: number;
    hasTraceData: boolean;
    generationTime: number;
  };
}

export interface ReportGeneratorConfig {
  outputDir?: string;
  tempDir?: string;
  maxReportSize?: number;
  defaultTemplate?: string;
  pdfOptions?: {
    format?: 'A4' | 'Letter' | 'Legal';
    margin?: {
      top?: string;
      right?: string;
      bottom?: string;
      left?: string;
    };
    printBackground?: boolean;
    landscape?: boolean;
  };
}