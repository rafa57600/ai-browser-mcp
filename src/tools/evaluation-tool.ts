import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { getMacroComponents } from './macro-tools.js';

/**
 * Serializes JavaScript values to JSON-safe format
 * Handles non-serializable objects like functions, DOM elements, etc.
 */
function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      __type: 'Error',
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === 'function') {
    return {
      __type: 'Function',
      name: value.name || 'anonymous',
      toString: value.toString()
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeValue(item));
  }

  if (typeof value === 'object') {
    // Handle DOM elements and other non-plain objects
    if (value.constructor && value.constructor.name !== 'Object') {
      return {
        __type: value.constructor.name,
        toString: value.toString()
      };
    }

    // Handle plain objects
    const serialized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      try {
        serialized[key] = serializeValue(val);
      } catch (error) {
        serialized[key] = {
          __type: 'SerializationError',
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
    return serialized;
  }

  // Fallback for other types
  return {
    __type: typeof value,
    toString: String(value)
  };
}

/**
 * Creates the browser.eval tool for executing JavaScript code in the browser context
 */
export function createEvalTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.eval',
    description: 'Execute JavaScript code in the browser context and return JSON-serializable results',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to use for JavaScript execution'
        },
        code: {
          type: 'string',
          description: 'JavaScript code to execute in the browser context'
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          default: 30000,
          description: 'Timeout in milliseconds for JavaScript execution (overrides session default)'
        },
        returnByValue: {
          type: 'boolean',
          default: true,
          description: 'Whether to return the result by value (serialized) or by reference'
        }
      },
      required: ['sessionId', 'code'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const code = args.code as string;
        const timeout = (args.timeout as number) || 30000;
        const returnByValue = args.returnByValue !== false; // Default to true

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!code || typeof code !== 'string') {
          throw new Error('code is required and must be a string');
        }

        if (code.trim().length === 0) {
          throw new Error('code cannot be empty');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const startTime = Date.now();

        try {
          // Security check: prevent access to sensitive browser APIs
          const forbiddenPatterns = [
            /require\s*\(/,
            /import\s+.*\s+from/,
            /process\./,
            /global\./,
            /__dirname/,
            /__filename/,
            /fs\./,
            /child_process/
          ];

          const hasForbiddenCode = forbiddenPatterns.some(pattern => pattern.test(code));
          if (hasForbiddenCode) {
            throw new Error('Code contains forbidden patterns that could access sensitive APIs');
          }

          // Execute JavaScript code in the browser context with timeout
          let result: unknown;
          
          // Create a timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`JavaScript execution timed out after ${timeout}ms`));
            }, timeout);
          });
          
          if (returnByValue) {
            // Execute and return by value (serialized)
            const evalPromise = session.page.evaluate((codeToExecute: string) => {
              try {
                // Execute the code and return the result
                const evalResult = eval(codeToExecute);
                return evalResult;
              } catch (error) {
                // Re-throw the error to be caught by Playwright
                throw error;
              }
            }, code);
            
            result = await Promise.race([evalPromise, timeoutPromise]);
          } else {
            // Execute and return by reference (for complex objects)
            const handlePromise = session.page.evaluateHandle((codeToExecute: string) => {
              try {
                return eval(codeToExecute);
              } catch (error) {
                throw error;
              }
            }, code);
            
            const handle = await Promise.race([handlePromise, timeoutPromise]) as any;
            
            // Convert handle to JSON value
            result = await handle.jsonValue();
            await handle.dispose();
          }

          const endTime = Date.now();
          const executionTime = endTime - startTime;

          // Record the action if macro recording is active
          const { macroRecorder } = getMacroComponents();
          if (macroRecorder!.isRecording(sessionId)) {
            macroRecorder!.recordEval(sessionId, code);
          }

          // Serialize the result to ensure it's JSON-safe
          const serializedResult = serializeValue(result);

          // Update session activity
          session.updateActivity();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  result: serializedResult,
                  executionTime: executionTime,
                  codeLength: code.length,
                  returnByValue: returnByValue,
                  timestamp: new Date().toISOString(),
                  message: 'JavaScript code executed successfully'
                }, null, 2)
              }
            ],
            isError: false
          };
        } catch (error) {
          throw error;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isTimeout = errorMessage.toLowerCase().includes('timeout') || 
                         errorMessage.includes('Execution context was destroyed') ||
                         errorMessage.includes('Navigation');
        const isSyntaxError = errorMessage.includes('SyntaxError') || 
                             errorMessage.includes('Unexpected token');
        const isReferenceError = errorMessage.includes('ReferenceError') || 
                                errorMessage.includes('is not defined');
        const isSecurityError = errorMessage.includes('forbidden patterns') ||
                               errorMessage.includes('access denied');

        let category: 'browser' | 'security' | 'system' = 'browser';
        if (isSecurityError) {
          category = 'security';
        } else if (isTimeout) {
          category = 'system';
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: category,
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isSyntaxError: isSyntaxError,
                  isReferenceError: isReferenceError,
                  isSecurityError: isSecurityError,
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