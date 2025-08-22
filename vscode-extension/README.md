# AI Browser MCP VS Code Extension

This VS Code extension provides integration with the AI Browser MCP server, allowing you to control browser automation directly from your IDE.

## Features

- **WebSocket Communication**: Real-time communication with the MCP server
- **Browser Commands**: Execute browser automation commands from VS Code
- **Screenshot Display**: View browser screenshots in a dedicated webview
- **Console Log Integration**: Stream browser console logs to VS Code output panel
- **Auto-reconnection**: Automatically reconnect to the server if connection is lost

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Click "Install from VSIX..." in the Extensions view menu
4. Select the packaged extension file

Or install from source:

1. Navigate to the `vscode-extension` directory
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press F5 to launch a new VS Code window with the extension loaded

## Configuration

The extension can be configured through VS Code settings:

```json
{
  "aiBrowserMcp.serverPort": 3000,
  "aiBrowserMcp.autoStart": false
}
```

### Settings

- `aiBrowserMcp.serverPort`: Port number for the MCP WebSocket server (default: 3000)
- `aiBrowserMcp.autoStart`: Automatically start the server when VS Code opens (default: false)

## Usage

### Starting the Server

1. Open the Command Palette (Ctrl+Shift+P)
2. Run "Start AI Browser MCP Server"
3. The server will start and connect via WebSocket

### Taking Screenshots

1. Ensure the server is running
2. Open the Command Palette (Ctrl+Shift+P)
3. Run "Show Browser Screenshot"
4. The screenshot will appear in the AI Browser MCP webview

### Viewing Console Logs

1. Open the Output panel (View > Output)
2. Select "AI Browser MCP Logs" from the dropdown
3. Console logs will stream in real-time when the server is active

### Available Commands

- `aiBrowserMcp.startServer`: Start the MCP server
- `aiBrowserMcp.stopServer`: Stop the MCP server
- `aiBrowserMcp.showScreenshot`: Capture and display a browser screenshot
- `aiBrowserMcp.showLogs`: Refresh and display console logs

## WebSocket API

The extension communicates with the MCP server using JSON-RPC over WebSocket:

### Connection

```
ws://localhost:3000/mcp
```

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "browser.screenshot",
  "params": {
    "fullPage": true
  }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "data": "base64-encoded-image",
    "format": "png",
    "width": 1280,
    "height": 720,
    "timestamp": "2023-01-01T12:00:00Z"
  }
}
```

### Notifications

The server sends notifications for real-time events:

```json
{
  "jsonrpc": "2.0",
  "method": "console.log",
  "params": {
    "timestamp": "2023-01-01T12:00:00Z",
    "level": "info",
    "message": "Page loaded successfully"
  }
}
```

## Supported Browser Tools

The extension supports all MCP browser tools:

- `browser.newContext`: Create new browser context
- `browser.goto`: Navigate to URL
- `browser.click`: Click elements
- `browser.type`: Type text into inputs
- `browser.select`: Select dropdown options
- `browser.screenshot`: Capture screenshots
- `browser.domSnapshot`: Get DOM structure
- `browser.eval`: Execute JavaScript
- `browser.console.getRecent`: Get console logs
- `browser.network.getRecent`: Get network logs

## Error Handling

The extension includes comprehensive error handling:

- **Connection Errors**: Automatic reconnection with exponential backoff
- **Request Timeouts**: 30-second timeout for all requests
- **Server Errors**: Detailed error messages displayed to user
- **Network Issues**: Graceful degradation when server is unavailable

## Development

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
npm test
```

### Packaging

```bash
npm install -g vsce
vsce package
```

## Architecture

```
┌─────────────────┐    WebSocket     ┌─────────────────┐
│   VS Code       │ ◄──────────────► │   MCP Server    │
│   Extension     │   JSON-RPC       │   (Port 3000)   │
└─────────────────┘                  └─────────────────┘
         │                                     │
         ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐
│   Webview       │                  │   Browser       │
│   (Screenshots) │                  │   (Playwright)  │
└─────────────────┘                  └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Output Panel  │
│   (Console Logs)│
└─────────────────┘
```

## Troubleshooting

### Connection Issues

1. Ensure the MCP server is running on the configured port
2. Check firewall settings
3. Verify WebSocket endpoint is accessible

### Screenshot Not Displaying

1. Check if browser context is created
2. Verify screenshot tool is registered
3. Look for errors in the Output panel

### Console Logs Not Streaming

1. Ensure real-time log streaming is enabled
2. Check WebSocket connection status
3. Verify console log capture is active

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details