import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface FindErrorsArgs {
  logFile?: string;
  errorTypes?: string[];
  includeContext?: boolean;
  timeRange?: {
    start: string;
    end: string;
  };
}

export async function findErrors(args: FindErrorsArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    let entries = [...allEntries];
    const includeContext = args.includeContext !== false; // default true
    const errorTypes = args.errorTypes || ['all'];

    // Apply time range filter if specified
    if (args.timeRange) {
      entries = parser.filterByTimeRange(entries, args.timeRange.start, args.timeRange.end);
    }

    // Extract different types of errors
    const errors = extractErrors(entries, errorTypes);
    
    // Add context if requested
    if (includeContext) {
      addContextToErrors(errors, entries);
    }

    // Generate error analysis
    const analysis = analyzeErrors(errors);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              total_errors: errors.length,
              error_types_found: errorTypes,
              time_range: args.timeRange || 'all time',
              context_included: includeContext,
              analysis
            },
            errors: errors.map(errorGroup => ({
              ...errorGroup,
              entries: errorGroup.entries.map(entry => ({
                id: entry.id,
                timestamp: entry.timestamp,
                displayTime: entry.displayTime,
                type: entry.type,
                level: entry.level,
                severity: entry.severity,
                source: entry.source,
                summary: entry.summary,
                category: entry.category,
                hasScreenshot: entry.hasScreenshot,
                data: entry.data,
                context: entry.context,
                surrounding_context: (entry as any).surrounding_context
              }))
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
            error: 'Failed to find errors',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

interface ErrorGroup {
  type: 'javascript_error' | 'network_failure' | 'console_error' | 'runtime_error' | 'unknown_error';
  pattern: string;
  count: number;
  severity: number;
  first_occurrence: string;
  last_occurrence: string;
  entries: DaisyLogEntry[];
  recommendations: string[];
}

function extractErrors(entries: DaisyLogEntry[], errorTypes: string[]): ErrorGroup[] {
  const errorGroups: Map<string, ErrorGroup> = new Map();

  for (const entry of entries) {
    const errorInfo = classifyError(entry);
    if (!errorInfo) continue;

    // Check if this error type is requested
    if (!errorTypes.includes('all') && !errorTypes.includes(errorInfo.type)) {
      continue;
    }

    const key = `${errorInfo.type}:${errorInfo.pattern}`;
    
    if (!errorGroups.has(key)) {
      errorGroups.set(key, {
        type: errorInfo.type,
        pattern: errorInfo.pattern,
        count: 0,
        severity: errorInfo.severity,
        first_occurrence: entry.timestamp,
        last_occurrence: entry.timestamp,
        entries: [],
        recommendations: generateErrorRecommendations(errorInfo.type, errorInfo.pattern, entry)
      });
    }

    const group = errorGroups.get(key)!;
    group.count++;
    group.entries.push(entry);
    group.last_occurrence = entry.timestamp;
    
    // Update severity to highest found
    group.severity = Math.max(group.severity, errorInfo.severity);
  }

  return Array.from(errorGroups.values())
    .sort((a, b) => b.severity - a.severity || b.count - a.count);
}

interface ErrorInfo {
  type: 'javascript_error' | 'network_failure' | 'console_error' | 'runtime_error' | 'unknown_error';
  pattern: string;
  severity: number;
}

function classifyError(entry: DaisyLogEntry): ErrorInfo | null {
  // JavaScript/Runtime Errors
  if (entry.type === 'error' || (entry.type === 'console' && entry.level === 'error')) {
    const message = entry.data?.message || entry.summary || '';
    const stack = entry.data?.stack || entry.context?.stackTrace || '';
    
    // Classify by error type
    if (message.includes('TypeError') || stack.includes('TypeError')) {
      return {
        type: 'javascript_error',
        pattern: `TypeError: ${extractErrorPattern(message)}`,
        severity: 4
      };
    }
    
    if (message.includes('ReferenceError') || stack.includes('ReferenceError')) {
      return {
        type: 'javascript_error',
        pattern: `ReferenceError: ${extractErrorPattern(message)}`,
        severity: 4
      };
    }
    
    if (message.includes('SyntaxError') || stack.includes('SyntaxError')) {
      return {
        type: 'javascript_error',
        pattern: `SyntaxError: ${extractErrorPattern(message)}`,
        severity: 5
      };
    }
    
    if (message.includes('Uncaught')) {
      return {
        type: 'javascript_error',
        pattern: `Uncaught Error: ${extractErrorPattern(message)}`,
        severity: 5
      };
    }
    
    return {
      type: entry.type === 'console' ? 'console_error' : 'runtime_error',
      pattern: extractErrorPattern(message),
      severity: 3
    };
  }

  // Network Failures
  if (entry.type === 'network') {
    const status = entry.data?.status || entry.context?.statusCode;
    const url = entry.data?.url || '';
    
    if (status && status >= 400) {
      let severity = 3;
      if (status >= 500) severity = 4;
      if (status === 404) severity = 2;
      
      return {
        type: 'network_failure',
        pattern: `HTTP ${status}: ${getUrlPattern(url)}`,
        severity
      };
    }
  }

  // Check for general error level entries
  if (entry.level === 'error') {
    return {
      type: 'unknown_error',
      pattern: extractErrorPattern(entry.summary || 'Unknown error'),
      severity: 3
    };
  }

  return null;
}

function extractErrorPattern(message: string): string {
  // Extract meaningful pattern from error message
  // Remove specific values, line numbers, etc.
  let pattern = message
    .replace(/at line \d+/g, 'at line XXX')
    .replace(/:\d+:\d+/g, ':XXX:XXX')
    .replace(/\d+/g, 'N')
    .replace(/['"`]([^'"`]+)['"`]/g, '"VALUE"')
    .replace(/https?:\/\/[^\s]+/g, 'URL')
    .substring(0, 100);
  
  return pattern || 'Generic error';
}

function getUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    const pathPattern = parsed.pathname
      .replace(/\/\d+/g, '/ID')
      .replace(/\?.*/, '?...');
    return `${parsed.origin}${pathPattern}`;
  } catch {
    return url.substring(0, 50) + (url.length > 50 ? '...' : '');
  }
}

function generateErrorRecommendations(type: string, pattern: string, entry: DaisyLogEntry): string[] {
  const recommendations: string[] = [];

  switch (type) {
    case 'javascript_error':
      if (pattern.includes('TypeError')) {
        recommendations.push('Check for null/undefined values before accessing properties');
        recommendations.push('Add type validation or null checks');
        recommendations.push('Review variable initialization');
      } else if (pattern.includes('ReferenceError')) {
        recommendations.push('Check variable declarations and scope');
        recommendations.push('Verify imports and module dependencies');
        recommendations.push('Check for typos in variable names');
      } else if (pattern.includes('SyntaxError')) {
        recommendations.push('Review code syntax and formatting');
        recommendations.push('Check for missing brackets, commas, or semicolons');
        recommendations.push('Validate JSON if parsing JSON data');
      } else if (pattern.includes('Uncaught')) {
        recommendations.push('Add try-catch blocks around potentially failing code');
        recommendations.push('Implement proper error handling');
        recommendations.push('Check for unhandled Promise rejections');
      }
      break;

    case 'network_failure':
      if (pattern.includes('HTTP 404')) {
        recommendations.push('Verify API endpoint URLs are correct');
        recommendations.push('Check if resources exist on the server');
        recommendations.push('Review routing configuration');
      } else if (pattern.includes('HTTP 500')) {
        recommendations.push('Check server logs for internal errors');
        recommendations.push('Review server-side code for bugs');
        recommendations.push('Verify database connections and queries');
      } else if (pattern.includes('HTTP 401') || pattern.includes('HTTP 403')) {
        recommendations.push('Check authentication credentials');
        recommendations.push('Verify API keys and tokens are valid');
        recommendations.push('Review user permissions and access rights');
      } else {
        recommendations.push('Check network connectivity');
        recommendations.push('Verify API endpoint availability');
        recommendations.push('Review request headers and parameters');
      }
      break;

    case 'console_error':
      recommendations.push('Review console output for debugging information');
      recommendations.push('Check browser developer tools for additional context');
      recommendations.push('Look for related warnings that might provide clues');
      break;

    default:
      recommendations.push('Review the error context and surrounding code');
      recommendations.push('Check application logs for additional information');
      recommendations.push('Consider adding more detailed error logging');
  }

  // Add screenshot recommendation if available
  if (entry.hasScreenshot) {
    recommendations.push('Review the screenshot captured at error time for visual context');
  }

  return recommendations;
}

function addContextToErrors(errorGroups: ErrorGroup[], allEntries: DaisyLogEntry[]): void {
  for (const group of errorGroups) {
    for (const errorEntry of group.entries) {
      // Find surrounding log entries (3 before, 3 after)
      const errorIndex = allEntries.findIndex(e => e.id === errorEntry.id);
      if (errorIndex !== -1) {
        const contextBefore = allEntries.slice(Math.max(0, errorIndex - 3), errorIndex);
        const contextAfter = allEntries.slice(errorIndex + 1, errorIndex + 4);
        
        (errorEntry as any).surrounding_context = {
          before: contextBefore.map(e => ({
            timestamp: e.timestamp,
            type: e.type,
            level: e.level,
            summary: e.summary
          })),
          after: contextAfter.map(e => ({
            timestamp: e.timestamp,
            type: e.type,
            level: e.level,
            summary: e.summary
          }))
        };
      }
    }
  }
}

function analyzeErrors(errorGroups: ErrorGroup[]) {
  const totalErrors = errorGroups.reduce((sum, group) => sum + group.count, 0);
  const criticalErrors = errorGroups.filter(g => g.severity >= 5).length;
  const highSeverityErrors = errorGroups.filter(g => g.severity >= 4).length;
  
  const errorPatterns = errorGroups
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(g => ({ pattern: g.pattern, count: g.count, type: g.type }));

  const recommendations: string[] = [];
  
  if (criticalErrors > 0) {
    recommendations.push('Address critical errors immediately - they may break core functionality');
  }
  
  if (highSeverityErrors > 0) {
    recommendations.push('Review high severity errors for impact on user experience');
  }
  
  const jsErrors = errorGroups.filter(g => g.type === 'javascript_error').length;
  const networkErrors = errorGroups.filter(g => g.type === 'network_failure').length;
  
  if (jsErrors > networkErrors && jsErrors > 0) {
    recommendations.push('JavaScript errors are predominant - focus on code quality and testing');
  } else if (networkErrors > 0) {
    recommendations.push('Network issues detected - review API reliability and error handling');
  }

  return {
    total_errors: totalErrors,
    unique_error_patterns: errorGroups.length,
    critical_errors: criticalErrors,
    high_severity_errors: highSeverityErrors,
    most_common_patterns: errorPatterns,
    error_type_distribution: {
      javascript_errors: errorGroups.filter(g => g.type === 'javascript_error').length,
      network_failures: errorGroups.filter(g => g.type === 'network_failure').length,
      console_errors: errorGroups.filter(g => g.type === 'console_error').length,
      runtime_errors: errorGroups.filter(g => g.type === 'runtime_error').length,
      unknown_errors: errorGroups.filter(g => g.type === 'unknown_error').length
    },
    recommendations
  };
}