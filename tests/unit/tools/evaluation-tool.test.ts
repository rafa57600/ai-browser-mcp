import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createEvalTool } from '../../../src/tools/evaluation-tool.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';

// Mock the SessionManager and BrowserSession
vi.mock('../../../src/browser/session-manager.js');
vi.mock('../../../src/browser/browser-session.js');

describe('EvaluationTool', () => {
  let sessionManager: SessionManager;
  let mockSession: BrowserSession;
  let evalTool: ReturnType<typeof createEvalTool>;

  beforeEach(() => {
    // Create mock session manager
    sessionManager = new SessionManager();
    
    // Create mock session with page.evaluate method
    mockSession = {
      id: 'test-session-123',
      page: {
        evaluate: vi.fn(),
        evaluateHandle: vi.fn(),
        getDefaultTimeout: vi.fn().mockReturnValue(30000),
        setDefaultTimeout: vi.fn()
      },
      updateActivity: vi.fn(),
      allowedDomains: new Set(['example.com']),
      isDomainAllowed: vi.fn().mockReturnValue(true),
      addAllowedDomain: vi.fn()
    } as any;

    // Mock session manager methods
    vi.mocked(sessionManager.getSession).mockReturnValue(mockSession);
    
    // Create the evaluation tool
    evalTool = createEvalTool(sessionManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Configuration', () => {
    it('should have correct tool name', () => {
      expect(evalTool.name).toBe('browser.eval');
    });

    it('should have proper description', () => {
      expect(evalTool.description).toContain('Execute JavaScript code');
      expect(evalTool.description).toContain('browser context');
    });

    it('should have correct input schema', () => {
      expect(evalTool.inputSchema).toEqual({
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
      });
    });
  });

  describe('Parameter Validation', () => {
    it('should reject missing sessionId', async () => {
      const result = await evalTool.handler({
        code: 'console.log("test")'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('sessionId is required');
    });

    it('should reject invalid sessionId type', async () => {
      const result = await evalTool.handler({
        sessionId: 123,
        code: 'console.log("test")'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('sessionId is required and must be a string');
    });

    it('should reject missing code', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('code is required');
    });

    it('should reject invalid code type', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 123
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('code is required and must be a string');
    });

    it('should reject empty code', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '   '
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('code cannot be empty');
    });

    it('should reject non-existent session', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(null);

      const result = await evalTool.handler({
        sessionId: 'non-existent-session',
        code: 'console.log("test")'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session \'non-existent-session\' not found');
    });
  });

  describe('Security Validation', () => {
    it('should reject code with require statements', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'const fs = require("fs");'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('forbidden patterns');
    });

    it('should reject code with import statements', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'import fs from "fs";'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('forbidden patterns');
    });

    it('should reject code accessing process object', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'process.exit(1);'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('forbidden patterns');
    });

    it('should reject code accessing global object', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'global.something = "bad";'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('forbidden patterns');
    });

    it('should reject code with __dirname', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'console.log(__dirname);'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('forbidden patterns');
    });

    it('should reject code with fs access', async () => {
      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'fs.readFileSync("test.txt");'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('forbidden patterns');
    });
  });

  describe('JavaScript Execution', () => {
    it('should execute simple JavaScript and return result', async () => {
      const mockResult = 42;
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockResult);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '21 + 21'
      });

      expect(result.isError).toBe(false);
      expect(mockSession.page.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        '21 + 21'
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.result).toBe(42);
      expect(response.executionTime).toBeGreaterThanOrEqual(0);
      expect(mockSession.updateActivity).toHaveBeenCalled();
    });

    it('should execute JavaScript with custom timeout', async () => {
      const mockResult = 'test result';
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockResult);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '"test result"',
        timeout: 5000
      });

      expect(result.isError).toBe(false);
      expect(mockSession.page.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        '"test result"'
      );
    });

    it('should handle JavaScript execution errors', async () => {
      const mockError = new Error('ReferenceError: undefinedVariable is not defined');
      vi.mocked(mockSession.page.evaluate).mockRejectedValue(mockError);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'undefinedVariable + 1'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('undefinedVariable is not defined');
      expect(response.error.isReferenceError).toBe(true);
    });

    it('should handle timeout errors', async () => {
      const mockError = new Error('Execution context was destroyed, most likely because of a navigation');
      vi.mocked(mockSession.page.evaluate).mockRejectedValue(mockError);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'while(true) {}'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isTimeout).toBe(true);
      expect(response.error.category).toBe('system');
    });

    it('should handle syntax errors', async () => {
      const mockError = new Error('SyntaxError: Unexpected token }');
      vi.mocked(mockSession.page.evaluate).mockRejectedValue(mockError);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'function test() { } }'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.isSyntaxError).toBe(true);
    });
  });

  describe('Result Serialization', () => {
    it('should serialize primitive values correctly', async () => {
      const testCases = [
        { input: 42, expected: 42 },
        { input: 'hello', expected: 'hello' },
        { input: true, expected: true },
        { input: null, expected: null },
        { input: undefined, expected: undefined }
      ];

      for (const testCase of testCases) {
        vi.mocked(mockSession.page.evaluate).mockResolvedValue(testCase.input);

        const result = await evalTool.handler({
          sessionId: 'test-session-123',
          code: 'test'
        });

        expect(result.isError).toBe(false);
        const response = JSON.parse(result.content[0].text);
        expect(response.result).toEqual(testCase.expected);
      }
    });

    it('should serialize arrays correctly', async () => {
      const mockResult = [1, 'two', true, null];
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockResult);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '[1, "two", true, null]'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual([1, 'two', true, null]);
    });

    it('should serialize plain objects correctly', async () => {
      const mockResult = { name: 'test', value: 42, active: true };
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockResult);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '({ name: "test", value: 42, active: true })'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual({ name: 'test', value: 42, active: true });
    });

    it('should serialize Date objects correctly', async () => {
      const mockDate = new Date('2023-01-01T00:00:00.000Z');
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockDate);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'new Date("2023-01-01T00:00:00.000Z")'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should serialize Error objects correctly', async () => {
      const mockError = new Error('Test error message');
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockError);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'new Error("Test error message")'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual({
        __type: 'Error',
        name: 'Error',
        message: 'Test error message',
        stack: mockError.stack
      });
    });

    it('should serialize functions correctly', async () => {
      const mockFunction = function testFunction() { return 42; };
      vi.mocked(mockSession.page.evaluate).mockResolvedValue(mockFunction);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'function testFunction() { return 42; }'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual({
        __type: 'Function',
        name: 'testFunction',
        toString: mockFunction.toString()
      });
    });
  });

  describe('Return By Reference Mode', () => {
    it('should use evaluateHandle when returnByValue is false', async () => {
      const mockHandle = {
        jsonValue: vi.fn().mockResolvedValue({ complex: 'object' }),
        dispose: vi.fn()
      };
      vi.mocked(mockSession.page.evaluateHandle).mockResolvedValue(mockHandle as any);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '({ complex: "object" })',
        returnByValue: false
      });

      expect(result.isError).toBe(false);
      expect(mockSession.page.evaluateHandle).toHaveBeenCalledWith(
        expect.any(Function),
        '({ complex: "object" })'
      );
      expect(mockHandle.jsonValue).toHaveBeenCalled();
      expect(mockHandle.dispose).toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.result).toEqual({ complex: 'object' });
      expect(response.returnByValue).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should return success response with correct format', async () => {
      vi.mocked(mockSession.page.evaluate).mockResolvedValue('test result');

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: '"test result"'
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('result', 'test result');
      expect(response).toHaveProperty('executionTime');
      expect(response).toHaveProperty('codeLength', 13);
      expect(response).toHaveProperty('returnByValue', true);
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('message', 'JavaScript code executed successfully');
      
      expect(typeof response.executionTime).toBe('number');
      expect(response.executionTime).toBeGreaterThanOrEqual(0);
      expect(new Date(response.timestamp)).toBeInstanceOf(Date);
    });

    it('should return error response with correct format', async () => {
      const mockError = new Error('Test error');
      vi.mocked(mockSession.page.evaluate).mockRejectedValue(mockError);

      const result = await evalTool.handler({
        sessionId: 'test-session-123',
        code: 'throw new Error("Test error")'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('category', 'browser');
      expect(response.error).toHaveProperty('message', 'Test error');
      expect(response.error).toHaveProperty('timestamp');
      expect(response.error).toHaveProperty('isTimeout', false);
      expect(response.error).toHaveProperty('isSyntaxError', false);
      expect(response.error).toHaveProperty('isReferenceError', false);
      expect(response.error).toHaveProperty('isSecurityError', false);
      
      expect(new Date(response.error.timestamp)).toBeInstanceOf(Date);
    });
  });
});