# MCP Browser Server Deployment Guide

## Overview

This guide covers deploying the MCP Browser Server in various environments including development, staging, and production.

## Prerequisites

- Node.js 18 or higher
- npm or yarn package manager
- Playwright browsers installed
- Sufficient system resources (see requirements below)

## System Requirements

### Minimum Requirements
- **CPU**: 2 cores
- **Memory**: 2GB RAM
- **Disk**: 1GB free space
- **OS**: Linux (Ubuntu 20.04+), macOS, or Windows 10+

### Recommended for Production
- **CPU**: 4+ cores
- **Memory**: 4GB+ RAM
- **Disk**: 5GB+ free space
- **OS**: Linux (Ubuntu 22.04 LTS)

## Environment Configuration

### Development Environment

1. **Install dependencies**:
   ```bash
   npm install
   npm run build
   ```

2. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```

3. **Start the server**:
   ```bash
   npm run start:dev
   # or
   ./scripts/start.sh --env development
   ```

### Production Environment

#### Using Docker (Recommended)

1. **Build Docker image**:
   ```bash
   docker build -t mcp-browser-server .
   ```

2. **Run container**:
   ```bash
   docker run -d \
     --name mcp-browser-server \
     -p 8080:8080 \
     -e NODE_ENV=production \
     -v /var/log/mcp-browser:/app/logs \
     mcp-browser-server
   ```

#### Manual Deployment (Linux)

1. **Run deployment script**:
   ```bash
   sudo ./scripts/deploy.sh --env production
   ```

2. **Verify deployment**:
   ```bash
   systemctl status mcp-browser-server
   curl http://localhost:8080/health
   ```

#### Windows Deployment

1. **Install as Windows Service** (using node-windows):
   ```bash
   npm install -g node-windows
   npm run install-service
   ```

2. **Start service**:
   ```bash
   net start "MCP Browser Server"
   ```

## Configuration Files

### Environment-Specific Configurations

- `config/development.json` - Development settings
- `config/production.json` - Production settings  
- `config/test.json` - Test environment settings

### Configuration Options

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "timeout": 30000,
    "maxConnections": 200
  },
  "browser": {
    "headless": true,
    "maxSessions": 20,
    "sessionTimeout": 1800000
  },
  "security": {
    "allowedDomains": [],
    "rateLimit": {
      "requests": 60,
      "window": 60000
    }
  },
  "logging": {
    "level": "info",
    "file": "/var/log/mcp-browser/production.log"
  },
  "monitoring": {
    "enableHealthCheck": true,
    "enableMetrics": true
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production/test) | development |
| `PORT` | Server port | 3000 |
| `HOST` | Server host | localhost |
| `LOG_LEVEL` | Logging level | info |
| `HEADLESS` | Run browser in headless mode | true |

## Health Monitoring

### Health Check Endpoint

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600000,
  "checks": {
    "memory": {
      "status": "pass",
      "message": "Memory usage: 256MB/1024MB (25%)"
    },
    "browser": {
      "status": "pass",
      "message": "Browser is available"
    }
  }
}
```

### Metrics Endpoint

```bash
curl http://localhost:8080/metrics
```

## Logging

### Log Levels
- `debug` - Detailed debugging information
- `info` - General information messages
- `warn` - Warning messages
- `error` - Error messages

### Log Files
- **Development**: `logs/development.log`
- **Production**: `/var/log/mcp-browser/production.log`
- **Errors**: `logs/exceptions.log`

### Log Rotation
Production deployments include automatic log rotation:
- Daily rotation
- Keep 30 days of logs
- Compress old logs
- Maximum 50MB per log file

## Security Considerations

### Network Security
- Run behind a reverse proxy (nginx/Apache)
- Use HTTPS in production
- Restrict access to metrics endpoint
- Configure firewall rules

### Application Security
- Enable domain validation
- Configure rate limiting
- Use secure session management
- Regular security updates

### Example nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location /health {
        proxy_pass http://localhost:8080/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /metrics {
        proxy_pass http://localhost:8080/metrics;
        allow 10.0.0.0/8;
        deny all;
    }
}
```

## Monitoring and Alerting

### Recommended Monitoring
- **Uptime**: Health check endpoint
- **Performance**: Response times, memory usage
- **Errors**: Error rates, failed requests
- **Resources**: CPU, memory, disk usage

### Integration with Monitoring Systems

#### Prometheus
```yaml
scrape_configs:
  - job_name: 'mcp-browser-server'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
```

#### Grafana Dashboard
Import the provided dashboard configuration from `monitoring/grafana-dashboard.json`

## Troubleshooting

### Common Issues

1. **Browser fails to launch**
   - Install missing system dependencies
   - Check Playwright browser installation
   - Verify permissions

2. **High memory usage**
   - Reduce maxSessions configuration
   - Enable context pooling
   - Check for memory leaks

3. **Service won't start**
   - Check configuration file syntax
   - Verify port availability
   - Review system logs

### Debug Commands

```bash
# Check service status
systemctl status mcp-browser-server

# View logs
journalctl -u mcp-browser-server -f

# Test configuration
node -e "console.log(require('./config/production.json'))"

# Check browser installation
npx playwright install --dry-run chromium
```

## Backup and Recovery

### What to Backup
- Configuration files (`config/`)
- Log files (if needed for compliance)
- Custom macros and reports

### Recovery Procedure
1. Restore configuration files
2. Reinstall dependencies
3. Restart service
4. Verify health checks

## Performance Tuning

### Optimization Settings
```json
{
  "performance": {
    "memoryLimit": 4096,
    "cpuThrottleRate": 0.8,
    "enableContextPooling": true
  },
  "browser": {
    "maxSessions": 20,
    "sessionTimeout": 1800000
  }
}
```

### System Tuning
- Increase file descriptor limits
- Configure swap appropriately
- Optimize network settings
- Use SSD storage for better I/O

## Scaling

### Horizontal Scaling
- Deploy multiple instances behind load balancer
- Use session affinity if needed
- Share configuration via external store

### Vertical Scaling
- Increase memory allocation
- Add more CPU cores
- Optimize browser session limits

## Support

For deployment issues:
1. Check the troubleshooting section
2. Review logs for error messages
3. Verify configuration settings
4. Test health endpoints
5. Contact support with detailed error information