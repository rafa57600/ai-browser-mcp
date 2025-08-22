import * as vscode from 'vscode';
import { ScreenshotResult } from './mcp-client';

export class ScreenshotWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiBrowserMcp.screenshot';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'refresh':
                        vscode.commands.executeCommand('aiBrowserMcp.showScreenshot');
                        break;
                    case 'saveScreenshot':
                        this.saveScreenshot(message.data);
                        break;
                }
            },
            undefined,
            []
        );
    }

    public updateScreenshot(screenshot: ScreenshotResult) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'screenshot',
                data: screenshot
            });
        }
    }

    private async saveScreenshot(screenshotData: string) {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`screenshot-${Date.now()}.png`),
                filters: {
                    'Images': ['png', 'jpg', 'jpeg']
                }
            });

            if (uri) {
                const buffer = Buffer.from(screenshotData, 'base64');
                await vscode.workspace.fs.writeFile(uri, buffer);
                vscode.window.showInformationMessage('Screenshot saved successfully');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save screenshot: ${error}`);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browser Screenshot</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
        }
        
        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        
        .toolbar {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            padding: 5px;
            background-color: var(--vscode-panel-background);
            border-radius: 3px;
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .screenshot-container {
            flex: 1;
            overflow: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            background-color: var(--vscode-editor-background);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .screenshot {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        
        .placeholder {
            color: var(--vscode-descriptionForeground);
            text-align: center;
            padding: 20px;
        }
        
        .metadata {
            margin-top: 10px;
            padding: 5px;
            background-color: var(--vscode-panel-background);
            border-radius: 3px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <button onclick="refreshScreenshot()">Refresh</button>
            <button onclick="saveScreenshot()" id="saveBtn" disabled>Save</button>
        </div>
        
        <div class="screenshot-container" id="screenshotContainer">
            <div class="placeholder">
                No screenshot available. Click "Refresh" to capture a screenshot.
            </div>
        </div>
        
        <div class="metadata" id="metadata" style="display: none;"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentScreenshot = null;

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'screenshot':
                    displayScreenshot(message.data);
                    break;
            }
        });

        function refreshScreenshot() {
            vscode.postMessage({ type: 'refresh' });
        }

        function saveScreenshot() {
            if (currentScreenshot) {
                vscode.postMessage({ 
                    type: 'saveScreenshot', 
                    data: currentScreenshot.data 
                });
            }
        }

        function displayScreenshot(screenshot) {
            currentScreenshot = screenshot;
            
            const container = document.getElementById('screenshotContainer');
            const metadata = document.getElementById('metadata');
            const saveBtn = document.getElementById('saveBtn');
            
            container.innerHTML = \`
                <img class="screenshot" 
                     src="data:image/\${screenshot.format};base64,\${screenshot.data}" 
                     alt="Browser Screenshot" />
            \`;
            
            metadata.innerHTML = \`
                <strong>Dimensions:</strong> \${screenshot.width} x \${screenshot.height} | 
                <strong>Format:</strong> \${screenshot.format.toUpperCase()} | 
                <strong>Captured:</strong> \${new Date(screenshot.timestamp).toLocaleString()}
            \`;
            
            metadata.style.display = 'block';
            saveBtn.disabled = false;
        }
    </script>
</body>
</html>`;
    }
}