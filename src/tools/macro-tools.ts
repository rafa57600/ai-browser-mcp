import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { MacroRecorder } from './macro-recorder.js';
import { MacroPlayer } from './macro-player.js';
import { FileMacroStorage } from './macro-storage.js';
import type { MacroPlaybackOptions } from '../types/macro-types.js';

// Lazy initialization to avoid circular imports
let macroStorage: FileMacroStorage | null = null;
let macroRecorder: MacroRecorder | null = null;
let macroPlayer: MacroPlayer | null = null;

function initializeMacroComponents() {
  if (!macroStorage) {
    macroStorage = new FileMacroStorage();
    macroRecorder = new MacroRecorder(macroStorage);
    macroPlayer = new MacroPlayer(macroStorage);
  }
  return { macroStorage, macroRecorder, macroPlayer };
}

/**
 * Creates the browser.macro.startRecording tool
 */
export function createMacroStartRecordingTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.macro.startRecording',
    description: 'Start recording a new macro for browser interactions',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to record'
        },
        name: {
          type: 'string',
          description: 'Name for the macro recording'
        },
        description: {
          type: 'string',
          description: 'Optional description of what the macro does'
        }
      },
      required: ['sessionId', 'name'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const name = args.name as string;
        const description = args.description as string | undefined;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!name || typeof name !== 'string') {
          throw new Error('name is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const { macroRecorder: recorder } = initializeMacroComponents();
        const macroId = await recorder!.startRecording(session, name, description);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                macroId,
                sessionId,
                name,
                description,
                startTime: new Date().toISOString(),
                message: 'Macro recording started successfully'
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'macro',
                  message: errorMessage,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}

/**
 * Creates the browser.macro.stopRecording tool
 */
export function createMacroStopRecordingTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.macro.stopRecording',
    description: 'Stop recording the current macro and save it',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to stop recording'
        }
      },
      required: ['sessionId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const { macroRecorder: recorder } = initializeMacroComponents();
        const recording = await recorder!.stopRecording(sessionId);
        if (!recording) {
          throw new Error(`No active recording found for session '${sessionId}'`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                macroId: recording.id,
                sessionId,
                name: recording.name,
                actionsRecorded: recording.actions.length,
                startTime: recording.startTime.toISOString(),
                endTime: recording.endTime?.toISOString(),
                duration: recording.endTime ? 
                  recording.endTime.getTime() - recording.startTime.getTime() : 0,
                message: 'Macro recording stopped and saved successfully'
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'macro',
                  message: errorMessage,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}

/**
 * Creates the browser.macro.list tool
 */
export function createMacroListTool(_sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.macro.list',
    description: 'List all saved macros, optionally filtered by session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Optional session ID to filter macros'
        }
      },
      required: [],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string | undefined;

        const { macroStorage: storage } = initializeMacroComponents();
        const macros = await storage!.listMacros(sessionId);

        const macroSummaries = macros.map(macro => ({
          id: macro.id,
          name: macro.name,
          sessionId: macro.sessionId,
          startTime: macro.startTime.toISOString(),
          endTime: macro.endTime?.toISOString(),
          actionsCount: macro.actions.length,
          description: macro.metadata.description,
          startUrl: macro.metadata.startUrl
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                macros: macroSummaries,
                totalCount: macros.length,
                filteredBySession: sessionId || null,
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ],
          isError: false
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'macro',
                  message: errorMessage,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}

/**
 * Creates the browser.macro.play tool
 */
export function createMacroPlayTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.macro.play',
    description: 'Play back a recorded macro in a browser session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to play the macro in'
        },
        macroId: {
          type: 'string',
          description: 'ID of the macro to play'
        },
        stepByStep: {
          type: 'boolean',
          default: false,
          description: 'Whether to execute the macro step by step'
        },
        delayBetweenActions: {
          type: 'number',
          minimum: 0,
          maximum: 10000,
          description: 'Delay in milliseconds between actions'
        },
        continueOnError: {
          type: 'boolean',
          default: false,
          description: 'Whether to continue execution if an action fails'
        },
        startFromStep: {
          type: 'number',
          minimum: 0,
          description: 'Step index to start execution from'
        },
        endAtStep: {
          type: 'number',
          minimum: 0,
          description: 'Step index to end execution at'
        }
      },
      required: ['sessionId', 'macroId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const macroId = args.macroId as string;
        const stepByStep = args.stepByStep as boolean | undefined;
        const delayBetweenActions = args.delayBetweenActions as number | undefined;
        const continueOnError = args.continueOnError as boolean | undefined;
        const startFromStep = args.startFromStep as number | undefined;
        const endAtStep = args.endAtStep as number | undefined;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!macroId || typeof macroId !== 'string') {
          throw new Error('macroId is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const options: MacroPlaybackOptions = {
          sessionId,
          macroId,
          ...(stepByStep !== undefined && { stepByStep }),
          ...(delayBetweenActions !== undefined && { delayBetweenActions }),
          ...(continueOnError !== undefined && { continueOnError }),
          ...(startFromStep !== undefined && { startFromStep }),
          ...(endAtStep !== undefined && { endAtStep })
        };

        const { macroPlayer: player } = initializeMacroComponents();
        const result = await player!.playMacro(session, options);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: result.success,
                playbackResult: result,
                message: result.success ? 
                  'Macro played successfully' : 
                  `Macro execution completed with ${result.errors.length} errors`
              }, null, 2)
            }
          ],
          isError: !result.success
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'macro',
                  message: errorMessage,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}

/**
 * Creates the browser.macro.delete tool
 */
export function createMacroDeleteTool(_sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.macro.delete',
    description: 'Delete a saved macro',
    inputSchema: {
      type: 'object',
      properties: {
        macroId: {
          type: 'string',
          description: 'ID of the macro to delete'
        }
      },
      required: ['macroId'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const macroId = args.macroId as string;

        if (!macroId || typeof macroId !== 'string') {
          throw new Error('macroId is required and must be a string');
        }

        const { macroStorage: storage } = initializeMacroComponents();
        const deleted = await storage!.deleteMacro(macroId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: deleted,
                macroId,
                message: deleted ? 
                  'Macro deleted successfully' : 
                  'Macro not found or already deleted',
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ],
          isError: !deleted
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'macro',
                  message: errorMessage,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  };
}

// Export function to get macro components for use in other tools
export function getMacroComponents() {
  return initializeMacroComponents();
}