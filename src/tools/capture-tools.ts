import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool, ScreenshotResult } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Temporary file manager for handling screenshot and other temporary files
 */
class TempFileManager {
  private static tempDir: string | null = null;
  private static createdFiles: Set<string> = new Set();

  static async getTempDir(): Promise<string> {
    if (!this.tempDir) {
      this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-browser-'));
    }
    return this.tempDir;
  }

  static async createTempFile(prefix: string, extension: string): Promise<string> {
    const tempDir = await this.getTempDir();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `${prefix}-${timestamp}-${random}.${extension}`;
    const filepath = path.join(tempDir, filename);
    this.createdFiles.add(filepath);
    return filepath;
  }

  static async cleanup(): Promise<void> {
    for (const filepath of this.createdFiles) {
      try {
        await fs.unlink(filepath);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.createdFiles.clear();

    if (this.tempDir) {
      try {
        await fs.rmdir(this.tempDir);
      } catch (error) {
        // Ignore errors during cleanup
      }
      this.tempDir = null;
    }
  }
}



/**
 * Creates the browser.screenshot tool for capturing page screenshots
 */
export function createScreenshotTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.screenshot',
    description: 'Capture a screenshot of the current page with various options',
    inputSchema: {
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
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const fullPage = args.fullPage as boolean || false;
        const selector = args.selector as string | undefined;
        const format = (args.format as 'png' | 'jpeg') || 'png';
        const quality = args.quality as number | undefined;
        const clip = args.clip as { x: number; y: number; width: number; height: number } | undefined;
        const omitBackground = args.omitBackground as boolean || false;
        const timeout = args.timeout as number | undefined;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const startTime = Date.now();

        try {
          let screenshotBuffer: Buffer;
          let screenshotWidth = 0;
          let screenshotHeight = 0;

          // Prepare screenshot options
          const screenshotOptions: any = {
            type: format,
            fullPage: fullPage,
            omitBackground: omitBackground
          };

          if (format === 'jpeg' && quality !== undefined) {
            screenshotOptions.quality = quality;
          }

          if (clip) {
            screenshotOptions.clip = clip;
          }

          if (timeout) {
            screenshotOptions.timeout = timeout;
          }

          if (selector) {
            // Screenshot specific element
            const element = await session.page.waitForSelector(selector, {
              timeout: timeout || 30000,
              state: 'visible'
            });

            if (!element) {
              throw new Error(`Element with selector '${selector}' not found`);
            }

            screenshotBuffer = await element.screenshot(screenshotOptions);
            
            // Get element dimensions
            const boundingBox = await element.boundingBox();
            if (boundingBox) {
              screenshotWidth = Math.round(boundingBox.width);
              screenshotHeight = Math.round(boundingBox.height);
            }
          } else {
            // Screenshot entire page or viewport
            screenshotBuffer = await session.page.screenshot(screenshotOptions);
            
            // Get viewport dimensions
            const viewport = session.page.viewportSize();
            if (viewport) {
              screenshotWidth = viewport.width;
              screenshotHeight = viewport.height;
            }
          }

          const endTime = Date.now();
          const screenshotTime = endTime - startTime;

          // Create screenshot result
          const result: ScreenshotResult = {
            data: screenshotBuffer,
            format: format,
            width: screenshotWidth,
            height: screenshotHeight,
            timestamp: new Date()
          };

          // Update session activity
          session.updateActivity();

          // Convert buffer to base64 for JSON response
          const base64Data = screenshotBuffer.toString('base64');

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  screenshot: {
                    data: base64Data,
                    format: format,
                    width: screenshotWidth,
                    height: screenshotHeight,
                    size: screenshotBuffer.length,
                    fullPage: fullPage,
                    selector: selector || null,
                    clip: clip || null,
                    omitBackground: omitBackground
                  },
                  screenshotTime: screenshotTime,
                  timestamp: result.timestamp.toISOString(),
                  message: 'Screenshot captured successfully'
                }, null, 2)
              }
            ],
            isError: false
          };
        } catch (error) {
          throw error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.toLowerCase().includes('timeout');
        const isElementNotFound = errorMessage.includes('not found') || 
                                 errorMessage.includes('waiting for selector');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'browser',
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isElementNotFound: isElementNotFound,
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
 * Creates the browser.domSnapshot tool for capturing DOM structure
 */
export function createDOMSnapshotTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.domSnapshot',
    description: 'Capture a JSON representation of the DOM structure with node limits',
    inputSchema: {
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
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const maxNodes = (args.maxNodes as number) || 5000;
        const selector = args.selector as string | undefined;
        const includeStyles = args.includeStyles as boolean || false;
        const includeAttributes = args.includeAttributes !== false; // Default to true
        // const timeout = args.timeout as number | undefined; // Not used in current implementation

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const startTime = Date.now();

        try {
          // Execute DOM serialization in the browser context
          const domSnapshot = await session.page.evaluate(
            (args: any) => {
              const { maxNodes, selector, includeStyles, includeAttributes } = args;
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

                // Add node-specific properties
                if (node.nodeType === 1) { // Element node
                  const element = node;
                  serialized.tagName = element.tagName;
                  
                  if (includeAttributes && element.attributes) {
                    serialized.attributes = {};
                    for (let i = 0; i < element.attributes.length; i++) {
                      const attr = element.attributes[i];
                      serialized.attributes[attr.name] = attr.value;
                    }
                  }

                  if (element.id) serialized.id = element.id;
                  if (element.className) serialized.className = element.className;

                  // Include computed styles if requested
                  if (includeStyles) {
                    try {
                      const computedStyle = (globalThis as any).getComputedStyle(element);
                      serialized.styles = {
                        display: computedStyle.display,
                        position: computedStyle.position,
                        width: computedStyle.width,
                        height: computedStyle.height,
                        color: computedStyle.color,
                        backgroundColor: computedStyle.backgroundColor,
                        fontSize: computedStyle.fontSize,
                        fontFamily: computedStyle.fontFamily
                      };
                    } catch (error) {
                      // Ignore style computation errors
                    }
                  }
                } else if (node.nodeType === 3) { // Text node
                  const textContent = node.textContent?.trim();
                  if (textContent) {
                    serialized.textContent = textContent;
                  }
                } else if (node.nodeType === 8) { // Comment node
                  serialized.data = node.data;
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

              // Start serialization from specified selector or document
              let rootNode: any;
              if (selector) {
                const element = (globalThis as any).document.querySelector(selector);
                if (!element) {
                  throw new Error(`Element with selector '${selector}' not found`);
                }
                rootNode = element;
              } else {
                rootNode = (globalThis as any).document.documentElement;
              }

              const snapshot = serializeNode(rootNode);
              
              return {
                snapshot: snapshot,
                metadata: {
                  totalNodes: currentCount.count,
                  maxNodes: maxNodes,
                  truncated: currentCount.count >= maxNodes,
                  url: (globalThis as any).location.href,
                  title: (globalThis as any).document.title,
                  selector: selector || null,
                  timestamp: new Date().toISOString()
                }
              };
            },
            { maxNodes, selector, includeStyles, includeAttributes }
          );

          const endTime = Date.now();
          const snapshotTime = endTime - startTime;

          // Update session activity
          session.updateActivity();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  domSnapshot: domSnapshot.snapshot,
                  metadata: {
                    ...domSnapshot.metadata,
                    snapshotTime: snapshotTime,
                    includeStyles: includeStyles,
                    includeAttributes: includeAttributes
                  },
                  message: 'DOM snapshot captured successfully'
                }, null, 2)
              }
            ],
            isError: false
          };
        } catch (error) {
          throw error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.toLowerCase().includes('timeout');
        const isElementNotFound = errorMessage.includes('not found') || 
                                 errorMessage.includes('waiting for selector');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'browser',
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isElementNotFound: isElementNotFound,
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

// Export the temporary file manager for cleanup
export { TempFileManager };