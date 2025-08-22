// Macro recording and playback types

export interface MacroAction {
  id: string;
  type: 'navigation' | 'click' | 'type' | 'select' | 'wait' | 'eval';
  timestamp: Date;
  selector?: string;
  url?: string;
  text?: string;
  value?: string;
  code?: string;
  waitTime?: number;
  position?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface MacroRecording {
  id: string;
  name: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  actions: MacroAction[];
  isActive: boolean;
  metadata: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    startUrl?: string;
    description?: string;
  };
}

export interface MacroPlaybackOptions {
  sessionId: string;
  macroId: string;
  stepByStep?: boolean;
  delayBetweenActions?: number;
  continueOnError?: boolean;
  startFromStep?: number;
  endAtStep?: number;
}

export interface MacroPlaybackResult {
  success: boolean;
  macroId: string;
  sessionId: string;
  executedActions: number;
  totalActions: number;
  startTime: Date;
  endTime: Date;
  duration: number;
  errors: MacroPlaybackError[];
  currentStep?: number;
  isComplete: boolean;
}

export interface MacroPlaybackError {
  actionId: string;
  actionIndex: number;
  error: string;
  timestamp: Date;
  actionType: string;
  selector?: string;
}

export interface MacroStorage {
  saveMacro(macro: MacroRecording): Promise<void>;
  getMacro(macroId: string): Promise<MacroRecording | null>;
  listMacros(sessionId?: string): Promise<MacroRecording[]>;
  deleteMacro(macroId: string): Promise<boolean>;
  updateMacro(macroId: string, updates: Partial<MacroRecording>): Promise<boolean>;
}

export interface MacroPlaybackState {
  macroId: string;
  sessionId: string;
  currentStep: number;
  isActive: boolean;
  isPaused: boolean;
  startTime: Date;
  errors: MacroPlaybackError[];
  options: MacroPlaybackOptions;
}