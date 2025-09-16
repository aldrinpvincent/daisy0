import * as fs from 'fs';
import * as path from 'path';

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

  constructor(logFile: string) {
    this.logFile = logFile;
    this.writeStream = fs.createWriteStream(logFile, { flags: 'w' });
    
    // Write initial header for LLM readability
    this.writeInitialHeader();
  }

  private writeInitialHeader() {
    const header = {
      daisy_session_start: new Date().toISOString(),
      format: "structured_json_logs",
      description: "Real-time Chrome DevTools Protocol debugging data",
      log_structure: {
        timestamp: "ISO 8601 timestamp",
        type: "Event category (console, network, error, performance, page, security, runtime)",
        level: "Log level (info, warn, error, debug)",
        source: "Event source/origin",
        data: "Raw event data from DevTools Protocol",
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
    this.log({
      timestamp: new Date().toISOString(),
      type: 'console',
      level: this.mapConsoleLevel(level),
      source: 'browser_console',
      data: {
        message: text,
        arguments: args,
        stackTrace: stackTrace
      },
      context: {
        url: url
      }
    });
  }

  logNetwork(method: string, url: string, statusCode: number, headers: any, requestData?: any, responseData?: any) {
    this.log({
      timestamp: new Date().toISOString(),
      type: 'network',
      level: statusCode >= 400 ? 'error' : 'info',
      source: 'network_request',
      data: {
        request: {
          method,
          url,
          headers,
          body: requestData
        },
        response: {
          statusCode,
          body: responseData
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

  close() {
    this.writeRawLine(`\n---\n# Session ended: ${new Date().toISOString()}\n`);
    this.writeStream.end();
  }
}