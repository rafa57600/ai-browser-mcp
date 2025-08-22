#!/bin/bash

# MCP Browser Server Start Script
set -e

# Default values
NODE_ENV=${NODE_ENV:-development}
PORT=${PORT:-3000}
HOST=${HOST:-localhost}
LOG_LEVEL=${LOG_LEVEL:-info}

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
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

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            NODE_ENV="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        --log-level)
            LOG_LEVEL="$2"
            shift 2
            ;;
        --daemon)
            DAEMON=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --env ENV          Set environment (default: development)"
            echo "  --port PORT        Set port (default: 3000)"
            echo "  --host HOST        Set host (default: localhost)"
            echo "  --log-level LEVEL  Set log level (default: info)"
            echo "  --daemon           Run as daemon"
            echo "  -h, --help         Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Export environment variables
export NODE_ENV
export PORT
export HOST
export LOG_LEVEL

log "Starting MCP Browser Server"
log "Environment: $NODE_ENV"
log "Port: $PORT"
log "Host: $HOST"
log "Log Level: $LOG_LEVEL"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    warn "Dependencies not found, installing..."
    npm install
fi

# Check if build exists
if [ ! -d "dist" ] && [ ! -f "index.js" ]; then
    warn "Build not found, building..."
    npm run build
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Check configuration
if [ ! -f "config/${NODE_ENV}.json" ]; then
    warn "Configuration file config/${NODE_ENV}.json not found, using defaults"
fi

# Pre-flight checks
log "Running pre-flight checks..."

# Check if port is available
if command -v lsof &> /dev/null; then
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null; then
        error "Port $PORT is already in use"
    fi
fi

# Check Playwright installation
if ! npx playwright --version &> /dev/null; then
    warn "Playwright not found, installing..."
    npx playwright install chromium
fi

# Start the server
log "Starting server..."

if [ "$DAEMON" = true ]; then
    # Start as daemon
    nohup node dist/index.js > logs/server.log 2>&1 &
    PID=$!
    echo $PID > logs/server.pid
    log "Server started as daemon with PID: $PID"
    log "Logs: tail -f logs/server.log"
else
    # Start in foreground
    exec node dist/index.js
fi