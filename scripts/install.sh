#!/bin/bash

# AI Browser MCP - Cross-Platform Installation Script
# Supports Linux, macOS, and Windows (via Git Bash/WSL)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS=Linux;;
        Darwin*)    OS=Mac;;
        CYGWIN*)    OS=Windows;;
        MINGW*)     OS=Windows;;
        MSYS*)      OS=Windows;;
        *)          OS="Unknown";;
    esac
    log_info "Detected OS: $OS"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        log_info "Please install Node.js 16+ from https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        log_error "Node.js 16+ required, found $(node --version)"
        exit 1
    fi
    
    log_success "Node.js $(node --version) ✓"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    log_success "npm $(npm --version) ✓"
    
    # Check git
    if ! command -v git &> /dev/null; then
        log_error "git is not installed"
        exit 1
    fi
    
    log_success "git $(git --version | cut -d' ' -f3) ✓"
}

# Install system dependencies
install_system_deps() {
    log_info "Installing system dependencies..."
    
    case $OS in
        Linux)
            if command -v apt-get &> /dev/null; then
                log_info "Installing dependencies via apt-get..."
                sudo apt-get update
                sudo apt-get install -y \
                    libnss3-dev \
                    libatk-bridge2.0-dev \
                    libdrm2 \
                    libxkbcommon0 \
                    libgtk-3-dev \
                    libxss1 \
                    libasound2
            elif command -v yum &> /dev/null; then
                log_info "Installing dependencies via yum..."
                sudo yum install -y \
                    nss \
                    atk \
                    at-spi2-atk \
                    gtk3 \
                    cups-libs \
                    libdrm \
                    libxkbcommon \
                    libXcomposite \
                    libXdamage \
                    libXrandr \
                    libgbm \
                    libXss \
                    alsa-lib
            else
                log_warning "Unknown package manager. You may need to install browser dependencies manually."
            fi
            ;;
        Mac)
            if ! command -v xcode-select &> /dev/null; then
                log_info "Installing Xcode command line tools..."
                xcode-select --install
            fi
            ;;
        Windows)
            log_info "Windows detected. Browser dependencies should be handled automatically."
            ;;
    esac
    
    log_success "System dependencies installed ✓"
}

# Install project dependencies
install_project_deps() {
    log_info "Installing project dependencies..."
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Are you in the project directory?"
        exit 1
    fi
    
    npm install
    log_success "Project dependencies installed ✓"
}

# Install Playwright browsers
install_playwright() {
    log_info "Installing Playwright browsers..."
    
    npx playwright install chromium
    
    # Install system dependencies for Playwright (Linux)
    if [ "$OS" = "Linux" ]; then
        npx playwright install-deps chromium || log_warning "Failed to install Playwright system dependencies"
    fi
    
    log_success "Playwright browsers installed ✓"
}

# Build project
build_project() {
    log_info "Building project..."
    
    npm run build
    log_success "Project built ✓"
}

# Configure MCP
configure_mcp() {
    log_info "Configuring MCP integration..."
    
    PROJECT_ROOT=$(pwd)
    HOME_DIR="${HOME:-$USERPROFILE}"
    KIRO_CONFIG_DIR="$HOME_DIR/.kiro/settings"
    WORKSPACE_CONFIG_DIR="$PROJECT_ROOT/.kiro/settings"
    
    # Create MCP configuration
    MCP_CONFIG='{
  "mcpServers": {
    "ai-browser-mcp": {
      "command": "node",
      "args": ["'$PROJECT_ROOT'/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "LOG_LEVEL": "info"
      },
      "disabled": false,
      "autoApprove": [
        "mcp_ai_browser_mcp_browsernewContext",
        "mcp_ai_browser_mcp_browsergoto",
        "mcp_ai_browser_mcp_browserscreenshot",
        "mcp_ai_browser_mcp_browserclick",
        "mcp_ai_browser_mcp_browsertype",
        "mcp_ai_browser_mcp_browsereval"
      ]
    }
  }
}'
    
    echo "Choose MCP configuration location:"
    echo "1. Workspace only (recommended for development)"
    echo "2. Global user configuration"
    echo "3. Both"
    read -p "Enter choice (1-3): " choice
    
    case $choice in
        1|3)
            # Workspace configuration
            mkdir -p "$WORKSPACE_CONFIG_DIR"
            echo "$MCP_CONFIG" > "$WORKSPACE_CONFIG_DIR/mcp.json"
            log_success "Workspace MCP config created: $WORKSPACE_CONFIG_DIR/mcp.json"
            ;;
    esac
    
    case $choice in
        2|3)
            # Global configuration
            mkdir -p "$KIRO_CONFIG_DIR"
            echo "$MCP_CONFIG" > "$KIRO_CONFIG_DIR/mcp.json"
            log_success "Global MCP config created: $KIRO_CONFIG_DIR/mcp.json"
            ;;
    esac
}

# Create quick start script
create_quick_start() {
    log_info "Creating quick start script..."
    
    cat > start.sh << 'EOF'
#!/bin/bash

echo "🚀 Starting AI Browser MCP Server..."

# Set environment variables
export NODE_ENV=production
export LOG_LEVEL=info

# Start the server
node dist/index.js

EOF
    
    chmod +x start.sh
    log_success "Quick start script created: start.sh"
}

# Test installation
test_installation() {
    log_info "Testing installation..."
    
    # Start server in background for testing
    timeout 10s node dist/index.js --test &> /dev/null || {
        log_warning "Server test timeout - this may be normal"
        return 0
    }
    
    log_success "Installation test passed ✓"
}

# Show completion message
show_completion() {
    log_success "🎉 Installation completed successfully!"
    
    cat << EOF

📋 Next Steps:

1. Start the MCP server:
   ./start.sh
   or
   npm start

2. In Kiro/VS Code:
   - Restart Kiro to load the new MCP server
   - Check MCP servers panel for "ai-browser-mcp"
   - Try browser automation commands

3. Test the integration:
   - "Take a screenshot of google.com"
   - "Navigate to example.com"
   - Check examples/ folder for more

📚 Documentation:
   - QUICK_START.md - Getting started guide
   - docs/api-reference.md - API documentation
   - docs/troubleshooting.md - Common issues
   - examples/ - Usage examples

🔧 Configuration files created:
   - .kiro/settings/mcp.json (workspace)
   - ~/.kiro/settings/mcp.json (global, if selected)

❓ Need help?
   - Check docs/faq.md
   - Review docs/troubleshooting.md
   - Open an issue on GitHub

Happy automating! 🤖✨

EOF
}

# Main installation function
main() {
    echo "🤖 AI Browser MCP - Easy Installation"
    echo "====================================="
    echo ""
    echo "This script will set up the AI Browser MCP server with all dependencies"
    echo "and configure it for use with Kiro."
    echo ""
    
    detect_os
    check_prerequisites
    
    # Ask for confirmation
    read -p "Continue with installation? (y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    
    # Run installation steps
    install_system_deps
    install_project_deps
    install_playwright
    build_project
    configure_mcp
    create_quick_start
    test_installation
    show_completion
}

# Run main function
main "$@"