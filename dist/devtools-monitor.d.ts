import { DaisyLogger } from './logger';
export declare class DevToolsMonitor {
    private client;
    private port;
    private logger;
    private connected;
    private pendingRequests;
    private screenshotDir;
    private networkRequestCount;
    private networkIdleTimer?;
    constructor(port: number, logger: DaisyLogger, screenshotDir?: string);
    connect(): Promise<void>;
    takeScreenshot(errorContext?: string): Promise<string | null>;
    navigateToUrl(url: string): Promise<void>;
    /**
     * Set up user interaction tracking by injecting JavaScript into the page
     */
    private setupInteractionTracking;
    /**
     * Start polling for user interactions
     */
    private startInteractionPolling;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    /**
     * Schedule a screenshot when network becomes idle (like dev3000)
     */
    private scheduleNetworkIdleScreenshot;
}
//# sourceMappingURL=devtools-monitor.d.ts.map