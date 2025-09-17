import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DaisyLogParser, ParsedLogData, DaisyLogEntry } from './log-parser.js';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

export interface DaisyMCPServerConfig {
  logFiles: string[];
  screenshotsDir: string;
  watchMode: boolean;
  transport: 'stdio';
  controlApiPort: number;
  controlApiHost?: string;
}

export class DaisyMCPServer {
  private server: Server;
  private config: DaisyMCPServerConfig;
  private parser: DaisyLogParser;
  private logData: Map<string, ParsedLogData> = new Map();
  private watchers: chokidar.FSWatcher[] = [];
  private controlApiHost: string;

  constructor(config: DaisyMCPServerConfig) {
    this.config = config;
    this.parser = new DaisyLogParser(config.screenshotsDir);
    this.controlApiHost = `http://${config.controlApiHost || 'localhost'}:${config.controlApiPort}`;
    this.server = new Server(
      {
        name: 'daisy-mcp-server',
        version: '1.0.0',
        description: 'MCP server for daisy debugging logs and browser control - provides AI assistants with access to browser debugging data and interaction capabilities'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupHandlers();
  }

  private async makeControlApiRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.controlApiHost}${endpoint}`);
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      const reqData = data ? JSON.stringify(data) : undefined;
      if (reqData) {
        headers['Content-Length'] = Buffer.byteLength(reqData);
      }

      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
        timeout: 30000 // 30 second timeout
      };

      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${response.error || body}`));
            }
          } catch (e) {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ body });
            } else {
              reject(new Error(`Failed to parse response: ${body}`));
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (reqData) {
        req.write(reqData);
      }
      req.end();
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'analyze_logs',
            description: 'Parse and categorize log entries by type, severity, and time range with filtering capabilities',
            inputSchema: {
              type: 'object',
              properties: {
                logFile: {
                  type: 'string',
                  description: 'Path to specific log file (optional, defaults to all loaded files)'
                },
                types: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by log types: console, network, error, performance, page, security, runtime'
                },
                levels: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by log levels: info, warn, error, debug'
                },
                timeRange: {
                  type: 'object',
                  properties: {
                    start: { type: 'string', description: 'Start time (ISO 8601)' },
                    end: { type: 'string', description: 'End time (ISO 8601)' }
                  }
                },
                minSeverity: {
                  type: 'number',
                  description: 'Minimum severity level (1-5, where 5 is critical)',
                  minimum: 1,
                  maximum: 5
                },
                search: {
                  type: 'string',
                  description: 'Search term to filter log entries'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of entries to return',
                  default: 100
                }
              }
            }
          },
          {
            name: 'find_errors',
            description: 'Extract and analyze JavaScript errors, network failures, and console errors with context',
            inputSchema: {
              type: 'object',
              properties: {
                logFile: {
                  type: 'string',
                  description: 'Path to specific log file (optional)'
                },
                errorTypes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Types of errors to find: js_errors, network_failures, console_errors, all'
                },
                includeContext: {
                  type: 'boolean',
                  description: 'Include surrounding log entries for context',
                  default: true
                },
                timeRange: {
                  type: 'object',
                  properties: {
                    start: { type: 'string' },
                    end: { type: 'string' }
                  }
                }
              }
            }
          },
          {
            name: 'performance_insights',
            description: 'Analyze performance metrics, slow requests, memory usage patterns, and identify bottlenecks',
            inputSchema: {
              type: 'object',
              properties: {
                logFile: {
                  type: 'string',
                  description: 'Path to specific log file (optional)'
                },
                metrics: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Metrics to analyze: load_times, network_performance, memory_usage, all'
                },
                thresholds: {
                  type: 'object',
                  properties: {
                    slowRequestMs: { type: 'number', default: 1000 },
                    largeResponseBytes: { type: 'number', default: 1048576 }
                  }
                }
              }
            }
          },
          {
            name: 'suggest_fixes',
            description: 'Provide debugging suggestions and potential fixes based on log patterns and error analysis',
            inputSchema: {
              type: 'object',
              properties: {
                logFile: {
                  type: 'string',
                  description: 'Path to specific log file (optional)'
                },
                errorContext: {
                  type: 'string',
                  description: 'Specific error or issue to analyze'
                },
                includeCodeSuggestions: {
                  type: 'boolean',
                  description: 'Include specific code fix suggestions',
                  default: true
                }
              }
            }
          },
          {
            name: 'get_log_summary',
            description: 'Generate comprehensive log session summary with statistics, insights, and key findings',
            inputSchema: {
              type: 'object',
              properties: {
                logFile: {
                  type: 'string',
                  description: 'Path to specific log file (optional)'
                },
                includeDetails: {
                  type: 'boolean',
                  description: 'Include detailed breakdown of issues',
                  default: true
                },
                format: {
                  type: 'string',
                  enum: ['concise', 'detailed', 'technical'],
                  description: 'Summary format style',
                  default: 'detailed'
                }
              }
            }
          },
          {
            name: 'take_screenshot',
            description: 'Take a screenshot of the current browser page with optional context for debugging',
            inputSchema: {
              type: 'object',
              properties: {
                context: {
                  type: 'string',
                  description: 'Context description for the screenshot (used in filename)',
                  default: 'mcp-request'
                }
              }
            }
          },
          {
            name: 'browser_click',
            description: 'Click on a DOM element by CSS selector',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element to click'
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout in milliseconds to wait for element',
                  default: 5000
                }
              },
              required: ['selector']
            }
          },
          {
            name: 'browser_type',
            description: 'Type text into an input field or text area by CSS selector',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the input element'
                },
                text: {
                  type: 'string',
                  description: 'Text to type into the element'
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout in milliseconds to wait for element',
                  default: 5000
                },
                clear: {
                  type: 'boolean',
                  description: 'Clear existing text before typing',
                  default: false
                }
              },
              required: ['selector', 'text']
            }
          },
          {
            name: 'browser_navigate',
            description: 'Navigate the browser to a specific URL',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'URL to navigate to'
                },
                waitForLoad: {
                  type: 'boolean',
                  description: 'Wait for page to fully load',
                  default: true
                },
                timeout: {
                  type: 'number',
                  description: 'Navigation timeout in milliseconds',
                  default: 30000
                }
              },
              required: ['url']
            }
          },
          {
            name: 'browser_scroll',
            description: 'Scroll the page to an element or specific coordinates',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector of element to scroll to (optional)'
                },
                x: {
                  type: 'number',
                  description: 'X coordinate to scroll to (optional)'
                },
                y: {
                  type: 'number',
                  description: 'Y coordinate to scroll to (optional)'
                },
                behavior: {
                  type: 'string',
                  enum: ['smooth', 'instant', 'auto'],
                  description: 'Scroll behavior',
                  default: 'smooth'
                }
              }
            }
          },
          {
            name: 'inspect_dom',
            description: 'Inspect DOM element properties, HTML content, and attributes',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element to inspect'
                },
                properties: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Properties to retrieve (textContent, innerHTML, outerHTML, className, id, etc.)',
                  default: ['textContent', 'innerHTML', 'outerHTML', 'className', 'id']
                }
              },
              required: ['selector']
            }
          },
          {
            name: 'get_computed_styles',
            description: 'Get computed CSS styles for a DOM element',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element'
                },
                properties: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'CSS properties to retrieve',
                  default: ['color', 'background-color', 'font-size', 'display', 'position']
                }
              },
              required: ['selector']
            }
          },
          {
            name: 'evaluate_javascript',
            description: 'Execute JavaScript code in the browser context and return the result',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'JavaScript code to execute'
                },
                returnByValue: {
                  type: 'boolean',
                  description: 'Return result by value instead of object reference',
                  default: true
                },
                timeout: {
                  type: 'number',
                  description: 'Execution timeout in milliseconds',
                  default: 10000
                }
              },
              required: ['code']
            }
          },
          {
            name: 'inspect_network_tab',
            description: 'Get recent network requests with full details including headers and response data',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of network requests to return',
                  default: 50
                }
              }
            }
          },
          {
            name: 'wait_for_element',
            description: 'Wait for a DOM element to appear or become visible',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector for the element to wait for'
                },
                timeout: {
                  type: 'number',
                  description: 'Maximum wait time in milliseconds',
                  default: 10000
                },
                visible: {
                  type: 'boolean',
                  description: 'Wait for element to be visible (not just present in DOM)',
                  default: true
                }
              },
              required: ['selector']
            }
          },
          {
            name: 'wait_for_network_idle',
            description: 'Wait for network activity to finish (no pending requests)',
            inputSchema: {
              type: 'object',
              properties: {
                timeout: {
                  type: 'number',
                  description: 'Maximum wait time in milliseconds',
                  default: 10000
                },
                idleTime: {
                  type: 'number',
                  description: 'How long to wait with no network activity before considering idle',
                  default: 1000
                }
              }
            }
          }
        ]
      };
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [];
      
      // Add resources for each log file
      for (const logFile of this.config.logFiles) {
        const fileName = path.basename(logFile);
        resources.push({
          uri: `daisy://logs/${fileName}`,
          name: `Daisy Log: ${fileName}`,
          description: `Complete daisy debugging log file: ${fileName}`,
          mimeType: 'application/json'
        });
        
        resources.push({
          uri: `daisy://logs/${fileName}/metadata`,
          name: `Log Metadata: ${fileName}`,
          description: `Session metadata and statistics for ${fileName}`,
          mimeType: 'application/json'
        });
        
        resources.push({
          uri: `daisy://logs/${fileName}/errors`,
          name: `Errors: ${fileName}`,
          description: `All error entries from ${fileName}`,
          mimeType: 'application/json'
        });
        
        resources.push({
          uri: `daisy://logs/${fileName}/performance`,
          name: `Performance: ${fileName}`,
          description: `Performance-related entries from ${fileName}`,
          mimeType: 'application/json'
        });
      }
      
      // Add screenshots resource if directory exists
      if (fs.existsSync(this.config.screenshotsDir)) {
        resources.push({
          uri: 'daisy://screenshots',
          name: 'Screenshots',
          description: 'Available debugging screenshots',
          mimeType: 'application/json'
        });
      }
      
      return { resources };
    });

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      if (uri.startsWith('daisy://logs/')) {
        return this.handleLogResource(uri);
      } else if (uri === 'daisy://screenshots') {
        return this.handleScreenshotsResource();
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        // Log analysis tools
        case 'analyze_logs':
          return await this.handleAnalyzeLogs(args);
        case 'find_errors':
          return await this.handleFindErrors(args);
        case 'performance_insights':
          return await this.handlePerformanceInsights(args);
        case 'suggest_fixes':
          return await this.handleSuggestFixes(args);
        case 'get_log_summary':
          return await this.handleGetLogSummary(args);
        
        // Browser interaction tools
        case 'take_screenshot':
          return await this.handleTakeScreenshot(args);
        case 'browser_click':
          return await this.handleBrowserClick(args);
        case 'browser_type':
          return await this.handleBrowserType(args);
        case 'browser_navigate':
          return await this.handleBrowserNavigate(args);
        case 'browser_scroll':
          return await this.handleBrowserScroll(args);
        case 'inspect_dom':
          return await this.handleInspectDOM(args);
        case 'get_computed_styles':
          return await this.handleGetComputedStyles(args);
        case 'evaluate_javascript':
          return await this.handleEvaluateJavaScript(args);
        case 'inspect_network_tab':
          return await this.handleInspectNetworkTab(args);
        case 'wait_for_element':
          return await this.handleWaitForElement(args);
        case 'wait_for_network_idle':
          return await this.handleWaitForNetworkIdle(args);
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async handleLogResource(uri: string) {
    const parts = uri.split('/');
    const fileName = parts[3]; // daisy://logs/filename -> parts[3] is filename
    const resourceType = parts[4]; // daisy://logs/filename/type -> parts[4] is type
    
    const logFile = this.config.logFiles.find(f => path.basename(f) === fileName);
    if (!logFile || !this.logData.has(logFile)) {
      throw new Error(`Log file not found: ${fileName}`);
    }
    
    const data = this.logData.get(logFile)!;
    
    switch (resourceType) {
      case undefined:
        // Return complete log data
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2)
          }]
        };
      case 'metadata':
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              metadata: data.metadata,
              statistics: data.statistics,
              parseErrors: data.parseErrors
            }, null, 2)
          }]
        };
      case 'errors':
        const errors = data.entries.filter(e => e.level === 'error' || e.type === 'error');
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(errors, null, 2)
          }]
        };
      case 'performance':
        const performance = data.entries.filter(e => e.type === 'performance');
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(performance, null, 2)
          }]
        };
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  private async handleScreenshotsResource() {
    if (!fs.existsSync(this.config.screenshotsDir)) {
      return {
        contents: [{
          uri: 'daisy://screenshots',
          mimeType: 'application/json',
          text: JSON.stringify({ screenshots: [] }, null, 2)
        }]
      };
    }
    
    const files = fs.readdirSync(this.config.screenshotsDir)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .map(f => ({
        name: f,
        path: path.join(this.config.screenshotsDir, f),
        timestamp: fs.statSync(path.join(this.config.screenshotsDir, f)).mtime.toISOString()
      }));
    
    return {
      contents: [{
        uri: 'daisy://screenshots',
        mimeType: 'application/json',
        text: JSON.stringify({ screenshots: files }, null, 2)
      }]
    };
  }

  // Tool implementations will be imported from separate files
  private async handleAnalyzeLogs(args: any) {
    const { analyzeLogs } = await import('./tools/analyze-logs.js');
    return analyzeLogs(args, this.getAllLogEntries(), this.parser);
  }

  private async handleFindErrors(args: any) {
    const { findErrors } = await import('./tools/find-errors.js');
    return findErrors(args, this.getAllLogEntries(), this.parser);
  }

  private async handlePerformanceInsights(args: any) {
    const { performanceInsights } = await import('./tools/performance-insights.js');
    return performanceInsights(args, this.getAllLogEntries(), this.parser);
  }

  private async handleSuggestFixes(args: any) {
    const { suggestFixes } = await import('./tools/suggest-fixes.js');
    return suggestFixes(args, this.getAllLogEntries(), this.parser);
  }

  private async handleGetLogSummary(args: any) {
    const { getLogSummary } = await import('./tools/get-log-summary.js');
    return getLogSummary(args, this.logData, this.parser);
  }

  // Browser interaction tool handlers
  private async handleTakeScreenshot(args: any) {
    try {
      const response = await this.makeControlApiRequest('/screenshot', 'POST', {
        context: args.context || 'mcp-request'
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            screenshot: response.screenshot,
            timestamp: response.timestamp,
            context: args.context || 'mcp-request'
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text', 
          text: JSON.stringify({
            success: false,
            error: error.message,
            tool: 'take_screenshot'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleBrowserClick(args: any) {
    try {
      if (!args.selector) {
        throw new Error('selector is required');
      }

      const response = await this.makeControlApiRequest('/click', 'POST', {
        selector: args.selector,
        timeout: args.timeout || 5000
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            selector: args.selector,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            selector: args.selector,
            tool: 'browser_click'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleBrowserType(args: any) {
    try {
      if (!args.selector || args.text === undefined) {
        throw new Error('selector and text are required');
      }

      const response = await this.makeControlApiRequest('/type', 'POST', {
        selector: args.selector,
        text: args.text,
        timeout: args.timeout || 5000,
        clear: args.clear || false
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            selector: args.selector,
            text: args.text,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            selector: args.selector,
            tool: 'browser_type'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleBrowserNavigate(args: any) {
    try {
      if (!args.url) {
        throw new Error('url is required');
      }

      const response = await this.makeControlApiRequest('/navigate', 'POST', {
        url: args.url,
        waitForLoad: args.waitForLoad !== false,
        timeout: args.timeout || 30000
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            url: args.url,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            url: args.url,
            tool: 'browser_navigate'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleBrowserScroll(args: any) {
    try {
      const response = await this.makeControlApiRequest('/scroll', 'POST', {
        selector: args.selector,
        x: args.x,
        y: args.y,
        behavior: args.behavior || 'smooth'
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            params: { selector: args.selector, x: args.x, y: args.y, behavior: args.behavior },
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            tool: 'browser_scroll'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleInspectDOM(args: any) {
    try {
      if (!args.selector) {
        throw new Error('selector is required');
      }

      const response = await this.makeControlApiRequest('/inspect', 'POST', {
        selector: args.selector,
        properties: args.properties || ['textContent', 'innerHTML', 'outerHTML', 'className', 'id']
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            selector: args.selector,
            properties: args.properties || ['textContent', 'innerHTML', 'outerHTML', 'className', 'id'],
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            selector: args.selector,
            tool: 'inspect_dom'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleGetComputedStyles(args: any) {
    try {
      if (!args.selector) {
        throw new Error('selector is required');
      }

      const response = await this.makeControlApiRequest('/computed-styles', 'POST', {
        selector: args.selector,
        properties: args.properties || ['color', 'background-color', 'font-size', 'display', 'position']
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            selector: args.selector,
            properties: args.properties || ['color', 'background-color', 'font-size', 'display', 'position'],
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            selector: args.selector,
            tool: 'get_computed_styles'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleEvaluateJavaScript(args: any) {
    try {
      if (!args.code) {
        throw new Error('code is required');
      }

      const response = await this.makeControlApiRequest('/execute', 'POST', {
        code: args.code,
        returnByValue: args.returnByValue !== false,
        timeout: args.timeout || 10000
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            code: args.code,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            code: args.code,
            tool: 'evaluate_javascript'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleInspectNetworkTab(args: any) {
    try {
      const queryParams = args.limit ? `?limit=${args.limit}` : '';
      const response = await this.makeControlApiRequest(`/network-requests${queryParams}`);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            count: response.count,
            limit: args.limit || 50,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            tool: 'inspect_network_tab'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleWaitForElement(args: any) {
    try {
      if (!args.selector) {
        throw new Error('selector is required');
      }

      const response = await this.makeControlApiRequest('/wait-for-element', 'POST', {
        selector: args.selector,
        timeout: args.timeout || 10000,
        visible: args.visible !== false
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            selector: args.selector,
            timeout: args.timeout || 10000,
            visible: args.visible !== false,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            selector: args.selector,
            tool: 'wait_for_element'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private async handleWaitForNetworkIdle(args: any) {
    try {
      const response = await this.makeControlApiRequest('/wait-for-network-idle', 'POST', {
        timeout: args.timeout || 10000,
        idleTime: args.idleTime || 1000
      });
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            result: response.result,
            timeout: args.timeout || 10000,
            idleTime: args.idleTime || 1000,
            timestamp: response.timestamp
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error.message,
            tool: 'wait_for_network_idle'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private getAllLogEntries(): DaisyLogEntry[] {
    const allEntries: DaisyLogEntry[] = [];
    for (const data of this.logData.values()) {
      allEntries.push(...data.entries);
    }
    return allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async start(): Promise<void> {
    // Load initial log files
    await this.loadLogFiles();
    
    // Setup file watchers if watch mode is enabled
    if (this.config.watchMode) {
      this.setupFileWatchers();
    }

    // Setup transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('🌼 Daisy MCP Server started successfully');
    console.error(`📊 Loaded ${this.getAllLogEntries().length} log entries from ${this.config.logFiles.length} file(s)`);
  }

  private async loadLogFiles(): Promise<void> {
    for (const logFile of this.config.logFiles) {
      try {
        const data = this.parser.parseLogFile(logFile);
        this.logData.set(logFile, data);
        console.error(`✅ Loaded ${data.entries.length} entries from ${path.basename(logFile)}`);
      } catch (error) {
        console.error(`❌ Failed to load ${logFile}: ${error}`);
      }
    }
  }

  private setupFileWatchers(): void {
    for (const logFile of this.config.logFiles) {
      const watcher = chokidar.watch(logFile, {
        persistent: true,
        usePolling: false,
        ignoreInitial: true
      });

      watcher.on('change', async () => {
        try {
          console.error(`🔄 Reloading ${path.basename(logFile)}...`);
          const data = this.parser.parseLogFile(logFile);
          this.logData.set(logFile, data);
          console.error(`✅ Reloaded ${data.entries.length} entries`);
        } catch (error) {
          console.error(`❌ Failed to reload ${logFile}: ${error}`);
        }
      });

      this.watchers.push(watcher);
    }
  }

  async stop(): Promise<void> {
    // Close file watchers
    for (const watcher of this.watchers) {
      await watcher.close();
    }
    
    // Close server
    await this.server.close();
    console.error('🛑 Daisy MCP Server stopped');
  }
}