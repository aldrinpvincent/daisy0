import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface SearchLogsArgs {
  logFile?: string;
  pattern: string;
  timeWindow?: number; // minutes
  maxResults?: number;
}

export async function searchLogs(args: SearchLogsArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    const timeWindow = (args.timeWindow || 15) * 60 * 1000;
    const now = Date.now();
    const cutoff = new Date(now - timeWindow).toISOString();
    const maxResults = args.maxResults || 10;
    
    if (!args.pattern) {
      throw new Error('Pattern is required for search');
    }
    
    // Get recent entries
    const recentEntries = allEntries.filter(entry => entry.timestamp >= cutoff);
    
    // Create regex pattern (case insensitive)
    const regex = new RegExp(args.pattern, 'i');
    
    // Search in relevant fields
    const matchingEntries = recentEntries.filter(entry => {
      const searchableText = [
        entry.summary,
        entry.data?.message,
        entry.data?.url,
        entry.source,
        JSON.stringify(entry.data)
      ].join(' ').toLowerCase();
      
      return regex.test(searchableText);
    });
    
    // Limit results
    const limitedResults = matchingEntries.slice(0, maxResults);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              pattern: args.pattern,
              timeWindow: `${args.timeWindow || 15} minutes`,
              totalEntries: recentEntries.length,
              matchesFound: matchingEntries.length,
              resultsReturned: limitedResults.length,
              truncated: matchingEntries.length > maxResults
            },
            matches: limitedResults.map(entry => ({
              timestamp: entry.timestamp,
              type: entry.type,
              level: entry.level,
              source: entry.source,
              summary: entry.summary,
              message: entry.data?.message,
              url: entry.data?.url,
              status: entry.data?.status,
              // Highlight the matching part
              matchContext: extractMatchContext(entry, regex)
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
            error: 'Failed to search logs',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}

function extractMatchContext(entry: DaisyLogEntry, regex: RegExp): string {
  const searchableText = [
    entry.summary,
    entry.data?.message,
    entry.data?.url
  ].filter(Boolean).join(' ');
  
  const match = searchableText.match(regex);
  if (!match) return '';
  
  const matchIndex = searchableText.indexOf(match[0]);
  const start = Math.max(0, matchIndex - 30);
  const end = Math.min(searchableText.length, matchIndex + match[0].length + 30);
  
  return searchableText.substring(start, end);
}