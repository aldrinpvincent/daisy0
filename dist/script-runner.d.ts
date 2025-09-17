import { ChildProcess } from 'child_process';
export declare class ScriptRunner {
    private process;
    private readonly isWindows;
    /**
     * Detects the preferred shell on Windows
     */
    private getWindowsShell;
    /**
     * Checks if a command contains shell metacharacters that require shell execution
     */
    private requiresShell;
    /**
     * Finds executable in node_modules/.bin, handling Windows extensions
     */
    private findNodeModulesBin;
    /**
     * Properly parses command arguments respecting quotes and escapes
     */
    private parseCommand;
    /**
     * Parses the script command and determines the best execution strategy
     */
    private parseScript;
    run(script: string): ChildProcess;
    stop(): void;
    isRunning(): boolean;
}
//# sourceMappingURL=script-runner.d.ts.map