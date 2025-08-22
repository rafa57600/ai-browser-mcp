import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface ConsoleLog {
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    location?: {
        url: string;
        lineNumber: number;
        columnNumber: number;
    };
}

export interface ScreenshotResult {
    data: string; // Base64 encoded image
    format: 'png' | 'jpeg';
    width: number;
    height: number;
    timestamp: Date;
}

export interface JSONRPCRequest {
    jsonrpc: string;
    id: string | number;
    method: string;
    params?: any;
}

export interface JSONRPCResponse {
    jsonrpc: string;
    id: string | number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export class MCPClient extends EventEmitter {
    private ws: WebSocket | undefined;
    private port: number;
    private requestId = 0;
    private pendingRequests = new Map<string | number, {
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }>();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;

    constructor(port: number) {
        super();
        this.port = port;
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(`ws://localhost:${this.port}/mcp`);

                this.ws.on('open', () => {
                    console.log('Connected to MCP server');
                    this.reconnectAttempts = 0;
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString()) as JSONRPCResponse;
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Failed to parse message:', error);
                    }
                });

                this.ws.on('close', () => {
                    console.log('Disconnected from MCP server');
                    this.handleDisconnection();
                });

                this.ws.on('error', (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async disconnect(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        this.pendingRequests.clear();
    }

    private handleMessage(message: JSONRPCResponse): void {
        // Handle notifications (console logs, etc.)
        if (!message.id) {
            if (message.method === 'console.log') {
                this.emit('consoleLog', message.params as ConsoleLog);
            }
            return;
        }

        // Handle responses to requests
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
            this.pendingRequests.delete(message.id);
            
            if (message.error) {
                pending.reject(new Error(message.error.message));
            } else {
                pending.resolve(message.result);
            }
        }
    }

    private handleDisconnection(): void {
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
            pending.reject(new Error('Connection lost'));
        }
        this.pendingRequests.clear();

        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                this.connect().catch(console.error);
            }, this.reconnectDelay * this.reconnectAttempts);
        }
    }

    private async sendRequest(method: string, params?: any): Promise<any> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to MCP server');
        }

        const id = ++this.requestId;
        const request: JSONRPCRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            
            this.ws!.send(JSON.stringify(request), (error) => {
                if (error) {
                    this.pendingRequests.delete(id);
                    reject(error);
                }
            });

            // Set timeout for request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }

    async takeScreenshot(options?: {
        fullPage?: boolean;
        selector?: string;
    }): Promise<ScreenshotResult> {
        return this.sendRequest('browser.screenshot', options);
    }

    async getConsoleLogs(limit?: number): Promise<ConsoleLog[]> {
        return this.sendRequest('browser.console.getRecent', { limit });
    }

    async getNetworkLogs(limit?: number): Promise<any[]> {
        return this.sendRequest('browser.network.getRecent', { limit });
    }

    async navigateTo(url: string): Promise<void> {
        return this.sendRequest('browser.goto', { url });
    }

    async clickElement(selector: string): Promise<void> {
        return this.sendRequest('browser.click', { selector });
    }

    async typeText(selector: string, text: string): Promise<void> {
        return this.sendRequest('browser.type', { selector, text });
    }

    async evaluateScript(script: string): Promise<any> {
        return this.sendRequest('browser.eval', { script });
    }

    onConsoleLog(callback: (log: ConsoleLog) => void): void {
        this.on('consoleLog', callback);
    }
}