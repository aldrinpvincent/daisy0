import CDP from 'chrome-remote-interface';
import { DaisyLogger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export class DevToolsMonitor {
  private client: any;
  private port: number;
  private logger: DaisyLogger;
  private connected: boolean = false;
  private pendingRequests = new Map<string, any>(); // Track requests by requestId
  private screenshotDir: string;
  private networkRequestCount = 0;
  private networkIdleTimer?: NodeJS.Timeout;

  constructor(port: number, logger: DaisyLogger, screenshotDir: string = './screenshots') {
    this.port = port;
    this.logger = logger;
    this.screenshotDir = screenshotDir;

    // Ensure screenshot directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
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
      Runtime.consoleAPICalled(async (params: any) => {
        // Extract clean message from console arguments
        const message = params.args.map((arg: any) => {
          if (arg.value !== undefined) return arg.value;
          if (arg.description) return arg.description;
          return `[${arg.type}]`;
        }).join(' ');

        // Get the source location (file and line) from stack trace
        let sourceLocation = '';
        if (params.stackTrace && params.stackTrace.callFrames.length > 0) {
          const frame = params.stackTrace.callFrames[0];
          const fileName = frame.url ? frame.url.split('/').pop() : 'unknown';
          sourceLocation = `${fileName}:${frame.lineNumber}`;
        }

        // Take screenshot on console errors
        let screenshotPath = null;
        if (params.type === 'error') {
          screenshotPath = await this.takeScreenshot('console-error');
        }

        this.logger.logConsole(
          params.type,
          message,
          sourceLocation ? [{ sourceLocation, screenshot: screenshotPath }] : undefined,
          params.stackTrace
        );
      });

      // Runtime exceptions
      Runtime.exceptionThrown(async (params: any) => {
        // Take screenshot on JavaScript errors
        const screenshotPath = await this.takeScreenshot('js-exception');

        this.logger.logError(
          {
            message: params.exceptionDetails.text,
            stack: params.exceptionDetails.stackTrace,
            name: 'RuntimeException',
            screenshot: screenshotPath
          },
          'runtime_exception',
          JSON.stringify(params.exceptionDetails.stackTrace)
        );
      });

      // Network request events - track requests and responses
      Network.requestWillBeSent((params: any) => {
        // Store request info for later when response comes
        this.pendingRequests.set(params.requestId, {
          method: params.request.method,
          url: params.request.url,
          headers: params.request.headers,
          postData: params.request.postData
        });

        // Track network activity for idle detection (like dev3000)
        this.networkRequestCount++;
        if (this.networkIdleTimer) {
          clearTimeout(this.networkIdleTimer);
        }
      });

      Network.responseReceived(async (params: any) => {
        const requestData = this.pendingRequests.get(params.requestId);

        // Helper function to get response body with retry
        const getResponseBodyWithRetry = async (requestId: string, maxRetries = 3): Promise<any> => {
          for (let i = 0; i < maxRetries; i++) {
            try {
              // Add small delay for first retry to let response body become available
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              
              const responseBodyResult = await Network.getResponseBody({ requestId });
              let responseBody = responseBodyResult.body;

              // Try to parse JSON responses
              if (params.response.mimeType === 'application/json' && responseBody) {
                try {
                  responseBody = JSON.parse(responseBody);
                } catch (e) {
                  // Keep as string if not valid JSON
                }
              }
              
              return responseBody;
            } catch (e) {
              if (i === maxRetries - 1) {
                // Last retry failed, return null
                return null;
              }
              // Continue to next retry
            }
          }
          return null;
        };

        try {
          // Get the actual response body content with retry
          const responseBody = await getResponseBodyWithRetry(params.requestId);

          // Log the complete request/response
          this.logger.logNetwork(
            requestData?.method || 'UNKNOWN',
            params.response.url,
            params.response.status,
            params.response.headers,
            requestData?.postData,
            responseBody
          );
        } catch (error) {
          // Fallback to basic logging if something fails
          this.logger.logNetwork(
            requestData?.method || 'UNKNOWN',
            params.response.url,
            params.response.status,
            params.response.headers,
            requestData?.postData,
            null
          );
        }

        // Clean up tracked request
        this.pendingRequests.delete(params.requestId);
      });

      Network.loadingFailed(async (params: any) => {
        // Take screenshot on network failures (4xx/5xx errors)
        const screenshotPath = await this.takeScreenshot('network-error');

        this.logger.logError(
          {
            message: `Network loading failed: ${params.errorText}`,
            name: 'NetworkError',
            url: params.request?.url,
            screenshot: screenshotPath
          },
          'network_failure'
        );
      });

      // Page events
      Page.loadEventFired(async (params: any) => {
        this.logger.logPageEvent('load', params);
        // Take screenshot on page load like dev3000
        await this.takeScreenshot('page-loaded');
        // Re-inject interaction tracking on page load
        setTimeout(() => this.setupInteractionTracking(), 1000);
      });

      Page.domContentEventFired(async (params: any) => {
        this.logger.logPageEvent('domContentLoaded', params);
        // Take screenshot on DOM content loaded
        await this.takeScreenshot('dom-content-loaded');
        // Re-inject interaction tracking on DOM ready
        setTimeout(() => this.setupInteractionTracking(), 500);
      });

      Page.frameNavigated((params: any) => {
        this.logger.logPageEvent('navigation', params, params.frame.url);
      });

      // DOM mutation tracking (like dev3000)
      const { DOM } = this.client;
      DOM.documentUpdated(() => {
        this.logger.logPageEvent('documentUpdated', {}, 'Document structure changed');
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

  async takeScreenshot(errorContext: string = ''): Promise<string | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const { Page } = this.client;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = errorContext
        ? `error-${errorContext}-${timestamp}.png`
        : `screenshot-${timestamp}.png`;
      const filepath = path.join(this.screenshotDir, filename);

      // Capture screenshot
      const screenshot = await Page.captureScreenshot({
        format: 'png',
        captureBeyondViewport: false
      });

      // Save screenshot to file
      const buffer = Buffer.from(screenshot.data, 'base64');
      fs.writeFileSync(filepath, buffer);

      console.log(`📸 Screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error('❌ Failed to capture screenshot:', error);
      return null;
    }
  }

  async navigateToUrl(url: string): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Page } = this.client;
      console.log(`🌐 Navigating to ${url}`);
      await Page.navigate({ url });
      this.logger.logPageEvent('navigation', { url }, url);

      // Take a screenshot after navigation
      setTimeout(() => {
        this.takeScreenshot('navigation');
      }, 1000);

      // Set up interaction tracking after navigation (like dev3000)
      setTimeout(() => {
        this.setupInteractionTracking();
      }, 100);
      
      setTimeout(() => {
        this.setupInteractionTracking();
      }, 1000);
      
      setTimeout(() => {
        this.setupInteractionTracking();
      }, 2000);
    } catch (error) {
      console.error(`❌ Failed to navigate to ${url}:`, error);
      throw error;
    }
  }

  /**
   * Set up user interaction tracking by injecting JavaScript into the page
   */
  private async setupInteractionTracking(): Promise<void> {
    if (!this.client || !this.connected) {
      return;
    }

    try {
      const trackingScript = `
        try {
          if (!window.__daisy_interaction_tracking) {
            window.__daisy_interaction_tracking = true;
            
            // Helper function to generate CSS selector for element
            function getElementSelector(el) {
              if (!el || el === document) return 'document';
              
              // Try ID first (most reliable)
              if (el.id) return '#' + el.id;
              
              // Build path with tag + classes
              let selector = el.tagName.toLowerCase();
              if (el.className && typeof el.className === 'string') {
                let classes = el.className.trim().split(/\\\\s+/).filter(c => c.length > 0);
                if (classes.length > 0) selector += '.' + classes.join('.');
              }
              
              // Add nth-child if needed to make unique
              if (el.parentNode) {
                let siblings = Array.from(el.parentNode.children).filter(child => 
                  child.tagName === el.tagName && 
                  child.className === el.className
                );
                if (siblings.length > 1) {
                  let index = siblings.indexOf(el) + 1;
                  selector += ':nth-child(' + index + ')';
                }
              }
              
              return selector;
            }
            
            // Helper to get element details for replay
            function getElementDetails(el) {
              return {
                selector: getElementSelector(el),
                tag: el.tagName.toLowerCase(),
                text: el.textContent ? el.textContent.trim().substring(0, 50) : '',
                id: el.id || '',
                className: el.className || '',
                name: el.name || '',
                type: el.type || '',
                value: el.value || ''
              };
            }
            
            // Store interactions for polling
            window.__daisy_interactions = [];
            
            // Add click tracking
            document.addEventListener('click', function(e) {
              let details = getElementDetails(e.target);
              window.__daisy_interactions.push({
                timestamp: Date.now(),
                type: 'CLICK',
                x: e.clientX,
                y: e.clientY,
                element: details,
                message: 'CLICK at ' + e.clientX + ',' + e.clientY + ' on ' + details.selector
              });
              
              // Keep only last 100 interactions
              if (window.__daisy_interactions.length > 100) {
                window.__daisy_interactions = window.__daisy_interactions.slice(-100);
              }
            });
            
            // Add key tracking
            document.addEventListener('keydown', function(e) {
              let details = getElementDetails(e.target);
              window.__daisy_interactions.push({
                timestamp: Date.now(),
                type: 'KEY',
                key: e.key,
                element: details,
                message: 'KEY ' + e.key + ' in ' + details.selector
              });
              
              // Keep only last 100 interactions
              if (window.__daisy_interactions.length > 100) {
                window.__daisy_interactions = window.__daisy_interactions.slice(-100);
              }
            });
            
            // Add scroll tracking with coalescing
            let scrollTimeout = null;
            let lastScrollX = 0;
            let lastScrollY = 0;
            let scrollStartX = 0;
            let scrollStartY = 0;
            let scrollTarget = 'document';
            
            document.addEventListener('scroll', function(e) {
              let target = e.target === document ? 'document' : getElementSelector(e.target);
              let currentScrollX, currentScrollY;
              
              if (e.target === document) {
                currentScrollX = window.scrollX;
                currentScrollY = window.scrollY;
              } else {
                currentScrollX = e.target.scrollLeft;
                currentScrollY = e.target.scrollTop;
              }
              
              // If this is the first scroll event or different target, reset
              if (scrollTimeout === null || scrollTarget !== target) {
                scrollStartX = currentScrollX;
                scrollStartY = currentScrollY;
                scrollTarget = target;
              } else {
                clearTimeout(scrollTimeout);
              }
              
              lastScrollX = currentScrollX;
              lastScrollY = currentScrollY;
              
              // Set timeout to log scroll after 300ms of no scrolling
              scrollTimeout = setTimeout(function() {
                let deltaX = Math.abs(lastScrollX - scrollStartX);
                let deltaY = Math.abs(lastScrollY - scrollStartY);
                
                if (deltaX > 5 || deltaY > 5) {
                  window.__daisy_interactions.push({
                    timestamp: Date.now(),
                    type: 'SCROLL',
                    from: { x: scrollStartX, y: scrollStartY },
                    to: { x: lastScrollX, y: lastScrollY },
                    target: target,
                    message: 'SCROLL from ' + scrollStartX + ',' + scrollStartY + ' to ' + lastScrollX + ',' + lastScrollY + ' in ' + target
                  });
                  
                  // Keep only last 100 interactions
                  if (window.__daisy_interactions.length > 100) {
                    window.__daisy_interactions = window.__daisy_interactions.slice(-100);
                  }
                }
                scrollTimeout = null;
              }, 300);
            }, true);
            
            console.debug('🌼 Daisy interaction tracking initialized');
          }
        } catch (err) {
          console.debug('🌼 Daisy interaction tracking error:', err.message);
        }
      `;

      const { Runtime } = this.client;
      const result = await Runtime.evaluate({
        expression: trackingScript,
        includeCommandLineAPI: false
      });

      console.log('🎯 User interaction tracking enabled');



      // Start polling for interactions
      this.startInteractionPolling();

    } catch (error) {
      console.error('❌ Failed to setup interaction tracking:', error);
    }
  }

  /**
   * Start polling for user interactions
   */
  private startInteractionPolling(): void {
    const pollInteractions = async () => {
      if (!this.client || !this.connected) return;

      try {
        const { Runtime } = this.client;
        const result = await Runtime.evaluate({
          expression: `
            (() => {
              if (window.__daisy_interactions && window.__daisy_interactions.length > 0) {
                const interactions = [...window.__daisy_interactions];
                window.__daisy_interactions = []; // Clear the array
                return interactions;
              }
              return [];
            })()
          `,
          returnByValue: true
        });

        if (result.result && result.result.value && Array.isArray(result.result.value)) {
          const interactions = result.result.value;
          for (const interaction of interactions) {
            // Log the interaction
            this.logger.logInteraction(interaction.type, interaction, interaction.message);
          }
        }
      } catch (error) {
        // Silently ignore polling errors to avoid spam
      }

      // Continue polling every 500ms
      setTimeout(pollInteractions, 500);
    };

    // Start polling after a brief delay
    setTimeout(pollInteractions, 1000);
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

  /**
   * Schedule a screenshot when network becomes idle (like dev3000)
   */
  private scheduleNetworkIdleScreenshot(): void {
    if (this.networkIdleTimer) {
      clearTimeout(this.networkIdleTimer);
    }

    // Take screenshot after 2 seconds of network inactivity
    this.networkIdleTimer = setTimeout(() => {
      if (this.networkRequestCount <= 0) {
        this.takeScreenshot('network-idle');
      }
    }, 2000);
  }
}