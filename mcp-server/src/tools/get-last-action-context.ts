import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface GetLastActionContextArgs {
  logFile?: string;
}

export async function getLastActionContext(args: GetLastActionContextArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    // Get entries from last 5 minutes to find recent actions
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentEntries = allEntries.filter(entry => entry.timestamp >= fiveMinutesAgo);
    
    // Find the last user interaction (interaction is a valid type in our logs)
    const lastAction = recentEntries
      .filter(entry => (entry as any).type === 'interaction')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    
    if (!lastAction) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: {
                lastAction: null,
                message: 'No user actions found in the last 5 minutes'
              }
            }, null, 2)
          }
        ]
      };
    }
    
    // Find errors that occurred within 5 seconds after the action
    const actionTime = new Date(lastAction.timestamp).getTime();
    const fiveSecondsLater = new Date(actionTime + 5000).toISOString();
    
    const errorsAfterAction = recentEntries.filter(entry => {
      return entry.level === 'error' && 
             entry.timestamp >= lastAction.timestamp && 
             entry.timestamp <= fiveSecondsLater;
    });
    
    // Get all entries in the 10-second window around the action for context
    const tenSecondsBefore = new Date(actionTime - 10000).toISOString();
    const tenSecondsAfter = new Date(actionTime + 10000).toISOString();
    
    const contextEntries = recentEntries.filter(entry => {
      return entry.timestamp >= tenSecondsBefore && 
             entry.timestamp <= tenSecondsAfter;
    }).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              lastActionTime: lastAction.timestamp,
              actionType: lastAction.data?.action,
              target: lastAction.data?.target,
              errorsFound: errorsAfterAction.length,
              contextWindow: '10 seconds around action'
            },
            lastAction: {
              timestamp: lastAction.timestamp,
              type: lastAction.type,
              action: lastAction.data?.action,
              target: lastAction.data?.target,
              elementType: lastAction.data?.element_type,
              summary: lastAction.summary
            },
            errorsAfterAction: errorsAfterAction.map(error => ({
              timestamp: error.timestamp,
              timeSinceAction: `${Math.round((new Date(error.timestamp).getTime() - actionTime) / 1000)}s`,
              type: error.type,
              source: error.source,
              message: error.data?.message || error.summary,
              stack: error.data?.stack
            })),
            contextTimeline: contextEntries.map(entry => ({
              timestamp: entry.timestamp,
              relativeTime: `${Math.round((new Date(entry.timestamp).getTime() - actionTime) / 1000)}s`,
              type: entry.type,
              level: entry.level,
              summary: entry.summary
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
            error: 'Failed to get last action context',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}