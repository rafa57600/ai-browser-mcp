#!/bin/bash

# AI Browser MCP - One-Liner Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/your-org/ai-browser-mcp/main/scripts/one-liner-install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✅${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠️${NC} $1"; }
log_error() { echo -e "${RED}❌${NC} $1"; }

# Configuration
REPO_URL="https://github.com/rafa57600/ai-browser-mcp.git"
INSTALL_DIR="ai-browser-mcp"
BRANCH="main"

main() {
    echo "🤖 AI Browser MCP - One-Liner Installation"
    echo "=========================================="
    echo ""
    
    # Check prerequisites
    log_info "Checking prerequisites..."
    
    if ! command -v git &> /dev/null; then
        log_error "git is required but not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        log_info "Install from: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        log_error "Node.js 16+ required, found $(node --version)"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
    
    # Clone repository
    log_info "Cloning repository..."
    
    if [ -d "$INSTALL_DIR" ]; then
        log_warning "Directory $INSTALL_DIR already exists"
        read -p "Remove and reinstall? (y/N): " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            log_info "Installation cancelled"
            exit 0
        fi
    fi
    
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    log_success "Repository cloned"
    
    # Run installer
    log_info "Running automated installer..."
    
    if [ -f "install.js" ]; then
        node install.js
    elif [ -f "scripts/install.sh" ]; then
        chmod +x scripts/install.sh
        ./scripts/install.sh
    else
        log_warning "No installer found, running manual setup..."
        npm install
        npx playwright install chromium
        npm run build
        log_success "Manual setup completed"
    fi
    
    # Final message
    echo ""
    log_success "🎉 AI Browser MCP installed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "   cd $INSTALL_DIR"
    echo "   npm start"
    echo ""
    echo "📖 Documentation: https://github.com/your-org/ai-browser-mcp#readme"
    echo ""
}

main "$@"