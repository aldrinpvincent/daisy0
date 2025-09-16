# Daisy MCP Server Setup Guide

The Daisy MCP Server provides AI coding assistants with intelligent access to daisy debugging logs, enabling advanced error analysis, performance insights, and debugging suggestions.

## Quick Start

### Installation

1. **Install the MCP server:**
   ```bash
   cd mcp-server
   npm install
   npm run build
   npm link  # Optional: for global CLI access
   ```

2. **Or install globally via npx:**
   ```bash
   npx daisy-mcp-server --help
   ```

### Basic Usage

```bash
# Auto-detect daisy log files in current directory
daisy-mcp --auto-detect --watch

# Specify a specific log file
daisy-mcp --log-file debug.log --screenshots-dir screenshots

# Use with specific transport
daisy-mcp --transport stdio --log-file verbose-debug.log
```

## AI Assistant Configurations

### Claude Desktop

1. **Location:** `~/.claude/config.json` (macOS) or `%APPDATA%\Claude\config.json` (Windows)

2. **Configuration:**
   ```json
   {
     "mcpServers": {
       "daisy-mcp-server": {
         "command": "npx",
         "args": ["daisy-mcp-server", "--auto-detect", "--watch"],
         "cwd": ".",
         "env": {}
       }
     }
   }
   ```

3. **Usage in Claude:**
   - Claude will automatically detect the MCP server
   - Use prompts like: "Analyze my daisy logs for errors"
   - Ask: "What performance issues do you see in the logs?"
   - Request: "Suggest fixes for the JavaScript errors"

### VS Code + GitHub Copilot

1. **Setup:** Add to VS Code settings (`settings.json`):
   ```json
   {
     "mcp.servers": {
       "daisy-debugging": {
         "command": "npx",
         "args": ["daisy-mcp-server", "--auto-detect", "--watch"],
         "env": {
           "NODE_ENV": "development"
         }
       }
     }
   }
   ```

2. **Usage:**
   - Copilot will have access to log analysis tools
   - Use comments like: `// TODO: Fix the errors shown in daisy logs`
   - Ask Copilot Chat: "What do the daisy logs say about this error?"

### Cursor

1. **Configuration file:** `.cursor-settings/mcp.json` in your project:
   ```json
   {
     "mcpServers": {
       "daisy-logs": {
         "command": "node",
         "args": ["./mcp-server/dist/index.js", "--auto-detect", "--watch"],
         "cwd": "${workspaceFolder}",
         "env": {
           "NODE_ENV": "development"
         }
       }
     }
   }
   ```

2. **Usage:**
   - Cursor AI will automatically have access to debugging tools
   - Ask: "Review the daisy logs and help me fix these issues"
   - Use: "Generate a summary of the current debugging session"

### Windsurf

1. **Configuration file:** `~/.windsurf/mcp.json`:
   ```json
   {
     "servers": {
       "daisy-debugging": {
         "name": "Daisy Debugging Assistant",
         "transport": { "type": "stdio" },
         "command": {
           "program": "npx",
           "arguments": ["daisy-mcp-server", "--auto-detect", "--watch"],
           "workingDirectory": "${workspaceRoot}"
         },
         "capabilities": {
           "tools": {
             "analyze_logs": "Parse and categorize log entries",
             "find_errors": "Extract and analyze errors",
             "performance_insights": "Analyze performance metrics",
             "suggest_fixes": "Provide debugging suggestions",
             "get_log_summary": "Generate session summary"
           }
         }
       }
     }
   }
   ```

2. **Usage:**
   - Windsurf will automatically detect available tools
   - Ask: "Use the analyze_logs tool to check for issues"
   - Request: "Get a performance_insights report"

## Available Tools

### `analyze_logs`
Parse and categorize log entries by type, severity, and time range.

**Parameters:**
- `types` (optional): Filter by log types (console, network, error, performance, etc.)
- `levels` (optional): Filter by log levels (info, warn, error, debug)
- `timeRange` (optional): Filter by time range
- `minSeverity` (optional): Minimum severity level (1-5)
- `search` (optional): Search term to filter entries
- `limit` (optional): Maximum number of entries to return

**Example usage:**
```
Please analyze the logs for the last hour, focusing on error-level entries
```

### `find_errors`
Extract JavaScript errors, network failures, and console errors with context.

**Parameters:**
- `errorTypes` (optional): Types of errors to find (js_errors, network_failures, console_errors)
- `includeContext` (optional): Include surrounding log entries for context
- `timeRange` (optional): Filter by time range

**Example usage:**
```
Find all JavaScript errors and provide context for debugging
```

### `performance_insights`
Analyze performance metrics, slow requests, and memory usage patterns.

**Parameters:**
- `metrics` (optional): Metrics to analyze (load_times, network_performance, memory_usage)
- `thresholds` (optional): Custom thresholds for slow requests and large responses

**Example usage:**
```
Analyze performance metrics and identify bottlenecks
```

### `suggest_fixes`
Provide debugging suggestions based on log patterns and error analysis.

**Parameters:**
- `errorContext` (optional): Specific error or issue to analyze
- `includeCodeSuggestions` (optional): Include specific code fix examples

**Example usage:**
```
Suggest fixes for the errors found in the logs, include code examples
```

### `get_log_summary`
Generate comprehensive log session summary with statistics and insights.

**Parameters:**
- `includeDetails` (optional): Include detailed breakdown of issues
- `format` (optional): Summary format (concise, detailed, technical)

**Example usage:**
```
Generate a detailed summary of the debugging session
```

## Available Resources

### Log Files
- `daisy://logs/{filename}` - Complete log file contents
- `daisy://logs/{filename}/metadata` - Session metadata and statistics
- `daisy://logs/{filename}/errors` - All error entries
- `daisy://logs/{filename}/performance` - Performance-related entries

### Screenshots
- `daisy://screenshots` - Available debugging screenshots

## Environment Variables

You can customize the MCP server behavior using environment variables:

```bash
export DAISY_LOG_FILE="debug.log"
export DAISY_SCREENSHOTS_DIR="screenshots"
export DAISY_LOG_LEVEL="standard"  # minimal, standard, verbose
export DAISY_AUTO_DETECT="true"
export DAISY_WATCH_MODE="true"
```

## Security Considerations

The Daisy MCP server operates with the following security measures:

- **Read-only access**: Only reads log files, never modifies them
- **Local file system only**: No network access or external API calls
- **Sandboxed execution**: Runs in a controlled environment
- **No sensitive data exposure**: Filters out potential secrets from logs

## Troubleshooting

### Common Issues

1. **"Command not found: daisy-mcp"**
   - Run `npm link` in the mcp-server directory
   - Or use `npx daisy-mcp-server` instead

2. **"No log files found"**
   - Ensure daisy has created log files in the current directory
   - Use `--log-file` to specify exact log file path
   - Check that log files contain the daisy header format

3. **"MCP server not responding"**
   - Check that the server process is running
   - Verify the configuration file syntax
   - Check console output for error messages

4. **"Permission denied"**
   - Ensure the log files are readable
   - Check directory permissions for screenshots folder

### Debug Mode

Run the MCP server with debug output:

```bash
DEBUG=* daisy-mcp --auto-detect --watch
```

### Log Validation

Test if your log files are valid daisy format:

```bash
daisy-mcp --log-file debug.log --validate-only
```

## Advanced Configuration

### Custom Log Parsing

If you have custom log formats, extend the `DaisyLogParser` class:

```typescript
import { DaisyLogParser } from 'daisy-mcp-server';

class CustomLogParser extends DaisyLogParser {
  // Override parsing methods for custom formats
}
```

### Performance Tuning

For large log files:

```bash
# Limit entries returned
daisy-mcp --log-file large-debug.log --limit 1000

# Use minimal logging for faster parsing
daisy-mcp --log-level minimal --auto-detect
```

## Integration Examples

### GitHub Actions

```yaml
- name: Analyze Debugging Logs
  run: |
    npx daisy-mcp-server --auto-detect --format technical > log-analysis.json
    # Use analysis in subsequent steps
```

### CI/CD Pipeline

```bash
#!/bin/bash
# Add to your CI pipeline for automated log analysis
daisy-mcp --auto-detect --format concise
if [ $? -ne 0 ]; then
  echo "Critical issues found in logs"
  exit 1
fi
```

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review the console output for error messages
3. Ensure all dependencies are properly installed
4. Verify that daisy log files are in the expected format

## License

This MCP server is part of the daisy debugging tool and follows the same license terms.