import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DaisyLogParser, ParsedLogData, DaisyLogEntry } from './log-parser.js';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';

export interface DaisyMCPServerConfig {
  logFiles: string[];
  screenshotsDir: string;
  watchMode: boolean;
  transport: 'stdio';
}

export class DaisyMCPServer {
  private server: Server;
  private config: DaisyMCPServerConfig;
  private parser: DaisyLogParser;
  private logData: Map<string, ParsedLogData> = new Map();
  private watchers: chokidar.FSWatcher[] = [];

  constructor(config: DaisyMCPServerConfig) {
    this.config = config;
    this.parser = new DaisyLogParser(config.screenshotsDir);
    this.server = new Server(
      {
        name: 'daisy-mcp-server',
        version: '1.0.0',
        description: 'MCP server for daisy debugging logs - provides AI assistants with access to browser debugging data'
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