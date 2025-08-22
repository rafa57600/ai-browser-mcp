import * as vscode from 'vscode';
import { ConsoleLog } from './mcp-client';

export class LogOutputChannel {
    private outputChannel: vscode.OutputChannel;
    private logBuffer: ConsoleLog[] = [];
    private maxBufferSize = 1000;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AI Browser MCP Logs');
    }

    public appendLog(log: ConsoleLog): void {
        // Add to buffer
        this.logBuffer.push(log);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }

        // Format and append to output channel
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        const level = log.level.toUpperCase().padEnd(5);
        const location = log.location ? ` [${log.location.url}:${log.location.lineNumber}]` : '';
        
        const formattedMessage = `[${timestamp}] ${level} ${log.message}${location}`;
        this.outputChannel.appendLine(formattedMessage);

        // Auto-show for errors
        if (log.level === 'error') {
            this.outputChannel.show(true);
        }
    }

    public updateLogs(logs: ConsoleLog[]): void {
        // Clear current content
        this.outputChannel.clear();
        
        // Update buffer
        this.logBuffer = logs.slice(-this.maxBufferSize);
        
        // Display all logs
        this.logBuffer.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleTimeString();
            const level = log.level.toUpperCase().padEnd(5);
            const location = log.location ? ` [${log.location.url}:${log.location.lineNumber}]` : '';
            
            const formattedMessage = `[${timestamp}] ${level} ${log.message}${location}`;
            this.outputChannel.appendLine(formattedMessage);
        });

        // Show the output channel
        this.outputChannel.show(true);
    }

    public clearLogs(): void {
        this.outputChannel.clear();
        this.logBuffer = [];
    }

    public showLogs(): void {
        this.outputChannel.show();
    }

    public getRecentLogs(limit: number = 100): ConsoleLog[] {
        return this.logBuffer.slice(-limit);
    }

    public filterLogs(level?: string, searchTerm?: string): ConsoleLog[] {
        let filtered = this.logBuffer;

        if (level) {
            filtered = filtered.filter(log => log.level === level);
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(log => 
                log.message.toLowerCase().includes(term) ||
                (log.location?.url.toLowerCase().includes(term))
            );
        }

        return filtered;
    }

    public exportLogs(): string {
        return this.logBuffer.map(log => {
            const timestamp = new Date(log.timestamp).toISOString();
            const location = log.location ? ` [${log.location.url}:${log.location.lineNumber}:${log.location.columnNumber}]` : '';
            return `${timestamp} [${log.level.toUpperCase()}] ${log.message}${location}`;
        }).join('\n');
    }

    public dispose(): void {
        this.outputChannel.dispose();
    }
}