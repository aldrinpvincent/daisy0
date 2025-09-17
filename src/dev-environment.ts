import { ChromeLauncher } from './chrome-launcher';
import { DevToolsMonitor } from './devtools-monitor';
import { ScriptRunner } from './script-runner';
import { DaisyLogger, LogLevel } from './logger';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DevEnvironmentConfig {
  script: string;
  webViewerPort: number;
  mcpServerPort: number;
  chromePort: number;
  browser: string;
  serversOnly: boolean;
  debugMode: boolean;
  logLevel: string;
}

export class DevEnvironment {
  private config: DevEnvironmentConfig;
  private chromeLauncher?: ChromeLauncher;
  private devToolsMonitor?: DevToolsMonitor;
  private scriptRunner?: ScriptRunner;
  private webViewerProcess?: ChildProcess;
  private mcpServerProcess?: ChildProcess;
  private logger?: DaisyLogger;
  private logFilePath: string;
  private symlinkPath: string;
  private screenshotsDir: string;

  constructor(config: DevEnvironmentConfig) {
    this.config = config;
    const { logFilePath, symlinkPath, screenshotsDir } = this.createPersistentLogFile();
    this.logFilePath = logFilePath;
    this.symlinkPath = symlinkPath;
    this.screenshotsDir = screenshotsDir;
  }

  /**
   * Creates persistent log file in temp directory (like dev3000)
   * Returns main log file, symlink path, and screenshots directory
   */
  private createPersistentLogFile(): { logFilePath: string; symlinkPath: string; screenshotsDir: string } {
    const tempDir = os.tmpdir();
    const daisyDir = path.join(tempDir, 'daisy');
    
    // Ensure daisy temp directory exists
    if (!fs.existsSync(daisyDir)) {
      fs.mkdirSync(daisyDir, { recursive: true });
    }
    
    // Create session-specific log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sessionId = `${timestamp}-${process.pid}`;
    const logFilePath = path.join(daisyDir, `daisy-${sessionId}.log`);
    
    // Create symlink to current session (like dev3000)
    const symlinkPath = path.join(daisyDir, 'current.log');
    
    // Remove existing symlink if it exists
    if (fs.existsSync(symlinkPath)) {
      try {
        fs.unlinkSync(symlinkPath);
      } catch (error) {
        // Ignore errors removing old symlink
      }
    }
    
    // Create new symlink
    try {
      fs.symlinkSync(logFilePath, symlinkPath);
    } catch (error) {
      console.warn('Warning: Could not create symlink to current log file');
    }
    
    // Create screenshots directory
    const screenshotsDir = path.join(daisyDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    return { logFilePath, symlinkPath, screenshotsDir };
  }

  /**
   * Start the complete development environment
   */
  async start(): Promise<void> {
    console.log('🚀 Starting daisy development environment...\n');
    
    // Initialize logger
    this.logger = new DaisyLogger(this.logFilePath, this.config.logLevel as LogLevel);
    
    console.log(`📝 Centralized logging: ${this.symlinkPath}`);
    console.log(`📸 Screenshots: ${this.screenshotsDir}\n`);
    
    try {
      // Start services based on configuration
      if (!this.config.serversOnly) {
        await this.startChromeAndScript();
        await this.startDevToolsMonitoring();
      }
      
      await this.startWebViewer();
      await this.startMCPServer();
      
      this.setupGracefulShutdown();
      
      console.log('\n✅ All services started successfully!');
      console.log('\n🌼 Daisy is running! Available at:');
      console.log(`   📊 Web Viewer: http://localhost:${this.config.webViewerPort}`);
      console.log(`   🤖 MCP Server: stdio transport (for AI assistants)`);
      console.log(`   📝 Live Logs: tail -f ${this.symlinkPath}`);
      console.log('\n   Press Ctrl+C to stop all services.');
      
      // Keep process alive
      this.keepAlive();
      
    } catch (error) {
      console.error('❌ Failed to start development environment:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Start Chrome with user script
   */
  private async startChromeAndScript(): Promise<void> {
    console.log('🌐 Starting Chrome and user script...');
    
    // Start user script first
    this.scriptRunner = new ScriptRunner();
    const scriptProcess = this.scriptRunner.run(this.config.script);
    console.log(`   ⚡ Script started: ${this.config.script}`);
    
    // Wait a moment for script to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Launch Chrome with debugging enabled
    this.chromeLauncher = new ChromeLauncher(this.config.chromePort);
    const chrome = await this.chromeLauncher.launch();
    const actualPort = chrome.port ?? this.chromeLauncher.getPort();
    console.log(`   🔍 Chrome debugging: port ${actualPort}`);
    
    // Wait for Chrome DevTools to be ready
    await this.waitForDevTools(actualPort);
  }

  /**
   * Start DevTools monitoring
   */
  private async startDevToolsMonitoring(): Promise<void> {
    if (!this.chromeLauncher || !this.logger) {
      throw new Error('Chrome or logger not initialized');
    }
    
    console.log('📡 Starting DevTools monitoring...');
    
    const chromePort = this.chromeLauncher.getChromeInstance().port ?? this.chromeLauncher.getPort();
    this.devToolsMonitor = new DevToolsMonitor(chromePort, this.logger, this.screenshotsDir);
    await this.devToolsMonitor.connect();
    
    console.log('   ✅ DevTools monitoring enabled');
  }

  /**
   * Start web viewer server
   */
  private async startWebViewer(): Promise<void> {
    console.log('🖥️  Starting web viewer...');
    
    const webViewerPath = path.resolve(__dirname, '../web-viewer/server.js');
    
    this.webViewerProcess = spawn('node', [
      webViewerPath,
      '--log-file', this.logFilePath,
      '--screenshots-dir', this.screenshotsDir,
      '--port', this.config.webViewerPort.toString(),
      '--host', '0.0.0.0'
    ], {
      stdio: this.config.debugMode ? 'inherit' : 'pipe',
      cwd: process.cwd()
    });
    
    this.webViewerProcess.on('error', (error) => {
      console.error('❌ Web viewer error:', error);
    });
    
    // Wait for web viewer to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Web viewer startup timeout'));
      }, 10000);
      
      const checkServer = () => {
        const http = require('http');
        const req = http.get(`http://localhost:${this.config.webViewerPort}`, (res: any) => {
          clearTimeout(timeout);
          resolve(undefined);
        });
        
        req.on('error', () => {
          setTimeout(checkServer, 500);
        });
        
        req.setTimeout(1000);
      };
      
      setTimeout(checkServer, 1000);
    });
    
    console.log(`   ✅ Web viewer running on port ${this.config.webViewerPort}`);
  }

  /**
   * Start MCP server
   */
  private async startMCPServer(): Promise<void> {
    console.log('🤖 Starting MCP server...');
    
    const mcpServerPath = path.resolve(__dirname, '../mcp-server/dist/index.js');
    
    // Check if MCP server build exists
    if (!fs.existsSync(mcpServerPath)) {
      console.warn('   ⚠️  MCP server not built, skipping...');
      return;
    }
    
    this.mcpServerProcess = spawn('node', [
      mcpServerPath,
      '--log-file', this.logFilePath,
      '--screenshots-dir', this.screenshotsDir,
      '--watch',
      '--transport', 'stdio'
    ], {
      stdio: this.config.debugMode ? 'inherit' : 'pipe',
      cwd: process.cwd()
    });
    
    this.mcpServerProcess.on('error', (error) => {
      console.error('❌ MCP server error:', error);
    });
    
    console.log(`   ✅ MCP server started (stdio transport)`);
  }

  /**
   * Wait for DevTools to be ready
   */
  private async waitForDevTools(port: number): Promise<void> {
    let retries = 10;
    while (retries > 0) {
      try {
        await new Promise<void>((resolve, reject) => {
          const http = require('http');
          const req = http.get(`http://127.0.0.1:${port}/json/version`, (res: any) => {
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

  /**
   * Keep the main process alive
   */
  private keepAlive(): void {
    // Keep the process running indefinitely
    const keepAliveInterval = setInterval(() => {
      // Do nothing - just keep the process alive
    }, 60000); // Check every minute
    
    // Store interval for cleanup
    (this as any).keepAliveInterval = keepAliveInterval;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const cleanup = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGQUIT', () => cleanup('SIGQUIT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught exception:', error);
      await this.cleanup();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason) => {
      console.error('❌ Unhandled rejection:', reason);
      await this.cleanup();
      process.exit(1);
    });
  }

  /**
   * Cleanup all services
   */
  private async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up services...');
    
    // Clear keep alive interval
    if ((this as any).keepAliveInterval) {
      clearInterval((this as any).keepAliveInterval);
    }
    
    try {
      // Stop script runner
      if (this.scriptRunner) {
        this.scriptRunner.stop();
        console.log('   ✅ Script stopped');
      }
      
      // Disconnect DevTools monitoring
      if (this.devToolsMonitor) {
        await this.devToolsMonitor.disconnect();
        console.log('   ✅ DevTools monitoring disconnected');
      }
      
      // Kill Chrome
      if (this.chromeLauncher) {
        await this.chromeLauncher.kill();
        console.log('   ✅ Chrome terminated');
      }
      
      // Stop web viewer
      if (this.webViewerProcess) {
        this.webViewerProcess.kill('SIGTERM');
        console.log('   ✅ Web viewer stopped');
      }
      
      // Stop MCP server
      if (this.mcpServerProcess) {
        this.mcpServerProcess.kill('SIGTERM');
        console.log('   ✅ MCP server stopped');
      }
      
      // Close logger
      if (this.logger) {
        this.logger.close();
        console.log('   ✅ Logger closed');
      }
      
      console.log('✅ Cleanup complete');
      
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }
}