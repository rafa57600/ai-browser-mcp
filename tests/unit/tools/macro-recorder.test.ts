import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MacroRecorder } from '../../../src/tools/macro-recorder.js';
import type { BrowserSession } from '../../../src/browser/browser-session.js';
import type { MacroStorage } from '../../../src/types/macro-types.js';

// Mock storage
const mockStorage: MacroStorage = {
  saveMacro: vi.fn(),
  getMacro: vi.fn(),
  listMacros: vi.fn(),
  deleteMacro: vi.fn(),
  updateMacro: vi.fn()
};

// Mock browser session
const mockSession = {
  id: 'test-session',
  page: {
    url: () => 'https://example.com',
    on: vi.fn()
  },
  options: {
    userAgent: 'test-agent',
    viewport: { width: 1280, height: 720 }
  }
} as unknown as BrowserSession;

describe('MacroRecorder', () => {
  let recorder: MacroRecorder;

  beforeEach(() => {
    vi.clearAllMocks();
    recorder = new MacroRecorder(mockStorage);
  });

  describe('startRecording', () => {
    it('should start recording a new macro', async () => {
      const macroId = await recorder.startRecording(mockSession, 'Test Macro', 'Test description');
      
      expect(macroId).toBeDefined();
      expect(typeof macroId).toBe('string');
      expect(recorder.isRecording(mockSession.id)).toBe(true);
    });

    it('should throw error if session is already recording', async () => {
      await recorder.startRecording(mockSession, 'Test Macro 1');
      
      await expect(
        recorder.startRecording(mockSession, 'Test Macro 2')
      ).rejects.toThrow('Session test-session is already recording a macro');
    });

    it('should create recording with correct metadata', async () => {
      const macroId = await recorder.startRecording(mockSession, 'Test Macro', 'Test description');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording).not.toBeNull();
      expect(recording!.name).toBe('Test Macro');
      expect(recording!.sessionId).toBe(mockSession.id);
      expect(recording!.metadata.description).toBe('Test description');
      expect(recording!.metadata.startUrl).toBe('https://example.com');
      expect(recording!.isActive).toBe(true);
    });
  });

  describe('stopRecording', () => {
    it('should stop recording and save macro', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      const result = await recorder.stopRecording(mockSession.id);
      
      expect(result).not.toBeNull();
      expect(result!.isActive).toBe(false);
      expect(result!.endTime).toBeDefined();
      expect(mockStorage.saveMacro).toHaveBeenCalledWith(result);
      expect(recorder.isRecording(mockSession.id)).toBe(false);
    });

    it('should return null if no recording is active', async () => {
      const result = await recorder.stopRecording(mockSession.id);
      
      expect(result).toBeNull();
    });
  });

  describe('recordAction', () => {
    it('should record navigation action', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      recorder.recordNavigation(mockSession.id, 'https://example.com/page');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording!.actions).toHaveLength(1);
      expect(recording!.actions[0].type).toBe('navigation');
      expect(recording!.actions[0].url).toBe('https://example.com/page');
    });

    it('should record click action', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      recorder.recordClick(mockSession.id, '#button', { x: 10, y: 20 });
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording!.actions).toHaveLength(1);
      expect(recording!.actions[0].type).toBe('click');
      expect(recording!.actions[0].selector).toBe('#button');
      expect(recording!.actions[0].position).toEqual({ x: 10, y: 20 });
    });

    it('should record type action', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      recorder.recordType(mockSession.id, '#input', 'test text');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording!.actions).toHaveLength(1);
      expect(recording!.actions[0].type).toBe('type');
      expect(recording!.actions[0].selector).toBe('#input');
      expect(recording!.actions[0].text).toBe('test text');
    });

    it('should record select action', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      recorder.recordSelect(mockSession.id, '#select', 'option1');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording!.actions).toHaveLength(1);
      expect(recording!.actions[0].type).toBe('select');
      expect(recording!.actions[0].selector).toBe('#select');
      expect(recording!.actions[0].value).toBe('option1');
    });

    it('should record eval action', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      recorder.recordEval(mockSession.id, 'console.log("test")');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording!.actions).toHaveLength(1);
      expect(recording!.actions[0].type).toBe('eval');
      expect(recording!.actions[0].code).toBe('console.log("test")');
    });

    it('should record wait action', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      recorder.recordWait(mockSession.id, 1000);
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording!.actions).toHaveLength(1);
      expect(recording!.actions[0].type).toBe('wait');
      expect(recording!.actions[0].waitTime).toBe(1000);
    });

    it('should not record actions when not recording', async () => {
      recorder.recordClick(mockSession.id, '#button');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording).toBeNull();
    });

    it('should not record actions when recording is inactive', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      await recorder.stopRecording(mockSession.id);
      
      recorder.recordClick(mockSession.id, '#button');
      
      // Should not add to the stopped recording
      expect(mockStorage.saveMacro).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRecording', () => {
    it('should return false when not recording', () => {
      expect(recorder.isRecording(mockSession.id)).toBe(false);
    });

    it('should return true when recording', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      expect(recorder.isRecording(mockSession.id)).toBe(true);
    });

    it('should return false after stopping recording', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      await recorder.stopRecording(mockSession.id);
      
      expect(recorder.isRecording(mockSession.id)).toBe(false);
    });
  });

  describe('getCurrentRecording', () => {
    it('should return null when not recording', () => {
      expect(recorder.getCurrentRecording(mockSession.id)).toBeNull();
    });

    it('should return current recording when active', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      
      const recording = recorder.getCurrentRecording(mockSession.id);
      expect(recording).not.toBeNull();
      expect(recording!.name).toBe('Test Macro');
      expect(recording!.isActive).toBe(true);
    });

    it('should return null after stopping recording', async () => {
      await recorder.startRecording(mockSession, 'Test Macro');
      await recorder.stopRecording(mockSession.id);
      
      expect(recorder.getCurrentRecording(mockSession.id)).toBeNull();
    });
  });
});