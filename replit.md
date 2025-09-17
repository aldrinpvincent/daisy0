# Overview

**Daisy is a unified browser debugging tool that provides a dev3000-like single-command experience.** It automatically starts Chrome debugging, a web viewer interface, and an MCP server for AI assistant integration - all with one simple command. Daisy streams comprehensive browser debugging data via the Chrome DevTools Protocol, monitors browser events (console logs, network requests, errors, performance metrics), and provides real-time insights through both a web interface and structured logs.

## Quick Start

**Like dev3000, daisy starts everything with one command:**

```bash
# Install globally (recommended)
npm install -g daisy

# Start everything in your project directory
daisy

# With custom script
daisy --script "yarn dev"
daisy --script "npm run start:dev"
```

**What daisy starts automatically:**
- 🌐 **Chrome debugging** (headless with DevTools Protocol)  
- 📊 **Web viewer** on http://localhost:5000 (visual log interface)
- 🤖 **MCP server** (stdio transport for AI assistants)
- 📝 **Centralized logging** to `/tmp/daisy/current.log`
- 📸 **Automatic screenshots** on errors

## Auto-Detection Features

Daisy automatically detects your development environment:
- **Package manager**: npm, yarn, or pnpm (based on lockfiles)
- **Development script**: Tries `dev`, `start:dev`, `develop`, `serve`, `start` in order
- **Project type**: Configures optimal settings for your stack

## Advanced Usage

```bash
# Minimal logging (errors only)
daisy --log-level minimal

# Verbose debugging with all details  
daisy --log-level verbose

# Custom ports
daisy --port 3000 --chrome-port 9223

# Servers only (no Chrome launching)
daisy --servers-only

# Debug mode with verbose console output
daisy --debug
```

## MCP Server for AI Assistants

Daisy includes a complete **Model Context Protocol (MCP) server** that makes debugging logs accessible to AI coding assistants like GitHub Copilot, Claude, Cursor, and Windsurf.

### Quick Setup

```bash
# Install and start the MCP server
cd mcp-server
npm install && npm run build

# Auto-detect daisy logs and start MCP server
npx daisy-mcp-server --auto-detect --watch
```

### AI Assistant Integration

The MCP server provides intelligent tools for log analysis:

- **`analyze_logs`** - Parse and categorize entries by type/severity with filtering
- **`find_errors`** - Extract JavaScript errors, network failures, console errors with context  
- **`performance_insights`** - Analyze performance metrics, slow requests, memory usage patterns
- **`suggest_fixes`** - Provide debugging suggestions with code examples based on log patterns
- **`get_log_summary`** - Generate comprehensive debugging session summaries

### Configuration Examples

**Claude Desktop** (`~/.claude/config.json`):
```json
{
  "mcpServers": {
    "daisy-mcp-server": {
      "command": "npx",
      "args": ["daisy-mcp-server", "--auto-detect", "--watch"]
    }
  }
}
```

**VS Code + Copilot** (settings.json):
```json
{
  "mcp.servers": {
    "daisy-debugging": {
      "command": "npx", 
      "args": ["daisy-mcp-server", "--auto-detect", "--watch"]
    }
  }
}
```

**Cursor** (`.cursor-settings/mcp.json`):
```json
{
  "mcpServers": {
    "daisy-logs": {
      "command": "npx",
      "args": ["daisy-mcp-server", "--auto-detect", "--watch"]
    }
  }
}
```

Once configured, you can ask your AI assistant:
- *"Analyze my daisy logs for errors and performance issues"*
- *"What JavaScript errors are occurring and how can I fix them?"*
- *"Generate a summary of this debugging session"*
- *"Find network failures and suggest improvements"*

See `mcp-server/docs/setup-guide.md` for complete configuration instructions.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Architecture Pattern
Daisy follows a modular, event-driven architecture with clear separation of concerns:

- **CLI Entry Point**: Commander.js-based CLI that orchestrates the debugging session
- **Chrome Management**: Automated Chrome launcher with headless browser configuration
- **DevTools Integration**: Chrome Remote Interface for real-time protocol communication
- **Event Monitoring**: Comprehensive event listeners for browser debugging data
- **Structured Logging**: JSON-based log output optimized for LLM consumption
- **Script Execution**: Child process management for running target applications

## Component Design

### Chrome Launcher (`ChromeLauncher`)
- Manages headless Chrome instances with extensive debugging flags
- Configures remote debugging port (default 9222)
- Handles Chrome lifecycle (launch/kill)
- Uses chrome-launcher package for reliable browser management

### DevTools Monitor (`DevToolsMonitor`)
- Establishes CDP (Chrome DevTools Protocol) connection
- Enables multiple debugging domains: Runtime, Network, Log, Performance, Page, Security, Debugger
- Sets up comprehensive event listeners for real-time monitoring
- Streams events to logger with contextual information

### Structured Logger (`DaisyLogger`)
- Creates JSON-structured log entries with timestamps and categorization
- Writes to file streams for persistent debugging data
- Includes session metadata and log structure documentation
- Optimized for LLM parsing with clear data schemas

### Script Runner (`ScriptRunner`)
- Spawns child processes for target applications (npm, yarn, or direct commands)
- Manages stdio streams and process lifecycle
- Provides real-time output forwarding to console

## Data Flow Architecture
1. CLI parses user input and initializes components
2. Chrome launches with debugging enabled on specified port
3. DevTools monitor connects via CDP and enables event domains
4. Script runner starts target application in parallel
5. Browser events stream to structured logger in real-time
6. Session continues until script completion or manual termination

## TypeScript Configuration
- Target ES2020 with CommonJS modules for Node.js compatibility
- Strict type checking enabled for reliability
- Source maps and declarations generated for debugging
- Output directory separation (src/ → dist/)

# Recent Improvements

## Log Filtering System
- Added configurable verbosity levels: minimal, standard, verbose
- **minimal**: Only errors, warnings, and critical network requests
- **standard**: Essential debugging info without verbose metadata (SSL certs, extensive headers)
- **verbose**: Full details including headers, certificates, and stack traces
- Console logs are cleanly captured with source location and appropriate stack traces
- Network requests filter out timing data, certificates, and verbose headers

## Automatic Screenshot on Errors
- **JavaScript errors**: Automatic screenshots when Runtime exceptions occur
- **Console errors**: Screenshots captured for console.error() messages  
- **Network failures**: Screenshots on network loading failures (4xx/5xx responses)
- Screenshots saved to `./screenshots/` directory with descriptive filenames
- Screenshot paths included in error log entries for visual debugging context

## Security Note
For production use, consider implementing credential redaction for sensitive headers (Authorization, API keys, tokens) that are currently preserved for local debugging convenience.

# External Dependencies

## Core Runtime Dependencies
- **chrome-launcher**: Programmatic Chrome browser management and configuration
- **chrome-remote-interface**: Chrome DevTools Protocol client for browser communication
- **commander**: CLI framework for argument parsing and command structure
- **ts-node**: TypeScript execution environment for development workflow
- **typescript**: TypeScript compiler and language support

## Development Toolchain
- **@types/chrome-remote-interface**: TypeScript definitions for CDP integration
- **@types/node**: Node.js TypeScript definitions for system integration

## System Requirements
- Node.js runtime environment (ES2020 compatible)
- Chrome/Chromium browser installation for headless operation
- File system write access for log output
- For MCP server: AI coding assistant with MCP support (Claude, VS Code + Copilot, Cursor, Windsurf)

## Protocol Integration
- **Chrome DevTools Protocol (CDP)**: Primary interface for browser debugging data
- **Chrome Remote Debugging**: Network protocol for browser communication
- **JSON-RPC**: Underlying communication protocol for CDP messages