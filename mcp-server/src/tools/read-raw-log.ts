import * as fs from 'fs';
import * as path from 'path';

export interface ReadRawLogArgs {
  logFile?: string;
  lines?: number;
  fromEnd?: boolean;
  filter?: string; // Filter by log level or type
  timeWindow?: number; // Minutes back from now
}

export async function readRawLog(args: ReadRawLogArgs) {
  try {
    // Default to the standard daisy log file if not specified
    const logFile = args.logFile || 'C:/Users/aldvincent/.daisy/logs/daisy-current.log';
    
    if (!fs.existsSync(logFile)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Log file not found',
              path: logFile,
              exists: false
            }, null, 2)
          }
        ]
      };
    }

    // Read the entire file
    const content = fs.readFileSync(logFile, 'utf8');
    let lines = content.split('\n');
    const totalLines = lines.length;
    
    // Apply time filtering if requested
    if (args.timeWindow) {
      const cutoffTime = new Date(Date.now() - args.timeWindow * 60 * 1000).toISOString();
      lines = lines.filter(line => {
        if (line.includes('"timestamp"')) {
          const match = line.match(/"timestamp":\s*"([^"]+)"/);
          if (match) {
            return match[1] >= cutoffTime;
          }
        }
        return true; // Keep non-log lines (headers, etc.)
      });
    }
    
    // Apply content filtering if requested
    if (args.filter) {
      lines = lines.filter(line => 
        line.toLowerCase().includes(args.filter!.toLowerCase())
      );
    }
    
    // Apply line count filtering if requested
    let selectedLines = lines;
    if (args.lines && args.lines > 0) {
      if (args.fromEnd) {
        // Get last N lines
        selectedLines = lines.slice(-args.lines);
      } else {
        // Get first N lines
        selectedLines = lines.slice(0, args.lines);
      }
    }

    // Get file stats
    const stats = fs.statSync(logFile);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            file_info: {
              path: logFile,
              size_bytes: stats.size,
              modified: stats.mtime.toISOString(),
              total_lines: totalLines,
              lines_returned: selectedLines.length,
              filter_applied: args.lines ? (args.fromEnd ? `last ${args.lines} lines` : `first ${args.lines} lines`) : 'none'
            },
            raw_content: selectedLines.join('\n'),
            line_by_line: selectedLines.map((line, index) => ({
              line_number: args.fromEnd ? (totalLines - selectedLines.length + index + 1) : (index + 1),
              content: line
            }))
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to read log file',
            details: error instanceof Error ? error.message : String(error),
            path: args.logFile
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}