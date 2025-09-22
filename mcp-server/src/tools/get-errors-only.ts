import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface GetErrorsOnlyArgs {
  logFile?: string;
  timeWindow?: number; // minutes
  includeContext?: boolean;
}

export async function getErrorsOnly(args: GetErrorsOnlyArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    const timeWindow = (args.timeWindow || 10) * 60 * 1000;
    const now = Date.now();
    const cutoff = new Date(now - timeWindow).toISOString();
    
    // Get recent entries
    const recentEntries = allEntries.filter(entry => entry.timestamp >= cutoff);
    
    // Extract only error-level entries
    const errorEntries = recentEntries.filter(entry => entry.level === 'error');
    
    // Add context if requested
    let entriesWithContext = errorEntries;
    if (args.includeContext) {
      entriesWithContext = errorEntries.map(errorEntry => {
        const errorIndex = recentEntries.findIndex(e => e.id === errorEntry.id);
        const contextBefore = recentEntries.slice(Math.max(0, errorIndex - 2), errorIndex);
        const contextAfter = recentEntries.slice(errorIndex + 1, errorIndex + 3);
        
        return {
          ...errorEntry,
          contextEntries: {
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
          }
        };
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              timeWindow: `${args.timeWindow || 10} minutes`,
              totalEntries: recentEntries.length,
              errorCount: errorEntries.length,
              contextIncluded: args.includeContext || false
            },
            errors: entriesWithContext.map(entry => ({
              timestamp: entry.timestamp,
              type: entry.type,
              source: entry.source,
              message: entry.data?.message || entry.summary,
              location: entry.data?.source || 'unknown',
              stack: entry.data?.stack,
              context: (entry as any).contextEntries
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
            error: 'Failed to get errors',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}