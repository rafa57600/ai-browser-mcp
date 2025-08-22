import { EventEmitter } from 'events';

export interface SystemMetrics {
  timestamp: Date;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  sessions: {
    active: number;
    total: number;
  };
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
  browser: {
    contexts: number;
    pages: number;
  };
}

export interface RequestMetrics {
  method: string;
  tool: string;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export class MetricsCollector extends EventEmitter {
  private metrics: SystemMetrics;
  private requestHistory: RequestMetrics[] = [];
  private maxHistorySize = 1000;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.metrics = this.initializeMetrics();
    this.startCollection();
  }

  private initializeMetrics(): SystemMetrics {
    return {
      timestamp: new Date(),
      memory: { used: 0, total: 0, percentage: 0 },
      cpu: { usage: 0 },
      sessions: { active: 0, total: 0 },
      requests: { total: 0, successful: 0, failed: 0, averageResponseTime: 0 },
      browser: { contexts: 0, pages: 0 }
    };
  }

  private startCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.emit('metrics', this.metrics);
    }, 30000); // Collect every 30 seconds
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.metrics.timestamp = new Date();
    this.metrics.memory = {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    };

    // CPU usage would require additional monitoring
    this.metrics.cpu.usage = process.cpuUsage().user / 1000000; // Convert to seconds
  }

  public recordRequest(metrics: RequestMetrics): void {
    this.requestHistory.push(metrics);
    
    // Maintain history size
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory.shift();
    }

    // Update request metrics
    this.metrics.requests.total++;
    if (metrics.success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Calculate average response time
    const recentRequests = this.requestHistory.slice(-100);
    this.metrics.requests.averageResponseTime = 
      recentRequests.reduce((sum, req) => sum + req.duration, 0) / recentRequests.length;
  }

  public updateSessionCount(active: number, total: number): void {
    this.metrics.sessions.active = active;
    this.metrics.sessions.total = total;
  }

  public updateBrowserCount(contexts: number, pages: number): void {
    this.metrics.browser.contexts = contexts;
    this.metrics.browser.pages = pages;
  }

  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  public getRequestHistory(limit?: number): RequestMetrics[] {
    if (limit) {
      return this.requestHistory.slice(-limit);
    }
    return [...this.requestHistory];
  }

  public getHealthStatus(): { status: 'healthy' | 'degraded' | 'unhealthy'; details: any } {
    const memoryThreshold = 80; // 80% memory usage threshold
    const errorRateThreshold = 10; // 10% error rate threshold
    
    const errorRate = this.metrics.requests.total > 0 
      ? (this.metrics.requests.failed / this.metrics.requests.total) * 100 
      : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const issues: string[] = [];

    if (this.metrics.memory.percentage > memoryThreshold) {
      status = this.metrics.memory.percentage > 90 ? 'unhealthy' : 'degraded';
      issues.push(`High memory usage: ${this.metrics.memory.percentage}%`);
    }

    if (errorRate > errorRateThreshold) {
      status = errorRate > 25 ? 'unhealthy' : 'degraded';
      issues.push(`High error rate: ${errorRate.toFixed(1)}%`);
    }

    return {
      status,
      details: {
        memory: this.metrics.memory,
        errorRate: errorRate.toFixed(1),
        activeSessions: this.metrics.sessions.active,
        issues
      }
    };
  }

  public stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

export const metricsCollector = new MetricsCollector();