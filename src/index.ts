#!/usr/bin/env node

import { Command } from 'commander';
import { DaisyLogger } from './logger';
import { ChromeLauncher } from './chrome-launcher';
import { DevToolsMonitor } from './devtools-monitor';
import { ScriptRunner } from './script-runner';
import * as path from 'path';
import * as fs from 'fs';

const program = new Command();

program
  .name('daisy')
  .description('A CLI tool for streaming browser debugging data via Chrome DevTools Protocol')
  .version('1.0.0');

program
  .option('-s, --script <script>', 'Script to run (e.g., "dev" for npm run dev)')
  .option('-p, --port <port>', 'Chrome remote debugging port', '9222')
  .option('-l, --log-file <file>', 'Log file path', 'daisy-debug.log')
  .action(async (options) => {
    if (!options.script) {
      console.error('Error: --script parameter is required');
      process.exit(1);
    }

    const logFile = path.resolve(process.cwd(), options.logFile);
    const logger = new DaisyLogger(logFile);
    
    console.log(`🌼 Daisy starting...`);
    console.log(`📝 Logging to: ${logFile}`);
    console.log(`🚀 Running script: ${options.script}`);
    
    try {
      // Initialize components
      const chromeLauncher = new ChromeLauncher(parseInt(options.port));
      const scriptRunner = new ScriptRunner();
      
      // Launch Chrome with DevTools enabled
      const chrome = await chromeLauncher.launch();
      console.log(`🌐 Chrome launched on port ${options.port}`);
      
      // Initialize DevTools monitoring
      const devToolsMonitor = new DevToolsMonitor(parseInt(options.port), logger);
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