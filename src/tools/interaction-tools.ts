import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BrowserTool } from '../types/tool-types.js';
import { SessionManager } from '../browser/session-manager.js';
import { getMacroComponents } from './macro-tools.js';

/**
 * Creates the browser.click tool for clicking DOM elements
 */
export function createClickTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.click',
    description: 'Click on a DOM element specified by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to use'
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click'
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          description: 'Timeout in milliseconds to wait for element (overrides session default)'
        },
        force: {
          type: 'boolean',
          default: false,
          description: 'Whether to force the click even if element is not actionable'
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' }
          },
          additionalProperties: false,
          description: 'Optional position relative to element to click'
        }
      },
      required: ['sessionId', 'selector'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const selector = args.selector as string;
        const timeout = args.timeout as number | undefined;
        const force = args.force as boolean | undefined;
        const position = args.position as { x: number; y: number } | undefined;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!selector || typeof selector !== 'string') {
          throw new Error('selector is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const startTime = Date.now();

        try {
          // Wait for element to be visible and actionable
          const element = await session.page.waitForSelector(selector, {
            timeout: timeout || 30000,
            state: 'visible'
          });

          if (!element) {
            throw new Error(`Element with selector '${selector}' not found`);
          }

          // Click the element
          const clickOptions: {
            force?: boolean;
            position?: { x: number; y: number };
            timeout?: number;
          } = {};

          if (force !== undefined) {
            clickOptions.force = force;
          }

          if (position) {
            clickOptions.position = position;
          }

          if (timeout) {
            clickOptions.timeout = timeout;
          }

          await element.click(clickOptions);

          const endTime = Date.now();
          const clickTime = endTime - startTime;

          // Record the action if macro recording is active
          const { macroRecorder } = getMacroComponents();
          if (macroRecorder!.isRecording(sessionId)) {
            macroRecorder!.recordClick(sessionId, selector, position);
          }

          // Update session activity
          session.updateActivity();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  selector: selector,
                  clickTime: clickTime,
                  force: force || false,
                  position: position || null,
                  timestamp: new Date().toISOString(),
                  message: 'Element clicked successfully'
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
        const isTimeout = errorMessage.toLowerCase().includes('timeout');
        const isElementNotFound = isTimeout || 
                                 errorMessage.includes('not found') || 
                                 errorMessage.includes('waiting for selector') ||
                                 errorMessage.includes('Element with selector');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'browser',
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isElementNotFound: isElementNotFound,
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
 * Creates the browser.type tool for typing text into form fields
 */
export function createTypeTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.type',
    description: 'Type text into a form field specified by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to use'
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the input element'
        },
        text: {
          type: 'string',
          description: 'Text to type into the element'
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          description: 'Timeout in milliseconds to wait for element (overrides session default)'
        },
        delay: {
          type: 'number',
          minimum: 0,
          maximum: 1000,
          description: 'Delay in milliseconds between key presses'
        },
        clear: {
          type: 'boolean',
          default: true,
          description: 'Whether to clear the field before typing'
        }
      },
      required: ['sessionId', 'selector', 'text'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const selector = args.selector as string;
        const text = args.text as string;
        const timeout = args.timeout as number | undefined;
        const delay = args.delay as number | undefined;
        const clear = args.clear !== undefined ? args.clear as boolean : true;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!selector || typeof selector !== 'string') {
          throw new Error('selector is required and must be a string');
        }

        if (text === undefined || typeof text !== 'string') {
          throw new Error('text is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const startTime = Date.now();

        try {
          // Wait for element to be visible and actionable
          const element = await session.page.waitForSelector(selector, {
            timeout: timeout || 30000,
            state: 'visible'
          });

          if (!element) {
            throw new Error(`Element with selector '${selector}' not found`);
          }

          // Clear the field if requested, then fill with text
          if (clear) {
            await element.fill('');
          }

          // Type the text using fill for immediate input or type for character-by-character
          if (delay && delay > 0) {
            // Use type for character-by-character input with delay
            const typeOptions: {
              delay?: number;
              timeout?: number;
            } = { delay };

            if (timeout) {
              typeOptions.timeout = timeout;
            }

            await element.type(text, typeOptions);
          } else {
            // Use fill for immediate input (faster)
            await element.fill(clear ? text : await element.inputValue() + text);
          }

          const endTime = Date.now();
          const typeTime = endTime - startTime;

          // Record the action if macro recording is active
          const { macroRecorder } = getMacroComponents();
          if (macroRecorder!.isRecording(sessionId)) {
            macroRecorder!.recordType(sessionId, selector, text);
          }

          // Update session activity
          session.updateActivity();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  selector: selector,
                  textLength: text.length,
                  typeTime: typeTime,
                  cleared: clear,
                  delay: delay || 0,
                  timestamp: new Date().toISOString(),
                  message: 'Text typed successfully'
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
        const isTimeout = errorMessage.toLowerCase().includes('timeout');
        const isElementNotFound = isTimeout || 
                                 errorMessage.includes('not found') || 
                                 errorMessage.includes('waiting for selector') ||
                                 errorMessage.includes('Element with selector');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'browser',
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isElementNotFound: isElementNotFound,
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
 * Creates the browser.select tool for selecting options from dropdown elements
 */
export function createSelectTool(sessionManager: SessionManager): BrowserTool {
  return {
    name: 'browser.select',
    description: 'Select an option from a dropdown element specified by CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'ID of the browser session to use'
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the select element'
        },
        value: {
          type: 'string',
          description: 'Value of the option to select'
        },
        timeout: {
          type: 'number',
          minimum: 1000,
          maximum: 300000,
          description: 'Timeout in milliseconds to wait for element (overrides session default)'
        }
      },
      required: ['sessionId', 'selector', 'value'],
      additionalProperties: false
    },
    handler: async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const sessionId = args.sessionId as string;
        const selector = args.selector as string;
        const value = args.value as string;
        const timeout = args.timeout as number | undefined;

        if (!sessionId || typeof sessionId !== 'string') {
          throw new Error('sessionId is required and must be a string');
        }

        if (!selector || typeof selector !== 'string') {
          throw new Error('selector is required and must be a string');
        }

        if (!value || typeof value !== 'string') {
          throw new Error('value is required and must be a string');
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error(`Session '${sessionId}' not found or has expired`);
        }

        const startTime = Date.now();

        try {
          // Wait for select element to be visible and actionable
          const element = await session.page.waitForSelector(selector, {
            timeout: timeout || 30000,
            state: 'visible'
          });

          if (!element) {
            throw new Error(`Element with selector '${selector}' not found`);
          }

          // Verify it's a select element
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          if (tagName !== 'select') {
            throw new Error(`Element with selector '${selector}' is not a select element (found: ${tagName})`);
          }

          // Check if the option exists before trying to select it
          const optionExists = await element.evaluate((el: any, val: string) => {
            const selectEl = el;
            for (let i = 0; i < selectEl.options.length; i++) {
              if (selectEl.options[i].value === val) {
                return true;
              }
            }
            return false;
          }, value);

          if (!optionExists) {
            throw new Error(`Option with value '${value}' not found in select element`);
          }

          // Select the option by value
          const selectedValues = await element.selectOption({ value: value });

          const endTime = Date.now();
          const selectTime = endTime - startTime;

          // Record the action if macro recording is active
          const { macroRecorder } = getMacroComponents();
          if (macroRecorder!.isRecording(sessionId)) {
            macroRecorder!.recordSelect(sessionId, selector, value);
          }

          // Update session activity
          session.updateActivity();

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  selector: selector,
                  selectedValue: value,
                  selectedValues: selectedValues,
                  selectTime: selectTime,
                  timestamp: new Date().toISOString(),
                  message: 'Option selected successfully'
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
        const isTimeout = errorMessage.toLowerCase().includes('timeout');
        const isElementNotFound = isTimeout || 
                                 errorMessage.includes('not found') || 
                                 errorMessage.includes('waiting for selector') ||
                                 errorMessage.includes('Element with selector');
        const isNotSelectElement = errorMessage.includes('not a select element');
        const isOptionNotFound = errorMessage.includes('Option with value') && 
                                errorMessage.includes('not found');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: {
                  category: 'browser',
                  message: errorMessage,
                  isTimeout: isTimeout,
                  isElementNotFound: isElementNotFound,
                  isNotSelectElement: isNotSelectElement,
                  isOptionNotFound: isOptionNotFound,
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