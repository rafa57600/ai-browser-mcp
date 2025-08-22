// Integration tests for DOM interaction tools
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/browser/session-manager.js';
import { createNewContextTool, createGotoTool } from '../../src/tools/navigation-tool.js';
import { createClickTool, createTypeTool, createSelectTool } from '../../src/tools/interaction-tools.js';

describe('DOM Interaction Tools Integration', () => {
  let sessionManager: SessionManager;
  let newContextTool: ReturnType<typeof createNewContextTool>;
  let gotoTool: ReturnType<typeof createGotoTool>;
  let clickTool: ReturnType<typeof createClickTool>;
  let typeTool: ReturnType<typeof createTypeTool>;
  let selectTool: ReturnType<typeof createSelectTool>;
  let sessionId: string;

  beforeAll(async () => {
    sessionManager = new SessionManager({
      maxSessions: 5,
      sessionTimeout: 60000, // 1 minute for tests
      cleanupInterval: 30000
    });
    await sessionManager.initialize();
    
    newContextTool = createNewContextTool(sessionManager);
    gotoTool = createGotoTool(sessionManager);
    clickTool = createClickTool(sessionManager);
    typeTool = createTypeTool(sessionManager);
    selectTool = createSelectTool(sessionManager);
  });

  afterAll(async () => {
    await sessionManager.shutdown();
  });

  beforeEach(async () => {
    // Clean up any existing sessions before each test
    await sessionManager.destroyAllSessions();
    
    // Create a fresh session for each test
    const result = await newContextTool.handler({});
    const response = JSON.parse(result.content[0].text);
    sessionId = response.sessionId;
  });

  afterEach(async () => {
    // Clean up sessions after each test
    await sessionManager.destroyAllSessions();
  });

  describe('browser.click tool', () => {
    beforeEach(async () => {
      // Navigate to a test page with clickable elements
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <button id="test-button">Click Me</button>
          <div id="clickable-div" style="width: 100px; height: 100px; background: red;">Clickable Div</div>
          <a href="#" id="test-link">Test Link</a>
          <input type="button" id="input-button" value="Input Button" />
          <div id="hidden-element" style="display: none;">Hidden Element</div>
          <div id="result"></div>
          <script>
            document.getElementById('test-button').onclick = () => {
              document.getElementById('result').textContent = 'Button clicked';
            };
            document.getElementById('clickable-div').onclick = () => {
              document.getElementById('result').textContent = 'Div clicked';
            };
            document.getElementById('test-link').onclick = (e) => {
              e.preventDefault();
              document.getElementById('result').textContent = 'Link clicked';
            };
            document.getElementById('input-button').onclick = () => {
              document.getElementById('result').textContent = 'Input button clicked';
            };
          </script>
        </body>
        </html>
      `;
      
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;
      await gotoTool.handler({ sessionId, url: dataUrl });
    });

    it('should click a button element successfully', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#test-button'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.selector).toBe('#test-button');
      expect(response.clickTime).toBeGreaterThan(0);
      expect(response.force).toBe(false);
      expect(response.position).toBeNull();
      expect(response.message).toBe('Element clicked successfully');
      
      // Verify the click actually worked by checking the result
      const session = sessionManager.getSession(sessionId);
      const resultText = await session!.page.textContent('#result');
      expect(resultText).toBe('Button clicked');
    });

    it('should click a div element successfully', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#clickable-div'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      
      // Verify the click worked
      const session = sessionManager.getSession(sessionId);
      const resultText = await session!.page.textContent('#result');
      expect(resultText).toBe('Div clicked');
    });

    it('should click with custom position', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#clickable-div',
        position: { x: 50, y: 50 }
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.position).toEqual({ x: 50, y: 50 });
    });

    it('should handle force click option', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#test-button',
        force: true
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.force).toBe(true);
    });

    it('should handle custom timeout', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#test-button',
        timeout: 5000
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should fail when element is not found', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#non-existent-element',
        timeout: 2000 // Use shorter timeout for error test
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('browser');
      expect(response.error.isElementNotFound).toBe(true);
    });

    it('should fail when element is not visible', async () => {
      const result = await clickTool.handler({
        sessionId,
        selector: '#hidden-element',
        timeout: 2000
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isTimeout).toBe(true);
    });

    it('should fail with invalid session ID', async () => {
      const result = await clickTool.handler({
        sessionId: 'invalid-session-id',
        selector: '#test-button'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Session \'invalid-session-id\' not found');
    });

    it('should fail with missing required parameters', async () => {
      const result = await clickTool.handler({
        sessionId
        // Missing selector parameter
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('selector is required');
    });

    it('should update session activity on successful click', async () => {
      const session = sessionManager.getSession(sessionId);
      const initialActivity = session!.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await clickTool.handler({
        sessionId,
        selector: '#test-button'
      });
      
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });
  });

  describe('browser.type tool', () => {
    beforeEach(async () => {
      // Navigate to a test page with input elements
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <input type="text" id="text-input" placeholder="Enter text" />
          <textarea id="textarea" placeholder="Enter long text"></textarea>
          <input type="password" id="password-input" placeholder="Enter password" />
          <input type="email" id="email-input" placeholder="Enter email" />
          <input type="text" id="prefilled-input" value="Existing text" />
          <div id="non-input">Not an input</div>
          <input type="text" id="hidden-input" style="display: none;" />
        </body>
        </html>
      `;
      
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;
      await gotoTool.handler({ sessionId, url: dataUrl });
    });

    it('should type text into input field successfully', async () => {
      const testText = 'Hello, World!';
      const result = await typeTool.handler({
        sessionId,
        selector: '#text-input',
        text: testText
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.selector).toBe('#text-input');
      expect(response.textLength).toBe(testText.length);
      expect(response.typeTime).toBeGreaterThan(0);
      expect(response.cleared).toBe(true);
      expect(response.delay).toBe(0);
      expect(response.message).toBe('Text typed successfully');
      
      // Verify the text was actually typed
      const session = sessionManager.getSession(sessionId);
      const inputValue = await session!.page.inputValue('#text-input');
      expect(inputValue).toBe(testText);
    });

    it('should type text into textarea successfully', async () => {
      const testText = 'This is a longer text\nwith multiple lines\nfor testing textarea.';
      const result = await typeTool.handler({
        sessionId,
        selector: '#textarea',
        text: testText
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      
      // Verify the text was typed
      const session = sessionManager.getSession(sessionId);
      const textareaValue = await session!.page.inputValue('#textarea');
      expect(textareaValue).toBe(testText);
    });

    it('should type with custom delay', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#text-input',
        text: 'Slow typing',
        delay: 100
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.delay).toBe(100);
    });

    it('should handle clear option set to false', async () => {
      // First, type some text
      await typeTool.handler({
        sessionId,
        selector: '#prefilled-input',
        text: ' Additional text',
        clear: false
      });
      
      // Verify the original text is preserved
      const session = sessionManager.getSession(sessionId);
      const inputValue = await session!.page.inputValue('#prefilled-input');
      expect(inputValue).toBe('Existing text Additional text');
    });

    it('should clear field by default', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#prefilled-input',
        text: 'New text'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.cleared).toBe(true);
      
      // Verify the field was cleared and new text typed
      const session = sessionManager.getSession(sessionId);
      const inputValue = await session!.page.inputValue('#prefilled-input');
      expect(inputValue).toBe('New text');
    });

    it('should handle custom timeout', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#text-input',
        text: 'Test text',
        timeout: 5000
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle empty text', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#text-input',
        text: ''
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textLength).toBe(0);
    });

    it('should fail when element is not found', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#non-existent-input',
        text: 'Test text',
        timeout: 2000 // Use shorter timeout for error test
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('browser');
      expect(response.error.isElementNotFound).toBe(true);
    });

    it('should fail when element is not visible', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#hidden-input',
        text: 'Test text',
        timeout: 2000
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isTimeout).toBe(true);
    });

    it('should fail with invalid session ID', async () => {
      const result = await typeTool.handler({
        sessionId: 'invalid-session-id',
        selector: '#text-input',
        text: 'Test text'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Session \'invalid-session-id\' not found');
    });

    it('should fail with missing required parameters', async () => {
      const result = await typeTool.handler({
        sessionId,
        selector: '#text-input'
        // Missing text parameter
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('text is required');
    });

    it('should update session activity on successful typing', async () => {
      const session = sessionManager.getSession(sessionId);
      const initialActivity = session!.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await typeTool.handler({
        sessionId,
        selector: '#text-input',
        text: 'Test text'
      });
      
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });
  });

  describe('browser.select tool', () => {
    beforeEach(async () => {
      // Navigate to a test page with select elements
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
          <select id="simple-select">
            <option value="">Choose an option</option>
            <option value="option1">Option 1</option>
            <option value="option2">Option 2</option>
            <option value="option3">Option 3</option>
          </select>
          
          <select id="multiple-select" multiple>
            <option value="multi1">Multi Option 1</option>
            <option value="multi2">Multi Option 2</option>
            <option value="multi3">Multi Option 3</option>
          </select>
          
          <select id="grouped-select">
            <optgroup label="Group 1">
              <option value="group1-opt1">Group 1 Option 1</option>
              <option value="group1-opt2">Group 1 Option 2</option>
            </optgroup>
            <optgroup label="Group 2">
              <option value="group2-opt1">Group 2 Option 1</option>
              <option value="group2-opt2">Group 2 Option 2</option>
            </optgroup>
          </select>
          
          <div id="not-select">Not a select element</div>
          <select id="hidden-select" style="display: none;">
            <option value="hidden-option">Hidden Option</option>
          </select>
        </body>
        </html>
      `;
      
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;
      await gotoTool.handler({ sessionId, url: dataUrl });
    });

    it('should select an option successfully', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#simple-select',
        value: 'option2'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.selector).toBe('#simple-select');
      expect(response.selectedValue).toBe('option2');
      expect(response.selectedValues).toEqual(['option2']);
      expect(response.selectTime).toBeGreaterThan(0);
      expect(response.message).toBe('Option selected successfully');
      
      // Verify the option was actually selected
      const session = sessionManager.getSession(sessionId);
      const selectedValue = await session!.page.inputValue('#simple-select');
      expect(selectedValue).toBe('option2');
    });

    it('should select option from grouped select', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#grouped-select',
        value: 'group2-opt1'
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.selectedValue).toBe('group2-opt1');
      
      // Verify the selection
      const session = sessionManager.getSession(sessionId);
      const selectedValue = await session!.page.inputValue('#grouped-select');
      expect(selectedValue).toBe('group2-opt1');
    });

    it('should handle custom timeout', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#simple-select',
        value: 'option1',
        timeout: 5000
      });
      
      expect(result.isError).toBeFalsy();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should fail when element is not found', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#non-existent-select',
        value: 'option1',
        timeout: 2000 // Use shorter timeout for error test
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('browser');
      expect(response.error.isElementNotFound).toBe(true);
    });

    it('should fail when element is not a select', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#not-select',
        value: 'option1'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('browser');
      expect(response.error.isNotSelectElement).toBe(true);
      expect(response.error.message).toContain('not a select element');
    });

    it('should fail when option value is not found', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#simple-select',
        value: 'non-existent-option',
        timeout: 2000 // Use shorter timeout for error test
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('browser');
      expect(response.error.isOptionNotFound).toBe(true);
      expect(response.error.message).toContain('Option with value \'non-existent-option\' not found');
    });

    it('should fail when element is not visible', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#hidden-select',
        value: 'hidden-option',
        timeout: 2000
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isTimeout).toBe(true);
    });

    it('should fail with invalid session ID', async () => {
      const result = await selectTool.handler({
        sessionId: 'invalid-session-id',
        selector: '#simple-select',
        value: 'option1'
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Session \'invalid-session-id\' not found');
    });

    it('should fail with missing required parameters', async () => {
      const result = await selectTool.handler({
        sessionId,
        selector: '#simple-select'
        // Missing value parameter
      });
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('value is required');
    });

    it('should update session activity on successful selection', async () => {
      const session = sessionManager.getSession(sessionId);
      const initialActivity = session!.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await selectTool.handler({
        sessionId,
        selector: '#simple-select',
        value: 'option1'
      });
      
      const updatedSession = sessionManager.getSession(sessionId);
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });
  });

  describe('Tool integration', () => {
    it('should work together for complex form interaction', async () => {
      // Navigate to a complex form
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Complex Form</title></head>
        <body>
          <form id="test-form">
            <input type="text" id="name" placeholder="Name" />
            <input type="email" id="email" placeholder="Email" />
            <select id="country">
              <option value="">Select Country</option>
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="uk">United Kingdom</option>
            </select>
            <textarea id="message" placeholder="Message"></textarea>
            <button type="button" id="submit-btn">Submit</button>
            <div id="form-result"></div>
          </form>
          <script>
            document.getElementById('submit-btn').onclick = () => {
              const name = document.getElementById('name').value;
              const email = document.getElementById('email').value;
              const country = document.getElementById('country').value;
              const message = document.getElementById('message').value;
              document.getElementById('form-result').textContent = 
                \`Name: \${name}, Email: \${email}, Country: \${country}, Message: \${message}\`;
            };
          </script>
        </body>
        </html>
      `;
      
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;
      await gotoTool.handler({ sessionId, url: dataUrl });
      
      // Fill out the form using interaction tools
      await typeTool.handler({
        sessionId,
        selector: '#name',
        text: 'John Doe'
      });
      
      await typeTool.handler({
        sessionId,
        selector: '#email',
        text: 'john.doe@example.com'
      });
      
      await selectTool.handler({
        sessionId,
        selector: '#country',
        value: 'us'
      });
      
      await typeTool.handler({
        sessionId,
        selector: '#message',
        text: 'This is a test message for the form.'
      });
      
      // Submit the form
      const submitResult = await clickTool.handler({
        sessionId,
        selector: '#submit-btn'
      });
      
      expect(submitResult.isError).toBeFalsy();
      
      // Verify the form was processed correctly
      const session = sessionManager.getSession(sessionId);
      const resultText = await session!.page.textContent('#form-result');
      expect(resultText).toBe('Name: John Doe, Email: john.doe@example.com, Country: us, Message: This is a test message for the form.');
    });

    it('should handle sequential interactions on the same page', async () => {
      // Navigate to a page with multiple interactive elements
      const testHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Sequential Interactions</title></head>
        <body>
          <input type="text" id="input1" />
          <button id="btn1">Button 1</button>
          <input type="text" id="input2" />
          <select id="select1">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </select>
          <button id="btn2">Button 2</button>
          <div id="log"></div>
          <script>
            let log = [];
            document.getElementById('input1').oninput = (e) => {
              log.push('Input1: ' + e.target.value);
              updateLog();
            };
            document.getElementById('btn1').onclick = () => {
              log.push('Button1 clicked');
              updateLog();
            };
            document.getElementById('input2').oninput = (e) => {
              log.push('Input2: ' + e.target.value);
              updateLog();
            };
            document.getElementById('select1').onchange = (e) => {
              log.push('Select1: ' + e.target.value);
              updateLog();
            };
            document.getElementById('btn2').onclick = () => {
              log.push('Button2 clicked');
              updateLog();
            };
            function updateLog() {
              document.getElementById('log').textContent = log.join(', ');
            }
          </script>
        </body>
        </html>
      `;
      
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`;
      await gotoTool.handler({ sessionId, url: dataUrl });
      
      // Perform sequential interactions
      await typeTool.handler({ sessionId, selector: '#input1', text: 'First' });
      await clickTool.handler({ sessionId, selector: '#btn1' });
      await typeTool.handler({ sessionId, selector: '#input2', text: 'Second' });
      await selectTool.handler({ sessionId, selector: '#select1', value: 'b' });
      await clickTool.handler({ sessionId, selector: '#btn2' });
      
      // Verify all interactions were logged
      const session = sessionManager.getSession(sessionId);
      const logText = await session!.page.textContent('#log');
      expect(logText).toContain('Input1: First');
      expect(logText).toContain('Button1 clicked');
      expect(logText).toContain('Input2: Second');
      expect(logText).toContain('Select1: b');
      expect(logText).toContain('Button2 clicked');
    });
  });
});