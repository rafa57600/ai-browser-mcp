import type { BrowserSession } from '../browser/browser-session.js';
import type { 
  MacroRecording, 
  MacroAction, 
  MacroPlaybackOptions, 
  MacroPlaybackResult, 
  MacroPlaybackError,
  MacroPlaybackState,
  MacroStorage 
} from '../types/macro-types.js';

/**
 * Macro player that can replay recorded browser interactions
 */
export class MacroPlayer {
  private activePlaybacks = new Map<string, MacroPlaybackState>();
  private storage: MacroStorage;

  constructor(storage: MacroStorage) {
    this.storage = storage;
  }

  /**
   * Starts playing back a macro
   */
  async playMacro(
    session: BrowserSession,
    options: MacroPlaybackOptions
  ): Promise<MacroPlaybackResult> {
    const macro = await this.storage.getMacro(options.macroId);
    if (!macro) {
      throw new Error(`Macro ${options.macroId} not found`);
    }

    if (this.isPlaying(session.id)) {
      throw new Error(`Session ${session.id} is already playing a macro`);
    }

    const startTime = new Date();
    const playbackState: MacroPlaybackState = {
      macroId: options.macroId,
      sessionId: session.id,
      currentStep: options.startFromStep || 0,
      isActive: true,
      isPaused: false,
      startTime,
      errors: [],
      options
    };

    this.activePlaybacks.set(session.id, playbackState);

    try {
      const result = await this.executePlayback(session, macro, playbackState);
      this.activePlaybacks.delete(session.id);
      return result;
    } catch (error) {
      this.activePlaybacks.delete(session.id);
      throw error;
    }
  }

  /**
   * Pauses macro playback
   */
  pausePlayback(sessionId: string): boolean {
    const playback = this.activePlaybacks.get(sessionId);
    if (!playback || !playback.isActive) {
      return false;
    }

    playback.isPaused = true;
    return true;
  }

  /**
   * Resumes macro playback
   */
  resumePlayback(sessionId: string): boolean {
    const playback = this.activePlaybacks.get(sessionId);
    if (!playback || !playback.isActive || !playback.isPaused) {
      return false;
    }

    playback.isPaused = false;
    return true;
  }

  /**
   * Stops macro playback
   */
  stopPlayback(sessionId: string): boolean {
    const playback = this.activePlaybacks.get(sessionId);
    if (!playback) {
      return false;
    }

    playback.isActive = false;
    this.activePlaybacks.delete(sessionId);
    return true;
  }

  /**
   * Checks if a session is currently playing a macro
   */
  isPlaying(sessionId: string): boolean {
    return this.activePlaybacks.has(sessionId);
  }

  /**
   * Gets the current playback state for a session
   */
  getPlaybackState(sessionId: string): MacroPlaybackState | null {
    return this.activePlaybacks.get(sessionId) || null;
  }

  /**
   * Executes the macro playback
   */
  private async executePlayback(
    session: BrowserSession,
    macro: MacroRecording,
    state: MacroPlaybackState
  ): Promise<MacroPlaybackResult> {
    const startIndex = state.options.startFromStep || 0;
    const endIndex = state.options.endAtStep || macro.actions.length;
    const actions = macro.actions.slice(startIndex, endIndex);

    let executedActions = 0;
    const errors: MacroPlaybackError[] = [];

    for (let i = 0; i < actions.length && state.isActive; i++) {
      const action = actions[i];
      const actionIndex = startIndex + i;
      
      state.currentStep = actionIndex;

      // Handle step-by-step mode
      if (state.options.stepByStep) {
        // In step-by-step mode, we pause after each action
        // The caller needs to call resumePlayback() to continue
        state.isPaused = true;
        
        // Wait for resume or stop
        while (state.isPaused && state.isActive) {
          await this.sleep(100);
        }
        
        if (!state.isActive) {
          break;
        }
      }

      // Add delay between actions if specified
      if (state.options.delayBetweenActions && state.options.delayBetweenActions > 0) {
        await this.sleep(state.options.delayBetweenActions);
      }

      try {
        await this.executeAction(session, action);
        executedActions++;
      } catch (error) {
        const playbackError: MacroPlaybackError = {
          actionId: action.id,
          actionIndex,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          actionType: action.type,
          ...(action.selector && { selector: action.selector })
        };

        errors.push(playbackError);
        state.errors.push(playbackError);

        if (!state.options.continueOnError) {
          state.isActive = false;
          break;
        }
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - state.startTime.getTime();

    return {
      success: errors.length === 0,
      macroId: macro.id,
      sessionId: session.id,
      executedActions,
      totalActions: actions.length,
      startTime: state.startTime,
      endTime,
      duration,
      errors,
      currentStep: state.currentStep,
      isComplete: executedActions === actions.length
    };
  }

  /**
   * Executes a single macro action
   */
  private async executeAction(session: BrowserSession, action: MacroAction): Promise<void> {
    const page = session.page;

    switch (action.type) {
      case 'navigation':
        if (!action.url) {
          throw new Error('Navigation action missing URL');
        }
        await page.goto(action.url, { waitUntil: 'networkidle' });
        break;

      case 'click':
        if (!action.selector) {
          throw new Error('Click action missing selector');
        }
        const clickElement = await page.waitForSelector(action.selector, { timeout: 30000 });
        if (!clickElement) {
          throw new Error(`Element not found: ${action.selector}`);
        }
        
        const clickOptions: any = {};
        if (action.position) {
          clickOptions.position = action.position;
        }
        
        await clickElement.click(clickOptions);
        break;

      case 'type':
        if (!action.selector || action.text === undefined) {
          throw new Error('Type action missing selector or text');
        }
        const typeElement = await page.waitForSelector(action.selector, { timeout: 30000 });
        if (!typeElement) {
          throw new Error(`Element not found: ${action.selector}`);
        }
        await typeElement.fill(action.text);
        break;

      case 'select':
        if (!action.selector || !action.value) {
          throw new Error('Select action missing selector or value');
        }
        const selectElement = await page.waitForSelector(action.selector, { timeout: 30000 });
        if (!selectElement) {
          throw new Error(`Element not found: ${action.selector}`);
        }
        await selectElement.selectOption({ value: action.value });
        break;

      case 'wait':
        if (!action.waitTime) {
          throw new Error('Wait action missing waitTime');
        }
        await this.sleep(action.waitTime);
        break;

      case 'eval':
        if (!action.code) {
          throw new Error('Eval action missing code');
        }
        await page.evaluate(action.code);
        break;

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }

    // Update session activity
    session.updateActivity();
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}