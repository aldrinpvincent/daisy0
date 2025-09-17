#!/usr/bin/env node

import { Command } from 'commander';
import { DevEnvironment } from './dev-environment';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

// Package manager detection (like dev3000)
function detectPackageManager(): { manager: string; runScript: string } {
  const cwd = process.cwd();
  
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return { manager: 'pnpm', runScript: 'pnpm run' };
  }
  
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    return { manager: 'yarn', runScript: 'yarn' };
  }
  
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) {
    return { manager: 'npm', runScript: 'npm run' };
  }
  
  // Default to npm if no lockfile found
  return { manager: 'npm', runScript: 'npm run' };
}

// Auto-detect common development scripts
function detectDefaultScript(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return 'dev';
    }
    
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const scripts = pkg.scripts || {};
    
    // Priority order for script detection
    const commonScripts = ['dev', 'start:dev', 'develop', 'serve', 'start'];
    
    for (const script of commonScripts) {
      if (scripts[script]) {
        return script;
      }
    }
    
    // Fallback to 'dev' if common scripts not found
    return 'dev';
  } catch (error) {
    return 'dev';
  }
}

// Main daisy command
program
  .name('daisy')
  .description('🌼 Unified browser debugging tool - starts everything with one command (like dev3000)')
  .version('1.0.0');

program
  .option('-s, --script <script>', 'Script to run (auto-detected by default)')
  .option('-p, --port <port>', 'Web viewer port', '5000')
  .option('--mcp-port <port>', 'MCP server port', '3684')
  .option('--chrome-port <port>', 'Chrome debugging port', '9222')
  .option('--browser <browser>', 'Browser to launch', 'chrome')
  .option('--servers-only', 'Start only web viewer and MCP server (no Chrome)', false)
  .option('--debug', 'Enable debug mode with verbose logging', false)
  .option('--log-level <level>', 'Log verbosity: minimal, standard, verbose', 'standard')
  .action(async (options) => {
    console.log('\n🌼 Daisy - Unified Browser Debugging Tool');
    console.log('========================================\n');
    
    // Detect package manager and script
    const { manager, runScript } = detectPackageManager();
    const script = options.script || detectDefaultScript();
    
    console.log(`📦 Package Manager: ${manager}`);
    console.log(`🚀 Script: ${runScript} ${script}`);
    console.log(`🌐 Web Viewer: http://localhost:${options.port}`);
    console.log(`🤖 MCP Server: stdio transport (for AI assistants)`);
    console.log(`🔍 Chrome Debugging: port ${options.chromePort}`);
    
    if (options.debug) {
      console.log(`🐛 Debug Mode: enabled`);
      console.log(`📊 Log Level: ${options.logLevel}`);
    }
    
    console.log('\n');
    
    try {
      // Initialize development environment
      const devEnv = new DevEnvironment({
        script: `${runScript} ${script}`,
        webViewerPort: parseInt(options.port),
        mcpServerPort: parseInt(options.mcpPort),
        chromePort: parseInt(options.chromePort),
        browser: options.browser,
        serversOnly: options.serversOnly,
        debugMode: options.debug,
        logLevel: options.logLevel
      });
      
      await devEnv.start();
      
    } catch (error) {
      console.error('\n❌ Failed to start daisy:', error);
      process.exit(1);
    }
  });


export { program };

// If called directly, parse and run
if (require.main === module) {
  program.parse();
}