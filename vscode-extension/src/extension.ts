import * as vscode from 'vscode';
import { MCPClient } from './mcp-client';
import { ScreenshotWebviewProvider } from './webview-provider';
import { LogOutputChannel } from './log-output-channel';

let mcpClient: MCPClient | undefined;
let screenshotProvider: ScreenshotWebviewProvider | undefined;
let logOutputChannel: LogOutputChannel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Browser MCP extension is now active');

    // Initialize components
    screenshotProvider = new ScreenshotWebviewProvider(context.extensionUri);
    logOutputChannel = new LogOutputChannel();

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'aiBrowserMcp.screenshot',
            screenshotProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('aiBrowserMcp.startServer', async () => {
            await startMCPServer();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiBrowserMcp.stopServer', async () => {
            await stopMCPServer();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiBrowserMcp.showScreenshot', async () => {
            if (mcpClient && screenshotProvider) {
                try {
                    const screenshot = await mcpClient.takeScreenshot();
                    screenshotProvider.updateScreenshot(screenshot);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to take screenshot: ${error}`);
                }
            } else {
                vscode.window.showWarningMessage('MCP server is not running');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('aiBrowserMcp.showLogs', async () => {
            if (mcpClient && logOutputChannel) {
                try {
                    const logs = await mcpClient.getConsoleLogs();
                    logOutputChannel.updateLogs(logs);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to get logs: ${error}`);
                }
            } else {
                vscode.window.showWarningMessage('MCP server is not running');
            }
        })
    );

    // Auto-start if configured
    const config = vscode.workspace.getConfiguration('aiBrowserMcp');
    if (config.get('autoStart')) {
        startMCPServer();
    }
}

async function startMCPServer(): Promise<void> {
    if (mcpClient) {
        vscode.window.showInformationMessage('MCP server is already running');
        return;
    }

    try {
        const config = vscode.workspace.getConfiguration('aiBrowserMcp');
        const port = config.get<number>('serverPort', 3000);

        mcpClient = new MCPClient(port);
        await mcpClient.connect();

        // Set up log streaming
        if (logOutputChannel) {
            mcpClient.onConsoleLog((log) => {
                logOutputChannel.appendLog(log);
            });
        }

        // Update context
        vscode.commands.executeCommand('setContext', 'aiBrowserMcp.serverRunning', true);
        
        vscode.window.showInformationMessage('AI Browser MCP server started successfully');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start MCP server: ${error}`);
    }
}

async function stopMCPServer(): Promise<void> {
    if (!mcpClient) {
        vscode.window.showInformationMessage('MCP server is not running');
        return;
    }

    try {
        await mcpClient.disconnect();
        mcpClient = undefined;

        // Update context
        vscode.commands.executeCommand('setContext', 'aiBrowserMcp.serverRunning', false);
        
        vscode.window.showInformationMessage('AI Browser MCP server stopped');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to stop MCP server: ${error}`);
    }
}

export function deactivate() {
    if (mcpClient) {
        mcpClient.disconnect();
    }
}