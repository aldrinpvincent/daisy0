import { DaisyLogger } from './logger';
export declare class DevToolsMonitor {
    private client;
    private port;
    private logger;
    private connected;
    private pendingRequests;
    private screenshotDir;
    constructor(port: number, logger: DaisyLogger, screenshotDir?: string);
    connect(): Promise<void>;
    takeScreenshot(errorContext?: string): Promise<string | null>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
//# sourceMappingURL=devtools-monitor.d.ts.map