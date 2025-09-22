import { DaisyLogEntry, DaisyLogParser } from '../log-parser.js';

export interface GetNetworkFailuresArgs {
  logFile?: string;
  timeWindow?: number; // minutes
  statusCodes?: number[];
}

export async function getNetworkFailures(args: GetNetworkFailuresArgs, allEntries: DaisyLogEntry[], parser: DaisyLogParser) {
  try {
    const timeWindow = (args.timeWindow || 10) * 60 * 1000;
    const now = Date.now();
    const cutoff = new Date(now - timeWindow).toISOString();
    const statusCodes = args.statusCodes || [400, 401, 403, 404, 500];
    
    // Get recent entries
    const recentEntries = allEntries.filter(entry => entry.timestamp >= cutoff);
    
    // Extract only failed network requests
    const networkFailures = recentEntries.filter(entry => {
      return entry.type === 'network' && 
             entry.data?.status && 
             statusCodes.includes(entry.data.status);
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: {
              timeWindow: `${args.timeWindow || 10} minutes`,
              totalNetworkRequests: recentEntries.filter(e => e.type === 'network').length,
              failureCount: networkFailures.length,
              statusCodesFiltered: statusCodes
            },
            failures: networkFailures.map(entry => ({
              timestamp: entry.timestamp,
              method: entry.data?.method || 'UNKNOWN',
              url: entry.data?.url,
              status: entry.data?.status,
              headers: entry.data?.headers,
              requestBody: entry.data?.requestBody,
              responseBody: entry.data?.responseBody,
              errorType: (entry.context as any)?.errorType,
              description: (entry.context as any)?.description
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
            error: 'Failed to get network failures',
            details: error instanceof Error ? error.message : String(error)
          }, null, 2)
        }
      ],
      isError: true
    };
  }
}