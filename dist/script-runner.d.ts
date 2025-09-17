import { ChildProcess } from 'child_process';
export declare class ScriptRunner {
    private process;
    private readonly isWindows;
    /**
     * Checks if a command is available in PATH (synchronous check)
     */
    private isCommandInPath;
    /**
     * Detects the preferred shell on Windows and returns both shell path and type
     */
    private getWindowsShell;
    /**
     * Checks if a command contains shell metacharacters that require shell execution
     */
    private requiresShell;
    /**
     * Checks if a command contains operators that are problematic in PowerShell 5.x
     * PowerShell 5.x doesn't support && and || operators like cmd.exe does
     */
    private hasPS5IncompatibleOperators;
    /**
     * Finds executable in node_modules/.bin, handling Windows extensions
     */
    private findNpmCommand;
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