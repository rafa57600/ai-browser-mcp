import { randomUUID } from 'crypto';
import type { BrowserSession } from '../browser/browser-session.js';
import type { MacroRecording, MacroAction, MacroStorage } from '../types/macro-types.js';

/**
 * Macro recorder that captures browser interactions
 */
export class MacroRecorder {
  private activeRecordings = new Map<string, MacroRecording>();
  private storage: MacroStorage;

  constructor(storage: MacroStorage) {
    this.storage = storage;
  }

  /**
   * Starts recording a new macro for the given session
   */
  async startRecording(
    session: BrowserSession,
    name: string,
    description?: string
  ): Promise<string> {
    if (this.isRecording(session.id)) {
      throw new Error(`Session ${session.id} is already recording a macro`);
    }

    const macroId = randomUUID();
    const currentUrl = session.page.url();
    
    const recording: MacroRecording = {
      id: macroId,
      name,
      sessionId: session.id,
      startTime: new Date(),
      actions: [],
      isActive: true,
      metadata: {
        ...(session.options.userAgent && { userAgent: session.options.userAgent }),
        ...(session.options.viewport && { viewport: session.options.viewport }),
        startUrl: currentUrl,
        ...(description && { description })
      }
    };

    this.activeRecordings.set(session.id, recording);

    // Set up event listeners to capture interactions
    this.setupRecordingListeners(session);

    return macroId;
  }

  /**
   * Stops recording and saves the macro
   */
  async stopRecording(sessionId: string): Promise<MacroRecording | null> {
    const recording = this.activeRecordings.get(sessionId);
    if (!recording) {
      return null;
    }

    recording.isActive = false;
    recording.endTime = new Date();

    // Save to storage
    await this.storage.saveMacro(recording);

    // Remove from active recordings
    this.activeRecordings.delete(sessionId);

    return recording;
  }

  /**
   * Checks if a session is currently recording
   */
  isRecording(sessionId: string): boolean {
    return this.activeRecordings.has(sessionId);
  }

  /**
   * Gets the current recording for a session
   */
  getCurrentRecording(sessionId: string): MacroRecording | null {
    return this.activeRecordings.get(sessionId) || null;
  }

  /**
   * Manually adds an action to the current recording
   */
  recordAction(sessionId: string, action: Omit<MacroAction, 'id' | 'timestamp'>): void {
    const recording = this.activeRecordings.get(sessionId);
    if (!recording || !recording.isActive) {
      return;
    }

    const macroAction: MacroAction = {
      ...action,
      id: randomUUID(),
      timestamp: new Date()
    };

    recording.actions.push(macroAction);
  }

  /**
   * Records a navigation action
   */
  recordNavigation(sessionId: string, url: string): void {
    this.recordAction(sessionId, {
      type: 'navigation',
      url
    });
  }

  /**
   * Records a click action
   */
  recordClick(sessionId: string, selector: string, position?: { x: number; y: number }): void {
    this.recordAction(sessionId, {
      type: 'click',
      selector,
      ...(position && { position })
    });
  }

  /**
   * Records a type action
   */
  recordType(sessionId: string, selector: string, text: string): void {
    this.recordAction(sessionId, {
      type: 'type',
      selector,
      text
    });
  }

  /**
   * Records a select action
   */
  recordSelect(sessionId: string, selector: string, value: string): void {
    this.recordAction(sessionId, {
      type: 'select',
      selector,
      value
    });
  }

  /**
   * Records a wait action
   */
  recordWait(sessionId: string, waitTime: number): void {
    this.recordAction(sessionId, {
      type: 'wait',
      waitTime
    });
  }

  /**
   * Records a JavaScript evaluation action
   */
  recordEval(sessionId: string, code: string): void {
    this.recordAction(sessionId, {
      type: 'eval',
      code
    });
  }

  /**
   * Sets up event listeners to automatically capture browser interactions
   */
  private setupRecordingListeners(session: BrowserSession): void {
    const page = session.page;

    // Record page navigations
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.recordNavigation(session.id, frame.url());
      }
    });

    // Note: Playwright doesn't provide direct events for clicks, types, etc.
    // These will need to be recorded manually when the corresponding tools are called
    // This is handled in the tool implementations
  }
}