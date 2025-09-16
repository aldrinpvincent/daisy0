import { ParsedLogData, DaisyLogEntry, LogStatistics } from '../log-parser.js';

export interface GetLogSummaryArgs {
  logFile?: string;
  includeDetails?: boolean;
  format?: 'concise' | 'detailed' | 'technical';
}

export async function getLogSummary(args: GetLogSummaryArgs, logDataMap: Map<string, ParsedLogData>, parser: any) {
  try {
    const includeDetails = args.includeDetails !== false;
    const format = args.format || 'detailed';

    // Combine all log data if no specific file requested
    const allLogData = Array.from(logDataMap.values());
    const combinedEntries: DaisyLogEntry[] = [];
    const combinedStats: LogStatistics = {
      total: 0,
      byType: {},
      byLevel: {},
      timeRange: { start: null, end: null },
      errorCount: 0,
      warningCount: 0,
      performanceIssues: 0,
      networkFailures: 0
    };

    // Merge all entries and statistics
    for (const logData of allLogData) {
      combinedEntries.push(...logData.entries);
      
      // Merge statistics
      combinedStats.total += logData.statistics.total;
      combinedStats.errorCount += logData.statistics.errorCount;
      combinedStats.warningCount += logData.statistics.warningCount;
      combinedStats.performanceIssues += logData.statistics.performanceIssues;
      combinedStats.networkFailures += logData.statistics.networkFailures;

      // Merge type distribution
      for (const [type, count] of Object.entries(logData.statistics.byType)) {
        combinedStats.byType[type] = (combinedStats.byType[type] || 0) + count;
      }

      // Merge level distribution
      for (const [level, count] of Object.entries(logData.statistics.byLevel)) {
        combinedStats.byLevel[level] = (combinedStats.byLevel[level] || 0) + count;
      }

      // Update time range
      if (!combinedStats.timeRange.start || (logData.statistics.timeRange.start && logData.statistics.timeRange.start < combinedStats.timeRange.start)) {
        combinedStats.timeRange.start = logData.statistics.timeRange.start;
      }
      if (!combinedStats.timeRange.end || (logData.statistics.timeRange.end && logData.statistics.timeRange.end > combinedStats.timeRange.end)) {
        combinedStats.timeRange.end = logData.statistics.timeRange.end;
      }
    }

    // Calculate session duration
    if (combinedStats.timeRange.start && combinedStats.timeRange.end) {
      combinedStats.timeRange.duration = new Date(combinedStats.timeRange.end).getTime() - new Date(combinedStats.timeRange.start).getTime();
    }

    // Generate summary based on format
    const summary = generateSummary(combinedEntries, combinedStats, allLogData, format, includeDetails);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary_metadata: {
              generation_time: new Date().toISOString(),
              log_files_analyzed: allLogData.length,
              total_entries: combinedStats.total,
              format: format,
              includes_details: includeDetails
            },
            ...summary
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
            error: 'Failed to generate log summary',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

function generateSummary(entries: DaisyLogEntry[], stats: LogStatistics, logDataArray: ParsedLogData[], format: string, includeDetails: boolean) {
  switch (format) {
    case 'concise':
      return generateConciseSummary(entries, stats);
    case 'technical':
      return generateTechnicalSummary(entries, stats, logDataArray, includeDetails);
    case 'detailed':
    default:
      return generateDetailedSummary(entries, stats, logDataArray, includeDetails);
  }
}

function generateConciseSummary(entries: DaisyLogEntry[], stats: LogStatistics) {
  const healthScore = calculateHealthScore(stats);
  const criticalIssues = entries.filter(e => e.severity && e.severity >= 4).length;
  
  return {
    session_health: {
      score: healthScore,
      grade: getHealthGrade(healthScore),
      status: healthScore >= 80 ? 'good' : healthScore >= 60 ? 'warning' : 'critical'
    },
    key_metrics: {
      total_events: stats.total,
      errors: stats.errorCount,
      warnings: stats.warningCount,
      critical_issues: criticalIssues,
      session_duration_minutes: stats.timeRange.duration ? Math.round(stats.timeRange.duration / (1000 * 60)) : 0
    },
    immediate_attention: criticalIssues > 0 ? 
      'Critical issues detected - immediate action required' : 
      stats.errorCount > 0 ? 
        'Errors detected - review recommended' : 
        'No critical issues detected',
    recommendations: generateQuickRecommendations(stats)
  };
}

function generateDetailedSummary(entries: DaisyLogEntry[], stats: LogStatistics, logDataArray: ParsedLogData[], includeDetails: boolean) {
  const healthScore = calculateHealthScore(stats);
  const sessionInsights = generateSessionInsights(entries, stats);
  const issueAnalysis = generateIssueAnalysis(entries);
  const performanceMetrics = generatePerformanceMetrics(entries);
  const timelineAnalysis = generateTimelineAnalysis(entries);

  const summary: any = {
    executive_summary: {
      health_score: healthScore,
      health_grade: getHealthGrade(healthScore),
      session_status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'needs_attention' : 'critical',
      key_findings: sessionInsights.keyFindings,
      priority_actions: sessionInsights.priorityActions
    },
    session_overview: {
      duration: stats.timeRange.duration ? formatDuration(stats.timeRange.duration) : 'unknown',
      time_range: {
        start: stats.timeRange.start,
        end: stats.timeRange.end
      },
      total_events: stats.total,
      event_distribution: stats.byType,
      level_distribution: stats.byLevel
    },
    issue_analysis: issueAnalysis,
    performance_analysis: performanceMetrics,
    timeline_analysis: timelineAnalysis
  };

  if (includeDetails) {
    summary.detailed_insights = {
      error_patterns: analyzeErrorPatterns(entries),
      network_analysis: analyzeNetworkPatterns(entries),
      user_experience_impact: assessUserExperienceImpact(entries, stats),
      debugging_guidance: generateDebuggingGuidance(entries, stats)
    };
  }

  return summary;
}

function generateTechnicalSummary(entries: DaisyLogEntry[], stats: LogStatistics, logDataArray: ParsedLogData[], includeDetails: boolean) {
  const technicalMetrics = generateTechnicalMetrics(entries, stats);
  const systemHealth = assessSystemHealth(entries, stats);
  const diagnosticData = generateDiagnosticData(entries);

  return {
    technical_overview: {
      log_quality_score: calculateLogQualityScore(logDataArray),
      data_completeness: assessDataCompleteness(entries),
      parsing_statistics: {
        total_parsed_entries: stats.total,
        parse_errors: logDataArray.reduce((sum, data) => sum + data.parseErrors, 0),
        data_integrity: 'good' // Could be calculated based on parse success rate
      }
    },
    system_health_indicators: systemHealth,
    technical_metrics: technicalMetrics,
    diagnostic_data: diagnosticData,
    monitoring_recommendations: generateMonitoringRecommendations(entries, stats),
    ...(includeDetails ? {
      raw_statistics: stats,
      entry_samples: {
        critical_errors: entries.filter(e => e.severity && e.severity >= 5).slice(0, 3),
        performance_issues: entries.filter(e => e.type === 'performance' && e.severity && e.severity >= 3).slice(0, 3),
        network_failures: entries.filter(e => e.type === 'network' && e.context?.statusCode && e.context.statusCode >= 400).slice(0, 3)
      }
    } : {})
  };
}

function calculateHealthScore(stats: LogStatistics): number {
  let score = 100;
  
  // Deduct points for errors and warnings
  if (stats.total > 0) {
    const errorRate = (stats.errorCount / stats.total) * 100;
    const warningRate = (stats.warningCount / stats.total) * 100;
    
    score -= errorRate * 2; // 2 points per % of errors
    score -= warningRate * 0.5; // 0.5 points per % of warnings
    score -= (stats.networkFailures / stats.total) * 100; // Heavy penalty for network failures
    score -= (stats.performanceIssues / stats.total) * 50; // Moderate penalty for performance issues
  }
  
  return Math.max(0, Math.min(100, score));
}

function getHealthGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function generateSessionInsights(entries: DaisyLogEntry[], stats: LogStatistics) {
  const keyFindings = [];
  const priorityActions = [];

  // Error analysis
  if (stats.errorCount > 0) {
    const errorRate = (stats.errorCount / stats.total) * 100;
    keyFindings.push(`${stats.errorCount} errors detected (${errorRate.toFixed(1)}% error rate)`);
    
    if (errorRate > 10) {
      priorityActions.push('Critical: Address high error rate immediately');
    } else {
      priorityActions.push('Review and fix detected errors');
    }
  }

  // Network analysis
  if (stats.networkFailures > 0) {
    keyFindings.push(`${stats.networkFailures} network failures detected`);
    priorityActions.push('Investigate network connectivity and API reliability');
  }

  // Performance analysis
  if (stats.performanceIssues > 0) {
    keyFindings.push(`${stats.performanceIssues} performance issues identified`);
    priorityActions.push('Optimize performance bottlenecks');
  }

  // Session duration insights
  if (stats.timeRange.duration) {
    const durationMinutes = stats.timeRange.duration / (1000 * 60);
    const eventsPerMinute = stats.total / durationMinutes;
    
    if (eventsPerMinute > 100) {
      keyFindings.push('High logging frequency detected - may indicate issues or verbose debugging');
      priorityActions.push('Review logging levels and frequency');
    }
  }

  // Positive findings
  if (stats.errorCount === 0 && stats.networkFailures === 0) {
    keyFindings.push('No critical errors detected - application appears stable');
  }

  return { keyFindings, priorityActions };
}

function generateIssueAnalysis(entries: DaisyLogEntry[]) {
  const criticalIssues = entries.filter(e => e.severity && e.severity >= 5);
  const highSeverityIssues = entries.filter(e => e.severity === 4);
  const mediumSeverityIssues = entries.filter(e => e.severity === 3);

  const issuesByCategory = entries.reduce((acc, entry) => {
    if (entry.category) {
      acc[entry.category] = (acc[entry.category] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  return {
    severity_breakdown: {
      critical: criticalIssues.length,
      high: highSeverityIssues.length,
      medium: mediumSeverityIssues.length,
      low: entries.filter(e => e.severity && e.severity <= 2).length
    },
    categories: issuesByCategory,
    most_critical: criticalIssues.slice(0, 5).map(e => ({
      summary: e.summary,
      timestamp: e.timestamp,
      type: e.type
    })),
    resolution_priority: [
      ...criticalIssues.map(e => ({ issue: e.summary, priority: 'critical' })),
      ...highSeverityIssues.slice(0, 3).map(e => ({ issue: e.summary, priority: 'high' })),
      ...mediumSeverityIssues.slice(0, 2).map(e => ({ issue: e.summary, priority: 'medium' }))
    ]
  };
}

function generatePerformanceMetrics(entries: DaisyLogEntry[]) {
  const networkEntries = entries.filter(e => e.type === 'network');
  const performanceEntries = entries.filter(e => e.type === 'performance');
  const pageEntries = entries.filter(e => e.type === 'page');

  // Network performance
  const networkMetrics = {
    total_requests: networkEntries.length,
    failed_requests: networkEntries.filter(e => e.context?.statusCode && e.context.statusCode >= 400).length,
    success_rate: networkEntries.length > 0 ? 
      ((networkEntries.length - networkEntries.filter(e => e.context?.statusCode && e.context.statusCode >= 400).length) / networkEntries.length) * 100 : 0
  };

  // Performance metrics
  const performanceMetrics = {
    total_metrics: performanceEntries.length,
    performance_issues: performanceEntries.filter(e => e.severity && e.severity >= 3).length
  };

  return {
    network: networkMetrics,
    performance: performanceMetrics,
    page_events: {
      total_events: pageEntries.length,
      critical_events: pageEntries.filter(e => e.severity && e.severity >= 4).length
    },
    overall_performance_grade: calculatePerformanceGrade(networkMetrics, performanceMetrics)
  };
}

function generateTimelineAnalysis(entries: DaisyLogEntry[]) {
  if (entries.length === 0) return { status: 'no_data' };

  // Sort entries by timestamp
  const sortedEntries = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Group by hour
  const hourlyGroups: Record<string, DaisyLogEntry[]> = {};
  sortedEntries.forEach(entry => {
    const hour = new Date(entry.timestamp).toISOString().substring(0, 13) + ':00:00.000Z';
    if (!hourlyGroups[hour]) hourlyGroups[hour] = [];
    hourlyGroups[hour].push(entry);
  });

  const timeline = Object.entries(hourlyGroups).map(([hour, hourEntries]) => ({
    hour,
    total_events: hourEntries.length,
    errors: hourEntries.filter(e => e.level === 'error').length,
    warnings: hourEntries.filter(e => e.level === 'warn').length,
    event_types: [...new Set(hourEntries.map(e => e.type))]
  }));

  // Find peak activity
  const peakHour = timeline.reduce((peak, current) => 
    current.total_events > peak.total_events ? current : peak
  , timeline[0]);

  // Find error clusters
  const errorClusters = timeline.filter(t => t.errors > 0).map(t => ({
    time: t.hour,
    error_count: t.errors,
    total_events: t.total_events,
    error_rate: (t.errors / t.total_events) * 100
  }));

  return {
    timeline,
    peak_activity: peakHour,
    error_clusters: errorClusters,
    activity_pattern: analyzeActivityPattern(timeline)
  };
}

function analyzeErrorPatterns(entries: DaisyLogEntry[]) {
  const errorEntries = entries.filter(e => e.level === 'error' || e.type === 'error');
  
  const patterns: Record<string, { count: number; examples: DaisyLogEntry[] }> = {};
  
  errorEntries.forEach(error => {
    const pattern = extractErrorPattern(error);
    if (!patterns[pattern]) {
      patterns[pattern] = { count: 0, examples: [] };
    }
    patterns[pattern].count++;
    if (patterns[pattern].examples.length < 3) {
      patterns[pattern].examples.push(error);
    }
  });

  return Object.entries(patterns)
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      percentage: (data.count / errorEntries.length) * 100,
      first_occurrence: data.examples[0]?.timestamp,
      examples: data.examples.map(e => e.summary)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function analyzeNetworkPatterns(entries: DaisyLogEntry[]) {
  const networkEntries = entries.filter(e => e.type === 'network');
  
  const urlPatterns: Record<string, number> = {};
  const statusCodes: Record<number, number> = {};
  const methods: Record<string, number> = {};

  networkEntries.forEach(entry => {
    const url = entry.data?.url || '';
    const status = entry.context?.statusCode || entry.data?.status || 0;
    const method = entry.data?.method || 'UNKNOWN';

    // Extract URL pattern
    const urlPattern = extractUrlPattern(url);
    urlPatterns[urlPattern] = (urlPatterns[urlPattern] || 0) + 1;
    
    statusCodes[status] = (statusCodes[status] || 0) + 1;
    methods[method] = (methods[method] || 0) + 1;
  });

  return {
    total_requests: networkEntries.length,
    url_patterns: Object.entries(urlPatterns)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count })),
    status_distribution: statusCodes,
    method_distribution: methods,
    failure_rate: networkEntries.length > 0 ? 
      (Object.entries(statusCodes).filter(([code]) => parseInt(code) >= 400).reduce((sum, [,count]) => sum + count, 0) / networkEntries.length) * 100 : 0
  };
}

function assessUserExperienceImpact(entries: DaisyLogEntry[], stats: LogStatistics) {
  const criticalErrors = entries.filter(e => e.severity && e.severity >= 5).length;
  const networkFailures = stats.networkFailures;
  const performanceIssues = stats.performanceIssues;

  let impactScore = 5; // Start with perfect score

  if (criticalErrors > 0) impactScore -= 3;
  if (networkFailures > 0) impactScore -= 2;
  if (performanceIssues > 0) impactScore -= 1;
  if (stats.errorCount > stats.total * 0.1) impactScore -= 1;

  impactScore = Math.max(1, impactScore);

  const impact = impactScore >= 4 ? 'minimal' : impactScore >= 3 ? 'moderate' : impactScore >= 2 ? 'significant' : 'severe';

  return {
    impact_score: impactScore,
    impact_level: impact,
    user_facing_issues: {
      critical_errors: criticalErrors,
      network_failures: networkFailures,
      performance_degradation: performanceIssues
    },
    recommendations: generateUXRecommendations(impact, criticalErrors, networkFailures, performanceIssues)
  };
}

function generateDebuggingGuidance(entries: DaisyLogEntry[], stats: LogStatistics) {
  const guidance = [];

  if (stats.errorCount > 0) {
    guidance.push({
      category: 'error_investigation',
      priority: 'high',
      steps: [
        'Open browser developer tools and check the Console tab',
        'Look for red error messages and stack traces',
        'Note the file names and line numbers mentioned in errors',
        'Check the Network tab for failed requests (red entries)',
        'Review the Sources tab to set breakpoints and debug code'
      ]
    });
  }

  if (stats.networkFailures > 0) {
    guidance.push({
      category: 'network_debugging',
      priority: 'high',
      steps: [
        'Check the Network tab in browser dev tools',
        'Look for requests with red status codes (4xx, 5xx)',
        'Verify API endpoint URLs and request parameters',
        'Check authentication headers and tokens',
        'Test API endpoints independently (Postman, curl)'
      ]
    });
  }

  if (stats.performanceIssues > 0) {
    guidance.push({
      category: 'performance_debugging',
      priority: 'medium',
      steps: [
        'Use the Performance tab in browser dev tools',
        'Record a performance profile during slow operations',
        'Look for long-running functions in the flame graph',
        'Check for excessive DOM updates or reflows',
        'Monitor memory usage in the Memory tab'
      ]
    });
  }

  return guidance;
}

// Helper functions
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function extractErrorPattern(error: DaisyLogEntry): string {
  const message = error.data?.message || error.summary || 'Unknown error';
  return message.substring(0, 50).replace(/\d+/g, 'N').replace(/['"`]([^'"`]+)['"`]/g, '"VALUE"');
}

function extractUrlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/\d+/g, '/ID').replace(/\?.*/, '');
  } catch {
    return url.substring(0, 30);
  }
}

function calculateLogQualityScore(logDataArray: ParsedLogData[]): number {
  const totalEntries = logDataArray.reduce((sum, data) => sum + data.entries.length, 0);
  const totalParseErrors = logDataArray.reduce((sum, data) => sum + data.parseErrors, 0);
  
  if (totalEntries === 0) return 0;
  
  const parseSuccessRate = ((totalEntries - totalParseErrors) / totalEntries) * 100;
  return Math.round(parseSuccessRate);
}

function assessDataCompleteness(entries: DaisyLogEntry[]): string {
  const requiredFields = ['timestamp', 'type', 'level', 'source'];
  let completeEntries = 0;

  entries.forEach(entry => {
    const hasAllRequired = requiredFields.every(field => entry[field as keyof DaisyLogEntry]);
    if (hasAllRequired) completeEntries++;
  });

  const completeness = entries.length > 0 ? (completeEntries / entries.length) * 100 : 0;
  
  if (completeness >= 95) return 'excellent';
  if (completeness >= 80) return 'good';
  if (completeness >= 60) return 'fair';
  return 'poor';
}

function generateTechnicalMetrics(entries: DaisyLogEntry[], stats: LogStatistics) {
  const typeFrequency = Object.entries(stats.byType)
    .sort(([,a], [,b]) => b - a)
    .map(([type, count]) => ({ type, count, percentage: (count / stats.total) * 100 }));

  const severityDistribution = entries.reduce((acc, entry) => {
    const severity = entry.severity || 1;
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return {
    event_type_frequency: typeFrequency,
    severity_distribution: severityDistribution,
    logging_rate: stats.timeRange.duration ? 
      (stats.total / (stats.timeRange.duration / 1000)).toFixed(2) + ' events/second' : 'unknown',
    data_quality_indicators: {
      entries_with_timestamps: entries.filter(e => e.timestamp).length,
      entries_with_severity: entries.filter(e => e.severity).length,
      entries_with_context: entries.filter(e => e.context).length
    }
  };
}

function assessSystemHealth(entries: DaisyLogEntry[], stats: LogStatistics) {
  const errorRate = stats.total > 0 ? (stats.errorCount / stats.total) * 100 : 0;
  const networkHealthScore = stats.networkFailures === 0 ? 100 : Math.max(0, 100 - (stats.networkFailures / stats.total) * 100);
  
  return {
    overall_health: calculateHealthScore(stats),
    error_rate_percentage: Math.round(errorRate * 100) / 100,
    network_health_score: Math.round(networkHealthScore),
    performance_health_score: stats.performanceIssues === 0 ? 100 : Math.max(0, 100 - (stats.performanceIssues / stats.total) * 50),
    system_stability: errorRate < 5 ? 'stable' : errorRate < 15 ? 'unstable' : 'critical'
  };
}

function generateDiagnosticData(entries: DaisyLogEntry[]) {
  return {
    critical_error_samples: entries
      .filter(e => e.severity && e.severity >= 5)
      .slice(0, 3)
      .map(e => ({
        timestamp: e.timestamp,
        summary: e.summary,
        type: e.type,
        data: e.data
      })),
    recent_errors: entries
      .filter(e => e.level === 'error')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
      .map(e => ({ timestamp: e.timestamp, summary: e.summary }))
  };
}

function generateMonitoringRecommendations(entries: DaisyLogEntry[], stats: LogStatistics) {
  const recommendations = [];

  if (stats.errorCount > 0) {
    recommendations.push({
      category: 'error_monitoring',
      recommendation: 'Implement real-time error tracking and alerting',
      tools: ['Sentry', 'Bugsnag', 'Rollbar'],
      priority: 'high'
    });
  }

  if (stats.performanceIssues > 0) {
    recommendations.push({
      category: 'performance_monitoring',
      recommendation: 'Set up performance monitoring and Core Web Vitals tracking',
      tools: ['New Relic', 'DataDog', 'Google PageSpeed Insights'],
      priority: 'medium'
    });
  }

  recommendations.push({
    category: 'log_management',
    recommendation: 'Implement structured logging and log aggregation',
    tools: ['ELK Stack', 'Splunk', 'Fluentd'],
    priority: 'low'
  });

  return recommendations;
}

function generateQuickRecommendations(stats: LogStatistics): string[] {
  const recommendations = [];

  if (stats.errorCount > 0) {
    recommendations.push(`Fix ${stats.errorCount} detected errors`);
  }

  if (stats.networkFailures > 0) {
    recommendations.push(`Investigate ${stats.networkFailures} network failures`);
  }

  if (stats.performanceIssues > 0) {
    recommendations.push(`Address ${stats.performanceIssues} performance issues`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Continue monitoring for issues');
  }

  return recommendations;
}

function calculatePerformanceGrade(networkMetrics: any, performanceMetrics: any): string {
  let score = 100;
  
  if (networkMetrics.total_requests > 0) {
    score -= (networkMetrics.failed_requests / networkMetrics.total_requests) * 50;
  }
  
  if (performanceMetrics.total_metrics > 0) {
    score -= (performanceMetrics.performance_issues / performanceMetrics.total_metrics) * 30;
  }

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function analyzeActivityPattern(timeline: any[]): string {
  if (timeline.length < 2) return 'insufficient_data';
  
  const eventCounts = timeline.map(t => t.total_events);
  const avg = eventCounts.reduce((a, b) => a + b, 0) / eventCounts.length;
  const variance = eventCounts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / eventCounts.length;
  
  if (variance < avg * 0.1) return 'steady';
  if (variance > avg * 2) return 'highly_variable';
  return 'moderate_variation';
}

function generateUXRecommendations(impact: string, critical: number, network: number, performance: number): string[] {
  const recommendations = [];

  if (impact === 'severe' || critical > 0) {
    recommendations.push('Implement graceful error handling with user-friendly messages');
    recommendations.push('Add loading states and error boundaries');
  }

  if (network > 0) {
    recommendations.push('Add retry logic and offline capability');
    recommendations.push('Implement progressive enhancement for poor connections');
  }

  if (performance > 0) {
    recommendations.push('Optimize critical rendering path');
    recommendations.push('Implement lazy loading for better perceived performance');
  }

  if (impact === 'minimal') {
    recommendations.push('Continue monitoring user experience metrics');
  }

  return recommendations;
}