import { 
  CircuitBreakerState, 
  CircuitBreakerConfig, 
  CircuitBreakerStats
} from '../types/error-types.js';
import { ErrorFactory } from './error-factory.js';

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date | undefined;
  private nextRetryTime?: Date | undefined;
  private totalRequests = 0;
  private windowStart = new Date();

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.updateWindow();
    
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw ErrorFactory.createSystemError(
          'SERVICE_UNAVAILABLE',
          `Circuit breaker '${this.name}' is OPEN. Next retry at ${this.nextRetryTime?.toISOString()}`,
          {
            circuitBreaker: this.name,
            state: this.state,
            nextRetryTime: this.nextRetryTime
          }
        );
      }
    }

    this.totalRequests++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.shouldTrip()) {
      this.trip();
    }
  }

  private shouldTrip(): boolean {
    // Need minimum requests before considering tripping
    if (this.totalRequests < this.config.minimumRequests) {
      return false;
    }

    // Check if failure rate exceeds threshold
    const failureRate = this.failureCount / this.totalRequests;
    return failureRate >= (this.config.failureThreshold / 100);
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextRetryTime) {
      return false;
    }
    return new Date() >= this.nextRetryTime;
  }

  private trip(): void {
    this.state = 'OPEN';
    this.nextRetryTime = new Date(Date.now() + this.config.recoveryTimeout);
  }

  private reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.nextRetryTime = undefined;
    this.totalRequests = 0;
    this.windowStart = new Date();
  }

  private updateWindow(): void {
    const now = new Date();
    const windowAge = now.getTime() - this.windowStart.getTime();
    
    if (windowAge >= this.config.monitoringWindow) {
      // Reset counters for new window
      this.failureCount = 0;
      this.successCount = 0;
      this.totalRequests = 0;
      this.windowStart = now;
    }
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.nextRetryTime,
      totalRequests: this.totalRequests,
      windowStart: this.windowStart
    };
  }

  // Manual control methods
  forceOpen(): void {
    this.state = 'OPEN';
    this.nextRetryTime = new Date(Date.now() + this.config.recoveryTimeout);
  }

  forceClose(): void {
    this.reset();
  }

  forceClosed(): void {
    this.state = 'CLOSED';
  }
}

export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 50, // 50% failure rate
    recoveryTimeout: 60000, // 1 minute
    monitoringWindow: 300000, // 5 minutes
    minimumRequests: 10
  };

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const finalConfig = { ...this.defaultConfig, ...config };
      this.breakers.set(name, new CircuitBreaker(name, finalConfig));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  reset(): void {
    this.breakers.clear();
  }

  // Predefined circuit breakers for common operations
  static readonly BROWSER_NAVIGATION = 'browser.navigation';
  static readonly BROWSER_INTERACTION = 'browser.interaction';
  static readonly BROWSER_EVALUATION = 'browser.evaluation';
  static readonly BROWSER_SCREENSHOT = 'browser.screenshot';
  static readonly SESSION_CREATION = 'session.creation';
  static readonly FILE_OPERATIONS = 'file.operations';
}