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
    serviceType?: string;
    domain?: string;
    errorType?: string;
    description?: string;
    errorPattern?: string;
    quickFix?: string;
    aiHints?: string[];
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

    // Add AI-friendly context for common API patterns
    const context = this.extractNetworkContext(url, statusCode, responseData);

    // Skip common static assets and development files that create noise
    const staticAssetExtensions = ['.woff2', '.woff', '.ttf', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
    const isStaticAsset = staticAssetExtensions.some(ext => url.toLowerCase().includes(ext));
    const isFontRequest = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');

    // Check for content types to skip - handle different header casing
    const contentType = headers && (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    const skipContentTypes = ['text/html', 'text/javascript', 'application/javascript', 'text/jsx', 'text/tsx'];
    const isSkippableContentType = contentType && skipContentTypes.some(type => contentType.includes(type));

    const isDevFile = url.includes('__x00__') || url.includes('/@id/') || url.includes('hmr-runtime') ||
      url.includes('node_modules') || url.includes('.tsx') || url.includes('.jsx');

    if (this.logLevel !== 'verbose' && (isStaticAsset || isFontRequest || isSkippableContentType || isDevFile)) {
      return; // Skip static assets, HTML pages, and dev files unless in verbose mode
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
      data: networkData,
      context: {
        ...context,
        aiHints: this.generateAIHints(url, statusCode, responseData)
      }
    });
  }

  logError(error: any, source: string = 'unknown', stackTrace?: string) {
    const errorContext = this.analyzeError(error, source);

    this.log({
      timestamp: new Date().toISOString(),
      type: 'error',
      level: 'error',
      source,
      data: {
        message: error.message || error,
        stack: error.stack || stackTrace,
        name: error.name,
        category: errorContext.category,
        severity: errorContext.severity
      },
      context: {
        stackTrace: error.stack || stackTrace,
        errorPattern: errorContext.pattern,
        quickFix: errorContext.quickFix,
        aiHints: errorContext.aiHints
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

  private extractNetworkContext(url: string, statusCode: number, responseData?: any): any {
    const context: any = {};

    // Only add useful context
    try {
      const urlObj = new URL(url);

      // Detect service type (useful for debugging)
      if (urlObj.pathname.includes('/api/')) {
        context.serviceType = 'api';
      } else if (urlObj.pathname.includes('/graphql')) {
        context.serviceType = 'graphql';
      }

    } catch (e) {
      // Invalid URL, skip context
    }

    // Error categorization (useful for AI debugging)
    if (statusCode >= 400) {
      const errorInfo = this.categorizeHttpError(statusCode);
      context.errorType = errorInfo.category;
      context.description = errorInfo.description;
    }

    return context;
  }

  private generateAIHints(url: string, statusCode: number, responseData?: any): string[] {
    const hints: string[] = [];

    // Generic HTTP status hints
    if (statusCode >= 400) {
      const errorCategory = this.categorizeHttpError(statusCode);
      hints.push(`HTTP_${statusCode}: ${errorCategory.description}`);
      hints.push(`CATEGORY: ${errorCategory.category}`);

      // Generic troubleshooting based on status code
      switch (Math.floor(statusCode / 100)) {
        case 4: // Client errors
          hints.push('CLIENT_ERROR: Check request parameters, headers, and authentication');
          if (statusCode === 401) {
            hints.push('AUTH_REQUIRED: Verify authentication credentials');
          } else if (statusCode === 403) {
            hints.push('PERMISSION_DENIED: Check user permissions and access rights');
          } else if (statusCode === 404) {
            hints.push('NOT_FOUND: Verify endpoint URL and resource existence');
          } else if (statusCode === 429) {
            hints.push('RATE_LIMITED: Implement retry logic with exponential backoff');
          }
          break;
        case 5: // Server errors
          hints.push('SERVER_ERROR: Check server status and retry with backoff');
          if (statusCode === 502 || statusCode === 503) {
            hints.push('SERVICE_UNAVAILABLE: Server may be temporarily down');
          } else if (statusCode === 504) {
            hints.push('TIMEOUT: Request took too long, consider increasing timeout');
          }
          break;
      }
    }

    // Generic API hints
    if (url.includes('/api/')) {
      hints.push('API_CALL: Review API documentation for correct usage');
      hints.push('DEBUG_TIP: Check request/response format and content-type');
    }

    // Response-based hints (generic)
    if (responseData && typeof responseData === 'object') {
      if (responseData.error) {
        if (responseData.error.message) {
          hints.push(`ERROR_MESSAGE: ${responseData.error.message}`);
        }
        if (responseData.error.code) {
          hints.push(`ERROR_CODE: ${responseData.error.code}`);
        }
        if (responseData.error.type) {
          hints.push(`ERROR_TYPE: ${responseData.error.type}`);
        }
      }

      // Common error response patterns
      if (responseData.message && !responseData.error) {
        hints.push(`RESPONSE_MESSAGE: ${responseData.message}`);
      }

      if (responseData.details) {
        hints.push('DETAILS_AVAILABLE: Check response details for more information');
      }
    }

    return hints;
  }

  private categorizeHttpError(statusCode: number): { category: string; description: string } {
    if (statusCode >= 400 && statusCode < 500) {
      const clientErrors: Record<number, string> = {
        400: 'Bad Request - Invalid request syntax or parameters',
        401: 'Unauthorized - Authentication required',
        403: 'Forbidden - Access denied',
        404: 'Not Found - Resource does not exist',
        405: 'Method Not Allowed - HTTP method not supported',
        409: 'Conflict - Request conflicts with current state',
        422: 'Unprocessable Entity - Request validation failed',
        429: 'Too Many Requests - Rate limit exceeded'
      };

      return {
        category: 'client_error',
        description: clientErrors[statusCode] || 'Client error - Check request format'
      };
    }

    if (statusCode >= 500) {
      const serverErrors: Record<number, string> = {
        500: 'Internal Server Error - Server encountered an error',
        502: 'Bad Gateway - Invalid response from upstream server',
        503: 'Service Unavailable - Server temporarily unavailable',
        504: 'Gateway Timeout - Upstream server timeout'
      };

      return {
        category: 'server_error',
        description: serverErrors[statusCode] || 'Server error - Service issue'
      };
    }

    return {
      category: 'unknown',
      description: 'Unknown HTTP status'
    };
  }

  private analyzeError(error: any, source: string): any {
    const message = error.message || error.toString();
    const stack = error.stack || '';

    let category = 'unknown';
    let severity = 3;
    let pattern = 'generic_error';
    let quickFix = 'Review error details and add appropriate handling';
    const aiHints: string[] = [];

    // JavaScript errors (generic patterns)
    if (message.includes('TypeError')) {
      category = 'javascript';
      severity = 4;
      pattern = 'type_error';
      quickFix = 'Add null/undefined checks before property access';
      aiHints.push('NULL_CHECK: Verify object exists before accessing properties');
      aiHints.push('DEFENSIVE_CODE: Use optional chaining (?.) or null checks');
    } else if (message.includes('ReferenceError')) {
      category = 'javascript';
      severity = 4;
      pattern = 'reference_error';
      quickFix = 'Check variable declarations and imports';
      aiHints.push('UNDEFINED_VAR: Variable or function not declared');
      aiHints.push('SCOPE_CHECK: Verify variable is in scope');
    } else if (message.includes('SyntaxError')) {
      category = 'javascript';
      severity = 5;
      pattern = 'syntax_error';
      quickFix = 'Fix syntax errors in code';
      aiHints.push('SYNTAX_FIX: Check brackets, semicolons, and syntax');
    } else if (message.includes('RangeError')) {
      category = 'javascript';
      severity = 3;
      pattern = 'range_error';
      quickFix = 'Check array bounds and numeric ranges';
      aiHints.push('BOUNDS_CHECK: Verify array indices and numeric limits');
    }

    // Network/connectivity errors
    if (message.includes('fetch') || message.includes('XMLHttpRequest') || message.includes('network') || source.includes('network')) {
      category = 'network';
      severity = 3;
      pattern = 'network_error';
      quickFix = 'Check network connectivity and endpoint availability';
      aiHints.push('CONNECTIVITY: Verify network connection and endpoint');
      aiHints.push('CORS_CHECK: Ensure CORS is properly configured');
    }

    // Authentication/authorization errors
    if (message.toLowerCase().includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      category = 'authentication';
      severity = 4;
      pattern = 'auth_error';
      quickFix = 'Verify authentication credentials and permissions';
      aiHints.push('CREDENTIALS: Check API keys, tokens, or login status');
      aiHints.push('PERMISSIONS: Verify user has required permissions');
    }

    // File system errors
    if (message.includes('ENOENT') || message.includes('EACCES') || message.includes('file') || message.includes('directory')) {
      category = 'filesystem';
      severity = 3;
      pattern = 'file_error';
      quickFix = 'Check file paths, permissions, and existence';
      aiHints.push('FILE_PATH: Verify file/directory exists and path is correct');
      aiHints.push('PERMISSIONS: Check read/write permissions');
    }

    // Database/connection errors
    if (message.includes('connection') || message.includes('database') || message.includes('timeout')) {
      category = 'database';
      severity = 4;
      pattern = 'connection_error';
      quickFix = 'Check database connection and configuration';
      aiHints.push('CONNECTION: Verify database/service is running and accessible');
      aiHints.push('CONFIG: Check connection strings and credentials');
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      category = 'validation';
      severity = 3;
      pattern = 'validation_error';
      quickFix = 'Check input validation and required fields';
      aiHints.push('INPUT_VALIDATION: Verify all required fields are provided');
      aiHints.push('DATA_FORMAT: Check data types and formats');
    }

    return {
      category,
      severity,
      pattern,
      quickFix,
      aiHints
    };
  }

  close() {
    this.writeRawLine(`\n---\n# Session ended: ${new Date().toISOString()}\n`);
  }
}