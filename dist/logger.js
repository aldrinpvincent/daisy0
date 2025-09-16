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
    constructor(logFile) {
        this.logFile = logFile;
        this.writeStream = fs.createWriteStream(logFile, { flags: 'w' });
        // Write initial header for LLM readability
        this.writeInitialHeader();
    }
    writeInitialHeader() {
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
    log(entry) {
        const logLine = JSON.stringify(entry, null, 2);
        this.writeRawLine(`${logLine}\n`);
    }
    writeRawLine(line) {
        this.writeStream.write(line);
    }
    logConsole(level, text, args, stackTrace, url) {
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
    logNetwork(method, url, statusCode, headers, requestData, responseData) {
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
    close() {
        this.writeRawLine(`\n---\n# Session ended: ${new Date().toISOString()}\n`);
        this.writeStream.end();
    }
}
exports.DaisyLogger = DaisyLogger;
//# sourceMappingURL=logger.js.map