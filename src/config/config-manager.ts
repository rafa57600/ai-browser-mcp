import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ServerConfig {
  server: {
    port: number;
    host: string;
    timeout: number;
    maxConnections: number;
  };
  browser: {
    headless: boolean;
    slowMo: number;
    timeout: number;
    maxSessions: number;
    sessionTimeout: number;
    viewport: {
      width: number;
      height: number;
    };
  };
  security: {
    allowedDomains: string[];
    rateLimit: {
      requests: number;
      window: number;
    };
    enableDomainValidation: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
    maxSize: string;
    maxFiles: number;
    enableConsole: boolean;
  };
  monitoring: {
    enableHealthCheck: boolean;
    healthCheckPath: string;
    metricsPath: string;
    enableMetrics: boolean;
  };
  performance: {
    memoryLimit: number;
    cpuThrottleRate: number;
    diskSpaceLimit: number;
    enableContextPooling: boolean;
  };
}

export class ConfigManager {
  private config: ServerConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfig();
  }

  private getDefaultConfigPath(): string {
    const env = process.env.NODE_ENV || 'development';
    return join(process.cwd(), 'config', `${env}.json`);
  }

  private loadConfig(): ServerConfig {
    const defaultConfig = this.getDefaultConfig();
    
    if (!existsSync(this.configPath)) {
      console.warn(`Config file not found at ${this.configPath}, using defaults`);
      return defaultConfig;
    }

    try {
      const fileContent = readFileSync(this.configPath, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      return this.mergeConfig(defaultConfig, fileConfig);
    } catch (error) {
      console.error(`Error loading config from ${this.configPath}:`, error);
      return defaultConfig;
    }
  }

  private getDefaultConfig(): ServerConfig {
    return {
      server: {
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || 'localhost',
        timeout: 30000,
        maxConnections: 100
      },
      browser: {
        headless: process.env.HEADLESS !== 'false',
        slowMo: 0,
        timeout: 30000,
        maxSessions: 10,
        sessionTimeout: 1800000, // 30 minutes
        viewport: {
          width: 1280,
          height: 720
        }
      },
      security: {
        allowedDomains: ['localhost', '127.0.0.1'],
        rateLimit: {
          requests: 60,
          window: 60000
        },
        enableDomainValidation: true
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'info',
        maxSize: '10m',
        maxFiles: 5,
        enableConsole: true
      },
      monitoring: {
        enableHealthCheck: true,
        healthCheckPath: '/health',
        metricsPath: '/metrics',
        enableMetrics: true
      },
      performance: {
        memoryLimit: 2048, // 2GB in MB
        cpuThrottleRate: 1,
        diskSpaceLimit: 1024, // 1GB in MB
        enableContextPooling: true
      }
    };
  }

  private mergeConfig(defaultConfig: ServerConfig, fileConfig: any): ServerConfig {
    return {
      server: { ...defaultConfig.server, ...fileConfig.server },
      browser: { ...defaultConfig.browser, ...fileConfig.browser },
      security: { 
        ...defaultConfig.security, 
        ...fileConfig.security,
        rateLimit: { ...defaultConfig.security.rateLimit, ...fileConfig.security?.rateLimit }
      },
      logging: { ...defaultConfig.logging, ...fileConfig.logging },
      monitoring: { ...defaultConfig.monitoring, ...fileConfig.monitoring },
      performance: { ...defaultConfig.performance, ...fileConfig.performance }
    };
  }

  public getConfig(): ServerConfig {
    return this.config;
  }

  public get<K extends keyof ServerConfig>(section: K): ServerConfig[K] {
    return this.config[section];
  }

  public reload(): void {
    this.config = this.loadConfig();
  }

  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('Server port must be between 1 and 65535');
    }

    if (this.config.browser.maxSessions < 1) {
      errors.push('Browser maxSessions must be at least 1');
    }

    if (this.config.security.rateLimit.requests < 1) {
      errors.push('Rate limit requests must be at least 1');
    }

    if (this.config.performance.memoryLimit < 100) {
      errors.push('Memory limit must be at least 100MB');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const configManager = new ConfigManager();