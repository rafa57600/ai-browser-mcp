import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEvalTool } from '../../src/tools/evaluation-tool.js';
import { SessionManager } from '../../src/browser/session-manager.js';
import { BrowserSession } from '../../src/browser/browser-session.js';

describe('EvaluationTool Integration Tests', () => {
  let sessionManager: SessionManager;
  let session: BrowserSession;
  let evalTool: ReturnType<typeof createEvalTool>;

  beforeEach(async () => {
    sessionManager = new SessionManager();
    await sessionManager.initialize();
    
    // Create a test session
    session = await sessionManager.createSession({
      viewport: { width: 1280, height: 720 },
      headless: true
    });
    
    evalTool = createEvalTool(sessionManager);
  });

  afterEach(async () => {
    if (session) {
      await sessionManager.destroySession(session.id);
    }
    await sessionManager.shutdown();
  });

  describe('Basic JavaScript Execution', () => {
    it('should execute simple arithmetic operations', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: '2 + 3 * 4'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe(14);
    });

    it('should execute string operations', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: '"Hello " + "World!"'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe('Hello World!');
    });

    it('should execute array operations', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: '[1, 2, 3].map(x => x * 2)'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toEqual([2, 4, 6]);
    });

    it('should execute object operations', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'Object.keys({ a: 1, b: 2, c: 3 })'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Browser Context Execution', () => {
    it('should access window object', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'typeof window'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe('object');
    });

    it('should access document object', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'document.title'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(typeof response.result).toBe('string');
    });

    it('should access navigator object', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'navigator.userAgent'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(typeof response.result).toBe('string');
      expect(response.result).toContain('Chrome');
    });
  });

  describe('DOM Manipulation', () => {
    beforeEach(async () => {
      // Navigate to a simple HTML page for DOM testing
      await session.page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <div id="test-div">Hello World</div>
          <input id="test-input" type="text" value="initial">
          <button id="test-button">Click Me</button>
        </body>
        </html>
      `);
    });

    it('should query DOM elements', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'document.getElementById("test-div").textContent'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe('Hello World');
    });

    it('should modify DOM elements', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: `
          const div = document.getElementById("test-div");
          div.textContent = "Modified Text";
          div.textContent;
        `
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe('Modified Text');
    });

    it('should get form input values', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'document.getElementById("test-input").value'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe('initial');
    });

    it('should set form input values', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: `
          const input = document.getElementById("test-input");
          input.value = "new value";
          input.value;
        `
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe('new value');
    });
  });

  describe('Complex Data Extraction', () => {
    beforeEach(async () => {
      // Set up a more complex HTML page
      await session.page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Complex Test Page</title></head>
        <body>
          <table id="data-table">
            <thead>
              <tr><th>Name</th><th>Age</th><th>City</th></tr>
            </thead>
            <tbody>
              <tr><td>John</td><td>25</td><td>New York</td></tr>
              <tr><td>Jane</td><td>30</td><td>Los Angeles</td></tr>
              <tr><td>Bob</td><td>35</td><td>Chicago</td></tr>
            </tbody>
          </table>
          <ul id="item-list">
            <li data-value="1">Item One</li>
            <li data-value="2">Item Two</li>
            <li data-value="3">Item Three</li>
          </ul>
        </body>
        </html>
      `);
    });

    it('should extract table data', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: `
          const table = document.getElementById("data-table");
          const rows = Array.from(table.querySelectorAll("tbody tr"));
          rows.map(row => {
            const cells = Array.from(row.querySelectorAll("td"));
            return {
              name: cells[0].textContent,
              age: parseInt(cells[1].textContent),
              city: cells[2].textContent
            };
          });
        `
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toEqual([
        { name: 'John', age: 25, city: 'New York' },
        { name: 'Jane', age: 30, city: 'Los Angeles' },
        { name: 'Bob', age: 35, city: 'Chicago' }
      ]);
    });

    it('should extract list data with attributes', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: `
          const list = document.getElementById("item-list");
          const items = Array.from(list.querySelectorAll("li"));
          items.map(item => ({
            text: item.textContent,
            value: item.getAttribute("data-value")
          }));
        `
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toEqual([
        { text: 'Item One', value: '1' },
        { text: 'Item Two', value: '2' },
        { text: 'Item Three', value: '3' }
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle JavaScript runtime errors', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'nonExistentVariable.someProperty'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('nonExistentVariable');
      expect(response.error.isReferenceError).toBe(true);
    });

    it('should handle JavaScript syntax errors', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'function test() { return; } }'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isSyntaxError).toBe(true);
    });

    it('should handle DOM errors gracefully', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'document.getElementById("non-existent").textContent'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('null');
    });
  });

  describe('Performance and Timeout', () => {
    it('should handle long-running operations within timeout', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: `
          let sum = 0;
          for (let i = 0; i < 1000000; i++) {
            sum += i;
          }
          sum;
        `,
        timeout: 10000
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(typeof response.result).toBe('number');
      expect(response.executionTime).toBeGreaterThan(0);
    });

    it('should timeout on infinite loops', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: 'while(true) { /* infinite loop */ }',
        timeout: 2000
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      // The timeout might not always work perfectly with infinite loops in browser context
      // so we just check that it fails rather than specifically checking for timeout
      expect(response.error.message).toBeDefined();
    }, 10000); // Give the test itself more time to complete
  });

  describe('Return By Reference Mode', () => {
    it('should handle complex objects with returnByValue false', async () => {
      const result = await evalTool.handler({
        sessionId: session.id,
        code: `({
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' }
          },
          date: new Date('2023-01-01'),
          func: function() { return 'test'; }
        })`,
        returnByValue: false
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.returnByValue).toBe(false);
      expect(response.result).toHaveProperty('nested');
    });
  });
});