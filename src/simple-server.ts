#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

class SimpleBrowserMCP {
  private server: Server;
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'ai-browser-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'browser.newContext',
          description: 'Create a new browser context',
          inputSchema: {
            type: 'object',
            properties: {
              viewport: {
                type: 'object',
                properties: {
                  width: { type: 'number', default: 1280 },
                  height: { type: 'number', default: 720 }
                }
              }
            }
          }
        },
        {
          name: 'browser.goto',
          description: 'Navigate to a URL',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              url: { type: 'string' }
            },
            required: ['sessionId', 'url']
          }
        },
        {
          name: 'browser.screenshot',
          description: 'Take a screenshot',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              format: { type: 'string', enum: ['png', 'jpeg'], default: 'png' }
            },
            required: ['sessionId']
          }
        },
        {
          name: 'browser.click',
          description: 'Click an element',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              selector: { type: 'string' }
            },
            required: ['sessionId', 'selector']
          }
        },
        {
          name: 'browser.type',
          description: 'Type text into an element',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              selector: { type: 'string' },
              text: { type: 'string' }
            },
            required: ['sessionId', 'selector', 'text']
          }
        },
        {
          name: 'browser.eval',
          description: 'Execute JavaScript in the browser',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              code: { type: 'string' }
            },
            required: ['sessionId', 'code']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'browser.newContext':
            return await this.handleNewContext(args);
          case 'browser.goto':
            return await this.handleGoto(args);
          case 'browser.screenshot':
            return await this.handleScreenshot(args);
          case 'browser.click':
            return await this.handleClick(args);
          case 'browser.type':
            return await this.handleType(args);
          case 'browser.eval':
            return await this.handleEval(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: false, // Set to true for headless mode
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    return this.browser;
  }

  private async handleNewContext(args: any) {
    const browser = await this.ensureBrowser();
    const viewport = args.viewport || { width: 1280, height: 720 };
    
    const context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.contexts.set(sessionId, context);
    this.pages.set(sessionId, page);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId,
            viewport,
            success: true
          }, null, 2)
        }
      ]
    };
  }

  private async handleGoto(args: any) {
    const { sessionId, url } = args;
    const page = this.pages.get(sessionId);
    
    if (!page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await page.goto(url);
    const title = await page.title();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            url: page.url(),
            title,
            success: true
          }, null, 2)
        }
      ]
    };
  }

  private async handleScreenshot(args: any) {
    const { sessionId, format = 'png' } = args;
    const page = this.pages.get(sessionId);
    
    if (!page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const screenshot = await page.screenshot({ 
      type: format as 'png' | 'jpeg',
      fullPage: false
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            data: screenshot.toString('base64'),
            format,
            width: 1280,
            height: 720,
            timestamp: new Date().toISOString(),
            success: true
          }, null, 2)
        }
      ]
    };
  }

  private async handleClick(args: any) {
    const { sessionId, selector } = args;
    const page = this.pages.get(sessionId);
    
    if (!page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await page.click(selector);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            selector,
            success: true
          }, null, 2)
        }
      ]
    };
  }

  private async handleType(args: any) {
    const { sessionId, selector, text } = args;
    const page = this.pages.get(sessionId);
    
    if (!page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    await page.fill(selector, text);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            selector,
            text,
            success: true
          }, null, 2)
        }
      ]
    };
  }

  private async handleEval(args: any) {
    const { sessionId, code } = args;
    const page = this.pages.get(sessionId);
    
    if (!page) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    try {
      const result = await page.evaluate(code);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code,
              result,
              success: true
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              code,
              error: error instanceof Error ? error.message : String(error),
              success: false
            }, null, 2)
          }
        ]
      };
    }
  }

  private async cleanup(): Promise<void> {
    console.log('Cleaning up browser resources...');
    
    for (const context of this.contexts.values()) {
      await context.close().catch(console.error);
    }
    
    if (this.browser) {
      await this.browser.close().catch(console.error);
    }
    
    this.contexts.clear();
    this.pages.clear();
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Browser MCP server running on stdio');
  }
}

const server = new SimpleBrowserMCP();
server.run().catch(console.error);