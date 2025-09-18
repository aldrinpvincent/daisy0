import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface DiagnoseErrorArgs {
  context?: string;  // Optional description of what the user was trying to do
  timeWindow?: number;  // How far back to look for errors (default 30 seconds)
  includeStackTraces?: boolean;  // Include full stack traces (default true)
}

export interface DiagnosticReport {
  summary: DiagnosticSummary;
  screenshot: ScreenshotInfo;
  errors: ErrorAnalysis;
  currentState: BrowserState;
  networkActivity: NetworkAnalysis;
  actionableInsights: string[];
  timestamp: string;
  context?: string;
}

interface DiagnosticSummary {
  totalIssuesFound: number;
  criticalErrors: number;
  networkFailures: number;
  consoleErrors: number;
  javascriptErrors: number;
  primaryConcern: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ScreenshotInfo {
  path: string | null;
  timestamp: string;
  success: boolean;
  error?: string;
}

interface ErrorAnalysis {
  recentErrors: CategorizedError[];
  errorPatterns: ErrorPattern[];
  stackTraces: StackTraceInfo[];
  timeRange: {
    start: string;
    end: string;
    durationMs: number;
  };
}

interface CategorizedError {
  type: 'javascript' | 'network' | 'console' | 'runtime' | 'unknown';
  severity: number;
  message: string;
  timestamp: string;
  source: string;
  category: string;
  details: any;
  stackTrace?: string;
  recommendations: string[];
}

interface ErrorPattern {
  pattern: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  type: string;
  severity: number;
}

interface StackTraceInfo {
  error: string;
  stack: string;
  timestamp: string;
  frames: StackFrame[];
}

interface StackFrame {
  file: string;
  line: number;
  column: number;
  function: string;
}

interface BrowserState {
  page: PageInfo;
  javascript: JavaScriptState;
  dom: DOMInfo;
  viewport: ViewportInfo;
  userAgent: string;
}

interface PageInfo {
  url: string;
  title: string;
  loaded: boolean;
  readyState: string;
  referrer: string;
}

interface JavaScriptState {
  globalErrors: string[];
  undefinedVariables: string[];
  consoleErrors: string[];
  unhandledPromises: string[];
  performance: {
    memoryUsage?: any;
    timing?: any;
  };
}

interface DOMInfo {
  elementCount: number;
  formsCount: number;
  imagesCount: number;
  scriptsCount: number;
  stylesheetsCount: number;
  brokenImages: string[];
  missingElements: string[];
}

interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  orientation: string;
}

interface NetworkAnalysis {
  recentRequests: NetworkRequestSummary[];
  failures: NetworkFailure[];
  slowRequests: SlowRequest[];
  statistics: NetworkStatistics;
}

interface NetworkRequestSummary {
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
  size?: number;
  error?: string;
}

interface NetworkFailure {
  url: string;
  method: string;
  status: number;
  error: string;
  timestamp: number;
  retryCount?: number;
}

interface SlowRequest {
  url: string;
  method: string;
  duration: number;
  timestamp: number;
  size?: number;
}

interface NetworkStatistics {
  totalRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalDataTransferred: number;
  slowRequestsCount: number;
}

export async function diagnoseError(
  args: DiagnoseErrorArgs, 
  allEntries: DaisyLogEntry[], 
  parser: DaisyLogParser,
  makeControlApiRequest: (endpoint: string, method: 'GET' | 'POST', data?: any) => Promise<any>
) {
  try {
    const timeWindow = args.timeWindow || 30000; // Default 30 seconds
    const includeStackTraces = args.includeStackTraces !== false; // Default true
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - timeWindow);

    console.log('🔍 Starting comprehensive error diagnosis...');

    // 1. Take screenshot first
    console.log('📸 Capturing screenshot...');
    const screenshot = await captureScreenshot(makeControlApiRequest, args.context);

    // 2. Filter logs to time window
    const recentEntries = allEntries.filter(entry => {
      const entryTime = new Date(entry.timestamp);
      return entryTime >= cutoffTime;
    });

    console.log(`📊 Analyzing ${recentEntries.length} recent log entries...`);

    // 3. Get current browser state
    console.log('🌐 Gathering browser state...');
    const browserState = await getBrowserState(makeControlApiRequest);

    // 4. Analyze errors from logs
    console.log('⚠️ Analyzing errors...');
    const errorAnalysis = analyzeErrorsInLogs(recentEntries, includeStackTraces, cutoffTime, now);

    // 5. Analyze network activity
    console.log('🌐 Analyzing network activity...');
    const networkAnalysis = analyzeNetworkActivity(recentEntries, timeWindow);

    // 6. Generate diagnostic summary
    console.log('📋 Generating summary...');
    const summary = generateDiagnosticSummary(errorAnalysis, networkAnalysis, browserState);

    // 7. Generate actionable insights
    console.log('💡 Generating actionable insights...');
    const actionableInsights = generateActionableInsights(
      errorAnalysis, 
      networkAnalysis, 
      browserState, 
      summary,
      args.context
    );

    const report: DiagnosticReport = {
      summary,
      screenshot,
      errors: errorAnalysis,
      currentState: browserState,
      networkActivity: networkAnalysis,
      actionableInsights,
      timestamp: now.toISOString(),
      context: args.context
    };

    console.log('✅ Error diagnosis complete');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(report, null, 2)
        }
      ]
    };

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to complete error diagnosis',
            details: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            context: args.context
          }, null, 2)
        }
      ]
    };
  }
}

async function captureScreenshot(
  makeControlApiRequest: (endpoint: string, method: 'GET' | 'POST', data?: any) => Promise<any>,
  context?: string
): Promise<ScreenshotInfo> {
  try {
    const screenshotContext = context ? `diagnose-${context.replace(/[^a-zA-Z0-9]/g, '-')}` : 'diagnose-error';
    const response = await makeControlApiRequest('/screenshot', 'POST', { 
      context: screenshotContext 
    });
    
    return {
      path: response.screenshot,
      timestamp: response.timestamp,
      success: true
    };
  } catch (error) {
    return {
      path: null,
      timestamp: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getBrowserState(
  makeControlApiRequest: (endpoint: string, method: 'GET' | 'POST', data?: any) => Promise<any>
): Promise<BrowserState> {
  try {
    const response = await makeControlApiRequest('/evaluate-javascript', 'POST', {
      code: `
        (() => {
          // Gather comprehensive browser state
          const state = {
            page: {
              url: window.location.href,
              title: document.title,
              loaded: document.readyState === 'complete',
              readyState: document.readyState,
              referrer: document.referrer
            },
            javascript: {
              globalErrors: [],
              undefinedVariables: [],
              consoleErrors: [],
              unhandledPromises: [],
              performance: {}
            },
            dom: {
              elementCount: document.querySelectorAll('*').length,
              formsCount: document.forms.length,
              imagesCount: document.images.length,
              scriptsCount: document.scripts.length,
              stylesheetsCount: document.styleSheets.length,
              brokenImages: [],
              missingElements: []
            },
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio || 1,
              orientation: screen.orientation ? screen.orientation.type : 'unknown'
            },
            userAgent: navigator.userAgent
          };

          // Check for broken images
          const images = Array.from(document.images);
          state.dom.brokenImages = images
            .filter(img => !img.complete || img.naturalWidth === 0)
            .map(img => img.src)
            .slice(0, 10); // Limit to 10

          // Check for common missing elements that might indicate issues
          const commonSelectors = ['#app', '#root', '.main-content', 'main', '.container'];
          state.dom.missingElements = commonSelectors.filter(selector => !document.querySelector(selector));

          // Get memory info if available
          if (performance.memory) {
            state.javascript.performance.memoryUsage = {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit
            };
          }

          // Get timing info
          if (performance.timing) {
            const timing = performance.timing;
            state.javascript.performance.timing = {
              loadComplete: timing.loadEventEnd - timing.navigationStart,
              domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
              firstPaint: timing.responseStart - timing.navigationStart
            };
          }

          // Check for global JavaScript errors stored by error handlers
          if (window.__daisy_global_errors) {
            state.javascript.globalErrors = window.__daisy_global_errors.slice(-5); // Last 5 errors
          }

          // Check for undefined variables by testing common ones
          const commonVars = ['$', 'jQuery', 'React', 'Vue', 'angular', 'app'];
          state.javascript.undefinedVariables = commonVars.filter(varName => {
            try {
              return typeof window[varName] === 'undefined';
            } catch (e) {
              return true;
            }
          });

          return state;
        })()
      `
    });

    return response.result || {
      page: { url: 'unknown', title: 'unknown', loaded: false, readyState: 'unknown', referrer: '' },
      javascript: { globalErrors: [], undefinedVariables: [], consoleErrors: [], unhandledPromises: [], performance: {} },
      dom: { elementCount: 0, formsCount: 0, imagesCount: 0, scriptsCount: 0, stylesheetsCount: 0, brokenImages: [], missingElements: [] },
      viewport: { width: 0, height: 0, devicePixelRatio: 1, orientation: 'unknown' },
      userAgent: 'unknown'
    };
  } catch (error) {
    // Return default state if evaluation fails
    return {
      page: { url: 'unknown', title: 'unknown', loaded: false, readyState: 'unknown', referrer: '' },
      javascript: { globalErrors: [], undefinedVariables: [], consoleErrors: [], unhandledPromises: [], performance: {} },
      dom: { elementCount: 0, formsCount: 0, imagesCount: 0, scriptsCount: 0, stylesheetsCount: 0, brokenImages: [], missingElements: [] },
      viewport: { width: 0, height: 0, devicePixelRatio: 1, orientation: 'unknown' },
      userAgent: 'unknown'
    };
  }
}

function analyzeErrorsInLogs(
  entries: DaisyLogEntry[], 
  includeStackTraces: boolean,
  cutoffTime: Date,
  now: Date
): ErrorAnalysis {
  const recentErrors: CategorizedError[] = [];
  const errorPatterns: Map<string, ErrorPattern> = new Map();
  const stackTraces: StackTraceInfo[] = [];

  // Process each log entry
  for (const entry of entries) {
    if (entry.level === 'error' || (entry.severity && entry.severity >= 4)) {
      const categorizedError = categorizeLogError(entry, includeStackTraces);
      recentErrors.push(categorizedError);

      // Extract stack trace if available and requested
      if (includeStackTraces && (entry.data?.stack || entry.context?.stackTrace)) {
        const stackInfo = parseStackTrace(entry);
        if (stackInfo) {
          stackTraces.push(stackInfo);
        }
      }

      // Track error patterns
      const patternKey = generateErrorPatternKey(entry);
      if (!errorPatterns.has(patternKey)) {
        errorPatterns.set(patternKey, {
          pattern: patternKey,
          count: 1,
          firstSeen: entry.timestamp,
          lastSeen: entry.timestamp,
          type: entry.type,
          severity: entry.severity || 3
        });
      } else {
        const pattern = errorPatterns.get(patternKey)!;
        pattern.count++;
        pattern.lastSeen = entry.timestamp;
        pattern.severity = Math.max(pattern.severity, entry.severity || 3);
      }
    }
  }

  // Sort errors by severity and timestamp
  recentErrors.sort((a, b) => b.severity - a.severity || 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    recentErrors: recentErrors.slice(0, 20), // Limit to 20 most important errors
    errorPatterns: Array.from(errorPatterns.values())
      .sort((a, b) => b.severity - a.severity || b.count - a.count)
      .slice(0, 10), // Top 10 patterns
    stackTraces: stackTraces.slice(0, 5), // Top 5 stack traces
    timeRange: {
      start: cutoffTime.toISOString(),
      end: now.toISOString(),
      durationMs: now.getTime() - cutoffTime.getTime()
    }
  };
}

function categorizeLogError(entry: DaisyLogEntry, includeStackTraces: boolean): CategorizedError {
  let type: 'javascript' | 'network' | 'console' | 'runtime' | 'unknown' = 'unknown';
  const recommendations: string[] = [];

  // Determine error type
  if (entry.type === 'error' || entry.category?.includes('error')) {
    type = 'javascript';
    recommendations.push('Check JavaScript code for syntax and runtime errors');
  } else if (entry.type === 'network') {
    type = 'network';
    recommendations.push('Check network connectivity and API endpoints');
  } else if (entry.type === 'console' && entry.level === 'error') {
    type = 'console';
    recommendations.push('Review console output for debugging information');
  } else if (entry.type === 'runtime') {
    type = 'runtime';
    recommendations.push('Check application runtime environment and dependencies');
  }

  // Add specific recommendations based on error content
  const errorMessage = entry.data?.message || entry.summary || '';
  if (errorMessage.includes('TypeError')) {
    recommendations.push('Add null/undefined checks for object properties');
  }
  if (errorMessage.includes('ReferenceError')) {
    recommendations.push('Check variable declarations and scope');
  }
  if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
    recommendations.push('Verify resource URLs and file paths');
  }
  if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
    recommendations.push('Check server-side code and logs');
  }

  return {
    type,
    severity: entry.severity || 3,
    message: errorMessage,
    timestamp: entry.timestamp,
    source: entry.source,
    category: entry.category || 'unknown',
    details: entry.data,
    stackTrace: includeStackTraces ? (entry.data?.stack || entry.context?.stackTrace) : undefined,
    recommendations
  };
}

function parseStackTrace(entry: DaisyLogEntry): StackTraceInfo | null {
  const stack = entry.data?.stack || entry.context?.stackTrace;
  if (!stack) return null;

  const frames: StackFrame[] = [];
  const stackLines = stack.split('\n');

  for (const line of stackLines) {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (match) {
      frames.push({
        function: match[1] || 'anonymous',
        file: match[2] || 'unknown',
        line: parseInt(match[3]) || 0,
        column: parseInt(match[4]) || 0
      });
    }
  }

  return {
    error: entry.data?.message || entry.summary || 'Unknown error',
    stack,
    timestamp: entry.timestamp,
    frames: frames.slice(0, 10) // Top 10 stack frames
  };
}

function generateErrorPatternKey(entry: DaisyLogEntry): string {
  const message = entry.data?.message || entry.summary || '';
  // Remove specific values to create a pattern
  return message
    .replace(/\d+/g, 'N')
    .replace(/['"`]([^'"`]+)['"`]/g, '"VALUE"')
    .replace(/https?:\/\/[^\s]+/g, 'URL')
    .substring(0, 100);
}

function analyzeNetworkActivity(entries: DaisyLogEntry[], timeWindow: number): NetworkAnalysis {
  const networkEntries = entries.filter(entry => entry.type === 'network');
  const recentRequests: NetworkRequestSummary[] = [];
  const failures: NetworkFailure[] = [];
  const slowRequests: SlowRequest[] = [];

  let totalRequests = 0;
  let failedRequests = 0;
  let totalResponseTime = 0;
  let totalDataTransferred = 0;

  for (const entry of networkEntries) {
    totalRequests++;
    const status = entry.data?.status || entry.context?.statusCode || 0;
    const url = entry.data?.url || 'unknown';
    const method = entry.data?.method || 'UNKNOWN';
    const duration = entry.data?.duration || 0;
    const size = entry.data?.responseSize || 0;

    totalResponseTime += duration;
    totalDataTransferred += size;

    const requestSummary: NetworkRequestSummary = {
      method,
      url: url.length > 100 ? url.substring(0, 100) + '...' : url,
      status,
      duration,
      timestamp: new Date(entry.timestamp).getTime(),
      size: size || undefined
    };

    // Check for failures
    if (status >= 400 || entry.level === 'error') {
      failedRequests++;
      failures.push({
        url: requestSummary.url,
        method,
        status,
        error: entry.data?.errorText || entry.data?.message || `HTTP ${status}`,
        timestamp: requestSummary.timestamp
      });
      requestSummary.error = entry.data?.errorText || entry.data?.message;
    }

    // Check for slow requests (> 2 seconds)
    if (duration > 2000) {
      slowRequests.push({
        url: requestSummary.url,
        method,
        duration,
        timestamp: requestSummary.timestamp,
        size
      });
    }

    recentRequests.push(requestSummary);
  }

  // Sort by timestamp (most recent first)
  recentRequests.sort((a, b) => b.timestamp - a.timestamp);

  const statistics: NetworkStatistics = {
    totalRequests,
    failedRequests,
    averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
    totalDataTransferred,
    slowRequestsCount: slowRequests.length
  };

  return {
    recentRequests: recentRequests.slice(0, 20), // Most recent 20 requests
    failures: failures.slice(0, 10), // Most recent 10 failures
    slowRequests: slowRequests.slice(0, 5), // Most recent 5 slow requests
    statistics
  };
}

function generateDiagnosticSummary(
  errorAnalysis: ErrorAnalysis,
  networkAnalysis: NetworkAnalysis,
  browserState: BrowserState
): DiagnosticSummary {
  const totalIssuesFound = errorAnalysis.recentErrors.length + 
                          networkAnalysis.failures.length + 
                          browserState.dom.brokenImages.length;

  const criticalErrors = errorAnalysis.recentErrors.filter(e => e.severity >= 5).length;
  const networkFailures = networkAnalysis.failures.length;
  const consoleErrors = errorAnalysis.recentErrors.filter(e => e.type === 'console').length;
  const javascriptErrors = errorAnalysis.recentErrors.filter(e => e.type === 'javascript').length;

  // Determine primary concern
  let primaryConcern = 'No significant issues detected';
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

  if (criticalErrors > 0) {
    primaryConcern = `${criticalErrors} critical JavaScript errors detected`;
    severity = 'critical';
  } else if (javascriptErrors > 2) {
    primaryConcern = `Multiple JavaScript errors (${javascriptErrors}) affecting functionality`;
    severity = 'high';
  } else if (networkFailures > 3) {
    primaryConcern = `Network connectivity issues (${networkFailures} failed requests)`;
    severity = 'high';
  } else if (networkFailures > 1) {
    primaryConcern = `Some network requests failing (${networkFailures} failures)`;
    severity = 'medium';
  } else if (totalIssuesFound > 0) {
    primaryConcern = `Minor issues detected (${totalIssuesFound} total)`;
    severity = 'low';
  }

  return {
    totalIssuesFound,
    criticalErrors,
    networkFailures,
    consoleErrors,
    javascriptErrors,
    primaryConcern,
    severity
  };
}

function generateActionableInsights(
  errorAnalysis: ErrorAnalysis,
  networkAnalysis: NetworkAnalysis,
  browserState: BrowserState,
  summary: DiagnosticSummary,
  context?: string
): string[] {
  const insights: string[] = [];

  // Add context-specific insight if provided
  if (context) {
    insights.push(`🎯 Context: User was trying to ${context} - focus debugging efforts on related functionality`);
  }

  // Critical errors first
  if (summary.criticalErrors > 0) {
    insights.push(`🚨 URGENT: ${summary.criticalErrors} critical errors need immediate attention - these may break core functionality`);
    
    const criticalErrors = errorAnalysis.recentErrors.filter(e => e.severity >= 5);
    for (const error of criticalErrors.slice(0, 3)) {
      insights.push(`   → ${error.type} error: ${error.message.substring(0, 100)}`);
    }
  }

  // JavaScript errors
  if (summary.javascriptErrors > 0) {
    insights.push(`⚠️ JavaScript Issues: ${summary.javascriptErrors} JS errors detected - check browser console and error logs`);
    
    const commonPatterns = errorAnalysis.errorPatterns
      .filter(p => p.type === 'error')
      .slice(0, 2);
    
    for (const pattern of commonPatterns) {
      insights.push(`   → Pattern "${pattern.pattern}" occurred ${pattern.count} times`);
    }
  }

  // Network issues
  if (summary.networkFailures > 0) {
    insights.push(`🌐 Network Issues: ${summary.networkFailures} failed requests - check API availability and connectivity`);
    
    const failureTypes = new Map<number, number>();
    networkAnalysis.failures.forEach(f => {
      const statusGroup = Math.floor(f.status / 100) * 100;
      failureTypes.set(statusGroup, (failureTypes.get(statusGroup) || 0) + 1);
    });
    
    for (const [statusGroup, count] of failureTypes) {
      if (statusGroup === 400) {
        insights.push(`   → ${count} client errors (4xx) - check request format and authentication`);
      } else if (statusGroup === 500) {
        insights.push(`   → ${count} server errors (5xx) - check backend service health`);
      }
    }
  }

  // Performance issues
  if (networkAnalysis.slowRequests.length > 0) {
    insights.push(`⏱️ Performance: ${networkAnalysis.slowRequests.length} slow requests detected - consider optimization`);
  }

  // Browser state issues
  if (browserState.dom.brokenImages.length > 0) {
    insights.push(`🖼️ UI Issues: ${browserState.dom.brokenImages.length} broken images - check image URLs and accessibility`);
  }

  if (browserState.dom.missingElements.length > 0) {
    insights.push(`📦 DOM Issues: Missing common elements [${browserState.dom.missingElements.join(', ')}] - check if page loaded correctly`);
  }

  // Page state insights
  if (!browserState.page.loaded || browserState.page.readyState !== 'complete') {
    insights.push(`⏳ Page State: Page not fully loaded (${browserState.page.readyState}) - wait for complete load or check for loading issues`);
  }

  // Memory issues
  if (browserState.javascript.performance.memoryUsage) {
    const memUsage = browserState.javascript.performance.memoryUsage;
    const usagePercent = (memUsage.used / memUsage.total) * 100;
    if (usagePercent > 80) {
      insights.push(`💾 Memory: High memory usage (${usagePercent.toFixed(1)}%) - potential memory leak detected`);
    }
  }

  // Error patterns
  if (errorAnalysis.errorPatterns.length > 0) {
    const topPattern = errorAnalysis.errorPatterns[0];
    if (topPattern.count > 1) {
      insights.push(`🔄 Pattern: "${topPattern.pattern}" is recurring (${topPattern.count}x) - address root cause`);
    }
  }

  // General recommendations based on severity
  if (summary.severity === 'critical') {
    insights.push(`🎯 Immediate Action: Focus on critical errors first, then network issues, then performance`);
  } else if (summary.severity === 'high') {
    insights.push(`🎯 Priority Action: Address JavaScript errors and network failures to restore functionality`);
  } else if (summary.severity === 'medium') {
    insights.push(`🎯 Recommended Action: Fix network issues and investigate console warnings`);
  } else if (summary.totalIssuesFound > 0) {
    insights.push(`🎯 Maintenance Action: Address minor issues to improve overall stability`);
  } else {
    insights.push(`✅ System Status: No significant issues detected - system appears to be functioning normally`);
  }

  // Add screenshot reference
  insights.push(`📸 Visual Context: Screenshot captured for visual debugging - check for UI layout or rendering issues`);

  return insights.slice(0, 15); // Limit to 15 most important insights
}