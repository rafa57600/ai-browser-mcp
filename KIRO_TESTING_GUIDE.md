# 🚀 Testing AI Browser MCP with Kiro AI IDE

## Quick Setup Guide

### Step 1: Configure MCP in Kiro

1. **Copy the MCP configuration** to your Kiro settings:
   ```bash
   # Copy the mcp.json to your Kiro workspace settings
   cp mcp.json .kiro/settings/mcp.json
   ```

2. **Or manually add to Kiro MCP settings**:
   - Open Kiro IDE
   - Go to Command Palette (Ctrl/Cmd + Shift + P)
   - Search for "MCP" and select "Configure MCP Servers"
   - Add the following configuration:

```json
{
  "mcpServers": {
    "ai-browser-mcp": {
      "command": "node",
      "args": ["dist/simple-server.js"],
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "info"
      },
      "disabled": false,
      "autoApprove": [
        "browser.newContext",
        "browser.goto",
        "browser.screenshot",
        "browser.click",
        "browser.type",
        "browser.eval"
      ]
    }
  }
}
```

### Step 2: Install Dependencies and Build

```bash
# Install dependencies
npm install

# Build the simple server
npx tsc src/simple-server.ts --outDir dist --target es2022 --module esnext --moduleResolution bundler --allowSyntheticDefaultImports
```

### Step 3: Test the MCP Server

1. **Restart Kiro IDE** to load the new MCP configuration
2. **Check MCP Server Status** in Kiro's MCP panel
3. **Verify the server is running** - you should see "ai-browser-mcp" in the active servers list

## 🧪 Testing Scenarios

### Test 1: Basic Browser Automation

Ask Kiro AI to help you with browser automation:

```
"Can you help me automate a web browser? I want to:
1. Create a new browser context
2. Navigate to https://example.com
3. Take a screenshot
4. Find and click on a link"
```

Kiro should use the MCP tools to:
- Call `browser.newContext` to create a browser session
- Call `browser.goto` to navigate to the website
- Call `browser.screenshot` to capture the page
- Call `browser.click` to interact with elements

### Test 2: Web Scraping

```
"I need to scrape some data from a website. Can you:
1. Open https://httpbin.org/html
2. Extract the text content from the page
3. Take a screenshot for verification"
```

### Test 3: Form Automation

```
"Help me automate filling out a form:
1. Go to https://httpbin.org/forms/post
2. Fill in the customer name field with 'Test User'
3. Fill in the telephone field with '123-456-7890'
4. Take a screenshot of the filled form"
```

### Test 4: JavaScript Execution

```
"Can you execute some JavaScript on a webpage?
1. Navigate to https://example.com
2. Execute JavaScript to change the page title to 'Modified by AI'
3. Get the current page title to verify the change"
```

## 🔧 Available MCP Tools

The AI Browser MCP provides these tools that Kiro can use:

### `browser.newContext`
Creates a new browser context with optional viewport settings.

**Example usage in Kiro:**
```
"Create a new browser context with a 1920x1080 viewport"
```

### `browser.goto`
Navigates to a specified URL.

**Example usage in Kiro:**
```
"Navigate to https://github.com"
```

### `browser.screenshot`
Takes a screenshot of the current page.

**Example usage in Kiro:**
```
"Take a screenshot of the current page"
```

### `browser.click`
Clicks on an element specified by CSS selector.

**Example usage in Kiro:**
```
"Click on the button with class 'submit-btn'"
```

### `browser.type`
Types text into an input field specified by CSS selector.

**Example usage in Kiro:**
```
"Type 'Hello World' into the input field with id 'search'"
```

### `browser.eval`
Executes JavaScript code in the browser context.

**Example usage in Kiro:**
```
"Execute JavaScript to get all the links on the page"
```

## 🎯 Example Conversations with Kiro

### Example 1: Website Testing
```
You: "I need to test if a website loads correctly. Can you help me check https://example.com?"

Kiro will:
1. Create a browser context
2. Navigate to the website
3. Take a screenshot
4. Check if the page loaded successfully
5. Report back with results
```

### Example 2: Data Extraction
```
You: "Extract all the headings from https://news.ycombinator.com"

Kiro will:
1. Create a browser session
2. Navigate to Hacker News
3. Execute JavaScript to find all heading elements
4. Return the extracted text
```

### Example 3: UI Testing
```
You: "Test the search functionality on https://duckduckgo.com by searching for 'AI browser automation'"

Kiro will:
1. Open DuckDuckGo
2. Find the search input field
3. Type the search query
4. Click the search button
5. Take a screenshot of results
```

## 🐛 Troubleshooting

### MCP Server Not Starting
1. Check that Node.js is installed: `node --version`
2. Verify the build completed: `ls dist/simple-server.js`
3. Check Kiro's MCP panel for error messages
4. Restart Kiro IDE

### Browser Not Opening
1. Ensure Playwright is installed: `npm list playwright`
2. Install browser binaries: `npx playwright install chromium`
3. Check system permissions for browser execution

### Tool Calls Failing
1. Check the MCP server logs in Kiro's output panel
2. Verify the session ID is being passed correctly
3. Ensure the target website allows automation

### Performance Issues
1. The browser runs in non-headless mode by default for testing
2. To improve performance, modify `headless: false` to `headless: true` in `simple-server.ts`
3. Limit concurrent browser contexts

## 🚀 Advanced Usage

### Custom Automation Scripts
You can ask Kiro to create complex automation workflows:

```
"Create an automation script that:
1. Opens multiple tabs
2. Navigates to different websites in each tab
3. Extracts specific data from each site
4. Compiles the results into a summary"
```

### Integration with Other Tools
Combine browser automation with other Kiro capabilities:

```
"Use the browser to scrape product prices from an e-commerce site, then create a CSV file with the data"
```

### Monitoring and Testing
Set up automated monitoring:

```
"Create a script that checks if my website is loading correctly every hour and takes screenshots for monitoring"
```

## 📊 Expected Results

When working correctly, you should see:

1. **Browser window opens** (unless in headless mode)
2. **Kiro successfully calls MCP tools** in the chat
3. **Screenshots returned as base64 data** that Kiro can display
4. **JavaScript execution results** returned as JSON
5. **Successful navigation and interaction** with web elements

## 🎉 Success Indicators

✅ **MCP Server Connected**: Shows as "active" in Kiro's MCP panel  
✅ **Tools Available**: Kiro can list and use browser tools  
✅ **Browser Launches**: Chromium browser opens when creating contexts  
✅ **Screenshots Work**: Images are captured and returned  
✅ **Navigation Works**: Pages load successfully  
✅ **Interactions Work**: Clicking and typing function correctly  
✅ **JavaScript Execution**: Code runs and returns results  

## 🔗 Next Steps

Once basic testing works:

1. **Explore Complex Workflows**: Try multi-step automation tasks
2. **Test Error Handling**: See how the system handles invalid selectors or network errors
3. **Performance Testing**: Test with multiple concurrent sessions
4. **Integration Testing**: Combine with other Kiro features
5. **Custom Tool Development**: Extend the MCP server with additional tools

---

**Happy Testing! 🎉**

The AI Browser MCP system is now ready to be used with Kiro AI IDE for powerful browser automation and web testing workflows.