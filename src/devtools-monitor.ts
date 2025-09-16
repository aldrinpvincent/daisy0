import CDP from 'chrome-remote-interface';
import { DaisyLogger } from './logger';

export class DevToolsMonitor {
  private client: any;
  private port: number;
  private logger: DaisyLogger;
  private connected: boolean = false;

  constructor(port: number, logger: DaisyLogger) {
    this.port = port;
    this.logger = logger;
  }

  async connect(): Promise<void> {
    // Retry connection with backoff
    let retries = 5;
    let lastError;
    
    while (retries > 0) {
      try {
        this.client = await CDP({ port: this.port });
        break;
      } catch (error: any) {
        lastError = error;
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
            continue;
          }
        }
        throw error;
      }
    }
    
    if (!this.client) {
      throw lastError;
    }

    try {
      const { Runtime, Network, Log, Performance, Page, Security, Debugger } = this.client;

      // Enable all domains for comprehensive monitoring
      await Promise.all([
        Runtime.enable(),
        Network.enable(),
        Log.enable(),
        Performance.enable(),
        Page.enable(),
        Security.enable(),
        Debugger.enable()
      ]);

      // Set up event listeners for comprehensive debugging data

      // Console events
      Runtime.consoleAPICalled((params: any) => {
        this.logger.logConsole(
          params.type,
          params.args.map((arg: any) => arg.value).join(' '),
          params.args,
          params.stackTrace
        );
      });

      // Runtime exceptions
      Runtime.exceptionThrown((params: any) => {
        this.logger.logError(
          {
            message: params.exceptionDetails.text,
            stack: params.exceptionDetails.stackTrace,
            name: 'RuntimeException'
          },
          'runtime_exception',
          JSON.stringify(params.exceptionDetails.stackTrace)
        );
      });

      // Network request events
      Network.requestWillBeSent((params: any) => {
        this.logger.logNetwork(
          params.request.method,
          params.request.url,
          0, // Status not known yet
          params.request.headers,
          params.request.postData
        );
      });

      Network.responseReceived((params: any) => {
        this.logger.logNetwork(
          params.response.url.includes('?') ? 'GET' : 'UNKNOWN',
          params.response.url,
          params.response.status,
          params.response.headers,
          undefined,
          params.response
        );
      });

      Network.loadingFailed((params: any) => {
        this.logger.logError(
          {
            message: `Network loading failed: ${params.errorText}`,
            name: 'NetworkError'
          },
          'network_failure'
        );
      });

      // Page events
      Page.loadEventFired((params: any) => {
        this.logger.logPageEvent('load', params);
      });

      Page.domContentEventFired((params: any) => {
        this.logger.logPageEvent('domContentLoaded', params);
      });

      Page.frameNavigated((params: any) => {
        this.logger.logPageEvent('navigation', params, params.frame.url);
      });

      // Security events
      Security.securityStateChanged((params: any) => {
        this.logger.logPageEvent('securityStateChange', params);
      });

      // Performance events
      Performance.metrics((params: any) => {
        this.logger.logPerformance('metrics', params);
      });

      // Log entries
      Log.entryAdded((params: any) => {
        this.logger.logConsole(
          params.entry.level,
          params.entry.text,
          undefined,
          params.entry.stackTrace,
          params.entry.url
        );
      });

      this.connected = true;

    } catch (error) {
      this.logger.logError(error, 'devtools_connection');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}