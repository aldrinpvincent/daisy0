"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevToolsMonitor = void 0;
const chrome_remote_interface_1 = __importDefault(require("chrome-remote-interface"));
class DevToolsMonitor {
    constructor(port, logger) {
        this.connected = false;
        this.port = port;
        this.logger = logger;
    }
    async connect() {
        try {
            this.client = await (0, chrome_remote_interface_1.default)({ port: this.port });
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
            Runtime.consoleAPICalled((params) => {
                this.logger.logConsole(params.type, params.args.map((arg) => arg.value).join(' '), params.args, params.stackTrace);
            });
            // Runtime exceptions
            Runtime.exceptionThrown((params) => {
                this.logger.logError({
                    message: params.exceptionDetails.text,
                    stack: params.exceptionDetails.stackTrace,
                    name: 'RuntimeException'
                }, 'runtime_exception', JSON.stringify(params.exceptionDetails.stackTrace));
            });
            // Network request events
            Network.requestWillBeSent((params) => {
                this.logger.logNetwork(params.request.method, params.request.url, 0, // Status not known yet
                params.request.headers, params.request.postData);
            });
            Network.responseReceived((params) => {
                this.logger.logNetwork(params.response.url.includes('?') ? 'GET' : 'UNKNOWN', params.response.url, params.response.status, params.response.headers, undefined, params.response);
            });
            Network.loadingFailed((params) => {
                this.logger.logError({
                    message: `Network loading failed: ${params.errorText}`,
                    name: 'NetworkError'
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