import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface AnalyzeLogsArgs {
  logFile?: string;
  types?: string[];
  levels?: string[];
  timeRange?: {
    start: string;
    end: string;
  };
  minSeverity?: number;
  search?: string;
  limit?: number;
}

export async function analyzeLogs(args: AnalyzeLogsArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    let entries = [...allEntries];
    const limit = args.limit || 100;

    // Apply filters
    if (args.types && args.types.length > 0) {
      entries = parser.filterByType(entries, args.types);
    }

    if (args.levels && args.levels.length > 0) {
      entries = parser.filterByLevel(entries, args.levels);
    }

    if (args.timeRange) {
      entries = parser.filterByTimeRange(entries, args.timeRange.start, args.timeRange.end);
    }

    if (args.minSeverity) {
      entries = parser.filterBySeverity(entries, args.minSeverity);
    }

    if (args.search) {
      entries = parser.searchEntries(entries, args.search);
    }

    // Sort by timestamp (newest first) and limit
    entries = entries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    // Generate analysis
    const analysis = generateAnalysis(entries);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              totalFound: entries.length,
              filters_applied: {
                types: args.types || 'all',
                levels: args.levels || 'all',
                timeRange: args.timeRange || 'all time',
                minSeverity: args.minSeverity || 'any',
                search: args.search || 'none'
              },
              analysis
            },
            entries: entries.map(entry => ({
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
              context: entry.context
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
            error: 'Failed to analyze logs',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ]
    };
  }
}

function generateAnalysis(entries: DaisyLogEntry[]) {
  const typeDistribution: Record<string, number> = {};
  const levelDistribution: Record<string, number> = {};
  const severityDistribution: Record<number, number> = {};
  const sourceDistribution: Record<string, number> = {};
  const categoryDistribution: Record<string, number> = {};
  const timelineEvents: Array<{ time: string; count: number; types: string[] }> = [];

  // Calculate distributions
  entries.forEach(entry => {
    typeDistribution[entry.type] = (typeDistribution[entry.type] || 0) + 1;
    levelDistribution[entry.level] = (levelDistribution[entry.level] || 0) + 1;
    sourceDistribution[entry.source] = (sourceDistribution[entry.source] || 0) + 1;
    
    if (entry.severity) {
      severityDistribution[entry.severity] = (severityDistribution[entry.severity] || 0) + 1;
    }
    
    if (entry.category) {
      categoryDistribution[entry.category] = (categoryDistribution[entry.category] || 0) + 1;
    }
  });

  // Create timeline analysis (group by hour)
  const timeGroups: Record<string, { count: number; types: Set<string> }> = {};
  entries.forEach(entry => {
    const hour = new Date(entry.timestamp).toISOString().substring(0, 13) + ':00:00.000Z';
    if (!timeGroups[hour]) {
      timeGroups[hour] = { count: 0, types: new Set() };
    }
    timeGroups[hour].count++;
    timeGroups[hour].types.add(entry.type);
  });

  Object.entries(timeGroups).forEach(([time, data]) => {
    timelineEvents.push({
      time,
      count: data.count,
      types: Array.from(data.types)
    });
  });

  // Sort timeline by time
  timelineEvents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Generate insights
  const insights = generateInsights(entries, typeDistribution, levelDistribution, severityDistribution);

  return {
    statistics: {
      total_entries: entries.length,
      type_distribution: typeDistribution,
      level_distribution: levelDistribution,
      severity_distribution: severityDistribution,
      source_distribution: sourceDistribution,
      category_distribution: categoryDistribution
    },
    timeline: timelineEvents,
    insights,
    time_range: entries.length > 0 ? {
      start: entries[entries.length - 1].timestamp,
      end: entries[0].timestamp,
      span_hours: entries.length > 1 ? 
        (new Date(entries[0].timestamp).getTime() - new Date(entries[entries.length - 1].timestamp).getTime()) / (1000 * 60 * 60) : 0
    } : null
  };
}

function generateInsights(
  entries: DaisyLogEntry[], 
  typeDistribution: Record<string, number>, 
  levelDistribution: Record<string, number>,
  severityDistribution: Record<number, number>
): string[] {
  const insights: string[] = [];

  // Error rate analysis
  const errorCount = levelDistribution.error || 0;
  const warningCount = levelDistribution.warn || 0;
  const totalCount = entries.length;
  
  if (errorCount > 0) {
    const errorRate = (errorCount / totalCount) * 100;
    insights.push(`${errorRate.toFixed(1)}% of entries are errors (${errorCount} out of ${totalCount})`);
    
    if (errorRate > 20) {
      insights.push('HIGH error rate detected - investigate critical issues');
    }
  }

  if (warningCount > 0) {
    const warningRate = (warningCount / totalCount) * 100;
    insights.push(`${warningRate.toFixed(1)}% of entries are warnings (${warningCount} out of ${totalCount})`);
  }

  // Type distribution insights
  const mostCommonType = Object.entries(typeDistribution)
    .sort(([,a], [,b]) => b - a)[0];
  if (mostCommonType) {
    insights.push(`Most common event type: ${mostCommonType[0]} (${mostCommonType[1]} occurrences)`);
  }

  // Severity analysis
  const criticalCount = severityDistribution[5] || 0;
  const highCount = severityDistribution[4] || 0;
  
  if (criticalCount > 0) {
    insights.push(`${criticalCount} critical severity issues detected - immediate attention required`);
  }
  
  if (highCount > 0) {
    insights.push(`${highCount} high severity issues detected`);
  }

  // Network analysis
  const networkErrors = entries.filter(e => 
    e.type === 'network' && (e.level === 'error' || (e.context?.statusCode && e.context.statusCode >= 400))
  ).length;
  
  if (networkErrors > 0) {
    insights.push(`${networkErrors} network failures detected - check API endpoints and connectivity`);
  }

  // Console error patterns
  const consoleErrors = entries.filter(e => e.type === 'console' && e.level === 'error').length;
  if (consoleErrors > 0) {
    insights.push(`${consoleErrors} console errors detected - review JavaScript code for issues`);
  }

  // Performance insights
  const performanceEntries = entries.filter(e => e.type === 'performance').length;
  if (performanceEntries > 0) {
    insights.push(`${performanceEntries} performance metrics recorded - review for optimization opportunities`);
  }

  // Temporal patterns
  if (entries.length > 10) {
    const timeSpread = entries.length > 1 ? 
      new Date(entries[0].timestamp).getTime() - new Date(entries[entries.length - 1].timestamp).getTime() : 0;
    const avgFrequency = timeSpread > 0 ? (entries.length / (timeSpread / 1000)) : 0;
    
    if (avgFrequency > 10) {
      insights.push('High frequency logging detected - may indicate rapid error conditions or verbose debugging');
    }
  }

  return insights;
}