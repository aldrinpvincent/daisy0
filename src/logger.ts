import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'minimal' | 'standard' | 'verbose';

export interface LogEntry {
  timestamp: string;
  type: 'console' | 'network' | 'error' | 'performance' | 'page' | 'security' | 'runtime' | 'interaction';
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
  private logFile: string;
  private logLevel: LogLevel;

  constructor(logFile: string, logLevel: LogLevel = 'standard') {
    this.logFile = logFile;
    this.logLevel = logLevel;

    // Use synchronous writes only to avoid file locking issues on Windows
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

    // Write header synchronously to create the file
    try {
      fs.writeFileSync(this.logFile, `# Daisy Debug Session\n${JSON.stringify(header, null, 2)}\n---\n`);

    } catch (err) {
      console.error('❌ Failed to write initial header:', err);
    }
  }

  log(entry: LogEntry) {
    const logLine = JSON.stringify(entry, null, 2);
    this.writeRawLine(`${logLine}\n`);
  }

  private writeRawLine(line: string) {
    // Retry logic for Windows file locking issues
    let retries = 3;
    while (retries > 0) {
      try {
        fs.appendFileSync(this.logFile, line);
        break;
      } catch (err: any) {
        if (err.code === 'EBUSY' && retries > 1) {
          retries--;
          // Small delay before retry
          const start = Date.now();
          while (Date.now() - start < 10) {
            // Busy wait for 10ms
          }
        } else {
          console.error('❌ Failed to write to log file:', err);
          break;
        }
      }
    }
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

    // Skip common static assets and development files that create noise
    const staticAssetExtensions = ['.woff2', '.woff', '.ttf', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
    const isStaticAsset = staticAssetExtensions.some(ext => url.toLowerCase().includes(ext));
    const isFontRequest = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

    // Check for JavaScript files - handle different header casing
    const contentType = headers && (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    const isJavaScriptFile = contentType &&
      (contentType.includes('text/javascript') ||
        contentType.includes('application/javascript') ||
        contentType.includes('text/jsx') ||
        contentType.includes('text/tsx'));

    const isDevFile = url.includes('__x00__') || url.includes('/@id/') || url.includes('hmr-runtime') ||
      url.includes('node_modules') || url.includes('.tsx') || url.includes('.jsx');

    if (this.logLevel !== 'verbose' && (isStaticAsset || isFontRequest || isJavaScriptFile || isDevFile)) {
      return; // Skip static assets and dev files unless in verbose mode
    }

    // Create clean network log structure
    const networkData: any = {
      method,
      url,
      status: statusCode
    };

    // Add essential headers only (content-type mainly)
    const essentialHeaders = this.getEssentialHeaders(headers);
    if (Object.keys(essentialHeaders).length > 0) {
      networkData.headers = essentialHeaders;
    }

    // Add request body if present
    if (requestData) {
      networkData.requestBody = this.filterRequestBody(requestData);
    }

    // Add response body for API calls (JSON responses are important for debugging)
    if (responseData) {
      const responseBody = this.extractResponseBody(responseData);
      if (responseBody) {
        // Always include JSON API responses (they're crucial for debugging)
        const isJsonResponse = headers && headers['content-type'] &&
          headers['content-type'].includes('application/json');

        if (isJsonResponse || this.logLevel === 'verbose') {
          // For JSON responses, include more content but still limit size
          const maxLength = isJsonResponse ? 1000 : 200;
          if (typeof responseBody === 'string') {
            networkData.responseBody = responseBody.length > maxLength ?
              responseBody.substring(0, maxLength) + '...[truncated]' : responseBody;
          } else {
            // For parsed JSON objects, stringify and limit
            const jsonString = JSON.stringify(responseBody, null, 2);
            networkData.responseBody = jsonString.length > maxLength ?
              jsonString.substring(0, maxLength) + '...[truncated]' : responseBody;
          }
        }
      }
    }

    this.log({
      timestamp: new Date().toISOString(),
      type: 'network',
      level: statusCode >= 400 ? 'error' : 'info',
      source: 'network_request',
      data: networkData
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

    // Simplify page event data to reduce noise
    const simplifiedData = eventType === 'navigation' ? {
      event: 'navigation',
      url: url || data.frame?.url
    } :
      eventType === 'load' ? { event: 'page_loaded' } :
        eventType === 'domContentLoaded' ? { event: 'dom_ready' } :
          eventType === 'documentUpdated' ? { event: 'dom_updated' } :
            { event: eventType };

    // Skip noisy page events in standard mode
    if (this.logLevel !== 'verbose' &&
      ['dom_updated', 'dom_ready'].includes(simplifiedData.event)) {
      return;
    }

    this.log({
      timestamp: new Date().toISOString(),
      type: 'page',
      level: 'info',
      source: 'page_events',
      data: simplifiedData,
      context: {
        url
      }
    });
  }

  logInteraction(interactionType: string, data: any, message: string) {
    // Apply log level filtering to interaction events
    if (this.shouldSkipLog('page', 'info')) {
      return;
    }

    // Skip noisy interactions - only log meaningful user actions
    if (interactionType === 'KEY' || interactionType === 'SCROLL') {
      return; // Skip key presses and scroll events
    }

    // Only log CLICK events for now (most meaningful for debugging)
    if (interactionType !== 'CLICK') {
      return;
    }

    // Skip clicks on non-interactive elements (divs, spans, etc.)
    const tag = data.element?.tag?.toLowerCase();
    const interactiveElements = ['button', 'a', 'input', 'select', 'textarea'];
    if (!interactiveElements.includes(tag)) {
      return; // Only log clicks on interactive elements
    }

    // LLM-optimized format: clear action with context
    const elementText = data.element?.text?.trim().substring(0, 25) || '';
    const elementId = data.element?.id || '';
    const elementClass = data.element?.className?.split(' ')[0] || ''; // First class only
    
    // Create descriptive but concise message for LLM understanding
    let elementDesc = elementText;
    if (!elementDesc && elementId) elementDesc = `#${elementId}`;
    if (!elementDesc && elementClass) elementDesc = `.${elementClass}`;
    if (!elementDesc) elementDesc = tag;

    this.log({
      timestamp: new Date().toISOString(),
      type: 'interaction',
      level: 'info',
      source: 'user_action',
      data: {
        action: 'CLICK',
        target: elementDesc,
        element_type: tag
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

  private getEssentialHeaders(headers: any): any {
    if (!headers) return {};

    // Only keep the most essential headers for debugging
    const essentialHeaders: any = {};
    const keepHeaders = ['content-type', 'content-length'];

    for (const [key, value] of Object.entries(headers)) {
      if (keepHeaders.includes(key.toLowerCase())) {
        essentialHeaders[key.toLowerCase()] = value;
      }
    }

    return essentialHeaders;
  }

  private extractResponseBody(responseData?: any): any {
    if (!responseData) return null;

    // If responseData is already the body content (from DevTools), return it
    if (typeof responseData === 'string' || typeof responseData === 'object') {
      return responseData;
    }

    return null;
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
  }
}