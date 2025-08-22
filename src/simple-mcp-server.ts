#!/usr/bin/env node

/**
 * AI Browser MCP - Simple Server Implementation
 * 
 * A simplified, working version of the MCP server for immediate use.
 * This version focuses on core functionality without complex integrations.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

interface BrowserSession {
    browser: Browser;
    contexts: Map<string, BrowserContext>;
    pages: Map<string, Page>;
}

class SimpleMCPBrowserServer {
    private server: Server;
    private sessions: Map<string, BrowserSession> = new Map();
    private defaultSessionId = 'default';

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

    private setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'browser_newContext',
                        description: 'Create a new browser context',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sessionId: {
                                    type: 'string',
                                    description: 'Session ID for the browser context',
                                    default: this.defaultSessionId
                                }
                            }
                        }
                    },
                    {
                        name: 'browser_goto',
                        description: 'Navigate to a URL',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sessionId: {
                                    type: 'string',
                                    description: 'Session ID',
                                    default: this.defaultSessionId
                                },
                                url: {
                                    type: 'string',
                                    description: 'URL to navigate to'
                                }
                            },
                            required: ['url']
                        }
                    },
                    {
                        name: 'browser_screenshot',
                        description: 'Take a screenshot',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sessionId: {
                                    type: 'string',
                                    description: 'Session ID',
                                    default: this.defaultSessionId
                                },
                                format: {
                                    type: 'string',
                                    enum: ['png', 'jpeg'],
                                    default: 'png'
                                }
                            }
                        }
                    },
                    {
                        name: 'browser_click',
                        description: 'Click an element',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sessionId: {
                                    type: 'string',
                                    description: 'Session ID',
                                    default: this.defaultSessionId
                                },
                                selector: {
                                    type: 'string',
                                    description: 'CSS selector for the element to click'
                                }
                            },
                            required: ['selector']
                        }
                    },
                    {
                        name: 'browser_type',
                        description: 'Type text into an element',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sessionId: {
                                    type: 'string',
                                    description: 'Session ID',
                                    default: this.defaultSessionId
                                },
                                selector: {
                                    type: 'string',
                                    description: 'CSS selector for the element'
                                },
                                text: {
                                    type: 'string',
                                    description: 'Text to type'
                                }
                            },
                            required: ['selector', 'text']
                        }
                    },
                    {
                        name: 'browser_eval',
                        description: 'Execute JavaScript in the browser',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                sessionId: {
                                    type: 'string',
                                    description: 'Session ID',
                                    default: this.defaultSessionId
                                },
                                code: {
                                    type: 'string',
                                    description: 'JavaScript code to execute'
                                }
                            },
                            required: ['code']
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case 'browser_newContext':
                        return await this.handleNewContext(args as any);
                    case 'browser_goto':
                        return await this.handleGoto(args as any);
                    case 'browser_screenshot':
                        return await this.handleScreenshot(args as any);
                    case 'browser_click':
                        return await this.handleClick(args as any);
                    case 'browser_type':
                        return await this.handleType(args as any);
                    case 'browser_eval':
                        return await this.handleEval(args as any);
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
                    ]
                };
            }
        });
    }

    private async ensureSession(sessionId: string = this.defaultSessionId): Promise<BrowserSession> {
        if (!this.sessions.has(sessionId)) {
            const browser = await chromium.launch({
                headless: process.env.BROWSER_HEADLESS !== 'false'
            });

            this.sessions.set(sessionId, {
                browser,
                contexts: new Map(),
                pages: new Map()
            });
        }

        return this.sessions.get(sessionId)!;
    }

    private async ensurePage(sessionId: string = this.defaultSessionId): Promise<Page> {
        const session = await this.ensureSession(sessionId);

        if (!session.pages.has('default')) {
            let context = session.contexts.get('default');
            if (!context) {
                context = await session.browser.newContext();
                session.contexts.set('default', context);
            }

            const page = await context.newPage();
            session.pages.set('default', page);
        }

        return session.pages.get('default')!;
    }

    private async handleNewContext(args: { sessionId?: string }) {
        const sessionId = args.sessionId || this.defaultSessionId;
        await this.ensureSession(sessionId);

        return {
            content: [
                {
                    type: 'text',
                    text: `Browser context created for session: ${sessionId}`
                }
            ]
        };
    }

    private async handleGoto(args: { sessionId?: string; url: string }) {
        const sessionId = args.sessionId || this.defaultSessionId;
        const page = await this.ensurePage(sessionId);

        await page.goto(args.url);

        return {
            content: [
                {
                    type: 'text',
                    text: `Navigated to: ${args.url}`
                }
            ]
        };
    }

    private async handleScreenshot(args: { sessionId?: string; format?: 'png' | 'jpeg' }) {
        const sessionId = args.sessionId || this.defaultSessionId;
        const page = await this.ensurePage(sessionId);

        const screenshot = await page.screenshot({
            type: args.format || 'png'
        });

        const base64Screenshot = screenshot.toString('base64');

        return {
            content: [
                {
                    type: 'image',
                    data: base64Screenshot,
                    mimeType: `image/${args.format || 'png'}`
                }
            ]
        };
    }

    private async handleClick(args: { sessionId?: string; selector: string }) {
        const sessionId = args.sessionId || this.defaultSessionId;
        const page = await this.ensurePage(sessionId);

        await page.click(args.selector);

        return {
            content: [
                {
                    type: 'text',
                    text: `Clicked element: ${args.selector}`
                }
            ]
        };
    }

    private async handleType(args: { sessionId?: string; selector: string; text: string }) {
        const sessionId = args.sessionId || this.defaultSessionId;
        const page = await this.ensurePage(sessionId);

        await page.fill(args.selector, args.text);

        return {
            content: [
                {
                    type: 'text',
                    text: `Typed "${args.text}" into element: ${args.selector}`
                }
            ]
        };
    }

    private async handleEval(args: { sessionId?: string; code: string }) {
        const sessionId = args.sessionId || this.defaultSessionId;
        const page = await this.ensurePage(sessionId);

        const result = await page.evaluate(args.code);

        return {
            content: [
                {
                    type: 'text',
                    text: `JavaScript result: ${JSON.stringify(result, null, 2)}`
                }
            ]
        };
    }

    private setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };

        process.on('SIGINT', async () => {
            await this.cleanup();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await this.cleanup();
            process.exit(0);
        });
    }

    private async cleanup() {
        console.log('Cleaning up browser sessions...');

        for (const [sessionId, session] of this.sessions) {
            try {
                await session.browser.close();
                console.log(`Closed browser session: ${sessionId}`);
            } catch (error) {
                console.error(`Error closing session ${sessionId}:`, error);
            }
        }

        this.sessions.clear();
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('AI Browser MCP Server running on stdio');
    }
}

// Run the server
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new SimpleMCPBrowserServer();
    server.run().catch(console.error);
}

export { SimpleMCPBrowserServer };