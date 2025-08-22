import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createNewContextTool, createGotoTool } from '../../../src/tools/navigation-tool.js';
import { SessionManager } from '../../../src/browser/session-manager.js';
import { BrowserSession } from '../../../src/browser/browser-session.js';

// Mock the SessionManager
vi.mock('../../../src/browser/session-manager.js');
vi.mock('../../../src/browser/browser-session.js');

describe('Navigation Tools Unit Tests', () => {
  let mockSessionManager: vi.Mocked<SessionManager>;
  let mockSession: vi.Mocked<BrowserSession>;

  beforeEach(() => {
    mockSession = {
      id: 'test-session-id',
      options: {
        viewport: { width: 1280, height: 720 },
        userAgent: 'Test User Agent'
      },
      createdAt: new Date('2023-01-01T00:00:00Z'),
      allowedDomains: new Set(['example.com']),
      isDomainAllowed: vi.fn(),
      addAllowedDomain: vi.fn(),
      updateActivity: vi.fn(),
      page: {
        goto: vi.fn(),
        url: vi.fn().mockReturnValue('https://example.com/')
      }
    } as any;

    mockSessionManager = {
      createSession: vi.fn(),
      getSession: vi.fn()
    } as any;
  });

  describe('createNewContextTool', () => {
    it('should create a tool with correct schema', () => {
      const tool = createNewContextTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.newContext');
      expect(tool.description).toContain('Create a new browser context');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('properties');
      expect(tool.handler).toBeTypeOf('function');
    });

    it('should handle successful session creation', async () => {
      mockSessionManager.createSession.mockResolvedValue(mockSession);
      
      const tool = createNewContextTool(mockSessionManager);
      const result = await tool.handler({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Custom User Agent'
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sessionId).toBe('test-session-id');
      expect(mockSessionManager.createSession).toHaveBeenCalledWith({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Custom User Agent'
      });
    });

    it('should handle session creation failure', async () => {
      mockSessionManager.createSession.mockRejectedValue(new Error('Session creation failed'));
      
      const tool = createNewContextTool(mockSessionManager);
      const result = await tool.handler({});

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Session creation failed');
    });

    it('should filter invalid allowed domains', async () => {
      mockSessionManager.createSession.mockResolvedValue(mockSession);
      
      const tool = createNewContextTool(mockSessionManager);
      await tool.handler({
        allowedDomains: ['valid.com', 123, 'another.com', null]
      });

      expect(mockSessionManager.createSession).toHaveBeenCalledWith({
        allowedDomains: ['valid.com', 'another.com']
      });
    });
  });

  describe('createGotoTool', () => {
    it('should create a tool with correct schema', () => {
      const tool = createGotoTool(mockSessionManager);
      
      expect(tool.name).toBe('browser.goto');
      expect(tool.description).toContain('Navigate to a specified URL');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('required', ['sessionId', 'url']);
      expect(tool.handler).toBeTypeOf('function');
    });

    it('should handle successful navigation', async () => {
      const mockResponse = {
        ok: () => true,
        status: () => 200,
        statusText: () => 'OK'
      };
      
      mockSession.page.goto.mockResolvedValue(mockResponse);
      mockSession.isDomainAllowed.mockReturnValue(true);
      mockSessionManager.getSession.mockReturnValue(mockSession);
      
      const tool = createGotoTool(mockSessionManager);
      const result = await tool.handler({
        sessionId: 'test-session-id',
        url: 'https://example.com',
        waitUntil: 'load'
      });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.url).toBe('https://example.com');
      expect(response.status).toBe(200);
      expect(mockSession.updateActivity).toHaveBeenCalled();
      expect(mockSession.addAllowedDomain).toHaveBeenCalledWith('example.com');
    });

    it('should handle invalid session ID', async () => {
      mockSessionManager.getSession.mockReturnValue(null);
      
      const tool = createGotoTool(mockSessionManager);
      const result = await tool.handler({
        sessionId: 'invalid-session',
        url: 'https://example.com'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toContain('Session \'invalid-session\' not found');
    });

    it('should handle invalid URL format', async () => {
      mockSessionManager.getSession.mockReturnValue(mockSession);
      
      const tool = createGotoTool(mockSessionManager);
      const result = await tool.handler({
        sessionId: 'test-session-id',
        url: 'not-a-valid-url'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Invalid URL format');
    });

    it('should handle domain restrictions', async () => {
      mockSession.allowedDomains = new Set(['allowed.com']);
      mockSession.isDomainAllowed.mockReturnValue(false);
      mockSessionManager.getSession.mockReturnValue(mockSession);
      
      const tool = createGotoTool(mockSessionManager);
      const result = await tool.handler({
        sessionId: 'test-session-id',
        url: 'https://restricted.com'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.category).toBe('security');
      expect(response.error.message).toContain('not in the allowed domains list');
    });

    it('should handle navigation errors', async () => {
      mockSession.isDomainAllowed.mockReturnValue(true);
      mockSession.page.goto.mockRejectedValue(new Error('Navigation timeout'));
      mockSessionManager.getSession.mockReturnValue(mockSession);
      
      const tool = createGotoTool(mockSessionManager);
      const result = await tool.handler({
        sessionId: 'test-session-id',
        url: 'https://example.com'
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Navigation timeout');
      expect(response.error.isTimeout).toBe(true);
    });

    it('should validate required parameters', async () => {
      const tool = createGotoTool(mockSessionManager);
      
      // Missing sessionId
      let result = await tool.handler({
        url: 'https://example.com'
      });
      expect(result.isError).toBe(true);
      let response = JSON.parse(result.content[0].text);
      expect(response.error.message).toContain('sessionId is required');

      // Missing url
      result = await tool.handler({
        sessionId: 'test-session-id'
      });
      expect(result.isError).toBe(true);
      response = JSON.parse(result.content[0].text);
      expect(response.error.message).toContain('url is required');
    });
  });
});