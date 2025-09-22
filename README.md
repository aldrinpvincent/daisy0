# Daisy 🌼

> Unified browser debugging tool with AI-powered insights

**Web debugging is fragmented across multiple tools, limiting AI assistance. Daisy unifies Chrome debugging, logging, and AI integration into a single tool for efficient debugging and fixing.**

## Quick Start

```bash
# Clone and build
git clone <repository-url>
cd daisy
npm install
npm run build

# Navigate to your project directory
cd /path/to/your/project

# Run daisy from the built version (use index.js, not cli.js)
node /path/to/daisy/dist/index.js

# Or add to your project's package.json scripts:
# "scripts": {
#   "daisy-dev": "node \"/path/to/daisy/dist/index.js\" --script \"dev\" --port 8080 --debug"
# }
# Then run: npm run daisy-dev
# 
# Note: Specify --port if your dev server runs on a port other than 3000
# Note: Specify --script if your dev script name is not auto-detected (dev, start:dev, develop, serve, start)
```

### Future: Global Installation
```bash
# Coming soon - install globally
npm install -g daisy
daisy --script "yarn dev"
```

## What Daisy Does

With one command, Daisy automatically:
- 🌐 **Launches Chrome debugging** (with DevTools Protocol)
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

Daisy operates as a unified debugging orchestrator that starts with a single command. When you run daisy, it automatically detects your package manager and development script, then launches Chrome with debugging enabled, connects to the Chrome DevTools Protocol to capture real-time browser events (console logs, network requests, JavaScript errors, performance metrics), and simultaneously starts a web viewer interface and MCP server. All captured events are processed into structured JSON logs with automatic screenshot capture on errors, stored cross-platform in your home directory. The MCP server makes these logs accessible to AI assistants like Claude or Copilot, enabling intelligent error analysis and automated debugging suggestions, while the web interface provides visual log inspection - creating a complete debugging ecosystem that bridges traditional browser debugging with modern AI-assisted development workflows.

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

### Dev script auto-detection logic

**Package Manager Detection:**
- Checks for `pnpm-lock.yaml` → uses `pnpm run`
- Checks for `yarn.lock` → uses `yarn`
- Checks for `package-lock.json` → uses `npm run`
- Default fallback → uses `npm run`

**Script Detection:**
Daisy looks for these scripts in your `package.json` (in priority order):
1. `dev` → runs `npm run dev`
2. `start:dev` → runs `npm run start:dev`
3. `develop` → runs `npm run develop`
4. `serve` → runs `npm run serve`
5. `start` → runs `npm run start`

**Manual Override Examples:**
```bash
# For npm start
daisy --script "start"

# For npm run dev
daisy --script "dev"

# For custom script
daisy --script "start:local"

# For yarn dev
daisy --script "yarn dev"
```

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

**VS Code + Copilot ** (`mcp.json`):
```json
{
  "mcpServers": {
    "daisy-debug": {
      "command": "node",
      "args": [
        "/path/to/daisy/mcp-server/dist/index.js",
        "--log-file", "~/.daisy/logs/daisy-current.log",
        "--screenshots-dir", "~/.daisy/logs/screenshots",
        "--watch"
      ],
      "env": {},
      "disabled": false,
      "autoApprove": ["analyze_logs", "find_errors", "get_log_summary"],
      "disabledTools": []
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
