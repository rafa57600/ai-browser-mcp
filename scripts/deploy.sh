#!/bin/bash

# MCP Browser Server Deployment Script
set -e

# Configuration
APP_NAME="mcp-browser-server"
APP_DIR="/opt/${APP_NAME}"
SERVICE_NAME="${APP_NAME}"
USER="mcp-browser"
NODE_VERSION="18"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

# Parse command line arguments
ENVIRONMENT="production"
SKIP_DEPS=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --env ENV        Set environment (default: production)"
            echo "  --skip-deps      Skip dependency installation"
            echo "  --skip-build     Skip build process"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

log "Starting deployment for environment: $ENVIRONMENT"

# Create application user if it doesn't exist
if ! id "$USER" &>/dev/null; then
    log "Creating application user: $USER"
    useradd --system --home-dir "$APP_DIR" --shell /bin/bash "$USER"
fi

# Create application directory
log "Creating application directory: $APP_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/config"
mkdir -p "$APP_DIR/tmp"

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    log "Installing Node.js $NODE_VERSION"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

# Install system dependencies for Playwright
if [ "$SKIP_DEPS" = false ]; then
    log "Installing system dependencies"
    apt-get update
    apt-get install -y \
        libnss3-dev \
        libatk-bridge2.0-dev \
        libdrm-dev \
        libxcomposite-dev \
        libxdamage-dev \
        libxrandr-dev \
        libgbm-dev \
        libxss-dev \
        libasound2-dev
fi

# Copy application files
log "Copying application files"
cp -r dist/* "$APP_DIR/"
cp -r config/* "$APP_DIR/config/"
cp package*.json "$APP_DIR/"

# Set ownership
chown -R "$USER:$USER" "$APP_DIR"

# Install dependencies
if [ "$SKIP_DEPS" = false ]; then
    log "Installing Node.js dependencies"
    cd "$APP_DIR"
    sudo -u "$USER" npm ci --production
    
    # Install Playwright browsers
    log "Installing Playwright browsers"
    sudo -u "$USER" npx playwright install chromium
fi

# Create systemd service file
log "Creating systemd service"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=MCP Browser Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=$ENVIRONMENT
Environment=PORT=8080
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR

# Resource limits
LimitNOFILE=65536
MemoryMax=4G

[Install]
WantedBy=multi-user.target
EOF

# Create log rotation configuration
log "Setting up log rotation"
cat > "/etc/logrotate.d/${SERVICE_NAME}" << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        systemctl reload $SERVICE_NAME
    endscript
}
EOF

# Create nginx configuration (if nginx is installed)
if command -v nginx &> /dev/null; then
    log "Creating nginx configuration"
    cat > "/etc/nginx/sites-available/${SERVICE_NAME}" << EOF
server {
    listen 80;
    server_name _;

    location /health {
        proxy_pass http://localhost:8080/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /metrics {
        proxy_pass http://localhost:8080/metrics;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Restrict access to metrics
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }

    location / {
        return 404;
    }
}
EOF

    # Enable the site
    ln -sf "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/"
    nginx -t && systemctl reload nginx
fi

# Reload systemd and start service
log "Starting service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# Wait for service to start
sleep 5

# Check service status
if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "Service started successfully"
    
    # Test health endpoint
    if curl -f http://localhost:8080/health > /dev/null 2>&1; then
        log "Health check passed"
    else
        warn "Health check failed"
    fi
else
    error "Service failed to start"
fi

log "Deployment completed successfully!"
log "Service status: $(systemctl is-active $SERVICE_NAME)"
log "Logs: journalctl -u $SERVICE_NAME -f"
log "Health check: curl http://localhost:8080/health"