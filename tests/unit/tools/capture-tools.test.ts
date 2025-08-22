import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createScreenshotTool, createDOMSnapshotTool, TempFileManager } from '../../../src/tools/capture-tools.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';

// Mock the SessionManager and BrowserSession
vi.mock('../../../src/browser/session-manager.js');
vi.mock('../../../src/browser/browser-session.js');

describe('CaptureTools', () => {
  let sessionManager: SessionManager;
  let mockSession: BrowserSession;

  beforeEach(() => {
    // Create mock session manager
    sessionManager = new SessionManager();
    
    // Create mock session with page methods
    mockSession = {
      id: 'test-session-123',
      page: {
        screenshot: vi.fn(),
        waitForSelector: vi.fn(),
        evaluate: vi.fn(),
        viewportSize: vi.fn().mockReturnValue({ width: 1280, height: 720 })
      },
      updateActivity: vi.fn(),
      allowedDomains: new Set(['example.com']),
      isDomainAllowed: vi.fn().mockReturnValue(true),
      addAllowedDomain: vi.fn()
    } as any;

    // Mock session manager methods
    vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ScreenshotTool', () => {
    let screenshotTool: ReturnType<typeof createScreenshotTool>;

    beforeEach(() => {
      screenshotTool = createScreenshotTool(sessionManager);
    });

    describe('Tool Configuration', () => {
      it('should have correct tool name', () => {
        expect(screenshotTool.name).toBe('browser.screenshot');
      });

      it('should have proper description', () => {
        expect(screenshotTool.description).toContain('Capture a screenshot');
        expect(screenshotTool.description).toContain('various options');
      });

      it('should have correct input schema', () => {
        expect(screenshotTool.inputSchema).toEqual({
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the browser session to use for screenshot'
            },
            fullPage: {
              type: 'boolean',
              default: false,
              description: 'Whether to capture the full scrollable page'
            },
            selector: {
              type: 'string',
              description: 'CSS selector for a specific element to screenshot'
            },
            format: {
              type: 'string',
              enum: ['png', 'jpeg'],
              default: 'png',
              description: 'Image format for the screenshot'
            },
            quality: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Image quality (0-100, only for JPEG format)'
            },
            clip: {
              type: 'object',
              properties: {
                x: { type: 'number', minimum: 0 },
                y: { type: 'number', minimum: 0 },
                width: { type: 'number', minimum: 1 },
                height: { type: 'number', minimum: 1 }
              },
              additionalProperties: false,
              description: 'Clip rectangle for the screenshot'
            },
            omitBackground: {
              type: 'boolean',
              default: false,
              description: 'Whether to omit the default white background'
            },
            timeout: {
              type: 'number',
              minimum: 1000,
              maximum: 300000,
              description: 'Timeout in milliseconds for screenshot operation'
            }
          },
          required: ['sessionId'],
          additionalProperties: false
        });
      });
    });

    describe('Parameter Validation', () => {
      it('should reject missing sessionId', async () => {
        const result = await screenshotTool.handler({});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('sessionId is required');
      });

      it('should reject invalid sessionId type', async () => {
        const result = await screenshotTool.handler({
          sessionId: 123
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('sessionId is required and must be a string');
      });

      it('should reject non-existent session', async () => {
        vi.mocked(sessionManager.getSession).mockReturnValue(null);

        const result = await screenshotTool.handler({
          sessionId: 'non-existent-session'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Session \'non-existent-session\' not found');
      });
    });

    describe('Full Page Screenshots', () => {
      it('should capture full page screenshot with default options', async () => {
        const mockBuffer = Buffer.from('fake-image-data');
        vi.mocked(mockSession.page.screenshot).mockResolvedValue(mockBuffer);

        const result = await screenshotTool.handler({
          sessionId: 'test-session-123',
          fullPage: true
        });

        expect(result.isError).toBe(false);
        expect(mockSession.page.screenshot).toHaveBeenCalledWith({
          type: 'png',
          fullPage: true,
          omitBackground: false
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.screenshot.format).toBe('png');
        expect(response.screenshot.fullPage).toBe(true);
        expect(response.screenshot.data).toBe(mockBuffer.toString('base64'));
        expect(mockSession.updateActivity).toHaveBeenCalled();
      });

      it('should capture JPEG screenshot with quality', async () => {
        const mockBuffer = Buffer.from('fake-jpeg-data');
        vi.mocked(mockSession.page.screenshot).mockResolvedValue(mockBuffer);

        const result = await screenshotTool.handler({
          sessionId: 'test-session-123',
          format: 'jpeg',
          quality: 80,
          omitBackground: true
        });

        expect(result.isError).toBe(false);
        expect(mockSession.page.screenshot).toHaveBeenCalledWith({
          type: 'jpeg',
          fullPage: false,
          omitBackground: true,
          quality: 80
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.screenshot.format).toBe('jpeg');
        expect(response.screenshot.omitBackground).toBe(true);
      });

      it('should capture screenshot with clip rectangle', async () => {
        const mockBuffer = Buffer.from('fake-clipped-data');
        vi.mocked(mockSession.page.screenshot).mockResolvedValue(mockBuffer);

        const clip = { x: 10, y: 20, width: 300, height: 200 };
        const result = await screenshotTool.handler({
          sessionId: 'test-session-123',
          clip: clip
        });

        expect(result.isError).toBe(false);
        expect(mockSession.page.screenshot).toHaveBeenCalledWith({
          type: 'png',
          fullPage: false,
          omitBackground: false,
          clip: clip
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.screenshot.clip).toEqual(clip);
      });
    });

    describe('Element Screenshots', () => {
      it('should capture element screenshot', async () => {
        const mockElement = {
          screenshot: vi.fn().mockResolvedValue(Buffer.from('element-screenshot')),
          boundingBox: vi.fn().mockResolvedValue({ width: 200, height: 100 })
        };
        vi.mocked(mockSession.page.waitForSelector).mockResolvedValue(mockElement as any);

        const result = await screenshotTool.handler({
          sessionId: 'test-session-123',
          selector: '.test-element'
        });

        expect(result.isError).toBe(false);
        expect(mockSession.page.waitForSelector).toHaveBeenCalledWith('.test-element', {
          timeout: 30000,
          state: 'visible'
        });
        expect(mockElement.screenshot).toHaveBeenCalledWith({
          type: 'png',
          fullPage: false,
          omitBackground: false
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.screenshot.selector).toBe('.test-element');
        expect(response.screenshot.width).toBe(200);
        expect(response.screenshot.height).toBe(100);
      });

      it('should handle element not found', async () => {
        vi.mocked(mockSession.page.waitForSelector).mockResolvedValue(null);

        const result = await screenshotTool.handler({
          sessionId: 'test-session-123',
          selector: '.non-existent'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Element with selector \'.non-existent\' not found');
      });

      it('should handle element screenshot timeout', async () => {
        const timeoutError = new Error('Timeout 5000ms exceeded');
        vi.mocked(mockSession.page.waitForSelector).mockRejectedValue(timeoutError);

        const result = await screenshotTool.handler({
          sessionId: 'test-session-123',
          selector: '.slow-element',
          timeout: 5000
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.isTimeout).toBe(true);
      });
    });

    describe('Response Format', () => {
      it('should return success response with correct format', async () => {
        const mockBuffer = Buffer.from('test-image-data');
        vi.mocked(mockSession.page.screenshot).mockResolvedValue(mockBuffer);

        const result = await screenshotTool.handler({
          sessionId: 'test-session-123'
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('screenshot');
        expect(response.screenshot).toHaveProperty('data');
        expect(response.screenshot).toHaveProperty('format', 'png');
        expect(response.screenshot).toHaveProperty('width');
        expect(response.screenshot).toHaveProperty('height');
        expect(response.screenshot).toHaveProperty('size', mockBuffer.length);
        expect(response).toHaveProperty('screenshotTime');
        expect(response).toHaveProperty('timestamp');
        expect(response).toHaveProperty('message', 'Screenshot captured successfully');
      });
    });
  });

  describe('DOMSnapshotTool', () => {
    let domSnapshotTool: ReturnType<typeof createDOMSnapshotTool>;

    beforeEach(() => {
      domSnapshotTool = createDOMSnapshotTool(sessionManager);
    });

    describe('Tool Configuration', () => {
      it('should have correct tool name', () => {
        expect(domSnapshotTool.name).toBe('browser.domSnapshot');
      });

      it('should have proper description', () => {
        expect(domSnapshotTool.description).toContain('Capture a JSON representation');
        expect(domSnapshotTool.description).toContain('DOM structure');
      });

      it('should have correct input schema', () => {
        expect(domSnapshotTool.inputSchema).toEqual({
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'ID of the browser session to use for DOM snapshot'
            },
            maxNodes: {
              type: 'number',
              minimum: 1,
              maximum: 50000,
              default: 5000,
              description: 'Maximum number of DOM nodes to include in the snapshot'
            },
            selector: {
              type: 'string',
              description: 'CSS selector to limit snapshot to a specific element and its children'
            },
            includeStyles: {
              type: 'boolean',
              default: false,
              description: 'Whether to include computed styles for elements'
            },
            includeAttributes: {
              type: 'boolean',
              default: true,
              description: 'Whether to include element attributes'
            },
            timeout: {
              type: 'number',
              minimum: 1000,
              maximum: 300000,
              description: 'Timeout in milliseconds for DOM snapshot operation'
            }
          },
          required: ['sessionId'],
          additionalProperties: false
        });
      });
    });

    describe('Parameter Validation', () => {
      it('should reject missing sessionId', async () => {
        const result = await domSnapshotTool.handler({});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('sessionId is required');
      });

      it('should reject invalid sessionId type', async () => {
        const result = await domSnapshotTool.handler({
          sessionId: 123
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('sessionId is required and must be a string');
      });

      it('should reject non-existent session', async () => {
        vi.mocked(sessionManager.getSession).mockReturnValue(null);

        const result = await domSnapshotTool.handler({
          sessionId: 'non-existent-session'
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Session \'non-existent-session\' not found');
      });
    });

    describe('DOM Snapshot Capture', () => {
      it('should capture full DOM snapshot with default options', async () => {
        const mockSnapshot = {
          snapshot: {
            nodeType: 1,
            nodeName: 'HTML',
            tagName: 'HTML',
            children: [
              {
                nodeType: 1,
                nodeName: 'BODY',
                tagName: 'BODY',
                children: []
              }
            ]
          },
          metadata: {
            totalNodes: 2,
            maxNodes: 5000,
            truncated: false,
            url: 'https://example.com',
            title: 'Test Page',
            selector: null,
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        };

        vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockSnapshot);

        const result = await domSnapshotTool.handler({
          sessionId: 'test-session-123'
        });

        expect(result.isError).toBe(false);
        expect(mockSession.page.evaluate).toHaveBeenCalledWith(
          expect.any(Function),
          {
            maxNodes: 5000,
            selector: undefined,
            includeStyles: false,
            includeAttributes: true
          }
        );

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.domSnapshot).toEqual(mockSnapshot.snapshot);
        expect(response.metadata.totalNodes).toBe(2);
        expect(response.metadata.truncated).toBe(false);
        expect(mockSession.updateActivity).toHaveBeenCalled();
      });

      it('should capture DOM snapshot with custom options', async () => {
        const mockSnapshot = {
          snapshot: {
            nodeType: 1,
            nodeName: 'DIV',
            tagName: 'DIV',
            id: 'test-element',
            children: []
          },
          metadata: {
            totalNodes: 1,
            maxNodes: 100,
            truncated: false,
            url: 'https://example.com',
            title: 'Test Page',
            selector: '#test-element',
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        };

        vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockSnapshot);

        const result = await domSnapshotTool.handler({
          sessionId: 'test-session-123',
          maxNodes: 100,
          selector: '#test-element',
          includeStyles: true,
          includeAttributes: false
        });

        expect(result.isError).toBe(false);
        expect(mockSession.page.evaluate).toHaveBeenCalledWith(
          expect.any(Function),
          {
            maxNodes: 100,
            selector: '#test-element',
            includeStyles: true,
            includeAttributes: false
          }
        );

        const response = JSON.parse(result.content[0].text);
        expect(response.metadata.maxNodes).toBe(100);
        expect(response.metadata.selector).toBe('#test-element');
        expect(response.metadata.includeStyles).toBe(true);
        expect(response.metadata.includeAttributes).toBe(false);
      });

      it('should handle truncated snapshots', async () => {
        const mockSnapshot = {
          snapshot: {
            nodeType: 1,
            nodeName: 'HTML',
            children: [
              { __truncated: true, reason: 'Node limit exceeded' }
            ]
          },
          metadata: {
            totalNodes: 1000,
            maxNodes: 1000,
            truncated: true,
            url: 'https://example.com',
            title: 'Large Page',
            selector: null,
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        };

        vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockSnapshot);

        const result = await domSnapshotTool.handler({
          sessionId: 'test-session-123',
          maxNodes: 1000
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.metadata.truncated).toBe(true);
        expect(response.metadata.totalNodes).toBe(1000);
      });

      it('should handle element not found for selector', async () => {
        const selectorError = new Error('Element with selector \'#non-existent\' not found');
        vi.mocked(mockSession.page.evaluate).mockRejectedValue(selectorError);

        const result = await domSnapshotTool.handler({
          sessionId: 'test-session-123',
          selector: '#non-existent'
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.isElementNotFound).toBe(true);
        expect(response.error.message).toContain('not found');
      });

      it('should handle DOM evaluation timeout', async () => {
        const timeoutError = new Error('Evaluation timeout exceeded');
        vi.mocked(mockSession.page.evaluate).mockRejectedValue(timeoutError);

        const result = await domSnapshotTool.handler({
          sessionId: 'test-session-123',
          timeout: 5000
        });

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.error.isTimeout).toBe(true);
      });
    });

    describe('Response Format', () => {
      it('should return success response with correct format', async () => {
        const mockSnapshot = {
          snapshot: { nodeType: 1, nodeName: 'HTML' },
          metadata: {
            totalNodes: 1,
            maxNodes: 5000,
            truncated: false,
            url: 'https://example.com',
            title: 'Test',
            selector: null,
            timestamp: '2023-01-01T00:00:00.000Z'
          }
        };

        vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockSnapshot);

        const result = await domSnapshotTool.handler({
          sessionId: 'test-session-123'
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('domSnapshot');
        expect(response).toHaveProperty('metadata');
        expect(response.metadata).toHaveProperty('snapshotTime');
        expect(response.metadata).toHaveProperty('includeStyles', false);
        expect(response.metadata).toHaveProperty('includeAttributes', true);
        expect(response).toHaveProperty('message', 'DOM snapshot captured successfully');
        
        expect(typeof response.metadata.snapshotTime).toBe('number');
        expect(response.metadata.snapshotTime).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('TempFileManager', () => {
    afterEach(async () => {
      await TempFileManager.cleanup();
    });

    it('should create temporary directory', async () => {
      const tempDir = await TempFileManager.getTempDir();
      expect(tempDir).toContain('mcp-browser-');
      expect(typeof tempDir).toBe('string');
    });

    it('should create temporary files with unique names', async () => {
      const file1 = await TempFileManager.createTempFile('screenshot', 'png');
      const file2 = await TempFileManager.createTempFile('screenshot', 'png');
      
      expect(file1).not.toBe(file2);
      expect(file1).toContain('screenshot-');
      expect(file1.endsWith('.png')).toBe(true);
      expect(file2).toContain('screenshot-');
      expect(file2.endsWith('.png')).toBe(true);
    });

    it('should cleanup temporary files', async () => {
      const file1 = await TempFileManager.createTempFile('test', 'txt');
      const file2 = await TempFileManager.createTempFile('test', 'txt');
      
      // Cleanup should not throw
      await expect(TempFileManager.cleanup()).resolves.toBeUndefined();
    });
  });
});