// Mock browser implementation for isolated testing
import { EventEmitter } from 'events';
import type { Browser, BrowserContext, Page, Response } from 'playwright';

export class MockPage extends EventEmitter {
  private _url = 'about:blank';
  private _title = 'Mock Page';
  private _content = '<html><body><h1>Mock Page</h1></body></html>';
  private _viewport = { width: 1280, height: 720 };
  private _screenshots: Buffer[] = [];
  private _networkLogs: Array<{ url: string; method: string; status: number }> = [];
  private _consoleLogs: Array<{ level: string; text: string; timestamp: Date }> = [];

  async goto(url: string, options?: any): Promise<Response | null> {
    this._url = url;
    
    // Simulate network request
    this._networkLogs.push({
      url,
      method: 'GET',
      status: 200
    });

    // Simulate different responses based on URL
    if (url.includes('404')) {
      throw new Error('Page not found');
    }
    if (url.includes('timeout')) {
      throw new Error('Navigation timeout');
    }
    if (url.includes('example.com')) {
      this._title = 'Example Domain';
      this._content = '<html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><p>This domain is for use in illustrative examples.</p></body></html>';
    }

    return {
      status: () => 200,
      url: () => url,
      ok: () => true
    } as Response;
  }

  async click(selector: string, options?: any): Promise<void> {
    if (selector === '#non-existent') {
      throw new Error(`Element not found: ${selector}`);
    }
    // Simulate click
    this.emit('click', { selector });
  }

  async type(selector: string, text: string, options?: any): Promise<void> {
    if (selector === '#non-existent') {
      throw new Error(`Element not found: ${selector}`);
    }
    // Simulate typing
    this.emit('type', { selector, text });
  }

  async selectOption(selector: string, values: string | string[], options?: any): Promise<string[]> {
    if (selector === '#non-existent') {
      throw new Error(`Element not found: ${selector}`);
    }
    const valueArray = Array.isArray(values) ? values : [values];
    this.emit('select', { selector, values: valueArray });
    return valueArray;
  }

  async evaluate<T>(pageFunction: string | Function, arg?: any): Promise<T> {
    // Simulate JavaScript execution
    if (typeof pageFunction === 'string') {
      if (pageFunction.includes('throw')) {
        throw new Error('JavaScript execution error');
      }
      if (pageFunction.includes('document.title')) {
        return this._title as T;
      }
      if (pageFunction.includes('window.location.href')) {
        return this._url as T;
      }
      if (pageFunction.includes('document.body.innerHTML')) {
        return this._content as T;
      }
    }
    return 'mock-result' as T;
  }

  async screenshot(options?: any): Promise<Buffer> {
    const mockScreenshot = Buffer.from('mock-screenshot-data');
    this._screenshots.push(mockScreenshot);
    return mockScreenshot;
  }

  async content(): Promise<string> {
    return this._content;
  }

  url(): string {
    return this._url;
  }

  async title(): Promise<string> {
    return this._title;
  }

  async setViewportSize(size: { width: number; height: number }): Promise<void> {
    this._viewport = size;
  }

  viewportSize(): { width: number; height: number } | null {
    return this._viewport;
  }

  // Mock methods for testing
  getNetworkLogs() {
    return this._networkLogs;
  }

  getConsoleLogs() {
    return this._consoleLogs;
  }

  addConsoleLog(level: string, text: string) {
    this._consoleLogs.push({
      level,
      text,
      timestamp: new Date()
    });
  }

  clearLogs() {
    this._networkLogs = [];
    this._consoleLogs = [];
  }

  async close(): Promise<void> {
    this.emit('close');
  }
}

export class MockBrowserContext extends EventEmitter {
  private _pages: MockPage[] = [];
  private _userAgent = 'Mozilla/5.0 (Mock Browser)';
  private _viewport = { width: 1280, height: 720 };

  async newPage(): Promise<MockPage> {
    const page = new MockPage();
    await page.setViewportSize(this._viewport);
    this._pages.push(page);
    return page;
  }

  async setUserAgent(userAgent: string): Promise<void> {
    this._userAgent = userAgent;
  }

  async setViewportSize(size: { width: number; height: number }): Promise<void> {
    this._viewport = size;
    // Update all existing pages
    await Promise.all(this._pages.map(page => page.setViewportSize(size)));
  }

  pages(): MockPage[] {
    return this._pages;
  }

  async close(): Promise<void> {
    await Promise.all(this._pages.map(page => page.close()));
    this._pages = [];
    this.emit('close');
  }

  // Mock methods for testing
  getUserAgent(): string {
    return this._userAgent;
  }

  getViewport() {
    return this._viewport;
  }
}

export class MockBrowser extends EventEmitter {
  private _contexts: MockBrowserContext[] = [];
  private _isConnected = true;

  async newContext(options?: any): Promise<MockBrowserContext> {
    const context = new MockBrowserContext();
    
    if (options?.userAgent) {
      await context.setUserAgent(options.userAgent);
    }
    if (options?.viewport) {
      await context.setViewportSize(options.viewport);
    }

    this._contexts.push(context);
    return context;
  }

  contexts(): MockBrowserContext[] {
    return this._contexts;
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  async close(): Promise<void> {
    await Promise.all(this._contexts.map(context => context.close()));
    this._contexts = [];
    this._isConnected = false;
    this.emit('close');
  }

  // Mock methods for testing
  simulateDisconnect() {
    this._isConnected = false;
    this.emit('disconnected');
  }

  simulateReconnect() {
    this._isConnected = true;
    this.emit('connected');
  }
}

// Factory function to create mock browser
export function createMockBrowser(): MockBrowser {
  return new MockBrowser();
}

// Mock Playwright module
export const mockPlaywright = {
  chromium: {
    launch: async (options?: any) => {
      const browser = createMockBrowser();
      if (options?.headless === false) {
        // Simulate headed mode
      }
      return browser;
    }
  }
};