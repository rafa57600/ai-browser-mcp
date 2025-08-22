# AI Browser MCP - API Reference

## Overview

The AI Browser MCP server provides browser automation capabilities through the Model Context Protocol (MCP). This document describes all available tools and their usage.

## Connection

The MCP server runs on a configurable port (default: 3000) and accepts JSON-RPC 2.0 requests over HTTP or WebSocket.

### Server Configuration

```json
{
  "port": 3000,
  "host": "localhost",
  "security": {
    "allowedDomains": ["example.com", "localhost"],
    "rateLimit": {
      "requests": 60,
      "window": 60000
    }
  }
}
```

## Browser Context Management

### browser.newContext

Creates a new isolated browser context for automation.

**Parameters:**
- `viewport` (optional): Object with `width` and `height` properties
- `userAgent` (optional): Custom user agent string
- `allowedDomains` (optional): Array of allowed domains for this session

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "browser.newContext",
    "arguments": {
      "viewport": { "width": 1920, "height": 1080 },
      "userAgent": "Mozilla/5.0 (compatible; AI-Browser/1.0)"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "session_123",
    "viewport": { "width": 1920, "height": 1080 },
    "userAgent": "Mozilla/5.0 (compatible; AI-Browser/1.0)"
  }
}
```

## Navigation Tools

### browser.goto

Navigate to a specified URL and wait for the page to load.

**Parameters:**
- `url` (required): Target URL to navigate to
- `waitUntil` (optional): Wait condition - "load", "domcontentloaded", "networkidle"
- `timeout` (optional): Maximum wait time in milliseconds

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "browser.goto",
    "arguments": {
      "url": "https://example.com",
      "waitUntil": "networkidle",
      "timeout": 30000
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "url": "https://example.com",
    "title": "Example Domain",
    "status": 200,
    "loadTime": 1250
  }
}
```

## Interaction Tools

### browser.click

Click on a DOM element specified by a CSS selector.

**Parameters:**
- `selector` (required): CSS selector for the target element
- `timeout` (optional): Maximum wait time for element to appear
- `force` (optional): Force click even if element is not visible

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "browser.click",
    "arguments": {
      "selector": "#submit-button",
      "timeout": 5000
    }
  }
}
```

### browser.type

Type text into a form field or input element.

**Parameters:**
- `selector` (required): CSS selector for the input element
- `text` (required): Text to type
- `delay` (optional): Delay between keystrokes in milliseconds

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "browser.type",
    "arguments": {
      "selector": "#username",
      "text": "testuser",
      "delay": 50
    }
  }
}
```

### browser.select

Select an option from a dropdown element.

**Parameters:**
- `selector` (required): CSS selector for the select element
- `value` (required): Value to select (can be value, label, or index)

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "browser.select",
    "arguments": {
      "selector": "#country",
      "value": "US"
    }
  }
}
```

## Capture Tools

### browser.screenshot

Capture a screenshot of the current page or a specific element.

**Parameters:**
- `fullPage` (optional): Capture the entire scrollable page
- `selector` (optional): CSS selector to capture specific element
- `format` (optional): Image format - "png" or "jpeg"
- `quality` (optional): JPEG quality (1-100)

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "browser.screenshot",
    "arguments": {
      "fullPage": true,
      "format": "png"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "data": "iVBORw0KGgoAAAANSUhEUgAA...",
    "format": "png",
    "width": 1920,
    "height": 1080,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### browser.domSnapshot

Capture a JSON representation of the DOM structure.

**Parameters:**
- `maxNodes` (optional): Maximum number of nodes to include
- `selector` (optional): CSS selector to capture specific subtree

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "browser.domSnapshot",
    "arguments": {
      "maxNodes": 1000,
      "selector": "body"
    }
  }
}
```

## JavaScript Execution

### browser.eval

Execute JavaScript code in the browser context.

**Parameters:**
- `code` (required): JavaScript code to execute
- `timeout` (optional): Maximum execution time in milliseconds

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "browser.eval",
    "arguments": {
      "code": "document.title",
      "timeout": 5000
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "value": "Example Domain",
    "type": "string"
  }
}
```

## Monitoring Tools

### browser.network.getRecent

Retrieve recent network requests and responses.

**Parameters:**
- `limit` (optional): Maximum number of entries to return
- `filter` (optional): Filter by request type or status

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "tools/call",
  "params": {
    "name": "browser.network.getRecent",
    "arguments": {
      "limit": 10,
      "filter": "xhr"
    }
  }
}
```

### browser.console.getRecent

Retrieve recent console log entries.

**Parameters:**
- `limit` (optional): Maximum number of entries to return
- `level` (optional): Filter by log level - "info", "warn", "error", "debug"

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "tools/call",
  "params": {
    "name": "browser.console.getRecent",
    "arguments": {
      "limit": 20,
      "level": "error"
    }
  }
}
```

## Tracing and Export Tools

### browser.trace.start

Start recording browser performance traces.

**Parameters:**
- `categories` (optional): Array of trace categories to record
- `screenshots` (optional): Include screenshots in trace

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "method": "tools/call",
  "params": {
    "name": "browser.trace.start",
    "arguments": {
      "categories": ["devtools.timeline", "blink.user_timing"],
      "screenshots": true
    }
  }
}
```

### browser.trace.stop

Stop recording and retrieve trace data.

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "method": "tools/call",
  "params": {
    "name": "browser.trace.stop",
    "arguments": {}
  }
}
```

### browser.harExport

Export network activity in HAR (HTTP Archive) format.

**Parameters:**
- `includeContent` (optional): Include response bodies in export

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 13,
  "method": "tools/call",
  "params": {
    "name": "browser.harExport",
    "arguments": {
      "includeContent": true
    }
  }
}
```

## Macro Tools

### browser.macro.record

Start recording user interactions for later playback.

**Parameters:**
- `name` (required): Name for the macro
- `description` (optional): Description of the macro

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 14,
  "method": "tools/call",
  "params": {
    "name": "browser.macro.record",
    "arguments": {
      "name": "login-flow",
      "description": "User login workflow"
    }
  }
}
```

### browser.macro.stop

Stop recording the current macro.

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 15,
  "method": "tools/call",
  "params": {
    "name": "browser.macro.stop",
    "arguments": {}
  }
}
```

### browser.macro.play

Play back a recorded macro.

**Parameters:**
- `name` (required): Name of the macro to play
- `speed` (optional): Playback speed multiplier (default: 1.0)

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 16,
  "method": "tools/call",
  "params": {
    "name": "browser.macro.play",
    "arguments": {
      "name": "login-flow",
      "speed": 1.5
    }
  }
}
```

## Report Generation

### browser.report.generate

Generate a comprehensive report with screenshots, logs, and DOM snapshots.

**Parameters:**
- `format` (optional): Report format - "html" or "pdf"
- `includeScreenshots` (optional): Include screenshots in report
- `includeLogs` (optional): Include console and network logs

**Example:**
```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "browser.report.generate",
    "arguments": {
      "format": "html",
      "includeScreenshots": true,
      "includeLogs": true
    }
  }
}
```

## Error Handling

All tools return standardized error responses when operations fail:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Element not found",
    "data": {
      "category": "browser",
      "details": {
        "selector": "#missing-element",
        "timeout": 5000
      },
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

### Error Categories

- **protocol**: Invalid JSON-RPC requests or malformed parameters
- **security**: Domain access denied or rate limit exceeded
- **browser**: Navigation failures, element not found, or timeout
- **system**: Resource exhaustion, browser crash, or network issues

## Rate Limiting

The server implements rate limiting to prevent abuse:

- **Default Limit**: 60 requests per minute per client
- **Burst Limit**: 10 requests per second
- **Rate Limit Headers**: Included in HTTP responses

When rate limits are exceeded, the server returns a 429 status code with retry information.