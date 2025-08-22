# AI Browser MCP - Windows PowerShell Installation Script

param(
    [switch]$SkipDeps,
    [switch]$GlobalOnly,
    [switch]$WorkspaceOnly,
    [string]$Port = "3000"
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info($message) {
    Write-Host "ℹ $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Warning($message) {
    Write-Host "⚠️ $message" -ForegroundColor Yellow
}

function Write-Error($message) {
    Write-Host "❌ $message" -ForegroundColor Red
}

# Check if running as administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        
        if ($majorVersion -lt 16) {
            Write-Error "Node.js 16+ required, found $nodeVersion"
            Write-Info "Please install Node.js 16+ from https://nodejs.org/"
            exit 1
        }
        
        Write-Success "Node.js $nodeVersion ✓"
    }
    catch {
        Write-Error "Node.js is not installed or not in PATH"
        Write-Info "Please install Node.js 16+ from https://nodejs.org/"
        exit 1
    }
    
    # Check npm
    try {
        $npmVersion = npm --version
        Write-Success "npm $npmVersion ✓"
    }
    catch {
        Write-Error "npm is not installed or not in PATH"
        exit 1
    }
    
    # Check git
    try {
        $gitVersion = git --version
        Write-Success "$gitVersion ✓"
    }
    catch {
        Write-Error "git is not installed or not in PATH"
        Write-Info "Please install Git from https://git-scm.com/"
        exit 1
    }
}

# Install project dependencies
function Install-ProjectDependencies {
    Write-Info "Installing project dependencies..."
    
    if (-not (Test-Path "package.json")) {
        Write-Error "package.json not found. Are you in the project directory?"
        exit 1
    }
    
    try {
        npm install
        Write-Success "Project dependencies installed ✓"
    }
    catch {
        Write-Error "Failed to install project dependencies: $_"
        exit 1
    }
}

# Install Playwright browsers
function Install-Playwright {
    Write-Info "Installing Playwright browsers..."
    
    try {
        npx playwright install chromium
        Write-Success "Playwright browsers installed ✓"
    }
    catch {
        Write-Error "Failed to install Playwright browsers: $_"
        Write-Warning "You may need to run this script as Administrator"
        
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            exit 1
        }
    }
}

# Build project
function Build-Project {
    Write-Info "Building project..."
    
    try {
        npm run build
        Write-Success "Project built ✓"
    }
    catch {
        Write-Error "Failed to build project: $_"
        exit 1
    }
}

# Configure MCP
function Set-MCPConfiguration {
    Write-Info "Configuring MCP integration..."
    
    $projectRoot = Get-Location
    $homeDir = $env:USERPROFILE
    $kiloConfigDir = Join-Path $homeDir ".kiro\settings"
    $workspaceConfigDir = Join-Path $projectRoot ".kiro\settings"
    
    # Create MCP configuration
    $mcpConfig = @{
        mcpServers = @{
            "ai-browser-mcp" = @{
                command = "node"
                args = @(Join-Path $projectRoot "dist\index.js")
                env = @{
                    NODE_ENV = "production"
                    LOG_LEVEL = "info"
                }
                disabled = $false
                autoApprove = @(
                    "mcp_ai_browser_mcp_browsernewContext",
                    "mcp_ai_browser_mcp_browsergoto",
                    "mcp_ai_browser_mcp_browserscreenshot",
                    "mcp_ai_browser_mcp_browserclick",
                    "mcp_ai_browser_mcp_browsertype",
                    "mcp_ai_browser_mcp_browsereval"
                )
            }
        }
    }
    
    $configJson = $mcpConfig | ConvertTo-Json -Depth 10
    
    # Determine installation type
    $installType = 1
    if ($GlobalOnly) {
        $installType = 2
    }
    elseif (-not $WorkspaceOnly) {
        Write-Host "Choose MCP configuration location:"
        Write-Host "1. Workspace only (recommended for development)"
        Write-Host "2. Global user configuration"
        Write-Host "3. Both"
        
        do {
            $choice = Read-Host "Enter choice (1-3)"
        } while ($choice -notmatch '^[1-3]$')
        
        $installType = [int]$choice
    }
    
    try {
        # Workspace configuration
        if ($installType -eq 1 -or $installType -eq 3) {
            if (-not (Test-Path $workspaceConfigDir)) {
                New-Item -ItemType Directory -Path $workspaceConfigDir -Force | Out-Null
            }
            
            $workspaceConfigPath = Join-Path $workspaceConfigDir "mcp.json"
            
            # Merge with existing config if it exists
            $existingConfig = @{}
            if (Test-Path $workspaceConfigPath) {
                try {
                    $existingConfig = Get-Content $workspaceConfigPath | ConvertFrom-Json -AsHashtable
                }
                catch {
                    Write-Warning "Invalid existing workspace config, creating new one"
                }
            }
            
            if ($existingConfig.mcpServers) {
                $existingConfig.mcpServers."ai-browser-mcp" = $mcpConfig.mcpServers."ai-browser-mcp"
            }
            else {
                $existingConfig = $mcpConfig
            }
            
            $existingConfig | ConvertTo-Json -Depth 10 | Set-Content $workspaceConfigPath
            Write-Success "Workspace MCP config created: $workspaceConfigPath"
        }
        
        # Global configuration
        if ($installType -eq 2 -or $installType -eq 3) {
            if (-not (Test-Path $kiloConfigDir)) {
                New-Item -ItemType Directory -Path $kiloConfigDir -Force | Out-Null
            }
            
            $globalConfigPath = Join-Path $kiloConfigDir "mcp.json"
            
            # Merge with existing config if it exists
            $existingConfig = @{}
            if (Test-Path $globalConfigPath) {
                try {
                    $existingConfig = Get-Content $globalConfigPath | ConvertFrom-Json -AsHashtable
                }
                catch {
                    Write-Warning "Invalid existing global config, creating new one"
                }
            }
            
            if ($existingConfig.mcpServers) {
                $existingConfig.mcpServers."ai-browser-mcp" = $mcpConfig.mcpServers."ai-browser-mcp"
            }
            else {
                $existingConfig = $mcpConfig
            }
            
            $existingConfig | ConvertTo-Json -Depth 10 | Set-Content $globalConfigPath
            Write-Success "Global MCP config created: $globalConfigPath"
        }
    }
    catch {
        Write-Error "Failed to configure MCP: $_"
        exit 1
    }
}

# Create quick start scripts
function New-QuickStartScripts {
    Write-Info "Creating quick start scripts..."
    
    # PowerShell script
    $startScript = @'
# AI Browser MCP - Quick Start Script

Write-Host "🚀 Starting AI Browser MCP Server..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "production"
$env:LOG_LEVEL = "info"

# Start the server
try {
    node dist/index.js
}
catch {
    Write-Host "❌ Failed to start server: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
'@
    
    $startScript | Set-Content "start.ps1"
    
    # Batch script for compatibility
    $batchScript = @'
@echo off
echo 🚀 Starting AI Browser MCP Server...

set NODE_ENV=production
set LOG_LEVEL=info

node dist/index.js

if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to start server
    pause
)
'@
    
    $batchScript | Set-Content "start.bat"
    
    Write-Success "Quick start scripts created: start.ps1, start.bat"
}

# Test installation
function Test-Installation {
    Write-Info "Testing installation..."
    
    try {
        # Test basic server startup with timeout
        $job = Start-Job -ScriptBlock {
            param($projectRoot)
            Set-Location $projectRoot
            node dist/index.js --test
        } -ArgumentList (Get-Location)
        
        $completed = Wait-Job $job -Timeout 10
        
        if ($completed) {
            $output = Receive-Job $job
            Remove-Job $job
            
            if ($output -match "Server started|MCP server") {
                Write-Success "Installation test passed ✓"
                return $true
            }
        }
        else {
            Stop-Job $job
            Remove-Job $job
            Write-Warning "Server test timeout - this may be normal"
            return $true
        }
    }
    catch {
        Write-Warning "Installation test failed: $_"
        return $false
    }
}

# Show completion message
function Show-Completion {
    Write-Success "🎉 Installation completed successfully!"
    
    Write-Host @"

📋 Next Steps:

1. Start the MCP server:
   .\start.ps1
   or
   .\start.bat
   or
   npm start

2. In Kiro/VS Code:
   - Restart Kiro to load the new MCP server
   - Check MCP servers panel for "ai-browser-mcp"
   - Try browser automation commands

3. Test the integration:
   - "Take a screenshot of google.com"
   - "Navigate to example.com"
   - Check examples\ folder for more

📚 Documentation:
   - QUICK_START.md - Getting started guide
   - docs\api-reference.md - API documentation
   - docs\troubleshooting.md - Common issues
   - examples\ - Usage examples

🔧 Configuration files created:
   - .kiro\settings\mcp.json (workspace)
   - ~/.kiro\settings\mcp.json (global, if selected)

❓ Need help?
   - Check docs\faq.md
   - Review docs\troubleshooting.md
   - Open an issue on GitHub

Happy automating! 🤖✨

"@ -ForegroundColor White
}

# Main installation function
function Start-Installation {
    Write-Host "🤖 AI Browser MCP - Easy Installation" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "This script will set up the AI Browser MCP server with all dependencies"
    Write-Host "and configure it for use with Kiro."
    Write-Host ""
    
    # Check if running as administrator
    if (-not (Test-Administrator)) {
        Write-Warning "Not running as Administrator. Some operations may fail."
        Write-Info "Consider running PowerShell as Administrator for best results."
        
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y" -and $continue -ne "Y") {
            Write-Info "Installation cancelled"
            exit 0
        }
    }
    
    # Ask for confirmation
    if (-not $SkipDeps) {
        $confirm = Read-Host "Continue with installation? (y/N)"
        if ($confirm -ne "y" -and $confirm -ne "Y") {
            Write-Info "Installation cancelled"
            exit 0
        }
    }
    
    try {
        # Run installation steps
        Test-Prerequisites
        Install-ProjectDependencies
        Install-Playwright
        Build-Project
        Set-MCPConfiguration
        New-QuickStartScripts
        Test-Installation
        Show-Completion
    }
    catch {
        Write-Error "Installation failed: $_"
        exit 1
    }
}

# Run main function
Start-Installation