import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface QuickErrorsArgs {
  logFile?: string;
  timeWindow?: number; // minutes to look back
  severity?: 'all' | 'critical' | 'high' | 'medium';
}

export async function quickErrors(args: QuickErrorsArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    const timeWindow = (args.timeWindow || 10) * 60 * 1000; // Convert minutes to milliseconds
    const now = Date.now();
    const cutoff = new Date(now - timeWindow).toISOString();
    
    // Get recent entries
    const recentEntries = allEntries.filter(entry => entry.timestamp >= cutoff);
    
    // Extract errors with smart categorization
    const errors = extractSmartErrors(recentEntries);
    
    // Filter by severity if specified
    let filteredErrors = errors;
    if (args.severity !== 'all') {
      const severityMap = { critical: 5, high: 4, medium: 3 };
      const minSeverity = severityMap[args.severity as keyof typeof severityMap] || 3;
      filteredErrors = errors.filter(e => e.severity >= minSeverity);
    }
    
    // Group similar errors
    const groupedErrors = groupSimilarErrors(filteredErrors);
    
    // Generate quick insights
    const insights = generateQuickInsights(filteredErrors, recentEntries);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              timeWindow: `${args.timeWindow || 10} minutes`,
              totalEntries: recentEntries.length,
              errorsFound: filteredErrors.length,
              criticalErrors: filteredErrors.filter(e => e.severity >= 5).length,
              errorGroups: groupedErrors.length,
              mostCommonIssue: insights.mostCommon
            },
            
            // Quick error overview for AI agents
            quickScan: {
              hasErrors: filteredErrors.length > 0,
              primaryIssue: filteredErrors[0]?.category || 'none',
              urgency: calculateUrgency(filteredErrors),
              actionRequired: filteredErrors.length > 0,
              canAutoFix: checkAutoFixable(filteredErrors)
            },
            
            // Grouped errors with solutions
            errorGroups: groupedErrors.map(group => ({
              category: group.category,
              count: group.errors.length,
              severity: Math.max(...group.errors.map(e => e.severity)),
              pattern: group.pattern,
              quickFix: group.quickFix,
              examples: group.errors.slice(0, 2).map(e => ({
                timestamp: e.timestamp,
                message: e.message.substring(0, 100),
                location: e.location
              }))
            })),
            
            // Immediate actions for AI agents
            immediateActions: generateImmediateActions(filteredErrors),
            
            // Context for debugging
            debugContext: {
              recentActivity: insights.recentActivity,
              errorTrend: insights.trend,
              relatedFiles: insights.relatedFiles,
              suggestedInvestigation: insights.investigation
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
            error: 'Quick error analysis failed',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}

interface SmartError {
  category: 'api_error' | 'js_error' | 'network_error' | 'config_error' | 'user_error';
  message: string;
  severity: number;
  timestamp: string;
  location: string;
  pattern: string;
  quickFix: string;
  autoFixable: boolean;
}

function extractSmartErrors(entries: DaisyLogEntry[]): SmartError[] {
  const errors: SmartError[] = [];
  
  for (const entry of entries) {
    // Console errors
    if (entry.level === 'error' && entry.type === 'console') {
      const error = categorizeConsoleError(entry);
      if (error) errors.push(error);
    }
    
    // Network errors
    if (entry.type === 'network' && entry.data?.status >= 400) {
      const error = categorizeNetworkError(entry);
      if (error) errors.push(error);
    }
    
    // Runtime errors
    if (entry.type === 'error') {
      const error = categorizeRuntimeError(entry);
      if (error) errors.push(error);
    }
  }
  
  return errors.sort((a, b) => b.severity - a.severity);
}

function categorizeConsoleError(entry: DaisyLogEntry): SmartError | null {
  const message = entry.data?.message || entry.summary || '';
  const source = entry.data?.source || 'unknown';
  
  // API-related errors
  if (message.includes('Failed to load resource') && message.includes('400')) {
    return {
      category: 'api_error',
      message: 'API request failed with 400 error',
      severity: 4,
      timestamp: entry.timestamp,
      location: source,
      pattern: 'api_400_error',
      quickFix: 'Check API endpoint and request parameters',
      autoFixable: false
    };
  }
  
  // JavaScript errors
  if (message.includes('TypeError')) {
    return {
      category: 'js_error',
      message: 'JavaScript type error',
      severity: 4,
      timestamp: entry.timestamp,
      location: source,
      pattern: 'type_error',
      quickFix: 'Add null checks before property access',
      autoFixable: true
    };
  }
  
  if (message.includes('ReferenceError')) {
    return {
      category: 'js_error',
      message: 'JavaScript reference error',
      severity: 4,
      timestamp: entry.timestamp,
      location: source,
      pattern: 'reference_error',
      quickFix: 'Check variable declarations and imports',
      autoFixable: false
    };
  }
  
  return null;
}

function categorizeNetworkError(entry: DaisyLogEntry): SmartError | null {
  const status = entry.data?.status;
  const url = entry.data?.url || '';
  const method = entry.data?.method || 'GET';
  
  if (status === 400) {
    // Check for specific API errors
    if (url.includes('generativelanguage.googleapis.com')) {
      if (url.includes('gemini-pro')) {
        return {
          category: 'api_error',
          message: 'Deprecated Gemini model name',
          severity: 4,
          timestamp: entry.timestamp,
          location: 'Gemini API call',
          pattern: 'deprecated_model',
          quickFix: 'Update model name from "gemini-pro" to "gemini-1.5-pro"',
          autoFixable: true
        };
      }
      
      return {
        category: 'api_error',
        message: 'Gemini API authentication or request error',
        severity: 4,
        timestamp: entry.timestamp,
        location: 'Gemini API call',
        pattern: 'gemini_api_error',
        quickFix: 'Check API key and request format',
        autoFixable: false
      };
    }
    
    return {
      category: 'network_error',
      message: `${method} request failed with 400`,
      severity: 3,
      timestamp: entry.timestamp,
      location: url,
      pattern: 'bad_request',
      quickFix: 'Verify request parameters and format',
      autoFixable: false
    };
  }
  
  if (status === 401 || status === 403) {
    return {
      category: 'config_error',
      message: 'Authentication or authorization error',
      severity: 4,
      timestamp: entry.timestamp,
      location: url,
      pattern: 'auth_error',
      quickFix: 'Check API keys and permissions',
      autoFixable: false
    };
  }
  
  if (status === 404) {
    return {
      category: 'network_error',
      message: 'Resource not found',
      severity: 3,
      timestamp: entry.timestamp,
      location: url,
      pattern: 'not_found',
      quickFix: 'Verify URL and endpoint configuration',
      autoFixable: false
    };
  }
  
  if (status >= 500) {
    return {
      category: 'network_error',
      message: 'Server error',
      severity: 4,
      timestamp: entry.timestamp,
      location: url,
      pattern: 'server_error',
      quickFix: 'Check server status and retry with backoff',
      autoFixable: false
    };
  }
  
  return null;
}

function categorizeRuntimeError(entry: DaisyLogEntry): SmartError | null {
  const message = entry.data?.message || entry.summary || '';
  
  return {
    category: 'js_error',
    message: 'Runtime error',
    severity: 4,
    timestamp: entry.timestamp,
    location: 'Runtime',
    pattern: 'runtime_error',
    quickFix: 'Check error details and add error handling',
    autoFixable: false
  };
}

function groupSimilarErrors(errors: SmartError[]) {
  const groups = new Map<string, { category: string; pattern: string; errors: SmartError[]; quickFix: string }>();
  
  for (const error of errors) {
    const key = `${error.category}_${error.pattern}`;
    if (!groups.has(key)) {
      groups.set(key, {
        category: error.category,
        pattern: error.pattern,
        errors: [],
        quickFix: error.quickFix
      });
    }
    groups.get(key)!.errors.push(error);
  }
  
  return Array.from(groups.values()).sort((a, b) => b.errors.length - a.errors.length);
}

function generateQuickInsights(errors: SmartError[], allEntries: DaisyLogEntry[]) {
  const errorsByCategory = new Map<string, number>();
  const relatedFiles = new Set<string>();
  
  for (const error of errors) {
    errorsByCategory.set(error.category, (errorsByCategory.get(error.category) || 0) + 1);
    if (error.location && error.location !== 'unknown') {
      relatedFiles.add(error.location);
    }
  }
  
  const mostCommon = Array.from(errorsByCategory.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
  
  return {
    mostCommon,
    recentActivity: allEntries.length,
    trend: errors.length > 5 ? 'increasing' : errors.length > 0 ? 'stable' : 'decreasing',
    relatedFiles: Array.from(relatedFiles),
    investigation: generateInvestigationSteps(errors)
  };
}

function generateInvestigationSteps(errors: SmartError[]): string[] {
  if (errors.length === 0) return ['No errors found - system appears healthy'];
  
  const steps: string[] = [];
  const primaryError = errors[0];
  
  steps.push(`1. Address primary ${primaryError.category}: ${primaryError.quickFix}`);
  
  const apiErrors = errors.filter(e => e.category === 'api_error').length;
  if (apiErrors > 0) {
    steps.push(`2. Review ${apiErrors} API error(s) - check authentication and endpoints`);
  }
  
  const jsErrors = errors.filter(e => e.category === 'js_error').length;
  if (jsErrors > 0) {
    steps.push(`3. Fix ${jsErrors} JavaScript error(s) - add error handling`);
  }
  
  steps.push('4. Monitor for recurring patterns after fixes');
  
  return steps;
}

function calculateUrgency(errors: SmartError[]): 'low' | 'medium' | 'high' | 'critical' {
  if (errors.length === 0) return 'low';
  
  const criticalCount = errors.filter(e => e.severity >= 5).length;
  const highCount = errors.filter(e => e.severity >= 4).length;
  
  if (criticalCount > 0) return 'critical';
  if (highCount > 2) return 'high';
  if (errors.length > 5) return 'medium';
  return 'low';
}

function checkAutoFixable(errors: SmartError[]): boolean {
  return errors.some(e => e.autoFixable);
}

function generateImmediateActions(errors: SmartError[]): string[] {
  if (errors.length === 0) return ['No immediate actions required'];
  
  const actions: string[] = [];
  const autoFixable = errors.filter(e => e.autoFixable);
  
  if (autoFixable.length > 0) {
    actions.push(`Auto-fix available for ${autoFixable.length} error(s)`);
    actions.push(autoFixable[0].quickFix);
  }
  
  const apiErrors = errors.filter(e => e.category === 'api_error');
  if (apiErrors.length > 0) {
    actions.push('Check API configuration and credentials');
  }
  
  const jsErrors = errors.filter(e => e.category === 'js_error');
  if (jsErrors.length > 0) {
    actions.push('Review JavaScript code for null checks and error handling');
  }
  
  return actions;
}