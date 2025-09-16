import * as fs from 'fs';
import * as path from 'path';

export interface DaisyLogEntry {
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
  // Enhanced fields for MCP usage
  id?: string;
  displayTime?: string;
  hasScreenshot?: boolean;
  summary?: string;
  category?: string;
  severity?: number; // 1-5 scale for prioritization
}

export interface DaisySessionMetadata {
  daisy_session_start: string;
  format: string;
  description: string;
  log_level: string;
  filtering?: any;
  log_structure?: any;
}

export interface ParsedLogData {
  metadata: DaisySessionMetadata | null;
  entries: DaisyLogEntry[];
  statistics: LogStatistics;
  parseErrors: number;
}

export interface LogStatistics {
  total: number;
  byType: Record<string, number>;
  byLevel: Record<string, number>;
  timeRange: {
    start: string | null;
    end: string | null;
    duration?: number; // milliseconds
  };
  errorCount: number;
  warningCount: number;
  performanceIssues: number;
  networkFailures: number;
}

export class DaisyLogParser {
  private screenshotsDir: string;

  constructor(screenshotsDir: string = './screenshots') {
    this.screenshotsDir = screenshotsDir;
  }

  parseLogFile(filePath: string): ParsedLogData {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Log file not found: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return this.parseContent(content);
    } catch (error) {
      throw new Error(`Error reading log file: ${error}`);
    }
  }

  parseContent(content: string): ParsedLogData {
    const parsedLogs: DaisyLogEntry[] = [];
    let metadata: DaisySessionMetadata | null = null;
    let parseErrors = 0;

    // Split content by lines and look for complete JSON objects
    const lines = content.split('\n');
    let currentJsonBuffer = '';
    let inJsonObject = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines and separators
      if (!line || line === '---') {
        continue;
      }

      // Skip markdown headers
      if (line.startsWith('# Daisy')) {
        continue;
      }

      // Try to parse session metadata (appears as JSON after header)
      if (!metadata && line.startsWith('{') && line.includes('daisy_session_start')) {
        try {
          metadata = JSON.parse(line);
          continue;
        } catch {
          // Continue with normal parsing
        }
      }

      // Detect start of JSON object
      if (line.startsWith('{') && !inJsonObject) {
        inJsonObject = true;
        currentJsonBuffer = line;
        braceCount = this.countBraces(line);
        
        // Check if it's a complete single-line JSON
        if (braceCount === 0) {
          this.tryParseAndAdd(currentJsonBuffer, parsedLogs, parseErrors);
          currentJsonBuffer = '';
          inJsonObject = false;
        }
      } else if (inJsonObject) {
        // Continue building multi-line JSON
        currentJsonBuffer += '\n' + line;
        braceCount += this.countBraces(line);
        
        // Check if JSON object is complete
        if (braceCount <= 0) {
          this.tryParseAndAdd(currentJsonBuffer, parsedLogs, parseErrors);
          currentJsonBuffer = '';
          inJsonObject = false;
          braceCount = 0;
        }
      }
    }
    
    // Handle any remaining JSON buffer
    if (currentJsonBuffer && inJsonObject) {
      this.tryParseAndAdd(currentJsonBuffer, parsedLogs, parseErrors);
    }

    // Generate statistics
    const statistics = this.generateStatistics(parsedLogs);

    return {
      metadata,
      entries: parsedLogs,
      statistics,
      parseErrors
    };
  }

  private countBraces(line: string): number {
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    return openBraces - closeBraces;
  }

  private tryParseAndAdd(jsonBuffer: string, parsedLogs: DaisyLogEntry[], parseErrors: number): void {
    try {
      const logEntry = JSON.parse(jsonBuffer);
      
      // Only add valid log entries (must have required fields)
      if (this.isValidLogEntry(logEntry)) {
        const enriched = this.enrichLogEntry(logEntry);
        parsedLogs.push(enriched);
      }
    } catch (e) {
      parseErrors++;
      // Silently ignore parsing errors for non-log JSON objects
    }
  }

  private isValidLogEntry(entry: any): boolean {
    return entry && 
           typeof entry === 'object' &&
           entry.timestamp &&
           entry.type &&
           entry.level &&
           entry.source;
  }

  private enrichLogEntry(entry: any): DaisyLogEntry {
    const enriched: DaisyLogEntry = {
      ...entry,
      id: this.generateId(entry),
      displayTime: this.formatTime(entry.timestamp),
      hasScreenshot: this.checkForScreenshot(entry),
      summary: this.generateSummary(entry),
      category: this.categorizeEntry(entry),
      severity: this.calculateSeverity(entry)
    };

    return enriched;
  }

  private generateId(entry: any): string {
    // Create a semi-unique ID based on timestamp and content
    const content = JSON.stringify(entry.data || '');
    const hash = content.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    return `${entry.timestamp}_${hash}`;
  }

  private formatTime(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit'
      });
    } catch (e) {
      return timestamp;
    }
  }

  private checkForScreenshot(entry: any): boolean {
    // Check if there's a corresponding screenshot for error entries
    if (entry.level === 'error' && entry.timestamp && fs.existsSync(this.screenshotsDir)) {
      try {
        const screenshotPattern = entry.timestamp.replace(/[:.]/g, '-');
        const files = fs.readdirSync(this.screenshotsDir);
        return files.some(file => 
          file.includes(screenshotPattern.substring(0, 16))
        );
      } catch {
        return false;
      }
    }
    return false;
  }

  private generateSummary(entry: any): string {
    switch (entry.type) {
      case 'console':
        return entry.data?.message || 'Console message';
      case 'network':
        const method = entry.data?.method || 'UNKNOWN';
        const url = this.truncateUrl(entry.data?.url || 'unknown URL');
        const status = entry.data?.status || entry.context?.statusCode || '?';
        return `${method} ${url} (${status})`;
      case 'error':
        return entry.data?.message || entry.data?.name || 'Runtime error';
      case 'performance':
        return `${entry.data?.metric || 'Performance'}: ${entry.data?.details || ''}`;
      case 'page':
        return `Page ${entry.data?.event || 'event'}: ${entry.data?.details || ''}`;
      default:
        return `${entry.type} event`;
    }
  }

  private categorizeEntry(entry: any): string {
    // Provide more specific categorization for debugging
    if (entry.type === 'error') {
      if (entry.data?.stack?.includes('TypeError')) return 'type_error';
      if (entry.data?.stack?.includes('ReferenceError')) return 'reference_error';
      if (entry.data?.stack?.includes('SyntaxError')) return 'syntax_error';
      return 'runtime_error';
    }
    
    if (entry.type === 'network') {
      const status = entry.data?.status || entry.context?.statusCode;
      if (status >= 500) return 'server_error';
      if (status >= 400) return 'client_error';
      if (status >= 300) return 'redirect';
      return 'network_success';
    }
    
    if (entry.type === 'console') {
      if (entry.level === 'error') return 'console_error';
      if (entry.level === 'warn') return 'console_warning';
      return 'console_info';
    }
    
    return entry.type;
  }

  private calculateSeverity(entry: any): number {
    // Calculate severity on 1-5 scale (5 = critical)
    let severity = 1;
    
    if (entry.level === 'error') severity = 4;
    else if (entry.level === 'warn') severity = 3;
    else if (entry.level === 'info') severity = 2;
    else if (entry.level === 'debug') severity = 1;
    
    // Boost severity for critical error types
    if (entry.type === 'error') {
      severity = Math.max(severity, 4);
      if (entry.data?.message?.includes('Uncaught')) severity = 5;
    }
    
    // Network errors
    if (entry.type === 'network') {
      const status = entry.data?.status || entry.context?.statusCode;
      if (status >= 500) severity = Math.max(severity, 4);
      else if (status >= 400) severity = Math.max(severity, 3);
    }
    
    return severity;
  }

  private truncateUrl(url: string, maxLength: number = 50): string {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + '...';
  }

  private generateStatistics(entries: DaisyLogEntry[]): LogStatistics {
    const byType: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    let errorCount = 0;
    let warningCount = 0;
    let performanceIssues = 0;
    let networkFailures = 0;
    let startTime: string | null = null;
    let endTime: string | null = null;

    for (const entry of entries) {
      // Count by type
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      
      // Count by level
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
      
      // Count specific issues
      if (entry.level === 'error') errorCount++;
      if (entry.level === 'warn') warningCount++;
      
      if (entry.type === 'performance' && entry.severity && entry.severity >= 3) {
        performanceIssues++;
      }
      
      if (entry.type === 'network' && entry.context?.statusCode && entry.context.statusCode >= 400) {
        networkFailures++;
      }
      
      // Track time range
      if (!startTime || entry.timestamp < startTime) {
        startTime = entry.timestamp;
      }
      if (!endTime || entry.timestamp > endTime) {
        endTime = entry.timestamp;
      }
    }

    // Calculate duration
    let duration: number | undefined;
    if (startTime && endTime) {
      try {
        duration = new Date(endTime).getTime() - new Date(startTime).getTime();
      } catch {
        duration = undefined;
      }
    }

    return {
      total: entries.length,
      byType,
      byLevel,
      timeRange: {
        start: startTime,
        end: endTime,
        duration
      },
      errorCount,
      warningCount,
      performanceIssues,
      networkFailures
    };
  }

  // Utility methods for filtering
  filterByTimeRange(entries: DaisyLogEntry[], startTime: string, endTime: string): DaisyLogEntry[] {
    return entries.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();
      return entryTime >= start && entryTime <= end;
    });
  }

  filterByType(entries: DaisyLogEntry[], types: string[]): DaisyLogEntry[] {
    return entries.filter(entry => types.includes(entry.type));
  }

  filterByLevel(entries: DaisyLogEntry[], levels: string[]): DaisyLogEntry[] {
    return entries.filter(entry => levels.includes(entry.level));
  }

  filterBySeverity(entries: DaisyLogEntry[], minSeverity: number): DaisyLogEntry[] {
    return entries.filter(entry => (entry.severity || 1) >= minSeverity);
  }

  searchEntries(entries: DaisyLogEntry[], searchTerm: string): DaisyLogEntry[] {
    const term = searchTerm.toLowerCase();
    return entries.filter(entry => {
      const searchableText = JSON.stringify({
        summary: entry.summary,
        data: entry.data,
        source: entry.source
      }).toLowerCase();
      return searchableText.includes(term);
    });
  }
}