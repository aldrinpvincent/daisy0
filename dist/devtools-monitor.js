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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevToolsMonitor = void 0;
const chrome_remote_interface_1 = __importDefault(require("chrome-remote-interface"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class DevToolsMonitor {
    constructor(port, logger, screenshotDir = './screenshots') {
        this.connected = false;
        this.pendingRequests = new Map(); // Track requests by requestId
        this.port = port;
        this.logger = logger;
        this.screenshotDir = screenshotDir;
        // Ensure screenshot directory exists
        if (!fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }
    async connect() {
        // Retry connection with backoff
        let retries = 5;
        let lastError;
        while (retries > 0) {
            try {
                this.client = await (0, chrome_remote_interface_1.default)({ port: this.port });
                break;
            }
            catch (error) {
                lastError = error;
                if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                    retries--;
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        continue;
                    }
                }
                throw error;
            }
        }
        if (!this.client) {
            throw lastError;
        }
        try {
            const { Runtime, Network, Log, Performance, Page, Security, Debugger } = this.client;
            // Enable all domains for comprehensive monitoring
            await Promise.all([
                Runtime.enable(),
                Network.enable(),
                Log.enable(),
                Performance.enable(),
                Page.enable(),
                Security.enable(),
                Debugger.enable()
            ]);
            // Set up event listeners for comprehensive debugging data
            // Console events
            Runtime.consoleAPICalled(async (params) => {
                // Extract clean message from console arguments
                const message = params.args.map((arg) => {
                    if (arg.value !== undefined)
                        return arg.value;
                    if (arg.description)
                        return arg.description;
                    return `[${arg.type}]`;
                }).join(' ');
                // Get the source location (file and line) from stack trace
                let sourceLocation = '';
                if (params.stackTrace && params.stackTrace.callFrames.length > 0) {
                    const frame = params.stackTrace.callFrames[0];
                    const fileName = frame.url ? frame.url.split('/').pop() : 'unknown';
                    sourceLocation = `${fileName}:${frame.lineNumber}`;
                }
                // Take screenshot on console errors
                let screenshotPath = null;
                if (params.type === 'error') {
                    screenshotPath = await this.takeScreenshot('console-error');
                }
                this.logger.logConsole(params.type, message, sourceLocation ? [{ sourceLocation, screenshot: screenshotPath }] : undefined, params.stackTrace);
            });
            // Runtime exceptions
            Runtime.exceptionThrown(async (params) => {
                // Take screenshot on JavaScript errors
                const screenshotPath = await this.takeScreenshot('js-exception');
                this.logger.logError({
                    message: params.exceptionDetails.text,
                    stack: params.exceptionDetails.stackTrace,
                    name: 'RuntimeException',
                    screenshot: screenshotPath
                }, 'runtime_exception', JSON.stringify(params.exceptionDetails.stackTrace));
            });
            // Network request events - track requests and responses
            Network.requestWillBeSent((params) => {
                // Store request info for later when response comes
                this.pendingRequests.set(params.requestId, {
                    method: params.request.method,
                    url: params.request.url,
                    headers: params.request.headers,
                    postData: params.request.postData
                });
            });
            Network.responseReceived(async (params) => {
                const requestData = this.pendingRequests.get(params.requestId);
                try {
                    // Get the actual response body content
                    let responseBody = null;
                    try {
                        const responseBodyResult = await Network.getResponseBody({
                            requestId: params.requestId
                        });
                        responseBody = responseBodyResult.body;
                        // Try to parse JSON responses
                        if (params.response.mimeType === 'application/json' && responseBody) {
                            try {
                                responseBody = JSON.parse(responseBody);
                            }
                            catch (e) {
                                // Keep as string if not valid JSON
                            }
                        }
                    }
                    catch (e) {
                        // Response body not available, skip
                    }
                    // Log the complete request/response
                    this.logger.logNetwork(requestData?.method || 'UNKNOWN', params.response.url, params.response.status, params.response.headers, requestData?.postData, responseBody);
                }
                catch (error) {
                    // Fallback to basic logging if something fails
                    this.logger.logNetwork(requestData?.method || 'UNKNOWN', params.response.url, params.response.status, params.response.headers, requestData?.postData, null);
                }
                // Clean up tracked request
                this.pendingRequests.delete(params.requestId);
            });
            Network.loadingFailed(async (params) => {
                // Take screenshot on network failures (4xx/5xx errors)
                const screenshotPath = await this.takeScreenshot('network-error');
                this.logger.logError({
                    message: `Network loading failed: ${params.errorText}`,
                    name: 'NetworkError',
                    url: params.request?.url,
                    screenshot: screenshotPath
                }, 'network_failure');
            });
            // Page events
            Page.loadEventFired((params) => {
                this.logger.logPageEvent('load', params);
            });
            Page.domContentEventFired((params) => {
                this.logger.logPageEvent('domContentLoaded', params);
            });
            Page.frameNavigated((params) => {
                this.logger.logPageEvent('navigation', params, params.frame.url);
            });
            // Security events
            Security.securityStateChanged((params) => {
                this.logger.logPageEvent('securityStateChange', params);
            });
            // Performance events
            Performance.metrics((params) => {
                this.logger.logPerformance('metrics', params);
            });
            // Log entries
            Log.entryAdded((params) => {
                this.logger.logConsole(params.entry.level, params.entry.text, undefined, params.entry.stackTrace, params.entry.url);
            });
            this.connected = true;
        }
        catch (error) {
            this.logger.logError(error, 'devtools_connection');
            throw error;
        }
    }
    async takeScreenshot(errorContext = '') {
        if (!this.connected || !this.client) {
            return null;
        }
        try {
            const { Page } = this.client;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = errorContext
                ? `error-${errorContext}-${timestamp}.png`
                : `screenshot-${timestamp}.png`;
            const filepath = path.join(this.screenshotDir, filename);
            // Capture screenshot
            const screenshot = await Page.captureScreenshot({
                format: 'png',
                captureBeyondViewport: false
            });
            // Save screenshot to file
            const buffer = Buffer.from(screenshot.data, 'base64');
            fs.writeFileSync(filepath, buffer);
            console.log(`📸 Screenshot saved: ${filepath}`);
            return filepath;
        }
        catch (error) {
            console.error('❌ Failed to capture screenshot:', error);
            return null;
        }
    }
    async disconnect() {
        if (this.client && this.connected) {
            await this.client.close();
            this.connected = false;
        }
    }
    isConnected() {
        return this.connected;
    }
}
exports.DevToolsMonitor = DevToolsMonitor;
//# sourceMappingURL=devtools-monitor.js.map