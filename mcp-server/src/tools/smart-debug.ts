import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface SmartDebugArgs {
  logFile?: string;
  context?: string;
  timeWindow?: number; // milliseconds to look back
  includeScreenshot?: boolean;
}

export async function smartDebug(args: SmartDebugArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser, controlApiRequest?: Function) {
  try {
    const timeWindow = args.timeWindow || 300000; // 5 minutes default
    const now = Date.now();
    const cutoff = new Date(now - timeWindow).toISOString();
    
    // Get recent entries
    const recentEntries = allEntries.filter(entry => entry.timestamp >= cutoff);
    
    // Analyze errors with AI-focused insights
    const errors = extractAndAnalyzeErrors(recentEntries);
    const networkIssues = analyzeNetworkIssues(recentEntries);
    const patterns = detectErrorPatterns(recentEntries);
    const solutions = generateSpecificSolutions(errors, networkIssues, patterns);
    
    // Take screenshot if requested and control API available
    let screenshot = null;
    if (args.includeScreenshot && controlApiRequest) {
      try {
        const screenshotResult = await controlApiRequest('/screenshot', 'POST', {
          context: args.context || 'smart-debug'
        });
        screenshot = screenshotResult.screenshot;
      } catch (e) {
        // Screenshot failed, continue without it
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              context: args.context,
              timeWindow: `${timeWindow / 1000}s`,
              totalRecentEntries: recentEntries.length,
              errorsFound: errors.length,
              networkIssues: networkIssues.length,
              criticalIssues: errors.filter(e => e.severity >= 4).length,
              screenshot: screenshot
            },
            
            // AI-focused error analysis
            primaryIssues: errors.slice(0, 3).map(error => ({
              type: error.type,
              message: error.message,
              severity: error.severity,
              timestamp: error.timestamp,
              location: error.location,
              rootCause: error.rootCause,
              quickFix: error.quickFix,
              codeExample: error.codeExample
            })),
            
            // Network analysis
            networkAnalysis: {
              failedRequests: networkIssues.filter(n => n.failed),
              slowRequests: networkIssues.filter(n => n.slow),
              apiErrors: networkIssues.filter(n => n.apiError),
              recommendations: generateNetworkRecommendations(networkIssues)
            },
            
            // Pattern detection
            errorPatterns: patterns.map(p => ({
              pattern: p.pattern,
              frequency: p.count,
              impact: p.impact,
              solution: p.solution
            })),
            
            // Actionable solutions
            immediateActions: solutions.immediate,
            codeChanges: solutions.codeChanges,
            configChanges: solutions.configChanges,
            
            // Context for AI agents
            debuggingContext: {
              mostLikelyIssue: solutions.mostLikelyIssue,
              confidenceLevel: solutions.confidence,
              nextSteps: solutions.nextSteps,
              relatedFiles: solutions.relatedFiles
            }
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
            error: 'Smart debug analysis failed',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}

interface AnalyzedError {
  type: 'api_error' | 'javascript_error' | 'network_error' | 'configuration_error';
  message: string;
  severity: number;
  timestamp: string;
  location: string;
  rootCause: string;
  quickFix: string;
  codeExample?: string;
}

function extractAndAnalyzeErrors(entries: DaisyLogEntry[]): AnalyzedError[] {
  const errors: AnalyzedError[] = [];
  
  for (const entry of entries) {
    if (entry.level === 'error' || (entry.type === 'network' && entry.data?.status >= 400)) {
      const analyzed = analyzeSpecificError(entry);
      if (analyzed) errors.push(analyzed);
    }
  }
  
  return errors.sort((a, b) => b.severity - a.severity);
}

function analyzeSpecificError(entry: DaisyLogEntry): AnalyzedError | null {
  const message = entry.data?.message || entry.summary || '';
  const url = entry.data?.url || entry.context?.url || '';
  
  // Gemini API errors
  if (url.includes('generativelanguage.googleapis.com')) {
    if (message.includes('gemini-pro') || url.includes('gemini-pro')) {
      return {
        type: 'api_error',
        message: 'Deprecated Gemini model name',
        severity: 4,
        timestamp: entry.timestamp,
        location: 'gemini.ts',
        rootCause: 'Using deprecated "gemini-pro" model name',
        quickFix: 'Update model name to "gemini-1.5-pro" or "gemini-1.5-flash"',
        codeExample: `// Change from:
const model = "gemini-pro";
// To:
const model = "gemini-1.5-pro";`
      };
    }
    
    if (message.includes('API key not valid')) {
      return {
        type: 'configuration_error',
        message: 'Invalid Gemini API key',
        severity: 5,
        timestamp: entry.timestamp,
        location: 'Environment configuration',
        rootCause: 'API key is missing, invalid, or expired',
        quickFix: 'Check API key in environment variables or configuration',
        codeExample: `// Verify API key is set:
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY not set');`
      };
    }
  }
  
  // JavaScript errors
  if (entry.type === 'console' && entry.level === 'error') {
    if (message.includes('TypeError')) {
      return {
        type: 'javascript_error',
        message: 'Type error in JavaScript',
        severity: 4,
        timestamp: entry.timestamp,
        location: entry.data?.source || 'Unknown',
        rootCause: 'Accessing property on null/undefined value',
        quickFix: 'Add null checks before property access',
        codeExample: `// Add null check:
if (object && object.property) {
  // Safe to access
}`
      };
    }
    
    if (message.includes('ReferenceError')) {
      return {
        type: 'javascript_error',
        message: 'Reference error in JavaScript',
        severity: 4,
        timestamp: entry.timestamp,
        location: entry.data?.source || 'Unknown',
        rootCause: 'Variable or function not defined',
        quickFix: 'Check variable declarations and imports',
        codeExample: `// Check imports:
import { missingFunction } from './module';`
      };
    }
  }
  
  // Network errors
  if (entry.type === 'network' && entry.data?.status >= 400) {
    const status = entry.data.status;
    if (status === 404) {
      return {
        type: 'network_error',
        message: 'Resource not found',
        severity: 3,
        timestamp: entry.timestamp,
        location: url,
        rootCause: 'API endpoint or resource does not exist',
        quickFix: 'Verify URL and API endpoint configuration'
      };
    }
    
    if (status >= 500) {
      return {
        type: 'network_error',
        message: 'Server error',
        severity: 4,
        timestamp: entry.timestamp,
        location: url,
        rootCause: 'Server-side error or service unavailable',
        quickFix: 'Check server status and retry with exponential backoff'
      };
    }
  }
  
  return null;
}

function analyzeNetworkIssues(entries: DaisyLogEntry[]) {
  return entries
    .filter(e => e.type === 'network')
    .map(entry => ({
      url: entry.data?.url,
      method: entry.data?.method,
      status: entry.data?.status,
      failed: entry.data?.status >= 400,
      slow: false, // Could add timing analysis
      apiError: entry.data?.url?.includes('api') && entry.data?.status >= 400,
      timestamp: entry.timestamp
    }));
}

function detectErrorPatterns(entries: DaisyLogEntry[]) {
  const patterns = new Map<string, { count: number; entries: DaisyLogEntry[] }>();
  
  for (const entry of entries) {
    if (entry.level === 'error') {
      const pattern = extractErrorPattern(entry.data?.message || entry.summary || '');
      if (!patterns.has(pattern)) {
        patterns.set(pattern, { count: 0, entries: [] });
      }
      patterns.get(pattern)!.count++;
      patterns.get(pattern)!.entries.push(entry);
    }
  }
  
  return Array.from(patterns.entries()).map(([pattern, data]) => ({
    pattern,
    count: data.count,
    impact: data.count > 1 ? 'high' : 'low',
    solution: generatePatternSolution(pattern, data.entries)
  }));
}

function extractErrorPattern(message: string): string {
  return message
    .replace(/:\d+:\d+/g, ':XX:XX')
    .replace(/\d+/g, 'N')
    .replace(/['"`][^'"`]*['"`]/g, '"VALUE"')
    .substring(0, 100);
}

function generatePatternSolution(pattern: string, entries: DaisyLogEntry[]): string {
  if (pattern.includes('gemini-pro')) {
    return 'Update all Gemini API calls to use current model names (gemini-1.5-pro)';
  }
  if (pattern.includes('API key')) {
    return 'Verify API key configuration and permissions';
  }
  if (pattern.includes('TypeError')) {
    return 'Add defensive programming with null checks';
  }
  return 'Review error context and add appropriate error handling';
}

function generateSpecificSolutions(errors: AnalyzedError[], networkIssues: any[], patterns: any[]) {
  const immediate: string[] = [];
  const codeChanges: string[] = [];
  const configChanges: string[] = [];
  let mostLikelyIssue = 'No critical issues detected';
  let confidence = 'low';
  
  // Analyze primary issues
  if (errors.length > 0) {
    const primaryError = errors[0];
    mostLikelyIssue = primaryError.rootCause;
    confidence = 'high';
    
    immediate.push(primaryError.quickFix);
    
    if (primaryError.codeExample) {
      codeChanges.push(primaryError.codeExample);
    }
    
    if (primaryError.type === 'configuration_error') {
      configChanges.push('Update environment variables or configuration files');
    }
  }
  
  // Add network-specific recommendations
  const apiErrors = networkIssues.filter(n => n.apiError);
  if (apiErrors.length > 0) {
    immediate.push('Check API service status and authentication');
    configChanges.push('Verify API endpoints and credentials');
  }
  
  return {
    immediate,
    codeChanges,
    configChanges,
    mostLikelyIssue,
    confidence,
    nextSteps: generateNextSteps(errors, patterns),
    relatedFiles: extractRelatedFiles(errors)
  };
}

function generateNetworkRecommendations(issues: any[]): string[] {
  const recommendations: string[] = [];
  
  const failedCount = issues.filter(i => i.failed).length;
  if (failedCount > 0) {
    recommendations.push(`${failedCount} failed requests detected - check API status`);
  }
  
  const apiErrors = issues.filter(i => i.apiError).length;
  if (apiErrors > 0) {
    recommendations.push(`${apiErrors} API errors - verify authentication and endpoints`);
  }
  
  return recommendations;
}

function generateNextSteps(errors: AnalyzedError[], patterns: any[]): string[] {
  const steps: string[] = [];
  
  if (errors.length > 0) {
    steps.push(`1. Fix primary issue: ${errors[0].quickFix}`);
    
    if (errors.length > 1) {
      steps.push(`2. Address ${errors.length - 1} additional error(s)`);
    }
  }
  
  if (patterns.some(p => p.count > 1)) {
    steps.push('3. Review recurring error patterns for systematic fixes');
  }
  
  steps.push('4. Test the fix and monitor for new issues');
  
  return steps;
}

function extractRelatedFiles(errors: AnalyzedError[]): string[] {
  const files = new Set<string>();
  
  for (const error of errors) {
    if (error.location && error.location !== 'Unknown') {
      files.add(error.location);
    }
  }
  
  return Array.from(files);
}