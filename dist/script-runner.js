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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptRunner = void 0;
const child_process_1 = require("child_process");
const tree_kill_1 = __importDefault(require("tree-kill"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class ScriptRunner {
    constructor() {
        this.process = null;
        this.isWindows = process.platform === 'win32';
    }
    /**
     * Checks if a command is available in PATH (synchronous check)
     */
    isCommandInPath(command) {
        if (!this.isWindows) {
            return false; // This method is Windows-specific
        }
        const pathEnv = process.env.PATH || '';
        const pathDirs = pathEnv.split(';');
        const extensions = process.env.PATHEXT?.split(';') || ['.exe', '.cmd', '.bat'];
        for (const dir of pathDirs) {
            if (!dir.trim())
                continue;
            // Check command with various extensions
            for (const ext of extensions) {
                const fullPath = path.join(dir.trim(), command + ext);
                if (fs.existsSync(fullPath)) {
                    return true;
                }
            }
            // Also check without extension
            const fullPath = path.join(dir.trim(), command);
            if (fs.existsSync(fullPath)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Detects the preferred shell on Windows and returns both shell path and type
     */
    getWindowsShell() {
        // First check if pwsh is available in PATH
        if (this.isCommandInPath('pwsh')) {
            return { shell: 'pwsh.exe', type: 'pwsh' };
        }
        // Check hardcoded paths for pwsh (PowerShell Core)
        const pwshPaths = [
            'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
            'C:\\Program Files\\PowerShell\\6\\pwsh.exe'
        ];
        for (const pwshPath of pwshPaths) {
            if (fs.existsSync(pwshPath)) {
                return { shell: pwshPath, type: 'pwsh' };
            }
        }
        // Check for Windows PowerShell 5.x
        const powershellPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        if (fs.existsSync(powershellPath)) {
            return { shell: powershellPath, type: 'powershell' };
        }
        // Check PSModulePath environment variable (indicates PowerShell is available)
        if (process.env.PSModulePath) {
            return { shell: 'powershell.exe', type: 'powershell' };
        }
        // Fallback to cmd.exe
        return { shell: 'cmd.exe', type: 'cmd' };
    }
    /**
     * Checks if a command contains shell metacharacters that require shell execution
     */
    requiresShell(script) {
        const shellMetaChars = ['&&', '||', '|', '>', '<', '>>', '&', ';'];
        return shellMetaChars.some(char => script.includes(char)) ||
            script.includes('"') ||
            script.includes("'") ||
            script.includes('`');
    }
    /**
     * Checks if a command contains operators that are problematic in PowerShell 5.x
     * PowerShell 5.x doesn't support && and || operators like cmd.exe does
     */
    hasPS5IncompatibleOperators(script) {
        return script.includes('&&') || script.includes('||');
    }
    /**
     * Finds executable in node_modules/.bin, handling Windows extensions
     */
    findNodeModulesBin(command) {
        const binDir = path.join(process.cwd(), 'node_modules', '.bin');
        if (!fs.existsSync(binDir)) {
            return null;
        }
        const extensions = this.isWindows ? ['.cmd', '.bat', '.ps1', ''] : [''];
        for (const ext of extensions) {
            const execPath = path.join(binDir, command + ext);
            if (fs.existsSync(execPath)) {
                return execPath;
            }
        }
        return null;
    }
    /**
     * Properly parses command arguments respecting quotes and escapes
     */
    parseCommand(script) {
        const args = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        for (let i = 0; i < script.length; i++) {
            const char = script[i];
            const nextChar = script[i + 1];
            if ((char === '"' || char === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = char;
            }
            else if (char === quoteChar && inQuotes) {
                inQuotes = false;
                quoteChar = '';
            }
            else if (char === '\\' && nextChar && inQuotes) {
                // Handle escaped characters within quotes
                current += nextChar;
                i++; // Skip next character
            }
            else if (char === ' ' && !inQuotes) {
                if (current) {
                    args.push(current);
                    current = '';
                }
            }
            else {
                current += char;
            }
        }
        if (current) {
            args.push(current);
        }
        return args;
    }
    /**
     * Parses the script command and determines the best execution strategy
     */
    parseScript(script) {
        const trimmed = script.trim();
        // Check if we need shell execution for complex commands
        if (this.requiresShell(trimmed)) {
            if (this.isWindows) {
                const { shell, type } = this.getWindowsShell();
                let finalShell = shell;
                let finalType = type;
                let args;
                // Operator-aware shell selection for Windows
                // If command has && or || operators and we only have PowerShell 5.x,
                // use cmd.exe instead to avoid compatibility issues
                if (this.hasPS5IncompatibleOperators(trimmed) && type === 'powershell') {
                    finalShell = 'cmd.exe';
                    finalType = 'cmd';
                }
                // Use appropriate arguments for each shell type
                switch (finalType) {
                    case 'pwsh':
                    case 'powershell':
                        args = ['-Command', trimmed];
                        break;
                    case 'cmd':
                        args = ['/d', '/s', '/c', trimmed];
                        break;
                    default:
                        args = ['/c', trimmed];
                }
                return {
                    command: finalShell,
                    args,
                    useShell: false, // Don't use options.shell when we're explicitly invoking a shell
                    shellType: finalType
                };
            }
            else {
                return {
                    command: '/bin/sh',
                    args: ['-c', trimmed],
                    useShell: false, // Don't use options.shell when we're explicitly invoking a shell
                    shellType: 'sh'
                };
            }
        }
        // Parse arguments properly
        const parts = this.parseCommand(trimmed);
        if (parts.length === 0) {
            throw new Error('Empty command provided');
        }
        let command = parts[0];
        let args = parts.slice(1);
        // Handle npm/yarn/pnpm commands specially
        if (['npm', 'yarn', 'pnpm'].includes(command)) {
            // These are usually available globally, but check node_modules/.bin first
            const localBin = this.findNodeModulesBin(command);
            if (localBin) {
                command = localBin;
            }
            else if (this.isWindows && !command.includes('.')) {
                // On Windows, ensure we can find the executable
                command = command + '.cmd';
            }
            return { command, args, useShell: false };
        }
        // Handle direct script names (assume npm run)
        if (parts.length === 1 && !trimmed.includes(' ') && !path.isAbsolute(command)) {
            return {
                command: this.isWindows ? 'npm.cmd' : 'npm',
                args: ['run', command],
                useShell: false
            };
        }
        // Check if command is in node_modules/.bin
        const localBin = this.findNodeModulesBin(command);
        if (localBin) {
            return { command: localBin, args, useShell: false };
        }
        // For other commands, use as-is and let Windows PATHEXT handle extension resolution
        // Don't force .exe extension - this breaks commands that exist as .cmd/.bat
        return { command, args, useShell: false };
    }
    run(script) {
        const parsedCommand = this.parseScript(script);
        // Debug output for Windows troubleshooting
        console.log(`[DEBUG] Script: "${script}"`);
        console.log(`[DEBUG] Parsed command: "${parsedCommand.command}"`);
        console.log(`[DEBUG] Parsed args:`, parsedCommand.args);
        console.log(`[DEBUG] Use shell: ${parsedCommand.useShell}`);
        console.log(`[DEBUG] Shell type: ${parsedCommand.shellType || 'none'}`);
        // Build spawn options
        const spawnOptions = {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        };
        // Only use options.shell for simple shell delegation, not when we're explicitly invoking a shell
        if (parsedCommand.useShell) {
            spawnOptions.shell = true;
        }
        // On Windows, ensure PATH includes node_modules/.bin
        if (this.isWindows) {
            const nodeModulesBin = path.join(process.cwd(), 'node_modules', '.bin');
            if (fs.existsSync(nodeModulesBin)) {
                spawnOptions.env.PATH = `${nodeModulesBin};${spawnOptions.env.PATH}`;
            }
        }
        else {
            const nodeModulesBin = path.join(process.cwd(), 'node_modules', '.bin');
            if (fs.existsSync(nodeModulesBin)) {
                spawnOptions.env.PATH = `${nodeModulesBin}:${spawnOptions.env.PATH}`;
            }
        }
        // Spawn the process
        this.process = (0, child_process_1.spawn)(parsedCommand.command, parsedCommand.args, spawnOptions);
        // Handle stdout
        this.process.stdout?.on('data', (data) => {
            console.log(`[SCRIPT] ${data.toString().trim()}`);
        });
        // Handle stderr
        this.process.stderr?.on('data', (data) => {
            console.error(`[SCRIPT ERROR] ${data.toString().trim()}`);
        });
        // Handle process exit
        this.process.on('close', (code) => {
            console.log(`[SCRIPT] Process exited with code ${code}`);
        });
        this.process.on('error', (error) => {
            console.error(`[SCRIPT ERROR] Failed to start script: ${error.message}`);
        });
        return this.process;
    }
    stop() {
        if (this.process && this.process.pid) {
            // Use tree-kill for cross-platform process tree termination
            (0, tree_kill_1.default)(this.process.pid, 'SIGTERM', (err) => {
                if (err) {
                    console.warn('[SCRIPT] Warning: Failed to kill process tree:', err.message);
                    // Fallback to direct kill if tree-kill fails
                    try {
                        this.process?.kill('SIGTERM');
                    }
                    catch (fallbackErr) {
                        console.warn('[SCRIPT] Warning: Fallback kill also failed:', fallbackErr);
                    }
                }
            });
            this.process = null;
        }
    }
    isRunning() {
        return this.process !== null && !this.process.killed;
    }
}
exports.ScriptRunner = ScriptRunner;
//# sourceMappingURL=script-runner.js.map