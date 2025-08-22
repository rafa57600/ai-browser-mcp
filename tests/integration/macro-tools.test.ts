import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, BrowserContext } from 'playwright';
import { SessionManager } from '../../src/browser/session-manager.js';
import { 
  createMacroStartRecordingTool,
  createMacroStopRecordingTool,
  createMacroListTool,
  createMacroPlayTool,
  createMacroDeleteTool
} from '../../src/tools/macro-tools.js';
import { createNewContextTool, createGotoTool } from '../../src/tools/navigation-tool.js';
import { createClickTool, createTypeTool } from '../../src/tools/interaction-tools.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Macro Tools Integration', () => {
  let browser: Browser;
  let sessionManager: SessionManager;
  let testMacroDir: string;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    sessionManager = new SessionManager();
    await sessionManager.initialize();
    
    // Create temporary macro directory
    testMacroDir = path.join(process.cwd(), 'test-macros-' + Date.now());
    process.env.MACRO_STORAGE_DIR = testMacroDir;
  });

  afterEach(async () => {
    await sessionManager.shutdown();
    await browser.close();
    
    // Clean up test macro directory
    try {
      await fs.rm(testMacroDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should record and play back a complete macro', { timeout: 30000 }, async () => {
    // Create tools
    const newContextTool = createNewContextTool(sessionManager);
    const gotoTool = createGotoTool(sessionManager);
    const clickTool = createClickTool(sessionManager);
    const typeTool = createTypeTool(sessionManager);
    const startRecordingTool = createMacroStartRecordingTool(sessionManager);
    const stopRecordingTool = createMacroStopRecordingTool(sessionManager);
    const listTool = createMacroListTool(sessionManager);
    const playTool = createMacroPlayTool(sessionManager);
    const deleteTool = createMacroDeleteTool(sessionManager);

    // Step 1: Create a browser session
    const contextResult = await newContextTool.handler({
      viewport: { width: 1280, height: 720 }
    });
    expect(contextResult.isError).toBe(false);
    
    const contextData = JSON.parse(contextResult.content[0].text);
    const sessionId = contextData.sessionId;

    // Step 2: Navigate to a test page
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Test Page</h1>
          <input id="test-input" type="text" placeholder="Enter text">
          <button id="test-button">Click Me</button>
          <div id="result"></div>
          <script>
            document.getElementById('test-button').onclick = function() {
              const input = document.getElementById('test-input');
              const result = document.getElementById('result');
              result.textContent = 'Button clicked with: ' + input.value;
            };
          </script>
        </body>
      </html>
    `;
    
    const testFile = path.join(process.cwd(), 'test-page.html');
    await fs.writeFile(testFile, testHtml);
    
    try {
      const gotoResult = await gotoTool.handler({
        sessionId,
        url: `file://${testFile}`
      });
      expect(gotoResult.isError).toBe(false);

      // Step 3: Start macro recording
      const startResult = await startRecordingTool.handler({
        sessionId,
        name: 'Test Interaction Macro',
        description: 'A macro that types text and clicks a button'
      });
      expect(startResult.isError).toBe(false);
      
      const startData = JSON.parse(startResult.content[0].text);
      const macroId = startData.macroId;

      // Step 4: Perform some interactions (these should be recorded)
      const typeResult = await typeTool.handler({
        sessionId,
        selector: '#test-input',
        text: 'Hello, World!'
      });
      expect(typeResult.isError).toBe(false);

      const clickResult = await clickTool.handler({
        sessionId,
        selector: '#test-button'
      });
      expect(clickResult.isError).toBe(false);

      // Step 5: Stop recording
      const stopResult = await stopRecordingTool.handler({
        sessionId
      });
      expect(stopResult.isError).toBe(false);
      
      const stopData = JSON.parse(stopResult.content[0].text);
      expect(stopData.actionsRecorded).toBeGreaterThan(0);

      // Step 6: List macros to verify it was saved
      const listResult = await listTool.handler({});
      expect(listResult.isError).toBe(false);
      
      const listData = JSON.parse(listResult.content[0].text);
      expect(listData.macros).toHaveLength(1);
      expect(listData.macros[0].id).toBe(macroId);
      expect(listData.macros[0].name).toBe('Test Interaction Macro');

      // Step 7: Create a new session for playback
      const newContextResult = await newContextTool.handler({
        viewport: { width: 1280, height: 720 }
      });
      expect(newContextResult.isError).toBe(false);
      
      const newContextData = JSON.parse(newContextResult.content[0].text);
      const playbackSessionId = newContextData.sessionId;

      // Navigate to the same test page
      const gotoResult2 = await gotoTool.handler({
        sessionId: playbackSessionId,
        url: `file://${testFile}`
      });
      expect(gotoResult2.isError).toBe(false);

      // Step 8: Play back the macro
      const playResult = await playTool.handler({
        sessionId: playbackSessionId,
        macroId,
        delayBetweenActions: 100
      });
      expect(playResult.isError).toBe(false);
      
      const playData = JSON.parse(playResult.content[0].text);
      expect(playData.success).toBe(true);
      expect(playData.playbackResult.executedActions).toBeGreaterThan(0);
      expect(playData.playbackResult.errors).toHaveLength(0);

      // Step 9: Verify the playback worked by checking the page state
      const session = sessionManager.getSession(playbackSessionId);
      const resultText = await session!.page.textContent('#result');
      expect(resultText).toBe('Button clicked with: Hello, World!');

      // Step 10: Delete the macro
      const deleteResult = await deleteTool.handler({
        macroId
      });
      expect(deleteResult.isError).toBe(false);
      
      const deleteData = JSON.parse(deleteResult.content[0].text);
      expect(deleteData.success).toBe(true);

      // Verify macro was deleted
      const listResult2 = await listTool.handler({});
      const listData2 = JSON.parse(listResult2.content[0].text);
      expect(listData2.macros).toHaveLength(0);

    } finally {
      // Clean up test file
      try {
        await fs.unlink(testFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it('should handle macro playback errors gracefully', { timeout: 30000 }, async () => {
    const newContextTool = createNewContextTool(sessionManager);
    const startRecordingTool = createMacroStartRecordingTool(sessionManager);
    const stopRecordingTool = createMacroStopRecordingTool(sessionManager);
    const playTool = createMacroPlayTool(sessionManager);
    const clickTool = createClickTool(sessionManager);

    // Create a session
    const contextResult = await newContextTool.handler({});
    const contextData = JSON.parse(contextResult.content[0].text);
    const sessionId = contextData.sessionId;

    // Start recording
    const startResult = await startRecordingTool.handler({
      sessionId,
      name: 'Error Test Macro'
    });
    const startData = JSON.parse(startResult.content[0].text);
    const macroId = startData.macroId;

    // Record an action that will fail during playback (non-existent element)
    await clickTool.handler({
      sessionId,
      selector: '#non-existent-element'
    }).catch(() => {}); // Ignore the error during recording

    // Stop recording
    await stopRecordingTool.handler({ sessionId });

    // Create new session for playback
    const newContextResult = await newContextTool.handler({});
    const newContextData = JSON.parse(newContextResult.content[0].text);
    const playbackSessionId = newContextData.sessionId;

    // Play back with continueOnError: false (should stop on first error)
    const playResult1 = await playTool.handler({
      sessionId: playbackSessionId,
      macroId,
      continueOnError: false
    });
    
    const playData1 = JSON.parse(playResult1.content[0].text);
    expect(playData1.success).toBe(false);
    expect(playData1.playbackResult.errors.length).toBeGreaterThan(0);

    // Play back with continueOnError: true (should continue despite errors)
    const playResult2 = await playTool.handler({
      sessionId: playbackSessionId,
      macroId,
      continueOnError: true
    });
    
    const playData2 = JSON.parse(playResult2.content[0].text);
    expect(playData2.playbackResult.errors.length).toBeGreaterThan(0);
  });

  it('should support step-by-step macro execution', { timeout: 30000 }, async () => {
    const newContextTool = createNewContextTool(sessionManager);
    const gotoTool = createGotoTool(sessionManager);
    const startRecordingTool = createMacroStartRecordingTool(sessionManager);
    const stopRecordingTool = createMacroStopRecordingTool(sessionManager);
    const playTool = createMacroPlayTool(sessionManager);

    // Create test page
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <div id="step1">Step 1</div>
          <div id="step2">Step 2</div>
        </body>
      </html>
    `;
    
    const testFile = path.join(process.cwd(), 'step-test-page.html');
    await fs.writeFile(testFile, testHtml);

    try {
      // Create session and record a simple macro
      const contextResult = await newContextTool.handler({});
      const contextData = JSON.parse(contextResult.content[0].text);
      const sessionId = contextData.sessionId;

      await gotoTool.handler({
        sessionId,
        url: `file://${testFile}`
      });

      const startResult = await startRecordingTool.handler({
        sessionId,
        name: 'Step Test Macro'
      });
      const startData = JSON.parse(startResult.content[0].text);
      const macroId = startData.macroId;

      // Record navigation to create at least one action
      await gotoTool.handler({
        sessionId,
        url: `file://${testFile}#step1`
      });

      await stopRecordingTool.handler({ sessionId });

      // Create new session for step-by-step playback
      const newContextResult = await newContextTool.handler({});
      const newContextData = JSON.parse(newContextResult.content[0].text);
      const playbackSessionId = newContextData.sessionId;

      // Start step-by-step playback
      const playResult = await playTool.handler({
        sessionId: playbackSessionId,
        macroId,
        stepByStep: true
      });

      // Note: In a real scenario, step-by-step would require manual intervention
      // This test just verifies the option is accepted
      expect(playResult.isError).toBe(false);

    } finally {
      try {
        await fs.unlink(testFile);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});