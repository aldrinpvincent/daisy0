#!/usr/bin/env node

import { Command } from 'commander';
import { DaisyLogger, LogLevel } from './logger';
import { ChromeLauncher } from './chrome-launcher';
import { DevToolsMonitor } from './devtools-monitor';
import { ScriptRunner } from './script-runner';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

const program = new Command();

async function waitForDevTools(port: number): Promise<void> {
  let retries = 10;
  while (retries > 0) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`DevTools not ready: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      });
      return;
    } catch (error) {
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        throw new Error(`DevTools not ready after waiting: ${error}`);
      }
    }
  }
}

program
  .name('daisy')
  .description('A CLI tool for streaming browser debugging data via Chrome DevTools Protocol')
  .version('1.0.0');

program
  .option('-s, --script <script>', 'Script to run (e.g., "dev" for npm run dev)')
  .option('-p, --port <port>', 'Chrome remote debugging port', '9222')
  .option('-l, --log-file <file>', 'Log file path', 'daisy-debug.log')
  .option('--log-level <level>', 'Log verbosity level: minimal, standard, verbose', 'standard')
  .action(async (options) => {
    if (!options.script) {
      console.error('Error: --script parameter is required');
      process.exit(1);
    }

    const logFile = path.resolve(process.cwd(), options.logFile);
    const logLevel = options.logLevel as LogLevel;
    
    // Validate log level
    if (!['minimal', 'standard', 'verbose'].includes(logLevel)) {
      console.error('Error: --log-level must be one of: minimal, standard, verbose');
      process.exit(1);
    }
    
    const logger = new DaisyLogger(logFile, logLevel);
    
    console.log(`🌼 Daisy starting...`);
    console.log(`📝 Logging to: ${logFile}`);
    console.log(`📊 Log level: ${logLevel}`);
    console.log(`🚀 Running script: ${options.script}`);
    
    try {
      // Initialize components
      const chromeLauncher = new ChromeLauncher(parseInt(options.port));
      const scriptRunner = new ScriptRunner();
      
      // Launch Chrome with DevTools enabled
      const chrome = await chromeLauncher.launch();
      const actualPort = chrome.port ?? chromeLauncher.getPort();
      console.log(`🌐 Chrome launched on port ${actualPort}`);
      
      // Wait for DevTools to be ready
      await waitForDevTools(actualPort);
      console.log(`🔗 DevTools ready on port ${actualPort}`);
      
      // Initialize DevTools monitoring
      const devToolsMonitor = new DevToolsMonitor(actualPort, logger);
      await devToolsMonitor.connect();
      console.log(`🔍 DevTools monitoring enabled`);
      
      // Start the script
      const scriptProcess = scriptRunner.run(options.script);
      console.log(`⚡ Script "${options.script}" started`);
      
      // Handle graceful shutdown
      const cleanup = async () => {
        console.log('\n🛑 Shutting down daisy...');
        try {
          scriptRunner.stop();
          await devToolsMonitor.disconnect();
          await chromeLauncher.kill();
          logger.close();
          console.log('✅ Cleanup complete');
          process.exit(0);
        } catch (error) {
          console.error('❌ Error during cleanup:', error);
          process.exit(1);
        }
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      
      console.log('🌼 Daisy is running! Press Ctrl+C to stop.');
      
    } catch (error) {
      console.error('❌ Error starting daisy:', error);
      process.exit(1);
    }
  });

program.parse();