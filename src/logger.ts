import * as fs from 'fs';
import * as path from 'path';

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

export class DaisyLogger {
  private writeStream: fs.WriteStream;
  private logFile: string;
  private logLevel: LogLevel;

  constructor(logFile: string, logLevel: LogLevel = 'standard') {
    this.logFile = logFile;
    this.logLevel = logLevel;
    this.writeStream = fs.createWriteStream(logFile, { flags: 'w' });
    
    // Write initial header for LLM readability
    this.writeInitialHeader();
  }

  private writeInitialHeader() {
    const header = {
      daisy_session_start: new Date().toISOString(),
      format: "structured_json_logs",
      description: "Real-time Chrome DevTools Protocol debugging data",
      log_level: this.logLevel,
      filtering: {
        minimal: "Only errors, warnings, and critical network requests",
        standard: "Essential debugging info without verbose metadata",
        verbose: "Full details including headers, certificates, and stack traces"
      },
      log_structure: {
        timestamp: "ISO 8601 timestamp",
        type: "Event category (console, network, error, performance, page, security, runtime)",
        level: "Log level (info, warn, error, debug)",
        source: "Event source/origin",
        data: "Filtered event data from DevTools Protocol",
        context: "Additional contextual information for debugging"
      }
    };
    
    this.writeRawLine(`# Daisy Debug Session\n${JSON.stringify(header, null, 2)}\n---\n`);
  }

  log(entry: LogEntry) {
    const logLine = JSON.stringify(entry, null, 2);
    this.writeRawLine(`${logLine}\n`);
  }

  private writeRawLine(line: string) {
    this.writeStream.write(line);
  }

  logConsole(level: string, text: string, args?: any[], stackTrace?: any, url?: string) {
    // Filter console output based on log level
    if (this.shouldSkipLog('console', this.mapConsoleLevel(level))) {
      return;
    }

    // Create clean console log structure
    const logData: any = {
      message: text
    };

    // Add source location if available (from simplified args)
    if (args && args.length > 0 && args[0].sourceLocation) {
      logData.source = args[0].sourceLocation;
    }

    // Only add stack trace for errors and warnings in standard/verbose mode
    if (['error', 'warn'].includes(this.mapConsoleLevel(level))) {
      logData.stackTrace = this.filterStackTrace(stackTrace);
    }

    this.log({
      timestamp: new Date().toISOString(),
      type: 'console',
      level: this.mapConsoleLevel(level),
      source: 'browser_console',
      data: logData,
      context: {
        url: url
      }
    });
  }

  logNetwork(method: string, url: string, statusCode: number, headers: any, requestData?: any, responseData?: any) {
    // Filter network requests based on log level
    if (this.shouldSkipLog('network', statusCode >= 400 ? 'error' : 'info')) {
      return;
    }

    this.log({
      timestamp: new Date().toISOString(),
      type: 'network',
      level: statusCode >= 400 ? 'error' : 'info',
      source: 'network_request',
      data: {
        request: {
          method,
          url,
          headers: this.filterHeaders(headers),
          body: this.filterRequestBody(requestData)
        },
        response: {
          statusCode,
          body: this.filterResponseBody(responseData)
        }
      },
      context: {
        url,
        method,
        statusCode
      }
    });
  }

  logError(error: any, source: string = 'unknown', stackTrace?: string) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'error',
      level: 'error',
      source,
      data: {
        message: error.message || error,
        stack: error.stack || stackTrace,
        name: error.name
      },
      context: {
        stackTrace: error.stack || stackTrace
      }
    });
  }

  logPerformance(name: string, data: any) {
    // Apply log level filtering to performance events
    if (this.shouldSkipLog('performance', 'info')) {
      return;
    }

    this.log({
      timestamp: new Date().toISOString(),
      type: 'performance',
      level: 'info',
      source: 'performance_monitor',
      data: {
        metric: name,
        details: data
      }
    });
  }

  logPageEvent(eventType: string, data: any, url?: string) {
    // Apply log level filtering to page events
    if (this.shouldSkipLog('page', 'info')) {
      return;
    }

    this.log({
      timestamp: new Date().toISOString(),
      type: 'page',
      level: 'info',
      source: 'page_events',
      data: {
        event: eventType,
        details: data
      },
      context: {
        url
      }
    });
  }

  private mapConsoleLevel(level: string): 'info' | 'warn' | 'error' | 'debug' {
    switch (level.toLowerCase()) {
      case 'error':
        return 'error';
      case 'warning':
      case 'warn':
        return 'warn';
      case 'debug':
        return 'debug';
      default:
        return 'info';
    }
  }

  // Filtering methods based on log level
  private shouldSkipLog(logType: string, level: string): boolean {
    if (this.logLevel === 'verbose') return false;
    
    if (this.logLevel === 'minimal') {
      // For minimal: only show errors and warnings
      if (!(level === 'error' || level === 'warn')) {
        return true;
      }
      // Additionally skip non-critical event types in minimal mode
      const skipTypesMinimal = ['performance', 'page', 'security'];
      if (skipTypesMinimal.includes(logType)) {
        return true;
      }
    }
    
    // Standard level - skip debug logs and non-essential event types
    if (level === 'debug') return true;
    
    // In standard mode, skip verbose performance/page events unless they're errors
    if (this.logLevel === 'standard' && level === 'info') {
      const skipTypesStandard = ['performance'];
      if (skipTypesStandard.includes(logType)) {
        return true;
      }
    }
    
    return false;
  }

  private filterConsoleArguments(args?: any[]): any[] {
    if (!args || this.logLevel === 'verbose') return args || [];
    
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        // Simplify object previews
        if (this.logLevel === 'minimal') {
          return { type: arg.type, value: arg.value || '[Object]' };
        }
        // Standard level - keep essential object info
        return {
          type: arg.type,
          value: arg.value,
          className: arg.className,
          description: arg.description
        };
      }
      return arg;
    });
  }

  private filterStackTrace(stackTrace?: any): any {
    if (!stackTrace || this.logLevel === 'verbose') return stackTrace;
    
    if (this.logLevel === 'minimal') return undefined;
    
    // Standard level - keep only essential stack frames (first 3)
    if (stackTrace.callFrames) {
      return {
        callFrames: stackTrace.callFrames.slice(0, 3).map((frame: any) => ({
          functionName: frame.functionName,
          url: frame.url,
          lineNumber: frame.lineNumber,
          columnNumber: frame.columnNumber
        }))
      };
    }
    
    return stackTrace;
  }

  private filterHeaders(headers: any): any {
    if (!headers || this.logLevel === 'verbose') return headers;
    
    if (this.logLevel === 'minimal') {
      // Only keep essential headers
      const essentialHeaders: any = {};
      const keepHeaders = ['content-type', 'authorization', 'x-api-key', 'user-agent'];
      
      for (const key of keepHeaders) {
        if (headers[key.toLowerCase()]) {
          essentialHeaders[key] = headers[key.toLowerCase()];
        }
      }
      return essentialHeaders;
    }
    
    // Standard level - remove verbose headers but keep useful ones
    const filteredHeaders: any = {};
    const skipHeaders = [
      'cf-ray', 'cf-cache-status', 'reporting-endpoints', 'nel', 'report-to',
      'x-ratelimit-', 'alt-svc', 'via', 'x-powered-by', 'server'
    ];
    
    for (const [key, value] of Object.entries(headers)) {
      const shouldSkip = skipHeaders.some(skip => key.toLowerCase().includes(skip));
      if (!shouldSkip) {
        filteredHeaders[key] = value;
      }
    }
    
    return filteredHeaders;
  }

  private filterRequestBody(body?: any): any {
    if (!body || this.logLevel === 'verbose') return body;
    
    if (this.logLevel === 'minimal') return '[Request Body]';
    
    // Standard level - truncate large bodies
    if (typeof body === 'string' && body.length > 1000) {
      return body.substring(0, 1000) + '... [truncated]';
    }
    
    return body;
  }

  private filterResponseBody(responseData?: any): any {
    if (!responseData || this.logLevel === 'verbose') return responseData;
    
    // Remove verbose response data that's not useful for debugging
    const filtered: any = {};
    
    if (responseData.url) filtered.url = responseData.url;
    if (responseData.status) filtered.status = responseData.status;
    if (responseData.statusText) filtered.statusText = responseData.statusText;
    if (responseData.mimeType) filtered.mimeType = responseData.mimeType;
    
    // Remove timing, security details, and other verbose data
    if (this.logLevel === 'standard') {
      if (responseData.headers) {
        filtered.headers = this.filterHeaders(responseData.headers);
      }
    }
    
    // Skip all the verbose timing, security, certificate data
    return filtered;
  }

  close() {
    this.writeRawLine(`\n---\n# Session ended: ${new Date().toISOString()}\n`);
    this.writeStream.end();
  }
}