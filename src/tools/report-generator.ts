import type { 
  ReportData, 
  ReportOptions, 
  ReportResult, 
  ReportTemplate, 
  ReportGeneratorConfig,
  SessionMetadata,
  DOMSnapshotData
} from '../types/report-types.js';
import type { BrowserSession } from '../browser/browser-session.js';
import type { ScreenshotResult } from '../types/tool-types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * ReportGenerator handles the creation of comprehensive browser automation reports
 */
export class ReportGenerator {
  private config: ReportGeneratorConfig;
  private templates: Map<string, ReportTemplate> = new Map();

  constructor(config: ReportGeneratorConfig = {}) {
    this.config = {
      outputDir: config.outputDir || path.join(process.cwd(), 'reports'),
      tempDir: config.tempDir || path.join(os.tmpdir(), 'mcp-browser-reports'),
      maxReportSize: config.maxReportSize || 100 * 1024 * 1024, // 100MB
      defaultTemplate: config.defaultTemplate || 'default',
      pdfOptions: {
        format: 'A4',
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        },
        printBackground: true,
        landscape: false,
        ...config.pdfOptions
      }
    };

    this.initializeDefaultTemplates();
  }

  /**
   * Generates a comprehensive report from session data
   */
  async generateReport(
    session: BrowserSession,
    options: ReportOptions
  ): Promise<ReportResult> {
    const startTime = Date.now();
    const reportId = this.generateReportId();

    try {
      // Ensure output directories exist
      await this.ensureDirectories();

      // Collect report data
      const reportData = await this.collectReportData(session, options);

      // Generate report based on format
      let filePath: string;
      switch (options.format) {
        case 'html':
          filePath = await this.generateHTMLReport(reportData, options, reportId);
          break;
        case 'pdf':
          filePath = await this.generatePDFReport(reportData, options, reportId);
          break;
        case 'json':
          filePath = await this.generateJSONReport(reportData, options, reportId);
          break;
        default:
          throw new Error(`Unsupported report format: ${options.format}`);
      }

      // Get file size
      const stats = await fs.stat(filePath);
      const endTime = Date.now();

      return {
        reportId,
        format: options.format,
        filePath,
        size: stats.size,
        timestamp: new Date(),
        metadata: {
          sessionId: session.id,
          screenshotCount: reportData.screenshots.length,
          domSnapshotCount: reportData.domSnapshots.length,
          networkLogCount: reportData.networkLogs.length,
          consoleLogCount: reportData.consoleLogs.length,
          hasTraceData: !!reportData.traceData,
          generationTime: endTime - startTime
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Collects all data needed for the report
   */
  private async collectReportData(
    session: BrowserSession,
    options: ReportOptions
  ): Promise<ReportData> {
    const reportData: ReportData = {
      sessionId: session.id,
      sessionMetadata: await this.collectSessionMetadata(session),
      screenshots: [],
      domSnapshots: [],
      networkLogs: [],
      consoleLogs: [],
      timestamp: new Date(),
      reportId: this.generateReportId()
    };

    // Collect screenshots if requested
    if (options.includeScreenshots !== false) {
      reportData.screenshots = await this.collectScreenshots(session, options.maxScreenshots);
    }

    // Collect DOM snapshots if requested
    if (options.includeDOMSnapshots !== false) {
      reportData.domSnapshots = await this.collectDOMSnapshots(session);
    }

    // Collect network logs if requested
    if (options.includeNetworkLogs !== false) {
      reportData.networkLogs = session.getRecentNetworkLogs(options.maxNetworkLogs);
    }

    // Collect console logs if requested
    if (options.includeConsoleLogs !== false) {
      reportData.consoleLogs = session.getRecentConsoleLogs(options.maxConsoleLogs);
    }

    // Collect trace data if requested and available
    if (options.includeTraceData !== false) {
      const traceData = session.getTraceData();
      if (traceData) {
        reportData.traceData = traceData;
      }
    }

    return reportData;
  }

  /**
   * Collects session metadata
   */
  private async collectSessionMetadata(session: BrowserSession): Promise<SessionMetadata> {
    const url = session.page.url();
    const title = await session.page.title().catch(() => 'Unknown');
    const viewport = session.page.viewportSize() || { width: 1280, height: 720 };

    return {
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      url,
      title,
      viewport,
      userAgent: session.options.userAgent || 'Unknown',
      allowedDomains: Array.from(session.allowedDomains),
      duration: session.lastActivity.getTime() - session.createdAt.getTime()
    };
  }

  /**
   * Collects screenshots from the session
   */
  private async collectScreenshots(
    session: BrowserSession,
    maxScreenshots?: number
  ): Promise<ScreenshotResult[]> {
    const screenshots: ScreenshotResult[] = [];

    try {
      // Take a current screenshot
      const screenshotBuffer = await session.page.screenshot({
        type: 'png',
        fullPage: true
      });

      const viewport = session.page.viewportSize() || { width: 1280, height: 720 };

      screenshots.push({
        data: screenshotBuffer,
        format: 'png',
        width: viewport.width,
        height: viewport.height,
        timestamp: new Date()
      });

      // Apply limit if specified
      if (maxScreenshots && screenshots.length > maxScreenshots) {
        return screenshots.slice(0, maxScreenshots);
      }
    } catch (error) {
      console.warn('Failed to capture screenshot for report:', error);
    }

    return screenshots;
  }

  /**
   * Collects DOM snapshots from the session
   */
  private async collectDOMSnapshots(session: BrowserSession): Promise<DOMSnapshotData[]> {
    const domSnapshots: DOMSnapshotData[] = [];

    try {
      // Capture current DOM snapshot
      const domSnapshot = await session.page.evaluate(() => {
        const maxNodes = 5000;
        const currentCount = { count: 0 };
        
        function serializeNode(node: any): any {
          if (currentCount.count >= maxNodes) {
            return { __truncated: true, reason: 'Node limit exceeded' };
          }

          currentCount.count++;

          const serialized: any = {
            nodeType: node.nodeType,
            nodeName: node.nodeName
          };

          if (node.nodeType === 1) { // Element node
            const element = node;
            serialized.tagName = element.tagName;
            
            if (element.attributes) {
              serialized.attributes = {};
              for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                serialized.attributes[attr.name] = attr.value;
              }
            }

            if (element.id) serialized.id = element.id;
            if (element.className) serialized.className = element.className;
          } else if (node.nodeType === 3) { // Text node
            const textContent = node.textContent?.trim();
            if (textContent) {
              serialized.textContent = textContent;
            }
          }

          // Recursively serialize children
          if (node.childNodes && node.childNodes.length > 0 && currentCount.count < maxNodes) {
            serialized.children = [];
            for (let i = 0; i < node.childNodes.length && currentCount.count < maxNodes; i++) {
              const childSerialized = serializeNode(node.childNodes[i]);
              if (childSerialized) {
                serialized.children.push(childSerialized);
              }
            }
          }

          return serialized;
        }

        const snapshot = serializeNode((globalThis as any).document.documentElement);
        
        return {
          snapshot: snapshot,
          metadata: {
            totalNodes: currentCount.count,
            maxNodes: maxNodes,
            truncated: currentCount.count >= maxNodes,
            url: (globalThis as any).location.href,
            title: (globalThis as any).document.title,
            selector: null,
            timestamp: new Date().toISOString(),
            snapshotTime: 0,
            includeStyles: false,
            includeAttributes: true
          }
        };
      });

      domSnapshots.push({
        ...domSnapshot,
        timestamp: new Date()
      });
    } catch (error) {
      console.warn('Failed to capture DOM snapshot for report:', error);
    }

    return domSnapshots;
  }

  /**
   * Generates HTML report
   */
  private async generateHTMLReport(
    reportData: ReportData,
    options: ReportOptions,
    reportId: string
  ): Promise<string> {
    const template = this.getTemplate(options.template || this.config.defaultTemplate!);
    const filePath = path.join(this.config.outputDir!, `${reportId}.html`);

    // Generate HTML content
    const htmlContent = this.renderHTMLTemplate(template, reportData, options);

    // Write HTML file
    await fs.writeFile(filePath, htmlContent, 'utf8');

    return filePath;
  }

  /**
   * Generates PDF report (requires HTML first)
   */
  private async generatePDFReport(
    reportData: ReportData,
    options: ReportOptions,
    reportId: string
  ): Promise<string> {
    // For now, we'll generate HTML and note that PDF conversion would require additional dependencies
    // In a real implementation, you would use puppeteer or playwright to convert HTML to PDF
    const htmlPath = await this.generateHTMLReport(reportData, options, reportId);
    const pdfPath = path.join(this.config.outputDir!, `${reportId}.pdf`);

    // Note: This is a placeholder. In a real implementation, you would:
    // 1. Install puppeteer or use playwright's PDF generation
    // 2. Convert the HTML to PDF
    // For now, we'll copy the HTML file and rename it to indicate PDF generation is needed
    await fs.copyFile(htmlPath, pdfPath.replace('.pdf', '.html'));

    // Create a note file explaining PDF generation
    const noteContent = `PDF generation requires additional setup.
The HTML report has been generated at: ${htmlPath}

To convert to PDF, you can:
1. Install puppeteer: npm install puppeteer
2. Use playwright's PDF generation
3. Use a browser to print the HTML file to PDF

This is a placeholder implementation for the PDF format.`;

    await fs.writeFile(pdfPath.replace('.pdf', '.pdf-note.txt'), noteContent, 'utf8');

    return pdfPath.replace('.pdf', '.pdf-note.txt');
  }

  /**
   * Generates JSON report
   */
  private async generateJSONReport(
    reportData: ReportData,
    _options: ReportOptions,
    reportId: string
  ): Promise<string> {
    const filePath = path.join(this.config.outputDir!, `${reportId}.json`);

    // Convert screenshots to base64 for JSON serialization
    const jsonData = {
      ...reportData,
      screenshots: reportData.screenshots.map(screenshot => ({
        ...screenshot,
        data: screenshot.data.toString('base64')
      }))
    };

    // Write JSON file
    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');

    return filePath;
  }

  /**
   * Renders HTML template with report data
   */
  private renderHTMLTemplate(
    template: ReportTemplate,
    reportData: ReportData,
    options: ReportOptions
  ): string {
    let html = template.htmlTemplate;

    // Replace template variables
    html = html.replace(/\{\{title\}\}/g, options.title || `Browser Automation Report - ${reportData.sessionId}`);
    html = html.replace(/\{\{description\}\}/g, options.description || 'Comprehensive browser automation report');
    html = html.replace(/\{\{timestamp\}\}/g, reportData.timestamp.toISOString());
    html = html.replace(/\{\{sessionId\}\}/g, reportData.sessionId);
    html = html.replace(/\{\{sessionUrl\}\}/g, reportData.sessionMetadata.url);
    html = html.replace(/\{\{sessionTitle\}\}/g, reportData.sessionMetadata.title);
    html = html.replace(/\{\{sessionDuration\}\}/g, this.formatDuration(reportData.sessionMetadata.duration));

    // Add custom styles if provided
    if (options.customStyles) {
      html = html.replace('</head>', `<style>${options.customStyles}</style></head>`);
    }

    // Generate sections
    const sectionsHtml = this.generateReportSections(reportData, options);
    html = html.replace('{{sections}}', sectionsHtml);

    return html;
  }

  /**
   * Generates HTML sections for the report
   */
  private generateReportSections(reportData: ReportData, options: ReportOptions): string {
    let sectionsHtml = '';

    // Session metadata section
    sectionsHtml += this.generateSessionSection(reportData.sessionMetadata);

    // Screenshots section
    if (options.includeScreenshots !== false && reportData.screenshots.length > 0) {
      sectionsHtml += this.generateScreenshotsSection(reportData.screenshots);
    }

    // Console logs section
    if (options.includeConsoleLogs !== false && reportData.consoleLogs.length > 0) {
      sectionsHtml += this.generateConsoleLogsSection(reportData.consoleLogs);
    }

    // Network logs section
    if (options.includeNetworkLogs !== false && reportData.networkLogs.length > 0) {
      sectionsHtml += this.generateNetworkLogsSection(reportData.networkLogs);
    }

    // DOM snapshots section
    if (options.includeDOMSnapshots !== false && reportData.domSnapshots.length > 0) {
      sectionsHtml += this.generateDOMSnapshotsSection(reportData.domSnapshots);
    }

    // Trace data section
    if (options.includeTraceData !== false && reportData.traceData) {
      sectionsHtml += this.generateTraceDataSection(reportData.traceData);
    }

    return sectionsHtml;
  }

  /**
   * Generates session metadata section
   */
  private generateSessionSection(metadata: SessionMetadata): string {
    return `
      <section class="report-section">
        <h2>Session Information</h2>
        <div class="session-info">
          <div class="info-row">
            <span class="label">Session ID:</span>
            <span class="value">${metadata.id}</span>
          </div>
          <div class="info-row">
            <span class="label">URL:</span>
            <span class="value"><a href="${metadata.url}" target="_blank">${metadata.url}</a></span>
          </div>
          <div class="info-row">
            <span class="label">Title:</span>
            <span class="value">${metadata.title}</span>
          </div>
          <div class="info-row">
            <span class="label">Created:</span>
            <span class="value">${metadata.createdAt.toISOString()}</span>
          </div>
          <div class="info-row">
            <span class="label">Duration:</span>
            <span class="value">${this.formatDuration(metadata.duration)}</span>
          </div>
          <div class="info-row">
            <span class="label">Viewport:</span>
            <span class="value">${metadata.viewport.width}x${metadata.viewport.height}</span>
          </div>
          <div class="info-row">
            <span class="label">User Agent:</span>
            <span class="value">${metadata.userAgent}</span>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Generates screenshots section
   */
  private generateScreenshotsSection(screenshots: ScreenshotResult[]): string {
    const screenshotItems = screenshots.map((screenshot, index) => `
      <div class="screenshot-item">
        <h4>Screenshot ${index + 1}</h4>
        <p>Captured: ${screenshot.timestamp.toISOString()}</p>
        <p>Dimensions: ${screenshot.width}x${screenshot.height}</p>
        <img src="data:image/${screenshot.format};base64,${screenshot.data.toString('base64')}" 
             alt="Screenshot ${index + 1}" 
             class="screenshot-image" />
      </div>
    `).join('');

    return `
      <section class="report-section">
        <h2>Screenshots (${screenshots.length})</h2>
        <div class="screenshots-container">
          ${screenshotItems}
        </div>
      </section>
    `;
  }

  /**
   * Generates console logs section
   */
  private generateConsoleLogsSection(consoleLogs: any[]): string {
    const logItems = consoleLogs.map(log => `
      <div class="log-item log-${log.level}">
        <span class="log-timestamp">${log.timestamp.toISOString()}</span>
        <span class="log-level">${log.level.toUpperCase()}</span>
        <span class="log-message">${this.escapeHtml(log.message)}</span>
        ${log.location ? `<span class="log-location">${log.location.url}:${log.location.lineNumber}</span>` : ''}
      </div>
    `).join('');

    return `
      <section class="report-section">
        <h2>Console Logs (${consoleLogs.length})</h2>
        <div class="console-logs">
          ${logItems}
        </div>
      </section>
    `;
  }

  /**
   * Generates network logs section
   */
  private generateNetworkLogsSection(networkLogs: any[]): string {
    const logItems = networkLogs.map(log => `
      <div class="network-item">
        <div class="network-header">
          <span class="method ${log.method.toLowerCase()}">${log.method}</span>
          <span class="status status-${Math.floor(log.status / 100)}xx">${log.status}</span>
          <span class="url">${this.escapeHtml(log.url)}</span>
          <span class="duration">${log.duration}ms</span>
        </div>
        <div class="network-timestamp">${log.timestamp.toISOString()}</div>
      </div>
    `).join('');

    return `
      <section class="report-section">
        <h2>Network Logs (${networkLogs.length})</h2>
        <div class="network-logs">
          ${logItems}
        </div>
      </section>
    `;
  }

  /**
   * Generates DOM snapshots section
   */
  private generateDOMSnapshotsSection(domSnapshots: DOMSnapshotData[]): string {
    const snapshotItems = domSnapshots.map((snapshot, index) => `
      <div class="dom-snapshot-item">
        <h4>DOM Snapshot ${index + 1}</h4>
        <p>Captured: ${snapshot.timestamp.toISOString()}</p>
        <p>Nodes: ${snapshot.metadata.totalNodes} ${snapshot.metadata.truncated ? '(truncated)' : ''}</p>
        <details>
          <summary>View DOM Structure</summary>
          <pre class="dom-content">${this.escapeHtml(JSON.stringify(snapshot.snapshot, null, 2))}</pre>
        </details>
      </div>
    `).join('');

    return `
      <section class="report-section">
        <h2>DOM Snapshots (${domSnapshots.length})</h2>
        <div class="dom-snapshots">
          ${snapshotItems}
        </div>
      </section>
    `;
  }

  /**
   * Generates trace data section
   */
  private generateTraceDataSection(traceData: any): string {
    return `
      <section class="report-section">
        <h2>Trace Data</h2>
        <div class="trace-info">
          <div class="info-row">
            <span class="label">Start Time:</span>
            <span class="value">${traceData.startTime.toISOString()}</span>
          </div>
          ${traceData.endTime ? `
            <div class="info-row">
              <span class="label">End Time:</span>
              <span class="value">${traceData.endTime.toISOString()}</span>
            </div>
          ` : ''}
          <div class="info-row">
            <span class="label">Trace File:</span>
            <span class="value">${traceData.traceFile}</span>
          </div>
          <div class="info-row">
            <span class="label">Status:</span>
            <span class="value">${traceData.isActive ? 'Active' : 'Completed'}</span>
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Gets a template by name
   */
  private getTemplate(name: string): ReportTemplate {
    const template = this.templates.get(name);
    if (!template) {
      throw new Error(`Template '${name}' not found`);
    }
    return template;
  }

  /**
   * Initializes default templates
   */
  private initializeDefaultTemplates(): void {
    const defaultTemplate: ReportTemplate = {
      name: 'default',
      description: 'Default browser automation report template',
      supportedFormats: ['html', 'pdf'],
      htmlTemplate: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        ${this.getDefaultCSS()}
    </style>
</head>
<body>
    <header class="report-header">
        <h1>{{title}}</h1>
        <p class="description">{{description}}</p>
        <div class="report-meta">
            <span>Generated: {{timestamp}}</span>
            <span>Session: {{sessionId}}</span>
        </div>
    </header>
    
    <main class="report-content">
        {{sections}}
    </main>
    
    <footer class="report-footer">
        <p>Generated by AI Browser MCP Server</p>
    </footer>
</body>
</html>
      `,
      cssStyles: this.getDefaultCSS()
    };

    this.templates.set('default', defaultTemplate);
  }

  /**
   * Gets default CSS styles
   */
  private getDefaultCSS(): string {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #f5f5f5;
      }
      
      .report-header {
        background: #fff;
        padding: 2rem;
        border-bottom: 1px solid #ddd;
        margin-bottom: 2rem;
      }
      
      .report-header h1 {
        color: #2c3e50;
        margin-bottom: 0.5rem;
      }
      
      .description {
        color: #666;
        margin-bottom: 1rem;
      }
      
      .report-meta {
        display: flex;
        gap: 2rem;
        font-size: 0.9rem;
        color: #888;
      }
      
      .report-content {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 2rem;
      }
      
      .report-section {
        background: #fff;
        margin-bottom: 2rem;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .report-section h2 {
        color: #2c3e50;
        margin-bottom: 1.5rem;
        border-bottom: 2px solid #3498db;
        padding-bottom: 0.5rem;
      }
      
      .session-info .info-row {
        display: flex;
        margin-bottom: 0.5rem;
      }
      
      .session-info .label {
        font-weight: bold;
        min-width: 120px;
        color: #555;
      }
      
      .session-info .value {
        color: #333;
      }
      
      .screenshot-image {
        max-width: 100%;
        height: auto;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-top: 1rem;
      }
      
      .log-item {
        display: flex;
        gap: 1rem;
        padding: 0.5rem;
        border-left: 3px solid #ddd;
        margin-bottom: 0.5rem;
        font-family: monospace;
        font-size: 0.9rem;
      }
      
      .log-error { border-left-color: #e74c3c; background-color: #fdf2f2; }
      .log-warn, .log-warning { border-left-color: #f39c12; background-color: #fef9e7; }
      .log-info, .log-log { border-left-color: #3498db; background-color: #f0f8ff; }
      .log-debug { border-left-color: #95a5a6; background-color: #f8f9fa; }
      
      .log-timestamp {
        color: #666;
        font-size: 0.8rem;
        min-width: 180px;
      }
      
      .log-level {
        font-weight: bold;
        min-width: 60px;
      }
      
      .log-message {
        flex: 1;
      }
      
      .network-item {
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        padding: 1rem;
      }
      
      .network-header {
        display: flex;
        gap: 1rem;
        align-items: center;
        margin-bottom: 0.5rem;
      }
      
      .method {
        font-weight: bold;
        padding: 0.2rem 0.5rem;
        border-radius: 3px;
        font-size: 0.8rem;
      }
      
      .method.get { background-color: #d4edda; color: #155724; }
      .method.post { background-color: #cce5ff; color: #004085; }
      .method.put { background-color: #fff3cd; color: #856404; }
      .method.delete { background-color: #f8d7da; color: #721c24; }
      
      .status {
        font-weight: bold;
        padding: 0.2rem 0.5rem;
        border-radius: 3px;
        font-size: 0.8rem;
      }
      
      .status-2xx { background-color: #d4edda; color: #155724; }
      .status-3xx { background-color: #cce5ff; color: #004085; }
      .status-4xx { background-color: #fff3cd; color: #856404; }
      .status-5xx { background-color: #f8d7da; color: #721c24; }
      
      .url {
        flex: 1;
        font-family: monospace;
        font-size: 0.9rem;
      }
      
      .duration {
        color: #666;
        font-size: 0.9rem;
      }
      
      .network-timestamp {
        color: #666;
        font-size: 0.8rem;
      }
      
      .dom-content {
        background-color: #f8f9fa;
        padding: 1rem;
        border-radius: 4px;
        overflow-x: auto;
        max-height: 400px;
        font-size: 0.8rem;
      }
      
      .trace-info .info-row {
        display: flex;
        margin-bottom: 0.5rem;
      }
      
      .trace-info .label {
        font-weight: bold;
        min-width: 120px;
        color: #555;
      }
      
      .trace-info .value {
        color: #333;
      }
      
      .report-footer {
        text-align: center;
        padding: 2rem;
        color: #666;
        font-size: 0.9rem;
      }
      
      details {
        margin-top: 1rem;
      }
      
      summary {
        cursor: pointer;
        font-weight: bold;
        padding: 0.5rem;
        background-color: #f8f9fa;
        border-radius: 4px;
      }
      
      summary:hover {
        background-color: #e9ecef;
      }
    `;
  }

  /**
   * Ensures output directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.outputDir!, { recursive: true });
    await fs.mkdir(this.config.tempDir!, { recursive: true });
  }

  /**
   * Generates a unique report ID
   */
  private generateReportId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `report-${timestamp}-${random}`;
  }

  /**
   * Formats duration in milliseconds to human readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Escapes HTML characters
   */
  private escapeHtml(text: string): string {
    const div = { innerHTML: '' } as any;
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Adds a custom template
   */
  addTemplate(template: ReportTemplate): void {
    this.templates.set(template.name, template);
  }

  /**
   * Gets available template names
   */
  getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Cleans up temporary files and old reports
   */
  async cleanup(maxAge?: number): Promise<void> {
    const maxAgeMs = maxAge || 24 * 60 * 60 * 1000; // 24 hours default
    const cutoffTime = Date.now() - maxAgeMs;

    try {
      // Clean up output directory
      const outputFiles = await fs.readdir(this.config.outputDir!);
      for (const file of outputFiles) {
        const filePath = path.join(this.config.outputDir!, file);
        const stats = await fs.stat(filePath);
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
        }
      }

      // Clean up temp directory
      const tempFiles = await fs.readdir(this.config.tempDir!);
      for (const file of tempFiles) {
        const filePath = path.join(this.config.tempDir!, file);
        const stats = await fs.stat(filePath);
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.warn('Error during report cleanup:', error);
    }
  }
}