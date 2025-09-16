import { ChildProcess } from 'child_process';
export declare class ScriptRunner {
    private process;
    run(script: string): ChildProcess;
    stop(): void;
    isRunning(): boolean;
}
//# sourceMappingURL=script-runner.d.ts.map