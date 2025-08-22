import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  createMacroStartRecordingTool,
  createMacroStopRecordingTool,
  createMacroListTool,
  createMacroPlayTool,
  createMacroDeleteTool
} from '../../../src/tools/macro-tools.js';
import type { SessionManager } from '../../../src/browser/session-manager.js';
import type { BrowserSession } from '../../../src/browser/browser-session.js';

// Mock session manager
const mockSession = {
  id: 'test-session',
  page: { 
    url: () => 'https://example.com',
    on: vi.fn()
  },
  options: { userAgent: 'test', viewport: { width: 1280, height: 720 } }
} as unknown as BrowserSession;

const mockSessionManager = {
  getSession: vi.fn().mockReturnValue(mockSession)
} as unknown as SessionManager;

describe('Macro Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMacroStartRecordingTool', () => {
    it('should create start recording tool with correct schema', () => {
      const tool = createMacroStartRecordingTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.macro.startRecording');
      expect(tool.description).toContain('Start recording');
      expect(tool.inputSchema.properties).toHaveProperty('sessionId');
      expect(tool.inputSchema.properties).toHaveProperty('name');
      expect(tool.inputSchema.properties).toHaveProperty('description');
      expect(tool.inputSchema.required).toContain('sessionId');
      expect(tool.inputSchema.required).toContain('name');
    });

    it('should start recording successfully', async () => {
      const tool = createMacroStartRecordingTool(mockSessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session',
        name: 'Test Macro',
        description: 'Test description'
      });
      
      if (result.isError) {
        console.log('Error result:', result.content[0].text);
      }
      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.macroId).toBeDefined();
      expect(content.name).toBe('Test Macro');
    });

    it('should return error for missing sessionId', async () => {
      const tool = createMacroStartRecordingTool(mockSessionManager);
      
      const result = await tool.handler({
        name: 'Test Macro'
      });
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('sessionId is required');
    });

    it('should return error for missing name', async () => {
      const tool = createMacroStartRecordingTool(mockSessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session'
      });
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('name is required');
    });

    it('should return error for non-existent session', async () => {
      const mockSessionManagerNoSession = {
        getSession: vi.fn().mockReturnValue(null)
      } as unknown as SessionManager;
      
      const tool = createMacroStartRecordingTool(mockSessionManagerNoSession);
      
      const result = await tool.handler({
        sessionId: 'non-existent',
        name: 'Test Macro'
      });
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('not found or has expired');
    });
  });

  describe('createMacroStopRecordingTool', () => {
    it('should create stop recording tool with correct schema', () => {
      const tool = createMacroStopRecordingTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.macro.stopRecording');
      expect(tool.description).toContain('Stop recording');
      expect(tool.inputSchema.properties).toHaveProperty('sessionId');
      expect(tool.inputSchema.required).toContain('sessionId');
    });

    it('should return error for missing sessionId', async () => {
      const tool = createMacroStopRecordingTool(mockSessionManager);
      
      const result = await tool.handler({});
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('sessionId is required');
    });
  });

  describe('createMacroListTool', () => {
    it('should create list tool with correct schema', () => {
      const tool = createMacroListTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.macro.list');
      expect(tool.description).toContain('List all saved macros');
      expect(tool.inputSchema.properties).toHaveProperty('sessionId');
      expect(tool.inputSchema.required).toHaveLength(0); // sessionId is optional
    });

    it('should list macros successfully', async () => {
      const tool = createMacroListTool(mockSessionManager);
      
      const result = await tool.handler({});
      
      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.macros).toBeDefined();
      expect(Array.isArray(content.macros)).toBe(true);
    });
  });

  describe('createMacroPlayTool', () => {
    it('should create play tool with correct schema', () => {
      const tool = createMacroPlayTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.macro.play');
      expect(tool.description).toContain('Play back a recorded macro');
      expect(tool.inputSchema.properties).toHaveProperty('sessionId');
      expect(tool.inputSchema.properties).toHaveProperty('macroId');
      expect(tool.inputSchema.properties).toHaveProperty('stepByStep');
      expect(tool.inputSchema.properties).toHaveProperty('delayBetweenActions');
      expect(tool.inputSchema.properties).toHaveProperty('continueOnError');
      expect(tool.inputSchema.required).toContain('sessionId');
      expect(tool.inputSchema.required).toContain('macroId');
    });

    it('should return error for missing sessionId', async () => {
      const tool = createMacroPlayTool(mockSessionManager);
      
      const result = await tool.handler({
        macroId: 'test-macro'
      });
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('sessionId is required');
    });

    it('should return error for missing macroId', async () => {
      const tool = createMacroPlayTool(mockSessionManager);
      
      const result = await tool.handler({
        sessionId: 'test-session'
      });
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('macroId is required');
    });
  });

  describe('createMacroDeleteTool', () => {
    it('should create delete tool with correct schema', () => {
      const tool = createMacroDeleteTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.macro.delete');
      expect(tool.description).toContain('Delete a saved macro');
      expect(tool.inputSchema.properties).toHaveProperty('macroId');
      expect(tool.inputSchema.required).toContain('macroId');
    });

    it('should return error for missing macroId', async () => {
      const tool = createMacroDeleteTool(mockSessionManager);
      
      const result = await tool.handler({});
      
      expect(result.isError).toBe(true);
      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(false);
      expect(content.error.message).toContain('macroId is required');
    });
  });
});