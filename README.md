# Daisy 🌼

> Unified browser debugging tool with AI-powered insights

**Web debugging is fragmented across multiple tools, limiting AI assistance. Daisy unifies Chrome debugging, logging, and AI integration into a single tool for efficient debugging and fixing.**

## Quick Start

```bash
# Install globally
npm install -g daisy

# Start debugging in your project
daisy

# With custom script
daisy --script "yarn dev"
```

## What Daisy Does

With one command, Daisy automatically:
- 🌐 **Launches Chrome debugging** (headless with DevTools Protocol)
- 📊 **Starts web viewer** on http://localhost:5000
- 🤖 **Runs MCP server** for AI assistant integration
- 📝 **Captures structured logs** to `~/.daisy/logs/`
- 📸 **Takes screenshots** on errors

## Key Features

### 🔍 Real-Time Browser Monitoring
- Captures browser events via Chrome DevTools Protocol
- Monitors console logs, network requests, errors, and performance metrics
- Automatic screenshot capture on errors

### 🤖 AI-Powered Debugging
- Built-in MCP server for AI assistant integration (Claude, Copilot, Cursor, Windsurf)
- Intelligent error analysis and automated fix suggestions
- Structured JSON logging optimized for AI consumption

### ⚡ Developer Experience
- Auto-detects package managers and development scripts
- One command setup - no complex configuration
- Web interface for visual log inspection
- Cross-platform with configurable verbosity levels

## How It Works

Daisy operates as a unified debugging orchestrator that starts with a single command. When you run `daisy`, it automatically detects your package manager and development script, then launches headless Chrome with debugging enabled, connects to the Chrome DevTools Protocol to capture real-time browser events, and simultaneously starts a web viewer interface and MCP server. All captured events are processed into structured JSON logs with automatic screenshot capture on errors, while the MCP server makes these logs accessible to AI assistants for intelligent error analysis and automated debugging suggestions.

## Usage

### Basic Commands

```bash
# Start with auto-detection
daisy

# Custom script
daisy --script "npm run start:dev"

# Custom ports
daisy --port 3000 --web-port 5000

# Minimal logging (errors only)
daisy --log-level minimal

# Verbose debugging
daisy --log-level verbose --debug

# Servers only (no Chrome)
daisy --servers-only
```

### Auto-Detection Features

Daisy automatically detects:
- **Package manager**: npm, yarn, or pnpm (based on lockfiles)
- **Development script**: Tries `dev`, `start:dev`, `develop`, `serve`, `start` in order
- **Project type**: Configures optimal settings for your stack

## AI Assistant Integration

### Setup MCP Server

```bash
# Install MCP server
cd mcp-server
npm install && npm run build

# Start with auto-detection
npx daisy-mcp-server --auto-detect --watch
```

### Configure AI Assistants

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

### AI Interactions

Ask your AI assistant:
- *"Analyze my daisy logs for errors and performance issues"*
- *"What JavaScript errors are occurring and how can I fix them?"*
- *"Generate a summary of this debugging session"*
- *"Find network failures and suggest improvements"*

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--script <script>` | Script to run | Auto-detected |
| `--port <port>` | Development server port | 3000 |
| `--web-port <port>` | Web viewer port | 5000 |
| `--chrome-port <port>` | Chrome debugging port | 9222 |
| `--control-port <port>` | Control API server port | 9223 |
| `--servers-only` | Start only web viewer and MCP server | false |
| `--debug` | Enable debug mode | false |
| `--log-level <level>` | Log verbosity: minimal, standard, verbose | standard |

## Requirements

- Node.js 18+
- Chrome/Chromium browser
- For AI integration: AI assistant with MCP support

## Architecture

- **CLI Entry Point**: Commander.js-based CLI orchestration
- **Chrome Management**: Automated headless browser with debugging flags
- **DevTools Integration**: Real-time Chrome DevTools Protocol communication
- **Event Monitoring**: Comprehensive browser event capture
- **Structured Logging**: JSON-based logs optimized for AI consumption
- **MCP Server**: Model Context Protocol for AI assistant access

## License

ISC

## Contributing

Contributions welcome! This project bridges traditional browser debugging with modern AI-assisted development workflows.