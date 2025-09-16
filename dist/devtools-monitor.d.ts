import { DaisyLogger } from './logger';
export declare class DevToolsMonitor {
    private client;
    private port;
    private logger;
    private connected;
    constructor(port: number, logger: DaisyLogger);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}
//# sourceMappingURL=devtools-monitor.d.ts.map