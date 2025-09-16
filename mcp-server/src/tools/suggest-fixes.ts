import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface SuggestFixesArgs {
  logFile?: string;
  errorContext?: string;
  includeCodeSuggestions?: boolean;
}

export async function suggestFixes(args: SuggestFixesArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    const includeCodeSuggestions = args.includeCodeSuggestions !== false;
    
    // Filter entries based on context if provided
    let relevantEntries = [...allEntries];
    if (args.errorContext) {
      relevantEntries = parser.searchEntries(allEntries, args.errorContext);
    }

    // Focus on error and warning entries
    const problemEntries = relevantEntries.filter(e => 
      e.level === 'error' || 
      e.level === 'warn' || 
      e.type === 'error' ||
      (e.type === 'network' && e.context?.statusCode && e.context.statusCode >= 400)
    );

    // Generate comprehensive fix suggestions
    const fixSuggestions = generateFixSuggestions(problemEntries, includeCodeSuggestions, args.errorContext);
    
    // Add preventive recommendations
    const preventiveRecommendations = generatePreventiveRecommendations(allEntries);
    
    // Generate implementation guidance
    const implementationGuide = generateImplementationGuide(problemEntries);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              total_issues_analyzed: problemEntries.length,
              error_context: args.errorContext || 'all detected issues',
              includes_code_suggestions: includeCodeSuggestions,
              analysis_timestamp: new Date().toISOString()
            },
            immediate_fixes: fixSuggestions.immediate,
            code_suggestions: includeCodeSuggestions ? fixSuggestions.code : [],
            architectural_improvements: fixSuggestions.architectural,
            preventive_measures: preventiveRecommendations,
            implementation_guide: implementationGuide,
            priority_matrix: generatePriorityMatrix(problemEntries)
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
            error: 'Failed to generate fix suggestions',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

interface FixSuggestion {
  issue_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affected_count: number;
  title: string;
  description: string;
  immediate_actions: string[];
  code_examples?: CodeExample[];
  related_entries: string[];
  estimated_effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

interface CodeExample {
  language: string;
  scenario: string;
  problematic_code?: string;
  fixed_code: string;
  explanation: string;
}

function generateFixSuggestions(problemEntries: DaisyLogEntry[], includeCode: boolean, context?: string) {
  const issues = categorizeIssues(problemEntries);
  const immediate: FixSuggestion[] = [];
  const code: CodeExample[] = [];
  const architectural: FixSuggestion[] = [];

  // JavaScript Errors
  if (issues.javascriptErrors.length > 0) {
    const jsErrorFix = generateJavaScriptErrorFixes(issues.javascriptErrors, includeCode);
    immediate.push(jsErrorFix.immediate);
    if (includeCode && jsErrorFix.code) code.push(...jsErrorFix.code);
    if (jsErrorFix.architectural) architectural.push(jsErrorFix.architectural);
  }

  // Network Issues
  if (issues.networkErrors.length > 0) {
    const networkFix = generateNetworkErrorFixes(issues.networkErrors, includeCode);
    immediate.push(networkFix.immediate);
    if (includeCode && networkFix.code) code.push(...networkFix.code);
    if (networkFix.architectural) architectural.push(networkFix.architectural);
  }

  // Console Errors
  if (issues.consoleErrors.length > 0) {
    const consoleFix = generateConsoleErrorFixes(issues.consoleErrors, includeCode);
    immediate.push(consoleFix.immediate);
    if (includeCode && consoleFix.code) code.push(...consoleFix.code);
  }

  // Performance Issues
  if (issues.performanceIssues.length > 0) {
    const perfFix = generatePerformanceIssuesFixes(issues.performanceIssues, includeCode);
    immediate.push(perfFix.immediate);
    if (includeCode && perfFix.code) code.push(...perfFix.code);
    if (perfFix.architectural) architectural.push(perfFix.architectural);
  }

  return { immediate, code, architectural };
}

function categorizeIssues(entries: DaisyLogEntry[]) {
  return {
    javascriptErrors: entries.filter(e => 
      e.type === 'error' || 
      (e.category && ['type_error', 'reference_error', 'syntax_error', 'runtime_error'].includes(e.category))
    ),
    networkErrors: entries.filter(e => 
      e.type === 'network' && e.context?.statusCode && e.context.statusCode >= 400
    ),
    consoleErrors: entries.filter(e => 
      e.type === 'console' && e.level === 'error'
    ),
    performanceIssues: entries.filter(e => 
      e.type === 'performance' && e.severity && e.severity >= 3
    )
  };
}

function generateJavaScriptErrorFixes(errors: DaisyLogEntry[], includeCode: boolean) {
  const errorPatterns = analyzeErrorPatterns(errors);
  const mostCommon = errorPatterns[0];

  const immediate: FixSuggestion = {
    issue_type: 'javascript_errors',
    severity: getSeverityLevel(errors),
    affected_count: errors.length,
    title: `Fix ${errors.length} JavaScript Error${errors.length > 1 ? 's' : ''}`,
    description: `Most common: ${mostCommon?.pattern || 'Various JavaScript runtime errors'}`,
    immediate_actions: [
      'Review JavaScript console errors in browser dev tools',
      'Add error boundaries to React components (if using React)',
      'Implement try-catch blocks around error-prone code',
      'Add null/undefined checks before property access',
      'Validate function parameters and return values'
    ],
    related_entries: errors.map(e => e.id || '').filter(Boolean),
    estimated_effort: errors.length > 10 ? 'high' : errors.length > 3 ? 'medium' : 'low',
    impact: 'high'
  };

  let code: CodeExample[] = [];
  if (includeCode) {
    code = generateJavaScriptCodeExamples(errors);
  }

  const architectural: FixSuggestion = {
    issue_type: 'error_handling_architecture',
    severity: 'medium',
    affected_count: 1,
    title: 'Implement Comprehensive Error Handling Strategy',
    description: 'Establish systematic error handling patterns across the application',
    immediate_actions: [
      'Create centralized error handling service',
      'Implement error reporting and monitoring',
      'Add user-friendly error messages',
      'Set up error boundaries for better UX'
    ],
    related_entries: [],
    estimated_effort: 'high',
    impact: 'high'
  };

  return { immediate, code, architectural };
}

function generateNetworkErrorFixes(errors: DaisyLogEntry[], includeCode: boolean) {
  const statusCodes = errors.map(e => e.context?.statusCode).filter(Boolean);
  const uniqueStatusCodes = [...new Set(statusCodes)];

  const immediate: FixSuggestion = {
    issue_type: 'network_errors',
    severity: getSeverityLevel(errors),
    affected_count: errors.length,
    title: `Resolve ${errors.length} Network Error${errors.length > 1 ? 's' : ''}`,
    description: `Status codes encountered: ${uniqueStatusCodes.join(', ')}`,
    immediate_actions: [
      'Check API endpoint availability and configuration',
      'Verify authentication tokens and API keys',
      'Implement retry logic for transient failures',
      'Add proper error handling for failed requests',
      'Review CORS configuration if applicable'
    ],
    related_entries: errors.map(e => e.id || '').filter(Boolean),
    estimated_effort: 'medium',
    impact: 'high'
  };

  let code: CodeExample[] = [];
  if (includeCode) {
    code = generateNetworkCodeExamples(errors);
  }

  const architectural: FixSuggestion = {
    issue_type: 'api_reliability',
    severity: 'medium',
    affected_count: 1,
    title: 'Improve API Communication Reliability',
    description: 'Implement patterns for robust API communication',
    immediate_actions: [
      'Add circuit breaker pattern for unreliable services',
      'Implement request/response interceptors',
      'Add request caching where appropriate',
      'Set up API monitoring and alerting'
    ],
    related_entries: [],
    estimated_effort: 'high',
    impact: 'medium'
  };

  return { immediate, code, architectural };
}

function generateConsoleErrorFixes(errors: DaisyLogEntry[], includeCode: boolean) {
  const immediate: FixSuggestion = {
    issue_type: 'console_errors',
    severity: getSeverityLevel(errors),
    affected_count: errors.length,
    title: `Address ${errors.length} Console Error${errors.length > 1 ? 's' : ''}`,
    description: 'Console errors may indicate underlying issues affecting user experience',
    immediate_actions: [
      'Open browser developer tools and review console errors',
      'Check for missing dependencies or resources',
      'Verify all imported modules are available',
      'Review third-party library configurations',
      'Add proper error logging instead of console.error where appropriate'
    ],
    related_entries: errors.map(e => e.id || '').filter(Boolean),
    estimated_effort: 'low',
    impact: 'medium'
  };

  let code: CodeExample[] = [];
  if (includeCode) {
    code = [{
      language: 'javascript',
      scenario: 'Replace console.error with proper error handling',
      problematic_code: 'console.error("Something went wrong:", error);',
      fixed_code: `// Add proper error handling service
errorService.logError(error, {
  context: 'user_action',
  userId: currentUser.id,
  timestamp: new Date().toISOString()
});

// Show user-friendly message
showNotification({
  type: 'error',
  message: 'We encountered an issue. Please try again.',
  duration: 5000
});`,
      explanation: 'Replace console.error with structured error logging that provides better debugging information and user feedback.'
    }];
  }

  return { immediate, code };
}

function generatePerformanceIssuesFixes(issues: DaisyLogEntry[], includeCode: boolean) {
  const immediate: FixSuggestion = {
    issue_type: 'performance_issues',
    severity: getSeverityLevel(issues),
    affected_count: issues.length,
    title: `Optimize ${issues.length} Performance Issue${issues.length > 1 ? 's' : ''}`,
    description: 'Performance issues may be affecting user experience and application responsiveness',
    immediate_actions: [
      'Use browser Performance tab to identify bottlenecks',
      'Optimize slow network requests',
      'Review and optimize expensive computations',
      'Implement lazy loading for heavy resources',
      'Consider code splitting for large bundles'
    ],
    related_entries: issues.map(e => e.id || '').filter(Boolean),
    estimated_effort: 'high',
    impact: 'medium'
  };

  let code: CodeExample[] = [];
  if (includeCode) {
    code = generatePerformanceCodeExamples();
  }

  const architectural: FixSuggestion = {
    issue_type: 'performance_architecture',
    severity: 'low',
    affected_count: 1,
    title: 'Implement Performance Monitoring Strategy',
    description: 'Establish systematic performance monitoring and optimization',
    immediate_actions: [
      'Implement Performance Observer API',
      'Set up Core Web Vitals monitoring',
      'Add performance budgets to CI/CD',
      'Create performance dashboards'
    ],
    related_entries: [],
    estimated_effort: 'high',
    impact: 'high'
  };

  return { immediate, code, architectural };
}

function generateJavaScriptCodeExamples(errors: DaisyLogEntry[]): CodeExample[] {
  const examples: CodeExample[] = [];

  // Type Error handling
  const typeErrors = errors.filter(e => 
    e.data?.message?.includes('TypeError') || e.summary?.includes('TypeError')
  );
  
  if (typeErrors.length > 0) {
    examples.push({
      language: 'javascript',
      scenario: 'Prevent TypeError with null/undefined checks',
      problematic_code: `// Prone to TypeError
const userName = user.profile.name;
const userEmail = user.contact.email;`,
      fixed_code: `// Safe property access
const userName = user?.profile?.name || 'Unknown';
const userEmail = user?.contact?.email || '';

// Or with traditional checks
const userName = user && user.profile && user.profile.name ? user.profile.name : 'Unknown';`,
      explanation: 'Use optional chaining (?.) or explicit null checks to prevent TypeErrors when accessing nested properties.'
    });
  }

  // Reference Error handling
  const refErrors = errors.filter(e => 
    e.data?.message?.includes('ReferenceError') || e.summary?.includes('ReferenceError')
  );
  
  if (refErrors.length > 0) {
    examples.push({
      language: 'javascript',
      scenario: 'Fix ReferenceError with proper variable declaration',
      problematic_code: `// ReferenceError: variable not declared
function handleClick() {
  userPreferences = getUserPreferences(); // ReferenceError if not declared
}`,
      fixed_code: `// Properly declare variables
function handleClick() {
  const userPreferences = getUserPreferences();
  // or if modification needed:
  let userPreferences = getUserPreferences();
}`,
      explanation: 'Always declare variables with const, let, or var to avoid ReferenceErrors.'
    });
  }

  return examples;
}

function generateNetworkCodeExamples(errors: DaisyLogEntry[]): CodeExample[] {
  const examples: CodeExample[] = [];

  // 404 errors
  const notFoundErrors = errors.filter(e => e.context?.statusCode === 404);
  if (notFoundErrors.length > 0) {
    examples.push({
      language: 'javascript',
      scenario: 'Handle 404 errors gracefully',
      problematic_code: `// No error handling
fetch('/api/user/123')
  .then(response => response.json())
  .then(data => setUser(data));`,
      fixed_code: `// With proper error handling
fetch('/api/user/123')
  .then(async response => {
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('User not found');
      }
      throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
    }
    return response.json();
  })
  .then(data => setUser(data))
  .catch(error => {
    console.error('Failed to fetch user:', error);
    showErrorMessage('Unable to load user information');
  });`,
      explanation: 'Always check response.ok and handle different status codes appropriately.'
    });
  }

  // General network retry logic
  examples.push({
    language: 'javascript',
    scenario: 'Add retry logic for network failures',
    fixed_code: `// Retry function with exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      
      // Don't retry for client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(\`Client error: \${response.status}\`);
      }
      
      // Retry for server errors (5xx) and network issues
      if (attempt === maxRetries) {
        throw new Error(\`Server error after \${maxRetries} attempts: \${response.status}\`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}`,
    explanation: 'Implement retry logic with exponential backoff for transient network failures.'
  });

  return examples;
}

function generatePerformanceCodeExamples(): CodeExample[] {
  return [
    {
      language: 'javascript',
      scenario: 'Optimize expensive calculations with memoization',
      problematic_code: `// Expensive calculation on every render
function ExpensiveComponent({ data }) {
  const processedData = expensiveCalculation(data);
  return <div>{processedData}</div>;
}`,
      fixed_code: `// Memoized expensive calculation
function ExpensiveComponent({ data }) {
  const processedData = useMemo(() => {
    return expensiveCalculation(data);
  }, [data]);
  
  return <div>{processedData}</div>;
}

// Or for non-React:
const memoizedCalculation = (() => {
  const cache = new Map();
  return (input) => {
    if (cache.has(input)) {
      return cache.get(input);
    }
    const result = expensiveCalculation(input);
    cache.set(input, result);
    return result;
  };
})();`,
      explanation: 'Use memoization to cache expensive calculations and avoid recalculating on every render.'
    },
    {
      language: 'javascript',
      scenario: 'Implement lazy loading for better performance',
      fixed_code: `// Lazy loading with Intersection Observer
const LazyImage = ({ src, alt, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} {...props}>
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          style={{
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s'
          }}
        />
      )}
    </div>
  );
};`,
      explanation: 'Use Intersection Observer to implement lazy loading and improve initial page load performance.'
    }
  ];
}

function generatePreventiveRecommendations(allEntries: DaisyLogEntry[]) {
  const recommendations = [];

  // Based on observed patterns
  const errorCount = allEntries.filter(e => e.level === 'error').length;
  const warningCount = allEntries.filter(e => e.level === 'warn').length;

  if (errorCount > 0 || warningCount > 5) {
    recommendations.push({
      category: 'error_prevention',
      title: 'Implement Proactive Error Prevention',
      actions: [
        'Add TypeScript for compile-time error detection',
        'Implement comprehensive unit and integration tests',
        'Set up ESLint with strict error rules',
        'Add Prettier for consistent code formatting',
        'Use static analysis tools like SonarQube'
      ],
      priority: 'high'
    });
  }

  recommendations.push({
    category: 'monitoring',
    title: 'Enhance Application Monitoring',
    actions: [
      'Implement real-time error tracking (e.g., Sentry, Bugsnag)',
      'Set up performance monitoring (e.g., New Relic, DataDog)',
      'Add custom metrics and dashboards',
      'Configure alerting for critical issues',
      'Implement health checks and uptime monitoring'
    ],
    priority: 'medium'
  });

  recommendations.push({
    category: 'development_practices',
    title: 'Adopt Better Development Practices',
    actions: [
      'Implement code review processes',
      'Add pre-commit hooks for code quality',
      'Use feature flags for safer deployments',
      'Implement proper logging strategies',
      'Create documentation for common issues and solutions'
    ],
    priority: 'medium'
  });

  return recommendations;
}

function generateImplementationGuide(problemEntries: DaisyLogEntry[]) {
  const criticalIssues = problemEntries.filter(e => e.severity && e.severity >= 4).length;
  const mediumIssues = problemEntries.filter(e => e.severity === 3).length;

  return {
    immediate_priority: criticalIssues > 0 ? 'critical_errors' : mediumIssues > 0 ? 'medium_errors' : 'improvements',
    suggested_timeline: {
      week_1: [
        'Fix all critical severity issues',
        'Implement basic error handling',
        'Set up error monitoring'
      ],
      week_2: [
        'Address medium severity issues',
        'Add comprehensive logging',
        'Implement retry logic for network requests'
      ],
      week_3: [
        'Performance optimizations',
        'Add preventive measures',
        'Improve error boundaries and user experience'
      ],
      ongoing: [
        'Regular error log reviews',
        'Performance monitoring',
        'Code quality improvements'
      ]
    },
    success_metrics: [
      'Reduce error count by 80%',
      'Improve average response time by 30%',
      'Achieve 99%+ API success rate',
      'Implement zero-downtime deployments'
    ]
  };
}

function generatePriorityMatrix(problemEntries: DaisyLogEntry[]) {
  const matrix = {
    critical_high_impact: [] as string[],
    critical_low_impact: [] as string[],
    medium_high_impact: [] as string[],
    medium_low_impact: [] as string[],
    low_impact: [] as string[]
  };

  for (const entry of problemEntries) {
    const severity = entry.severity || 1;
    const impact = determineImpact(entry);
    
    if (severity >= 4 && impact === 'high') {
      matrix.critical_high_impact.push(entry.summary || 'Unknown issue');
    } else if (severity >= 4) {
      matrix.critical_low_impact.push(entry.summary || 'Unknown issue');
    } else if (severity === 3 && impact === 'high') {
      matrix.medium_high_impact.push(entry.summary || 'Unknown issue');
    } else if (severity === 3) {
      matrix.medium_low_impact.push(entry.summary || 'Unknown issue');
    } else {
      matrix.low_impact.push(entry.summary || 'Unknown issue');
    }
  }

  return matrix;
}

function analyzeErrorPatterns(errors: DaisyLogEntry[]) {
  const patterns: Record<string, number> = {};
  
  errors.forEach(error => {
    const message = error.data?.message || error.summary || 'Unknown error';
    const pattern = message.substring(0, 50);
    patterns[pattern] = (patterns[pattern] || 0) + 1;
  });
  
  return Object.entries(patterns)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);
}

function getSeverityLevel(entries: DaisyLogEntry[]): 'critical' | 'high' | 'medium' | 'low' {
  const maxSeverity = Math.max(...entries.map(e => e.severity || 1));
  if (maxSeverity >= 5) return 'critical';
  if (maxSeverity >= 4) return 'high';
  if (maxSeverity >= 3) return 'medium';
  return 'low';
}

function determineImpact(entry: DaisyLogEntry): 'high' | 'medium' | 'low' {
  // Determine user impact based on entry characteristics
  if (entry.type === 'error' || entry.level === 'error') return 'high';
  if (entry.type === 'network' && entry.context?.statusCode && entry.context.statusCode >= 500) return 'high';
  if (entry.type === 'performance' && entry.severity && entry.severity >= 4) return 'medium';
  return 'low';
}