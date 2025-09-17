"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaisyLogger = void 0;
const fs = __importStar(require("fs"));
class DaisyLogger {
    constructor(logFile, logLevel = 'standard') {
        this.logFile = logFile;
        this.logLevel = logLevel;
        // Use synchronous writes only to avoid file locking issues on Windows
        // Write initial header for LLM readability
        this.writeInitialHeader();
    }
    writeInitialHeader() {
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
        }
        catch (err) {
            console.error('❌ Failed to write initial header:', err);
        }
    }
    log(entry) {
        const logLine = JSON.stringify(entry, null, 2);
        this.writeRawLine(`${logLine}\n`);
    }
    writeRawLine(line) {
        // Retry logic for Windows file locking issues
        let retries = 3;
        while (retries > 0) {
            try {
                fs.appendFileSync(this.logFile, line);
                break;
            }
            catch (err) {
                if (err.code === 'EBUSY' && retries > 1) {
                    retries--;
                    // Small delay before retry
                    const start = Date.now();
                    while (Date.now() - start < 10) {
                        // Busy wait for 10ms
                    }
                }
                else {
                    console.error('❌ Failed to write to log file:', err);
                    break;
                }
            }
        }
    }
    logConsole(level, text, args, stackTrace, url) {
        // Filter console output based on log level
        if (this.shouldSkipLog('console', this.mapConsoleLevel(level))) {
            return;
        }
        // Create clean console log structure
        const logData = {
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
    logNetwork(method, url, statusCode, headers, requestData, responseData) {
        // Filter network requests based on log level
        if (this.shouldSkipLog('network', statusCode >= 400 ? 'error' : 'info')) {
            return;
        }
        // Skip common static assets that create noise
        const staticAssetExtensions = ['.woff2', '.woff', '.ttf', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
        const isStaticAsset = staticAssetExtensions.some(ext => url.toLowerCase().includes(ext));
        const isFontRequest = url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com');
        if (this.logLevel !== 'verbose' && (isStaticAsset || isFontRequest)) {
            return; // Skip static assets unless in verbose mode
        }
        // Create clean network log structure
        const networkData = {
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
        // Add response body/data if present (only for non-static assets and in verbose mode)
        if (responseData && this.logLevel === 'verbose') {
            const responseBody = this.extractResponseBody(responseData);
            if (responseBody && typeof responseBody === 'string' && responseBody.length < 500) {
                networkData.responseBody = responseBody.substring(0, 200) + (responseBody.length > 200 ? '...' : '');
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
    logError(error, source = 'unknown', stackTrace) {
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
    logPerformance(name, data) {
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
    logPageEvent(eventType, data, url) {
        // Apply log level filtering to page events
        if (this.shouldSkipLog('page', 'info')) {
            return;
        }
        // Simplify page event data to reduce noise
        const simplifiedData = eventType === 'navigation' ? { url: url || data.frame?.url } :
            eventType === 'load' ? { event: 'page loaded' } :
                eventType === 'domContentLoaded' ? { event: 'DOM ready' } :
                    { event: eventType };
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
    logInteraction(interactionType, data, message) {
        // Apply log level filtering to interaction events
        if (this.shouldSkipLog('page', 'info')) {
            return;
        }
        this.log({
            timestamp: new Date().toISOString(),
            type: 'page',
            level: 'info',
            source: 'user_interaction',
            data: {
                interaction: interactionType,
                message: message,
                details: data
            }
        });
    }
    mapConsoleLevel(level) {
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
    shouldSkipLog(logType, level) {
        if (this.logLevel === 'verbose')
            return false;
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
        if (level === 'debug')
            return true;
        // In standard mode, skip verbose performance/page events unless they're errors
        if (this.logLevel === 'standard' && level === 'info') {
            const skipTypesStandard = ['performance'];
            if (skipTypesStandard.includes(logType)) {
                return true;
            }
        }
        return false;
    }
    filterConsoleArguments(args) {
        if (!args || this.logLevel === 'verbose')
            return args || [];
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
    filterStackTrace(stackTrace) {
        if (!stackTrace || this.logLevel === 'verbose')
            return stackTrace;
        if (this.logLevel === 'minimal')
            return undefined;
        // Standard level - keep only essential stack frames (first 3)
        if (stackTrace.callFrames) {
            return {
                callFrames: stackTrace.callFrames.slice(0, 3).map((frame) => ({
                    functionName: frame.functionName,
                    url: frame.url,
                    lineNumber: frame.lineNumber,
                    columnNumber: frame.columnNumber
                }))
            };
        }
        return stackTrace;
    }
    filterHeaders(headers) {
        if (!headers || this.logLevel === 'verbose')
            return headers;
        if (this.logLevel === 'minimal') {
            // Only keep essential headers
            const essentialHeaders = {};
            const keepHeaders = ['content-type', 'authorization', 'x-api-key', 'user-agent'];
            for (const key of keepHeaders) {
                if (headers[key.toLowerCase()]) {
                    essentialHeaders[key] = headers[key.toLowerCase()];
                }
            }
            return essentialHeaders;
        }
        // Standard level - remove verbose headers but keep useful ones
        const filteredHeaders = {};
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
    filterRequestBody(body) {
        if (!body || this.logLevel === 'verbose')
            return body;
        if (this.logLevel === 'minimal')
            return '[Request Body]';
        // Standard level - truncate large bodies
        if (typeof body === 'string' && body.length > 1000) {
            return body.substring(0, 1000) + '... [truncated]';
        }
        return body;
    }
    getEssentialHeaders(headers) {
        if (!headers)
            return {};
        // Only keep the most essential headers for debugging
        const essentialHeaders = {};
        const keepHeaders = ['content-type', 'content-length'];
        for (const [key, value] of Object.entries(headers)) {
            if (keepHeaders.includes(key.toLowerCase())) {
                essentialHeaders[key.toLowerCase()] = value;
            }
        }
        return essentialHeaders;
    }
    extractResponseBody(responseData) {
        if (!responseData)
            return null;
        // If responseData is already the body content (from DevTools), return it
        if (typeof responseData === 'string' || typeof responseData === 'object') {
            return responseData;
        }
        return null;
    }
    filterResponseBody(responseData) {
        if (!responseData || this.logLevel === 'verbose')
            return responseData;
        // Remove verbose response data that's not useful for debugging
        const filtered = {};
        if (responseData.url)
            filtered.url = responseData.url;
        if (responseData.status)
            filtered.status = responseData.status;
        if (responseData.statusText)
            filtered.statusText = responseData.statusText;
        if (responseData.mimeType)
            filtered.mimeType = responseData.mimeType;
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
exports.DaisyLogger = DaisyLogger;
//# sourceMappingURL=logger.js.map