#!/bin/bash

# MCP Browser Server Stop Script
set -e

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
}

# Parse command line arguments
FORCE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --force    Force kill the process"
            echo "  -h, --help Show this help message"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

log "Stopping MCP Browser Server..."

# Check if PID file exists
if [ -f "logs/server.pid" ]; then
    PID=$(cat logs/server.pid)
    
    # Check if process is running
    if kill -0 $PID 2>/dev/null; then
        log "Found running process with PID: $PID"
        
        if [ "$FORCE" = true ]; then
            log "Force killing process..."
            kill -9 $PID
        else
            log "Gracefully stopping process..."
            kill -TERM $PID
            
            # Wait for graceful shutdown
            for i in {1..30}; do
                if ! kill -0 $PID 2>/dev/null; then
                    break
                fi
                sleep 1
            done
            
            # Force kill if still running
            if kill -0 $PID 2>/dev/null; then
                warn "Process didn't stop gracefully, force killing..."
                kill -9 $PID
            fi
        fi
        
        # Verify process is stopped
        if kill -0 $PID 2>/dev/null; then
            error "Failed to stop process"
        else
            log "Process stopped successfully"
        fi
    else
        warn "Process with PID $PID is not running"
    fi
    
    # Remove PID file
    rm -f logs/server.pid
else
    warn "PID file not found"
fi

# Try to find and kill any remaining processes
PIDS=$(pgrep -f "mcp-browser-server\|node.*dist/index.js" || true)
if [ -n "$PIDS" ]; then
    warn "Found additional processes, stopping them..."
    echo "$PIDS" | while read -r pid; do
        if [ "$FORCE" = true ]; then
            kill -9 "$pid" 2>/dev/null || true
        else
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
fi

# Check if systemd service is running
if command -v systemctl &> /dev/null; then
    if systemctl is-active --quiet mcp-browser-server 2>/dev/null; then
        log "Stopping systemd service..."
        systemctl stop mcp-browser-server
    fi
fi

log "MCP Browser Server stopped"