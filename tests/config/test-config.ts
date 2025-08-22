// Test configuration for different environments
export interface TestConfig {
  browser: {
    headless: boolean;
    slowMo: number;
    timeout: number;
    viewport: { width: number; height: number };
  };
  server: {
    timeout: number;
    maxSessions: number;
    cleanupInterval: number;
  };
  security: {
    allowedDomains: string[];
    rateLimits: {
      requestsPerMinute: number;
      requestsPerHour: number;
    };
  };
  performance: {
    memoryLimits: {
      maxSessionMemoryMB: number;
      maxTotalMemoryMB: number;
    };
    diskLimits: {
      maxTotalSizeMB: number;
    };
    contextPool: {
      minPoolSize: number;
      maxPoolSize: number;
    };
  };
  load: {
    maxConcurrentSessions: number;
    operationsPerSession: number;
    testDuration: number;
  };
}

export const testConfigs: Record<string, TestConfig> = {
  unit: {
    browser: {
      headless: true,
      slowMo: 0,
      timeout: 5000,
      viewport: { width: 1280, height: 720 }
    },
    server: {
      timeout: 10000,
      maxSessions: 5,
      cleanupInterval: 30000
    },
    security: {
      allowedDomains: ['example.com', 'localhost'],
      rateLimits: {
        requestsPerMinute: 100,
        requestsPerHour: 1000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 128,
        maxTotalMemoryMB: 512
      },
      diskLimits: {
        maxTotalSizeMB: 50
      },
      contextPool: {
        minPoolSize: 1,
        maxPoolSize: 3
      }
    },
    load: {
      maxConcurrentSessions: 3,
      operationsPerSession: 5,
      testDuration: 10000
    }
  },

  integration: {
    browser: {
      headless: true,
      slowMo: 0,
      timeout: 30000,
      viewport: { width: 1280, height: 720 }
    },
    server: {
      timeout: 30000,
      maxSessions: 10,
      cleanupInterval: 60000
    },
    security: {
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 200,
        requestsPerHour: 2000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 256,
        maxTotalMemoryMB: 1024
      },
      diskLimits: {
        maxTotalSizeMB: 100
      },
      contextPool: {
        minPoolSize: 2,
        maxPoolSize: 8
      }
    },
    load: {
      maxConcurrentSessions: 8,
      operationsPerSession: 10,
      testDuration: 30000
    }
  },

  e2e: {
    browser: {
      headless: true,
      slowMo: 100,
      timeout: 60000,
      viewport: { width: 1920, height: 1080 }
    },
    server: {
      timeout: 60000,
      maxSessions: 15,
      cleanupInterval: 60000
    },
    security: {
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 300,
        requestsPerHour: 3000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 512,
        maxTotalMemoryMB: 2048
      },
      diskLimits: {
        maxTotalSizeMB: 200
      },
      contextPool: {
        minPoolSize: 3,
        maxPoolSize: 12
      }
    },
    load: {
      maxConcurrentSessions: 10,
      operationsPerSession: 15,
      testDuration: 60000
    }
  },

  performance: {
    browser: {
      headless: true,
      slowMo: 0,
      timeout: 120000,
      viewport: { width: 1280, height: 720 }
    },
    server: {
      timeout: 120000,
      maxSessions: 25,
      cleanupInterval: 30000
    },
    security: {
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 500,
        requestsPerHour: 5000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 256,
        maxTotalMemoryMB: 2048
      },
      diskLimits: {
        maxTotalSizeMB: 500
      },
      contextPool: {
        minPoolSize: 5,
        maxPoolSize: 20
      }
    },
    load: {
      maxConcurrentSessions: 20,
      operationsPerSession: 20,
      testDuration: 120000
    }
  },

  load: {
    browser: {
      headless: true,
      slowMo: 0,
      timeout: 300000,
      viewport: { width: 1280, height: 720 }
    },
    server: {
      timeout: 300000,
      maxSessions: 50,
      cleanupInterval: 30000
    },
    security: {
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 1000,
        requestsPerHour: 10000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 256,
        maxTotalMemoryMB: 4096
      },
      diskLimits: {
        maxTotalSizeMB: 1000
      },
      contextPool: {
        minPoolSize: 10,
        maxPoolSize: 30
      }
    },
    load: {
      maxConcurrentSessions: 50,
      operationsPerSession: 50,
      testDuration: 300000
    }
  },

  security: {
    browser: {
      headless: true,
      slowMo: 0,
      timeout: 60000,
      viewport: { width: 1280, height: 720 }
    },
    server: {
      timeout: 60000,
      maxSessions: 10,
      cleanupInterval: 60000
    },
    security: {
      allowedDomains: ['example.com', 'httpbin.org'],
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerHour: 1000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 256,
        maxTotalMemoryMB: 1024
      },
      diskLimits: {
        maxTotalSizeMB: 100
      },
      contextPool: {
        minPoolSize: 2,
        maxPoolSize: 8
      }
    },
    load: {
      maxConcurrentSessions: 8,
      operationsPerSession: 10,
      testDuration: 60000
    }
  },

  ci: {
    browser: {
      headless: true,
      slowMo: 0,
      timeout: 30000,
      viewport: { width: 1280, height: 720 }
    },
    server: {
      timeout: 30000,
      maxSessions: 8,
      cleanupInterval: 60000
    },
    security: {
      allowedDomains: ['example.com', 'httpbin.org', 'localhost'],
      rateLimits: {
        requestsPerMinute: 200,
        requestsPerHour: 2000
      }
    },
    performance: {
      memoryLimits: {
        maxSessionMemoryMB: 256,
        maxTotalMemoryMB: 1024
      },
      diskLimits: {
        maxTotalSizeMB: 100
      },
      contextPool: {
        minPoolSize: 2,
        maxPoolSize: 6
      }
    },
    load: {
      maxConcurrentSessions: 6,
      operationsPerSession: 8,
      testDuration: 30000
    }
  }
};

export function getTestConfig(environment: string = 'unit'): TestConfig {
  const config = testConfigs[environment];
  if (!config) {
    throw new Error(`Unknown test environment: ${environment}`);
  }
  return config;
}

export function getEnvironment(): string {
  return process.env.TEST_ENV || 
         process.env.NODE_ENV || 
         (process.env.CI ? 'ci' : 'unit');
}