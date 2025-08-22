import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createScreenshotTool, createDOMSnapshotTool, TempFileManager } from '../../src/tools/capture-tools.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { BrowserSession } from '../../src/browser/browser-session.js';

describe('CaptureTools Integration', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let sessionManager: SessionManager;
  let session: BrowserSession;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
    await TempFileManager.cleanup();
  });

  beforeEach(async () => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    page = await context.newPage();
    
    sessionManager = new SessionManager();
    await sessionManager.initialize();
    
    // Create a real session for integration testing
    session = await sessionManager.createSession({
      viewport: { width: 1280, height: 720 },
      headless: true
    });

    // Set up a test page with various elements
    await session.page.setContent(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page for Screenshots and DOM</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { background: #007acc; color: white; padding: 20px; }
            .content { margin: 20px 0; }
            .box { width: 200px; height: 100px; background: #f0f0f0; border: 1px solid #ccc; margin: 10px; }
            .hidden { display: none; }
            .large-content { height: 2000px; background: linear-gradient(to bottom, #ff0000, #0000ff); }
          </style>
        </head>
        <body>
          <div class="header" id="main-header">
            <h1>Test Page</h1>
            <p>This is a test page for capture tools</p>
          </div>
          <div class="content">
            <div class="box" id="test-box-1">Box 1</div>
            <div class="box" id="test-box-2">Box 2</div>
            <div class="hidden" id="hidden-element">Hidden Element</div>
            <form id="test-form">
              <input type="text" id="test-input" value="test value" />
              <select id="test-select">
                <option value="option1">Option 1</option>
                <option value="option2" selected>Option 2</option>
              </select>
              <button type="button" id="test-button">Test Button</button>
            </form>
            <div class="large-content" id="large-content">
              <p>This is a very tall element for testing full page screenshots</p>
            </div>
          </div>
          <!-- Comment node for DOM testing -->
          <script>
            console.log('Test page loaded');
            window.testData = { loaded: true, timestamp: Date.now() };
          </script>
        </body>
      </html>
    `);
  });

  afterEach(async () => {
    if (session) {
      await sessionManager.destroySession(session.id);
    }
    await context.close();
  });

  describe('ScreenshotTool Integration', () => {
    let screenshotTool: ReturnType<typeof createScreenshotTool>;

    beforeEach(() => {
      screenshotTool = createScreenshotTool(sessionManager);
    });

    it('should capture viewport screenshot', async () => {
      const result = await screenshotTool.handler({
        sessionId: session.id
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.screenshot.format).toBe('png');
      expect(response.screenshot.width).toBe(1280);
      expect(response.screenshot.height).toBe(720);
      expect(response.screenshot.fullPage).toBe(false);
      expect(response.screenshot.data).toBeTruthy();
      expect(response.screenshot.size).toBeGreaterThan(0);
      
      // Verify base64 data is valid
      const buffer = Buffer.from(response.screenshot.data, 'base64');
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])); // PNG signature
    });

    it('should capture full page screenshot', async () => {
      const result = await screenshotTool.handler({
        sessionId: session.id,
        fullPage: true
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.screenshot.fullPage).toBe(true);
      expect(response.screenshot.height).toBeGreaterThanOrEqual(720); // Should be at least viewport height
    });

    it('should capture element screenshot', async () => {
      const result = await screenshotTool.handler({
        sessionId: session.id,
        selector: '#main-header'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.screenshot.selector).toBe('#main-header');
      expect(response.screenshot.width).toBeGreaterThan(0);
      expect(response.screenshot.height).toBeGreaterThan(0);
      expect(response.screenshot.width).toBeLessThan(1280); // Should be smaller than full viewport
    });

    it('should capture JPEG screenshot with quality', async () => {
      const result = await screenshotTool.handler({
        sessionId: session.id,
        format: 'jpeg',
        quality: 50
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.screenshot.format).toBe('jpeg');
      
      // Verify JPEG data
      const buffer = Buffer.from(response.screenshot.data, 'base64');
      expect(buffer.subarray(0, 2)).toEqual(Buffer.from([0xFF, 0xD8])); // JPEG signature
    });

    it('should capture screenshot with clip rectangle', async () => {
      const clip = { x: 100, y: 100, width: 300, height: 200 };
      const result = await screenshotTool.handler({
        sessionId: session.id,
        clip: clip
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.screenshot.clip).toEqual(clip);
      
      // The screenshot dimensions should match the clip (approximately)
      const buffer = Buffer.from(response.screenshot.data, 'base64');
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle element not found', async () => {
      const result = await screenshotTool.handler({
        sessionId: session.id,
        selector: '#non-existent-element',
        timeout: 2000 // Short timeout for faster test
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error.isElementNotFound || response.error.isTimeout).toBe(true);
    }, 10000); // 10 second timeout for this test

    it('should handle screenshot with omitBackground', async () => {
      const result = await screenshotTool.handler({
        sessionId: session.id,
        omitBackground: true
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.screenshot.omitBackground).toBe(true);
    });
  });

  describe('DOMSnapshotTool Integration', () => {
    let domSnapshotTool: ReturnType<typeof createDOMSnapshotTool>;

    beforeEach(() => {
      domSnapshotTool = createDOMSnapshotTool(sessionManager);
    });

    it('should capture full DOM snapshot', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.domSnapshot).toBeTruthy();
      expect(response.domSnapshot.nodeType).toBe(1); // Element node
      expect(response.domSnapshot.nodeName).toBe('HTML');
      expect(response.domSnapshot.tagName).toBe('HTML');
      expect(response.domSnapshot.children).toBeInstanceOf(Array);
      expect(response.domSnapshot.children.length).toBeGreaterThan(0);
      
      expect(response.metadata.totalNodes).toBeGreaterThan(10);
      expect(response.metadata.maxNodes).toBe(5000);
      expect(response.metadata.truncated).toBe(false);
      expect(response.metadata.url).toContain('about:blank');
      expect(response.metadata.title).toBe('Test Page for Screenshots and DOM');
      expect(response.metadata.selector).toBe(null);
    });

    it('should capture DOM snapshot with element selector', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        selector: '#main-header'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.domSnapshot.nodeType).toBe(1);
      expect(response.domSnapshot.nodeName).toBe('DIV');
      expect(response.domSnapshot.id).toBe('main-header');
      expect(response.domSnapshot.className).toContain('header');
      expect(response.metadata.selector).toBe('#main-header');
    });

    it('should capture DOM snapshot with node limit', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        maxNodes: 10
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.metadata.totalNodes).toBeLessThanOrEqual(10);
      expect(response.metadata.maxNodes).toBe(10);
      // May or may not be truncated depending on actual DOM size
    });

    it('should capture DOM snapshot with styles', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        selector: '#main-header',
        includeStyles: true
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.domSnapshot.styles).toBeTruthy();
      expect(response.domSnapshot.styles.backgroundColor).toBeTruthy();
      expect(response.domSnapshot.styles.color).toBeTruthy();
      expect(response.metadata.includeStyles).toBe(true);
    });

    it('should capture DOM snapshot without attributes', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        selector: '#test-box-1',
        includeAttributes: false
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.domSnapshot.attributes).toBeUndefined();
      expect(response.metadata.includeAttributes).toBe(false);
    });

    it('should handle different node types', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        selector: 'body'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      // Find text nodes and comment nodes in the snapshot
      function findNodeTypes(node: any, types: Set<number>) {
        if (node.nodeType) {
          types.add(node.nodeType);
        }
        if (node.children) {
          for (const child of node.children) {
            findNodeTypes(child, types);
          }
        }
      }
      
      const nodeTypes = new Set<number>();
      findNodeTypes(response.domSnapshot, nodeTypes);
      
      expect(nodeTypes.has(1)).toBe(true); // Element nodes
      expect(nodeTypes.has(3)).toBe(true); // Text nodes
      expect(nodeTypes.has(8)).toBe(true); // Comment nodes
    });

    it('should handle element not found for selector', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        selector: '#non-existent-element'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error.isElementNotFound).toBe(true);
      expect(response.error.message).toContain('not found');
    });

    it('should handle very small node limits', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        maxNodes: 1
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      expect(response.metadata.totalNodes).toBe(1);
      expect(response.metadata.truncated).toBe(true);
    });

    it('should preserve form element values', async () => {
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        selector: '#test-form'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.success).toBe(true);
      
      // Find the input element in the snapshot
      function findElementById(node: any, id: string): any {
        if (node.id === id) return node;
        if (node.children) {
          for (const child of node.children) {
            const found = findElementById(child, id);
            if (found) return found;
          }
        }
        return null;
      }
      
      const inputElement = findElementById(response.domSnapshot, 'test-input');
      expect(inputElement).toBeTruthy();
      expect(inputElement.attributes.value).toBe('test value');
      
      const selectElement = findElementById(response.domSnapshot, 'test-select');
      expect(selectElement).toBeTruthy();
      expect(selectElement.children).toBeInstanceOf(Array);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid session for screenshot', async () => {
      const screenshotTool = createScreenshotTool(sessionManager);
      
      const result = await screenshotTool.handler({
        sessionId: 'invalid-session-id'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle invalid session for DOM snapshot', async () => {
      const domSnapshotTool = createDOMSnapshotTool(sessionManager);
      
      const result = await domSnapshotTool.handler({
        sessionId: 'invalid-session-id'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error.message).toContain('not found or has expired');
    });

    it('should handle page navigation during screenshot', async () => {
      const screenshotTool = createScreenshotTool(sessionManager);
      
      // Start navigation and immediately try to screenshot
      const navigationPromise = session.page.goto('about:blank');
      const screenshotPromise = screenshotTool.handler({
        sessionId: session.id,
        timeout: 1000
      });
      
      await navigationPromise;
      const result = await screenshotPromise;
      
      // Should either succeed or fail gracefully
      if (result.isError) {
        const response = JSON.parse(result.content[0].text);
        expect(response.error.category).toBe('browser');
      } else {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      }
    });
  });

  describe('Performance and Limits', () => {
    it('should handle large DOM snapshots efficiently', async () => {
      // Create a page with many elements
      await session.page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            ${Array.from({ length: 1000 }, (_, i) => `<div id="element-${i}">Element ${i}</div>`).join('')}
          </body>
        </html>
      `);

      const domSnapshotTool = createDOMSnapshotTool(sessionManager);
      const startTime = Date.now();
      
      const result = await domSnapshotTool.handler({
        sessionId: session.id,
        maxNodes: 500
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      expect(result.isError).toBe(false);
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.totalNodes).toBeLessThanOrEqual(500);
    });

    it('should handle screenshot timeouts gracefully', async () => {
      const screenshotTool = createScreenshotTool(sessionManager);
      
      const result = await screenshotTool.handler({
        sessionId: session.id,
        timeout: 1 // Very short timeout
      });

      // Should either succeed quickly or timeout gracefully
      if (result.isError) {
        const response = JSON.parse(result.content[0].text);
        expect(response.error.isTimeout).toBe(true);
      } else {
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      }
    });
  });
});