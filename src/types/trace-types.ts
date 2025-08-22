// Trace-related type definitions

export interface TraceData {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  traceFile?: string;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      mimeType: string;
      text: string;
    };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: {
      size: number;
      mimeType: string;
      text?: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: {};
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl: number;
  };
}

export interface HARLog {
  version: string;
  creator: {
    name: string;
    version: string;
  };
  browser: {
    name: string;
    version: string;
  };
  pages: Array<{
    startedDateTime: string;
    id: string;
    title: string;
    pageTimings: {
      onContentLoad: number;
      onLoad: number;
    };
  }>;
  entries: HAREntry[];
}

export interface HARFile {
  log: HARLog;
}

export interface TraceOptions {
  screenshots?: boolean;
  snapshots?: boolean;
  sources?: boolean;
}

export interface TraceResult {
  sessionId: string;
  traceFile: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  size: number;
}