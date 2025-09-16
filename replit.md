# Overview

Daisy is a command-line debugging tool that streams browser debugging data via the Chrome DevTools Protocol. It launches a headless Chrome instance with remote debugging enabled, monitors various browser events (console logs, network requests, errors, performance metrics), and streams this debugging data to structured log files. The tool is designed to help developers debug applications by providing comprehensive real-time insights into browser behavior during script execution.

## Usage

To use daisy in your frontend application:

```bash
# Build the CLI tool
npm run build

# Run daisy with your script
node dist/index.js --script "npm run dev"

# Or with custom options
node dist/index.js --script "yarn start" --port 9223 --log-file custom-debug.log
```

The tool will create a structured JSON log file containing all browser debugging data in real-time, formatted for easy analysis by LLMs and debugging tools.

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

## Protocol Integration
- **Chrome DevTools Protocol (CDP)**: Primary interface for browser debugging data
- **Chrome Remote Debugging**: Network protocol for browser communication
- **JSON-RPC**: Underlying communication protocol for CDP messages