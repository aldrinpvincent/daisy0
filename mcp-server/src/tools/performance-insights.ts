import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface PerformanceInsightsArgs {
  logFile?: string;
  metrics?: string[];
  thresholds?: {
    slowRequestMs?: number;
    largeResponseBytes?: number;
  };
}

export async function performanceInsights(args: PerformanceInsightsArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    const metrics = args.metrics || ['all'];
    const thresholds = {
      slowRequestMs: args.thresholds?.slowRequestMs || 1000,
      largeResponseBytes: args.thresholds?.largeResponseBytes || 1048576 // 1MB
    };

    // Filter relevant entries
    const performanceEntries = allEntries.filter(entry => 
      entry.type === 'performance' || 
      entry.type === 'network' || 
      (entry.type === 'page' && entry.data?.event?.includes('load'))
    );

    // Analyze different performance aspects
    const analysis = {
      load_times: metrics.includes('all') || metrics.includes('load_times') ? 
        analyzeLoadTimes(performanceEntries) : null,
      network_performance: metrics.includes('all') || metrics.includes('network_performance') ? 
        analyzeNetworkPerformance(allEntries, thresholds) : null,
      memory_usage: metrics.includes('all') || metrics.includes('memory_usage') ? 
        analyzeMemoryUsage(performanceEntries) : null,
      bottlenecks: identifyBottlenecks(performanceEntries, thresholds),
      recommendations: generatePerformanceRecommendations(performanceEntries, thresholds)
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              total_performance_entries: performanceEntries.length,
              metrics_analyzed: metrics,
              thresholds_used: thresholds,
              analysis_timestamp: new Date().toISOString()
            },
            performance_analysis: analysis,
            detailed_metrics: generateDetailedMetrics(performanceEntries, thresholds)
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
            error: 'Failed to analyze performance',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

function analyzeLoadTimes(entries: DaisyLogEntry[]) {
  const loadEvents = entries.filter(e => 
    e.type === 'page' || 
    (e.type === 'performance' && e.data?.metric?.includes('load'))
  );

  const loadTimes: number[] = [];
  const pageLoadEvents = [];

  for (const entry of loadEvents) {
    if (entry.type === 'page' && entry.data?.details) {
      const details = entry.data.details;
      if (details.loadEventEnd && details.loadEventStart) {
        const loadTime = details.loadEventEnd - details.loadEventStart;
        loadTimes.push(loadTime);
        pageLoadEvents.push({
          timestamp: entry.timestamp,
          loadTime,
          url: entry.context?.url,
          details
        });
      }
    } else if (entry.type === 'performance' && entry.data?.details?.duration) {
      loadTimes.push(entry.data.details.duration);
    }
  }

  if (loadTimes.length === 0) {
    return {
      status: 'no_data',
      message: 'No load time data found in performance entries'
    };
  }

  const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
  const maxLoadTime = Math.max(...loadTimes);
  const minLoadTime = Math.min(...loadTimes);

  return {
    status: 'analyzed',
    statistics: {
      average_load_time_ms: Math.round(avgLoadTime),
      max_load_time_ms: Math.round(maxLoadTime),
      min_load_time_ms: Math.round(minLoadTime),
      total_load_events: loadTimes.length
    },
    performance_grade: getPerformanceGrade(avgLoadTime),
    slow_loads: pageLoadEvents.filter(e => e.loadTime > 3000),
    insights: generateLoadTimeInsights(avgLoadTime, maxLoadTime, loadTimes.length)
  };
}

function analyzeNetworkPerformance(entries: DaisyLogEntry[], thresholds: any) {
  const networkEntries = entries.filter(e => e.type === 'network');

  if (networkEntries.length === 0) {
    return {
      status: 'no_data',
      message: 'No network entries found'
    };
  }

  const requests = networkEntries.map(entry => {
    const data = entry.data;
    const context = entry.context;
    
    return {
      timestamp: entry.timestamp,
      method: data?.method || 'UNKNOWN',
      url: data?.url || '',
      status: data?.status || context?.statusCode || 0,
      responseSize: estimateResponseSize(data),
      isSlowRequest: false, // Will be determined based on timing if available
      entry
    };
  });

  // Analyze request patterns
  const statusDistribution: Record<number, number> = {};
  const methodDistribution: Record<string, number> = {};
  let largeResponses = 0;
  let failedRequests = 0;

  requests.forEach(req => {
    statusDistribution[req.status] = (statusDistribution[req.status] || 0) + 1;
    methodDistribution[req.method] = (methodDistribution[req.method] || 0) + 1;
    
    if (req.responseSize > thresholds.largeResponseBytes) {
      largeResponses++;
    }
    
    if (req.status >= 400) {
      failedRequests++;
    }
  });

  const successRate = requests.length > 0 ? 
    ((requests.length - failedRequests) / requests.length) * 100 : 0;

  return {
    status: 'analyzed',
    statistics: {
      total_requests: requests.length,
      success_rate_percent: Math.round(successRate * 100) / 100,
      failed_requests: failedRequests,
      large_responses: largeResponses,
      status_distribution: statusDistribution,
      method_distribution: methodDistribution
    },
    performance_issues: {
      large_responses: requests.filter(r => r.responseSize > thresholds.largeResponseBytes),
      failed_requests: requests.filter(r => r.status >= 400),
      redirect_chains: requests.filter(r => r.status >= 300 && r.status < 400)
    },
    insights: generateNetworkInsights(successRate, failedRequests, requests.length, largeResponses)
  };
}

function analyzeMemoryUsage(entries: DaisyLogEntry[]) {
  const memoryEntries = entries.filter(e => 
    e.type === 'performance' && 
    e.data?.metric?.toLowerCase().includes('memory')
  );

  if (memoryEntries.length === 0) {
    return {
      status: 'no_data',
      message: 'No memory usage data found in performance entries'
    };
  }

  const memorySnapshots = memoryEntries.map(entry => ({
    timestamp: entry.timestamp,
    metric: entry.data?.metric,
    value: extractMemoryValue(entry.data?.details),
    details: entry.data?.details
  })).filter(snapshot => snapshot.value !== null);

  if (memorySnapshots.length === 0) {
    return {
      status: 'no_parseable_data',
      message: 'No parseable memory values found'
    };
  }

  const memoryValues = memorySnapshots.map(s => s.value as number);
  const avgMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
  const maxMemory = Math.max(...memoryValues);
  const minMemory = Math.min(...memoryValues);

  return {
    status: 'analyzed',
    statistics: {
      average_memory_mb: Math.round(avgMemory / 1024 / 1024),
      max_memory_mb: Math.round(maxMemory / 1024 / 1024),
      min_memory_mb: Math.round(minMemory / 1024 / 1024),
      snapshots_analyzed: memorySnapshots.length
    },
    memory_trend: analyzeMemoryTrend(memorySnapshots),
    insights: generateMemoryInsights(avgMemory, maxMemory, memorySnapshots)
  };
}

function identifyBottlenecks(entries: DaisyLogEntry[], thresholds: any) {
  const bottlenecks = [];

  // Network bottlenecks
  const slowNetworkRequests = entries.filter(e => 
    e.type === 'network' && 
    e.severity && e.severity >= 3
  );

  if (slowNetworkRequests.length > 0) {
    bottlenecks.push({
      type: 'network',
      severity: 'high',
      description: `${slowNetworkRequests.length} slow or failed network requests detected`,
      affected_urls: [...new Set(slowNetworkRequests.map(e => e.data?.url).filter(Boolean))],
      recommendations: [
        'Optimize API endpoints for faster response times',
        'Implement request caching where appropriate',
        'Review network request patterns for efficiency'
      ]
    });
  }

  // JavaScript execution bottlenecks
  const jsErrors = entries.filter(e => 
    e.type === 'error' || (e.type === 'console' && e.level === 'error')
  );

  if (jsErrors.length > 5) {
    bottlenecks.push({
      type: 'javascript',
      severity: 'medium',
      description: `${jsErrors.length} JavaScript errors may be impacting performance`,
      error_patterns: getTopErrorPatterns(jsErrors),
      recommendations: [
        'Fix JavaScript errors to improve execution performance',
        'Add error handling to prevent performance degradation',
        'Review and optimize error-prone code sections'
      ]
    });
  }

  // Page load bottlenecks
  const pageEvents = entries.filter(e => e.type === 'page');
  const criticalPageIssues = pageEvents.filter(e => e.severity && e.severity >= 4);

  if (criticalPageIssues.length > 0) {
    bottlenecks.push({
      type: 'page_load',
      severity: 'high',
      description: `${criticalPageIssues.length} critical page load issues detected`,
      issues: criticalPageIssues.map(e => e.summary),
      recommendations: [
        'Optimize critical rendering path',
        'Reduce initial page load resources',
        'Implement lazy loading for non-critical content'
      ]
    });
  }

  return bottlenecks;
}

function generatePerformanceRecommendations(entries: DaisyLogEntry[], thresholds: any) {
  const recommendations = [];

  const networkEntries = entries.filter(e => e.type === 'network');
  const errorEntries = entries.filter(e => e.level === 'error');
  const performanceEntries = entries.filter(e => e.type === 'performance');

  // Network recommendations
  if (networkEntries.length > 0) {
    const failedRequests = networkEntries.filter(e => 
      e.context?.statusCode && e.context.statusCode >= 400
    ).length;
    
    if (failedRequests > networkEntries.length * 0.1) {
      recommendations.push({
        category: 'network',
        priority: 'high',
        title: 'High Network Failure Rate',
        description: `${Math.round((failedRequests / networkEntries.length) * 100)}% of requests are failing`,
        actions: [
          'Implement retry logic for failed requests',
          'Add proper error handling for network failures',
          'Review API endpoint reliability',
          'Consider circuit breaker patterns for unreliable services'
        ]
      });
    }
  }

  // Error handling recommendations
  if (errorEntries.length > 0) {
    recommendations.push({
      category: 'error_handling',
      priority: 'medium',
      title: 'Error Rate Optimization',
      description: `${errorEntries.length} errors detected in the session`,
      actions: [
        'Implement comprehensive error boundary components',
        'Add user-friendly error messages',
        'Set up error monitoring and alerting',
        'Review error logs regularly for patterns'
      ]
    });
  }

  // Performance monitoring recommendations
  if (performanceEntries.length === 0) {
    recommendations.push({
      category: 'monitoring',
      priority: 'low',
      title: 'Enhance Performance Monitoring',
      description: 'Limited performance metrics available for analysis',
      actions: [
        'Implement Performance Observer API',
        'Add custom performance markers',
        'Monitor Core Web Vitals metrics',
        'Set up performance budgets and alerts'
      ]
    });
  }

  return recommendations;
}

// Helper functions
function getPerformanceGrade(avgLoadTime: number): string {
  if (avgLoadTime < 1000) return 'A'; // Excellent
  if (avgLoadTime < 2000) return 'B'; // Good
  if (avgLoadTime < 3000) return 'C'; // Acceptable
  if (avgLoadTime < 5000) return 'D'; // Poor
  return 'F'; // Very Poor
}

function estimateResponseSize(data: any): number {
  // Estimate response size from available data
  if (data?.headers?.['content-length']) {
    return parseInt(data.headers['content-length']) || 0;
  }
  if (data?.responseBody) {
    return JSON.stringify(data.responseBody).length;
  }
  return 0;
}

function extractMemoryValue(details: any): number | null {
  if (!details) return null;
  
  // Try different possible memory value locations
  if (typeof details.usedJSHeapSize === 'number') return details.usedJSHeapSize;
  if (typeof details.totalJSHeapSize === 'number') return details.totalJSHeapSize;
  if (typeof details.memoryUsage === 'number') return details.memoryUsage;
  if (typeof details === 'number') return details;
  
  return null;
}

function analyzeMemoryTrend(snapshots: any[]): string {
  if (snapshots.length < 2) return 'insufficient_data';
  
  const values = snapshots.map(s => s.value);
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

function generateLoadTimeInsights(avg: number, max: number, count: number): string[] {
  const insights = [];
  
  if (avg > 3000) {
    insights.push('Average load time exceeds 3 seconds - users may experience frustration');
  } else if (avg < 1000) {
    insights.push('Excellent load times - users should have a smooth experience');
  }
  
  if (max > 10000) {
    insights.push('Some loads took over 10 seconds - investigate worst-case scenarios');
  }
  
  if (count < 5) {
    insights.push('Limited load time data - consider adding more performance monitoring');
  }
  
  return insights;
}

function generateNetworkInsights(successRate: number, failed: number, total: number, large: number): string[] {
  const insights = [];
  
  if (successRate < 90) {
    insights.push(`Low success rate (${successRate.toFixed(1)}%) indicates network reliability issues`);
  }
  
  if (failed > 0) {
    insights.push(`${failed} failed requests out of ${total} total requests need attention`);
  }
  
  if (large > 0) {
    insights.push(`${large} large responses detected - consider response optimization`);
  }
  
  return insights;
}

function generateMemoryInsights(avg: number, max: number, snapshots: any[]): string[] {
  const insights = [];
  const avgMB = avg / 1024 / 1024;
  const maxMB = max / 1024 / 1024;
  
  if (maxMB > 100) {
    insights.push(`Peak memory usage of ${maxMB.toFixed(1)}MB is high - investigate memory leaks`);
  }
  
  if (avgMB > 50) {
    insights.push(`Average memory usage of ${avgMB.toFixed(1)}MB may impact performance on low-end devices`);
  }
  
  const trend = analyzeMemoryTrend(snapshots);
  if (trend === 'increasing') {
    insights.push('Memory usage is trending upward - potential memory leak detected');
  }
  
  return insights;
}

function getTopErrorPatterns(errors: DaisyLogEntry[]): string[] {
  const patterns: Record<string, number> = {};
  
  errors.forEach(error => {
    const message = error.data?.message || error.summary || 'Unknown error';
    const pattern = message.substring(0, 50);
    patterns[pattern] = (patterns[pattern] || 0) + 1;
  });
  
  return Object.entries(patterns)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([pattern]) => pattern);
}

function generateDetailedMetrics(entries: DaisyLogEntry[], thresholds: any) {
  return {
    performance_entries: entries.filter(e => e.type === 'performance').map(e => ({
      timestamp: e.timestamp,
      metric: e.data?.metric,
      details: e.data?.details,
      summary: e.summary
    })),
    network_timing: entries.filter(e => e.type === 'network').map(e => ({
      timestamp: e.timestamp,
      method: e.data?.method,
      url: e.data?.url,
      status: e.data?.status,
      summary: e.summary
    })),
    page_events: entries.filter(e => e.type === 'page').map(e => ({
      timestamp: e.timestamp,
      event: e.data?.event,
      details: e.data?.details,
      summary: e.summary
    }))
  };
}