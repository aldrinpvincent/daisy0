#!/usr/bin/env node

import { program } from 'commander';
import { DaisyMCPServer } from './server.js';
import * as path from 'path';
import * as fs from 'fs';

// CLI configuration
program
  .name('daisy-mcp')
  .description('MCP server for daisy debugging logs - provides AI assistants with access to browser debugging data')
  .version('1.0.0')
  .option('-f, --log-file <path>', 'Path to daisy log file', './debug.log')
  .option('-w, --watch', 'Watch log file for real-time updates', false)
  .option('-s, --screenshots-dir <path>', 'Directory containing screenshots', './screenshots')
  .option('--auto-detect', 'Auto-detect daisy log files in current directory', false)
  .option('--transport <type>', 'Transport type (stdio only)', 'stdio')
  .option('--control-api-port <port>', 'Control API server port', '9223')
  .option('--control-api-host <host>', 'Control API server host', 'localhost')
  .parse();

const options = program.opts();

async function main() {
  // Auto-detect log files if requested
  let logFiles: string[] = [];
  
  if (options.autoDetect) {
    console.error('🔍 Auto-detecting daisy log files...');
    const files = fs.readdirSync('.');
    logFiles = files.filter(f => 
      f.endsWith('.log') && 
      fs.existsSync(f) && 
      isDaisyLogFile(f)
    );
    
    if (logFiles.length === 0) {
      console.error('❌ No daisy log files found in current directory');
      process.exit(1);
    }
    
    console.error(`✅ Found ${logFiles.length} daisy log file(s): ${logFiles.join(', ')}`);
  } else {
    logFiles = [options.logFile];
  }

  // Validate log files exist
  for (const logFile of logFiles) {
    if (!fs.existsSync(logFile)) {
      console.error(`❌ Log file not found: ${logFile}`);
      process.exit(1);
    }
  }

  // Ensure screenshots directory exists
  const screenshotsDir = path.resolve(options.screenshotsDir);
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    console.error(`📁 Created screenshots directory: ${screenshotsDir}`);
  }

  console.error('🌼 Starting Daisy MCP Server...');
  console.error(`📄 Log files: ${logFiles.join(', ')}`);
  console.error(`📁 Screenshots: ${screenshotsDir}`);
  console.error(`👁️  Watch mode: ${options.watch ? 'enabled' : 'disabled'}`);
  console.error(`🚀 Transport: ${options.transport}`);
  console.error(`🎮 Control API: ${options.controlApiHost}:${options.controlApiPort}`);

  // Create and start MCP server
  const server = new DaisyMCPServer({
    logFiles: logFiles.map(f => path.resolve(f)),
    screenshotsDir,
    watchMode: options.watch,
    transport: options.transport,
    controlApiPort: parseInt(options.controlApiPort, 10),
    controlApiHost: options.controlApiHost
  });

  try {
    await server.start();
  } catch (error) {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  }
}

function isDaisyLogFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Check for daisy log file markers
    return content.includes('# Daisy Debug Session') || 
           content.includes('structured_json_logs') ||
           content.includes('Chrome DevTools Protocol debugging data');
  } catch {
    return false;
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}