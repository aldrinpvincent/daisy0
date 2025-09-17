import { ChromeLauncher } from './chrome-launcher';
import { DevToolsMonitor } from './devtools-monitor';
import { ScriptRunner } from './script-runner';
import { DaisyLogger, LogLevel } from './logger';
import { ControlServer } from './control-server';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import treeKill from 'tree-kill';

export interface DevEnvironmentConfig {
  script: string;
  appPort: number;
  webViewerPort: number;
  mcpServerPort: number;
  chromePort: number;
  controlServerPort: number;
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
  private controlServer?: ControlServer;
  private logger?: DaisyLogger;
  private logFilePath: string;
  private symlinkPath: string;
  private screenshotsDir: string;
  private isUsingSymlink: boolean;
  private fileSyncInterval?: NodeJS.Timeout;

  constructor(config: DevEnvironmentConfig) {
    this.config = config;
    const { logFilePath, symlinkPath, screenshotsDir, isUsingSymlink } = this.createPersistentLogFile();
    this.logFilePath = logFilePath;
    this.symlinkPath = symlinkPath;
    this.screenshotsDir = screenshotsDir;
    this.isUsingSymlink = isUsingSymlink;
  }

  /**
   * Creates persistent log file in temp directory (like dev3000)
   * Returns main log file, symlink path, screenshots directory, and symlink status
   */
  private createPersistentLogFile(): { logFilePath: string; symlinkPath: string; screenshotsDir: string; isUsingSymlink: boolean } {
    // Use desktop directory instead of temp for better file access
    const daisyDir = 'C:\\Users\\aldvincent\\Desktop\\aldrin\\apps\\daisy_new\\logs';
    
    // Ensure daisy temp directory exists
    if (!fs.existsSync(daisyDir)) {
      fs.mkdirSync(daisyDir, { recursive: true });
    }
    
    // Use a simple direct log file without symlinks to avoid Windows issues
    const logFilePath = path.join(daisyDir, 'daisy-current.log');
    const symlinkPath = logFilePath; // Same file, no symlink needed
    const isUsingSymlink = false;
    
    console.log(`   📝 Using direct log file: ${logFilePath}`);
    
    // Create screenshots directory
    const screenshotsDir = path.join(daisyDir, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    return { logFilePath, symlinkPath, screenshotsDir, isUsingSymlink };
  }

  /**
   * Start the complete development environment
   */
  async start(): Promise<void> {
    console.log('🚀 Starting daisy development environment...\n');
    
    // Initialize logger
    this.logger = new DaisyLogger(this.logFilePath, this.config.logLevel as LogLevel);
    
    console.log(`📝 Centralized logging: ${this.symlinkPath}`);
    console.log(`📸 Screenshots: ${this.screenshotsDir}`);
    
    // Start file synchronization if using copy fallback
    if (!this.isUsingSymlink) {
      this.startFileSynchronization();
      console.log('   🔄 File synchronization active (Windows copy mode)');
    }
    console.log('');
    
    try {
      // Start services based on configuration
      if (!this.config.serversOnly) {
        await this.startChromeAndScript();
        await this.startDevToolsMonitoring();
      }
      
      // await this.startWebViewer();
      await this.startMCPServer();
      
      // Start control server if DevTools monitoring is enabled
      if (!this.config.serversOnly && this.devToolsMonitor) {
        await this.startControlServer();
      }
      
      this.setupGracefulShutdown();
      
      console.log('\n✅ All services started successfully!');
      console.log('\n🌼 Daisy is running! Available at:');
      console.log(`   📊 Web Viewer: http://localhost:${this.config.webViewerPort}`);
      console.log(`   🤖 MCP Server: stdio transport (for AI assistants)`);
      if (this.controlServer && this.controlServer.isRunning()) {
        console.log(`   🎮 Control API: http://localhost:${this.config.controlServerPort}`);
      }
      // Show platform-appropriate log viewing command
      if (process.platform === 'win32') {
        console.log(`   📝 Live Logs: Get-Content -Path "${this.symlinkPath}" -Wait`);
        console.log(`   📝 Or use: type "${this.symlinkPath}" (static view)`);
      } else {
        console.log(`   📝 Live Logs: tail -f ${this.symlinkPath}`);
      }
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
    
    // Wait for the app server to be available and then navigate
    await this.waitForAppServer();
    await this.navigateToApp();
  }

  /**
   * Wait for the app server to be available
   */
  private async waitForAppServer(): Promise<void> {
    const maxAttempts = 30; // 30 seconds
    let attempts = 0;
    
    console.log(`🔄 Waiting for app server on port ${this.config.appPort}...`);
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`http://localhost:${this.config.appPort}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000)
        });
        
        if (response.ok || response.status < 500) {
          console.log(`   ✅ App server is ready on port ${this.config.appPort}`);
          return;
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.warn(`   ⚠️  App server not responding after ${maxAttempts} seconds, proceeding anyway...`);
  }

  /**
   * Navigate Chrome to the app
   */
  private async navigateToApp(): Promise<void> {
    if (!this.devToolsMonitor) {
      throw new Error('DevTools monitor not initialized');
    }
    
    const appUrl = `http://localhost:${this.config.appPort}`;
    console.log(`🎯 Navigating to app: ${appUrl}`);
    
    try {
      await this.devToolsMonitor.navigateToUrl(appUrl);
      console.log(`   ✅ Successfully navigated to ${appUrl}`);
    } catch (error) {
      console.error(`   ❌ Failed to navigate to ${appUrl}:`, error);
    }
  }

  /**
   * Start web viewer server
   */
  private async startWebViewer(): Promise<void> {
    console.log('🖥️  Starting web viewer...');
    
    const webViewerPath = path.resolve(__dirname, '../web-viewer/server.js');
    
    this.webViewerProcess = spawn('node', [
      webViewerPath,
      '--log-file', this.symlinkPath,
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
      '--log-file', this.symlinkPath,
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
   * Start Control API server
   */
  private async startControlServer(): Promise<void> {
    if (!this.devToolsMonitor || !this.logger) {
      throw new Error('DevTools monitor and logger must be initialized before starting control server');
    }

    console.log('🎮 Starting Control API server...');
    
    this.controlServer = new ControlServer(
      this.devToolsMonitor, 
      this.logger, 
      { 
        port: this.config.controlServerPort,
        host: '0.0.0.0'
      }
    );
    
    await this.controlServer.start();
    console.log(`   ✅ Control API server ready on port ${this.config.controlServerPort}`);
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
   * Start file synchronization for copy fallback mode
   */
  private startFileSynchronization(): void {
    let lastFileSize = 0;
    let lastModifiedTime = 0;
    
    // Sync the log file every 2 seconds, but only if it has actually changed
    this.fileSyncInterval = setInterval(() => {
      try {
        if (!fs.existsSync(this.logFilePath)) {
          return;
        }
        
        const stats = fs.statSync(this.logFilePath);
        const currentSize = stats.size;
        const currentModified = stats.mtimeMs;
        
        // Only copy if the file has actually changed
        if (currentSize !== lastFileSize || currentModified !== lastModifiedTime) {
          fs.copyFileSync(this.logFilePath, this.symlinkPath);
          lastFileSize = currentSize;
          lastModifiedTime = currentModified;
        }
      } catch (error) {
        // Silently handle sync errors to avoid spam
        // This could happen if files are being written to during copy
      }
    }, 2000); // Reduced frequency from 500ms to 2s
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
    
    // Clear file synchronization interval
    if (this.fileSyncInterval) {
      clearInterval(this.fileSyncInterval);
      console.log('   ✅ File synchronization stopped');
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
      if (this.webViewerProcess && this.webViewerProcess.pid) {
        await new Promise<void>((resolve) => {
          treeKill(this.webViewerProcess!.pid!, 'SIGTERM', (err?: Error) => {
            if (err) {
              console.warn('   ⚠️ Warning: Failed to kill web viewer process tree:', err.message);
              // Fallback to direct kill
              try {
                this.webViewerProcess?.kill('SIGTERM');
              } catch (fallbackErr) {
                console.warn('   ⚠️ Warning: Fallback web viewer kill also failed:', fallbackErr);
              }
            }
            console.log('   ✅ Web viewer stopped');
            resolve();
          });
        });
      }
      
      // Stop Control API server
      if (this.controlServer) {
        console.log('🎮 Stopping Control API server...');
        await this.controlServer.stop();
        console.log('   ✅ Control API server stopped');
      }
      
      // Stop MCP server
      if (this.mcpServerProcess && this.mcpServerProcess.pid) {
        await new Promise<void>((resolve) => {
          treeKill(this.mcpServerProcess!.pid!, 'SIGTERM', (err?: Error) => {
            if (err) {
              console.warn('   ⚠️ Warning: Failed to kill MCP server process tree:', err.message);
              // Fallback to direct kill
              try {
                this.mcpServerProcess?.kill('SIGTERM');
              } catch (fallbackErr) {
                console.warn('   ⚠️ Warning: Fallback MCP server kill also failed:', fallbackErr);
              }
            }
            console.log('   ✅ MCP server stopped');
            resolve();
          });
        });
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