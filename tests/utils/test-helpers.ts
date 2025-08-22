// Test utilities and helper functions
import { expect } from 'vitest';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { TestConfig } from '../config/test-config.js';

export interface TestSession {
  id: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export class TestHelpers {
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  static measureTime<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
    return new Promise(async (resolve, reject) => {
      const startTime = performance.now();
      
      try {
        const result = await operation();
        const duration = performance.now() - startTime;
        resolve({ result, duration });
      } catch (error) {
        const duration = performance.now() - startTime;
        reject({ error, duration });
      }
    });
  }

  static async expectEventually(
    assertion: () => void | Promise<void>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    let lastError: Error;
    
    while (Date.now() - startTime < timeout) {
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error as Error;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    throw lastError!;
  }

  static createMockResponse(success: boolean, data?: any, error?: string): any {
    return {
      isError: !success,
      content: [{
        type: 'text',
        text: JSON.stringify({
          success,
          ...(data && { ...data }),
          ...(error && { error: { message: error } })
        })
      }]
    };
  }

  static parseToolResponse(response: any): any {
    if (response.isError) {
      throw new Error('Tool response indicates error');
    }
    
    return JSON.parse(response.content[0].text);
  }

  static async cleanupFiles(patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      if (existsSync(pattern)) {
        try {
          unlinkSync(pattern);
        } catch (error) {
          console.warn(`Failed to cleanup file ${pattern}:`, error);
        }
      }
    }
  }

  static generateRandomString(length: number = 10): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static generateTestUrl(path: string = '', params: Record<string, string> = {}): string {
    const baseUrl = 'https://example.com';
    const url = new URL(path, baseUrl);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    
    return url.toString();
  }

  static createTestData(size: number): string {
    return 'x'.repeat(size);
  }

  static async loadTestFile(filename: string): Promise<string> {
    const filePath = join(__dirname, '..', 'fixtures', filename);
    if (!existsSync(filePath)) {
      throw new Error(`Test file not found: ${filePath}`);
    }
    return readFileSync(filePath, 'utf8');
  }

  static validateSessionId(sessionId: string): boolean {
    return typeof sessionId === 'string' && 
           sessionId.length > 0 && 
           /^[a-zA-Z0-9-_]+$/.test(sessionId);
  }

  static validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static validateTimestamp(timestamp: string): boolean {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  }

  static expectValidResponse(response: any): void {
    expect(response).toBeDefined();
    expect(response.content).toBeDefined();
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toBeDefined();
  }

  static expectSuccessResponse(response: any): any {
    TestHelpers.expectValidResponse(response);
    expect(response.isError).toBeFalsy();
    
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.success).toBe(true);
    
    return parsed;
  }

  static expectErrorResponse(response: any, expectedCategory?: string): any {
    TestHelpers.expectValidResponse(response);
    expect(response.isError).toBe(true);
    
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBeDefined();
    expect(parsed.error.message).toBeDefined();
    
    if (expectedCategory) {
      expect(parsed.error.category).toBe(expectedCategory);
    }
    
    return parsed;
  }

  static expectPerformanceWithinLimits(
    duration: number, 
    maxDuration: number, 
    operation: string
  ): void {
    expect(duration).toBeLessThanOrEqual(maxDuration);
    
    if (duration > maxDuration * 0.8) {
      console.warn(`${operation} took ${duration}ms, approaching limit of ${maxDuration}ms`);
    }
  }

  static expectMemoryUsageWithinLimits(
    memoryMB: number, 
    maxMemoryMB: number, 
    context: string
  ): void {
    expect(memoryMB).toBeLessThanOrEqual(maxMemoryMB);
    
    if (memoryMB > maxMemoryMB * 0.8) {
      console.warn(`${context} using ${memoryMB}MB, approaching limit of ${maxMemoryMB}MB`);
    }
  }

  static createLoadTestScenario(
    config: TestConfig,
    operationFactory: (sessionId: string, index: number) => Promise<any>
  ) {
    return async function runLoadTest() {
      const sessions: string[] = [];
      const results: TestResult[] = [];
      const startTime = performance.now();
      
      try {
        // Create sessions
        for (let i = 0; i < config.load.maxConcurrentSessions; i++) {
          sessions.push(`load-test-session-${i}`);
        }
        
        // Run operations
        const operationPromises = sessions.flatMap(sessionId =>
          Array.from({ length: config.load.operationsPerSession }, (_, i) =>
            TestHelpers.measureTime(() => operationFactory(sessionId, i))
              .then(({ result, duration }) => {
                results.push({ success: true, data: result, duration });
              })
              .catch(({ error, duration }) => {
                results.push({ success: false, error: error.message, duration });
              })
          )
        );
        
        await Promise.allSettled(operationPromises);
        
        const totalTime = performance.now() - startTime;
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        
        return {
          totalOperations: results.length,
          successful,
          failed,
          successRate: (successful / results.length) * 100,
          totalTime,
          averageDuration: avgDuration,
          operationsPerSecond: results.length / (totalTime / 1000)
        };
      } finally {
        // Cleanup would happen here in a real test
      }
    };
  }

  static createStressTestScenario(
    maxOperations: number,
    operationFactory: () => Promise<any>,
    shouldContinue: () => boolean = () => true
  ) {
    return async function runStressTest() {
      const results: TestResult[] = [];
      const startTime = performance.now();
      let operationCount = 0;
      
      while (operationCount < maxOperations && shouldContinue()) {
        try {
          const { result, duration } = await TestHelpers.measureTime(operationFactory);
          results.push({ success: true, data: result, duration });
        } catch ({ error, duration }) {
          results.push({ success: false, error: (error as Error).message, duration: duration as number });
        }
        
        operationCount++;
        
        // Small delay to prevent overwhelming the system
        if (operationCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      const totalTime = performance.now() - startTime;
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      return {
        totalOperations: operationCount,
        successful,
        failed,
        successRate: (successful / operationCount) * 100,
        totalTime,
        averageDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
        operationsPerSecond: operationCount / (totalTime / 1000)
      };
    };
  }

  static logTestMetrics(testName: string, metrics: any): void {
    console.log(`\n📊 ${testName} Metrics:`);
    Object.entries(metrics).forEach(([key, value]) => {
      if (typeof value === 'number') {
        const formattedValue = key.includes('Rate') || key.includes('Percent') 
          ? `${(value as number).toFixed(1)}%`
          : key.includes('Time') || key.includes('Duration')
          ? `${(value as number).toFixed(2)}ms`
          : key.includes('PerSecond')
          ? `${(value as number).toFixed(2)}/s`
          : value.toString();
        console.log(`  ${key}: ${formattedValue}`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });
    console.log('');
  }
}

// Export commonly used assertions
export const expectValidResponse = TestHelpers.expectValidResponse;
export const expectSuccessResponse = TestHelpers.expectSuccessResponse;
export const expectErrorResponse = TestHelpers.expectErrorResponse;
export const expectPerformanceWithinLimits = TestHelpers.expectPerformanceWithinLimits;
export const expectMemoryUsageWithinLimits = TestHelpers.expectMemoryUsageWithinLimits;