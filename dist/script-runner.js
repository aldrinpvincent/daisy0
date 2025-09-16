"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptRunner = void 0;
const child_process_1 = require("child_process");
class ScriptRunner {
    constructor() {
        this.process = null;
    }
    run(script) {
        // Parse the script command
        let command;
        let args;
        if (script.startsWith('npm ')) {
            // Handle npm commands
            command = 'npm';
            args = script.split(' ').slice(1);
        }
        else if (script.startsWith('yarn ')) {
            // Handle yarn commands
            command = 'yarn';
            args = script.split(' ').slice(1);
        }
        else if (script.includes(' ')) {
            // Handle other commands with arguments
            const parts = script.split(' ');
            command = parts[0];
            args = parts.slice(1);
        }
        else {
            // Assume it's an npm script
            command = 'npm';
            args = ['run', script];
        }
        // Spawn the process
        this.process = (0, child_process_1.spawn)(command, args, {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env }
        });
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
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }
    isRunning() {
        return this.process !== null && !this.process.killed;
    }
}
exports.ScriptRunner = ScriptRunner;
//# sourceMappingURL=script-runner.js.map