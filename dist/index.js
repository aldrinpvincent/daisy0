#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const logger_1 = require("./logger");
const chrome_launcher_1 = require("./chrome-launcher");
const devtools_monitor_1 = require("./devtools-monitor");
const script_runner_1 = require("./script-runner");
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const program = new commander_1.Command();
async function waitForDevTools(port) {
    let retries = 10;
    while (retries > 0) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
                    if (res.statusCode === 200) {
                        resolve();
                    }
                    else {
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
        }
        catch (error) {
            retries--;
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            else {
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
    const logLevel = options.logLevel;
    // Validate log level
    if (!['minimal', 'standard', 'verbose'].includes(logLevel)) {
        console.error('Error: --log-level must be one of: minimal, standard, verbose');
        process.exit(1);
    }
    const logger = new logger_1.DaisyLogger(logFile, logLevel);
    console.log(`🌼 Daisy starting...`);
    console.log(`📝 Logging to: ${logFile}`);
    console.log(`📊 Log level: ${logLevel}`);
    console.log(`🚀 Running script: ${options.script}`);
    try {
        // Initialize components
        const chromeLauncher = new chrome_launcher_1.ChromeLauncher(parseInt(options.port));
        const scriptRunner = new script_runner_1.ScriptRunner();
        // Launch Chrome with DevTools enabled
        const chrome = await chromeLauncher.launch();
        const actualPort = chrome.port ?? chromeLauncher.getPort();
        console.log(`🌐 Chrome launched on port ${actualPort}`);
        // Wait for DevTools to be ready
        await waitForDevTools(actualPort);
        console.log(`🔗 DevTools ready on port ${actualPort}`);
        // Initialize DevTools monitoring with screenshot capability
        const screenshotDir = path.resolve(process.cwd(), 'screenshots');
        const devToolsMonitor = new devtools_monitor_1.DevToolsMonitor(actualPort, logger, screenshotDir);
        await devToolsMonitor.connect();
        console.log(`🔍 DevTools monitoring enabled`);
        console.log(`📸 Screenshots will be saved to: ${screenshotDir}`);
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
            }
            catch (error) {
                console.error('❌ Error during cleanup:', error);
                process.exit(1);
            }
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        console.log('🌼 Daisy is running! Press Ctrl+C to stop.');
    }
    catch (error) {
        console.error('❌ Error starting daisy:', error);
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map