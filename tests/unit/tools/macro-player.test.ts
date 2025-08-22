import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MacroPlayer } from '../../../src/tools/macro-player.js';
import type { BrowserSession } from '../../../src/browser/browser-session.js';
import type { MacroStorage, MacroRecording } from '../../../src/types/macro-types.js';

// Mock storage
const mockStorage: MacroStorage = {
  saveMacro: vi.fn(),
  getMacro: vi.fn(),
  listMacros: vi.fn(),
  deleteMacro: vi.fn(),
  updateMacro: vi.fn()
};

// Mock page element
const mockElement = {
  click: vi.fn(),
  fill: vi.fn(),
  selectOption: vi.fn()
};

// Mock browser session
const mockSession = {
  id: 'test-session',
  page: {
    goto: vi.fn(),
    waitForSelector: vi.fn().mockResolvedValue(mockElement),
    evaluate: vi.fn()
  },
  updateActivity: vi.fn()
} as unknown as BrowserSession;

const createTestMacro = (): MacroRecording => ({
  id: 'test-macro',
  name: 'Test Macro',
  sessionId: 'test-session',
  startTime: new Date(),
  actions: [
    {
      id: 'action-1',
      type: 'navigation',
      timestamp: new Date(),
      url: 'https://example.com'
    },
    {
      id: 'action-2',
      type: 'click',
      timestamp: new Date(),
      selector: '#button'
    },
    {
      id: 'action-3',
      type: 'type',
      timestamp: new Date(),
      selector: '#input',
      text: 'test text'
    }
  ],
  isActive: false,
  metadata: {}
});

describe('MacroPlayer', () => {
  let player: MacroPlayer;

  beforeEach(() => {
    vi.clearAllMocks();
    player = new MacroPlayer(mockStorage);
  });

  describe('playMacro', () => {
    it('should play a macro successfully', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      const result = await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id
      });
      
      expect(result.success).toBe(true);
      expect(result.executedActions).toBe(3);
      expect(result.totalActions).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(result.isComplete).toBe(true);
      
      // Verify actions were executed
      expect(mockSession.page.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'networkidle' });
      expect(mockElement.click).toHaveBeenCalled();
      expect(mockElement.fill).toHaveBeenCalledWith('test text');
    });

    it('should throw error if macro not found', async () => {
      mockStorage.getMacro = vi.fn().mockResolvedValue(null);
      
      await expect(
        player.playMacro(mockSession, {
          sessionId: mockSession.id,
          macroId: 'non-existent'
        })
      ).rejects.toThrow('Macro non-existent not found');
    });

    it('should throw error if session is already playing', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      // Start first playback
      const playPromise = player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id
      });
      
      // Try to start second playback
      await expect(
        player.playMacro(mockSession, {
          sessionId: mockSession.id,
          macroId: macro.id
        })
      ).rejects.toThrow('Session test-session is already playing a macro');
      
      await playPromise;
    });

    it('should handle action execution errors', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      mockSession.page.goto = vi.fn().mockRejectedValue(new Error('Navigation failed'));
      
      const result = await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        continueOnError: true
      });
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Navigation failed');
      expect(result.errors[0].actionType).toBe('navigation');
    });

    it('should stop on first error when continueOnError is false', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      mockSession.page.goto = vi.fn().mockRejectedValue(new Error('Navigation failed'));
      
      const result = await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        continueOnError: false
      });
      
      expect(result.success).toBe(false);
      expect(result.executedActions).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.isComplete).toBe(false);
    });

    it('should respect startFromStep and endAtStep options', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      const result = await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        startFromStep: 1,
        endAtStep: 2
      });
      
      expect(result.executedActions).toBe(1);
      expect(result.totalActions).toBe(1);
      
      // Should only execute the click action (index 1)
      expect(mockSession.page.goto).not.toHaveBeenCalled();
      expect(mockElement.click).toHaveBeenCalled();
      expect(mockElement.fill).not.toHaveBeenCalled();
    });

    it('should add delay between actions when specified', async () => {
      const macro = {
        ...createTestMacro(),
        actions: [
          {
            id: 'action-1',
            type: 'wait' as const,
            timestamp: new Date(),
            waitTime: 100
          }
        ]
      };
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      const startTime = Date.now();
      await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        delayBetweenActions: 50
      });
      const endTime = Date.now();
      
      // Should have waited at least 100ms for the wait action plus 50ms delay
      expect(endTime - startTime).toBeGreaterThanOrEqual(140);
    });
  });

  describe('pausePlayback', () => {
    it('should pause active playback', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      // Start playback
      const playPromise = player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        stepByStep: true
      });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const paused = player.pausePlayback(mockSession.id);
      expect(paused).toBe(true);
      
      const state = player.getPlaybackState(mockSession.id);
      expect(state?.isPaused).toBe(true);
      
      // Stop the playback to clean up
      player.stopPlayback(mockSession.id);
      await playPromise.catch(() => {}); // Ignore errors from stopping
    });

    it('should return false if no playback is active', () => {
      const paused = player.pausePlayback(mockSession.id);
      expect(paused).toBe(false);
    });
  });

  describe('resumePlayback', () => {
    it('should resume paused playback', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      // Start playback
      const playPromise = player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        stepByStep: true
      });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      player.pausePlayback(mockSession.id);
      const resumed = player.resumePlayback(mockSession.id);
      expect(resumed).toBe(true);
      
      const state = player.getPlaybackState(mockSession.id);
      expect(state?.isPaused).toBe(false);
      
      // Stop the playback to clean up
      player.stopPlayback(mockSession.id);
      await playPromise.catch(() => {}); // Ignore errors from stopping
    });

    it('should return false if no playback is active', () => {
      const resumed = player.resumePlayback(mockSession.id);
      expect(resumed).toBe(false);
    });
  });

  describe('stopPlayback', () => {
    it('should stop active playback', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      // Start playback
      const playPromise = player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        stepByStep: true
      });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const stopped = player.stopPlayback(mockSession.id);
      expect(stopped).toBe(true);
      
      expect(player.isPlaying(mockSession.id)).toBe(false);
      
      await playPromise.catch(() => {}); // Ignore errors from stopping
    });

    it('should return false if no playback is active', () => {
      const stopped = player.stopPlayback(mockSession.id);
      expect(stopped).toBe(false);
    });
  });

  describe('isPlaying', () => {
    it('should return false when not playing', () => {
      expect(player.isPlaying(mockSession.id)).toBe(false);
    });

    it('should return true when playing', async () => {
      const macro = createTestMacro();
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      const playPromise = player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id,
        stepByStep: true
      });
      
      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(player.isPlaying(mockSession.id)).toBe(true);
      
      player.stopPlayback(mockSession.id);
      await playPromise.catch(() => {});
    });
  });

  describe('action execution', () => {
    it('should execute navigation action', async () => {
      const macro = {
        ...createTestMacro(),
        actions: [{
          id: 'nav',
          type: 'navigation' as const,
          timestamp: new Date(),
          url: 'https://test.com'
        }]
      };
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id
      });
      
      expect(mockSession.page.goto).toHaveBeenCalledWith('https://test.com', { waitUntil: 'networkidle' });
    });

    it('should execute wait action', async () => {
      const macro = {
        ...createTestMacro(),
        actions: [{
          id: 'wait',
          type: 'wait' as const,
          timestamp: new Date(),
          waitTime: 100
        }]
      };
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      const startTime = Date.now();
      await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id
      });
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some timing variance
    });

    it('should execute eval action', async () => {
      const macro = {
        ...createTestMacro(),
        actions: [{
          id: 'eval',
          type: 'eval' as const,
          timestamp: new Date(),
          code: 'console.log("test")'
        }]
      };
      mockStorage.getMacro = vi.fn().mockResolvedValue(macro);
      
      await player.playMacro(mockSession, {
        sessionId: mockSession.id,
        macroId: macro.id
      });
      
      expect(mockSession.page.evaluate).toHaveBeenCalledWith('console.log("test")');
    });
  });
});