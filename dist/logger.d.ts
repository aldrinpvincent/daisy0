export type LogLevel = 'minimal' | 'standard' | 'verbose';
export interface LogEntry {
    timestamp: string;
    type: 'console' | 'network' | 'error' | 'performance' | 'page' | 'security' | 'runtime';
    level: 'info' | 'warn' | 'error' | 'debug';
    source: string;
    data: any;
    context?: {
        url?: string;
        method?: string;
        statusCode?: number;
        stackTrace?: string;
    };
}
export declare class DaisyLogger {
    private writeStream;
    private logFile;
    private logLevel;
    constructor(logFile: string, logLevel?: LogLevel);
    private writeInitialHeader;
    log(entry: LogEntry): void;
    private writeRawLine;
    logConsole(level: string, text: string, args?: any[], stackTrace?: any, url?: string): void;
    logNetwork(method: string, url: string, statusCode: number, headers: any, requestData?: any, responseData?: any): void;
    logError(error: any, source?: string, stackTrace?: string): void;
    logPerformance(name: string, data: any): void;
    logPageEvent(eventType: string, data: any, url?: string): void;
    private mapConsoleLevel;
    private shouldSkipLog;
    private filterConsoleArguments;
    private filterStackTrace;
    private filterHeaders;
    private filterRequestBody;
    private filterResponseBody;
    close(): void;
}
//# sourceMappingURL=logger.d.ts.map