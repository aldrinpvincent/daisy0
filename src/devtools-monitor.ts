import CDP from 'chrome-remote-interface';
import { DaisyLogger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export interface NetworkRequest {
  requestId: string;
  method: string;
  url: string;
  headers: any;
  postData?: string;
  status?: number;
  responseHeaders?: any;
  responseBody?: any;
  timestamp: number;
  loadingFailed?: boolean;
  errorText?: string;
}

export interface ScrollOptions {
  selector?: string;
  x?: number;
  y?: number;
  behavior?: 'smooth' | 'instant' | 'auto';
}

export class DevToolsMonitor {
  private client: any;
  private port: number;
  private logger: DaisyLogger;
  private connected: boolean = false;
  private pendingRequests = new Map<string, any>(); // Track requests by requestId
  private screenshotDir: string;
  private networkRequestCount = 0;
  private networkIdleTimer?: NodeJS.Timeout;
  private networkRequestBuffer: NetworkRequest[] = []; // Ring buffer for network requests
  private maxNetworkRequests = 1000; // Max requests to keep in buffer

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
      const { Runtime, Network, Log, Performance, Page, Security, Debugger, CSS } = this.client;
      const DOM = this.client.DOM;

      // Enable all domains for comprehensive monitoring and control
      await Promise.all([
        Runtime.enable(),
        Network.enable(),
        Log.enable(),
        Performance.enable(),
        Page.enable(),
        Security.enable(),
        Debugger.enable(),
        CSS.enable(), // Enable CSS domain for computed styles
        DOM.enable()  // Enable DOM domain for element interaction
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
        const requestData = {
          method: params.request.method,
          url: params.request.url,
          headers: params.request.headers,
          postData: params.request.postData,
          timestamp: Date.now()
        };
        
        this.pendingRequests.set(params.requestId, requestData);

        // Add to network buffer
        const networkRequest: NetworkRequest = {
          requestId: params.requestId,
          method: params.request.method,
          url: params.request.url,
          headers: params.request.headers,
          postData: params.request.postData,
          timestamp: Date.now()
        };
        
        this.addToNetworkBuffer(networkRequest);

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

        let responseBody: any = null;
        
        try {
          // Get the actual response body content with retry
          responseBody = await getResponseBodyWithRetry(params.requestId);

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

        // Update network buffer with response data
        this.updateNetworkBufferResponse(params.requestId, {
          status: params.response.status,
          responseHeaders: params.response.headers,
          responseBody
        });

        // Clean up tracked request
        this.pendingRequests.delete(params.requestId);
        
        // Decrement network activity counter
        this.networkRequestCount = Math.max(0, this.networkRequestCount - 1);
      });

      Network.loadingFailed(async (params: any) => {
        // Take screenshot on network failures (4xx/5xx errors)
        const screenshotPath = await this.takeScreenshot('network-error');

        // Update network buffer with error
        this.updateNetworkBufferResponse(params.requestId, {
          loadingFailed: true,
          errorText: params.errorText
        });

        this.logger.logError(
          {
            message: `Network loading failed: ${params.errorText}`,
            name: 'NetworkError',
            url: params.request?.url,
            screenshot: screenshotPath
          },
          'network_failure'
        );
        
        // Decrement network activity counter
        this.networkRequestCount = Math.max(0, this.networkRequestCount - 1);
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

  /**
   * Add network request to ring buffer
   */
  private addToNetworkBuffer(request: NetworkRequest): void {
    this.networkRequestBuffer.unshift(request);
    
    // Keep buffer size within limit
    if (this.networkRequestBuffer.length > this.maxNetworkRequests) {
      this.networkRequestBuffer = this.networkRequestBuffer.slice(0, this.maxNetworkRequests);
    }
  }

  /**
   * Update network request in buffer with response data
   */
  private updateNetworkBufferResponse(requestId: string, responseData: Partial<NetworkRequest>): void {
    const requestIndex = this.networkRequestBuffer.findIndex(req => req.requestId === requestId);
    if (requestIndex !== -1) {
      Object.assign(this.networkRequestBuffer[requestIndex], responseData);
    }
  }

  /**
   * Get recent network requests from buffer
   */
  getNetworkRequests(limit: number = 50): NetworkRequest[] {
    return this.networkRequestBuffer.slice(0, Math.min(limit, this.networkRequestBuffer.length));
  }

  /**
   * Enhanced navigation with timeout and wait options
   */
  async navigateTo(url: string, waitForLoad: boolean = true, timeout: number = 30000): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Page } = this.client;
      console.log(`🌐 Navigating to ${url}`);
      
      // Navigate with timeout
      const navigationPromise = Page.navigate({ url });
      
      if (waitForLoad) {
        // Wait for both navigation and load event
        const loadPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error(`Navigation timeout after ${timeout}ms`));
          }, timeout);
          
          const loadHandler = () => {
            clearTimeout(timeoutId);
            Page.removeListener('loadEventFired', loadHandler);
            resolve(undefined);
          };
          
          Page.on('loadEventFired', loadHandler);
        });
        
        await Promise.all([navigationPromise, loadPromise]);
      } else {
        await navigationPromise;
      }

      this.logger.logPageEvent('navigation', { url, waitForLoad, timeout }, url);

      // Take a screenshot after navigation
      setTimeout(() => {
        this.takeScreenshot('navigation');
      }, 1000);

      // Set up interaction tracking after navigation
      setTimeout(() => {
        this.setupInteractionTracking();
      }, 1500);
      
      return { success: true, url };
    } catch (error) {
      console.error(`❌ Failed to navigate to ${url}:`, error);
      this.logger.logError(error as Error, 'navigation_error');
      throw error;
    }
  }

  /**
   * Click on an element by CSS selector
   */
  async clickElement(selector: string, timeout: number = 5000): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime, DOM } = this.client;
      
      // Wait for element to be available
      await this.waitForElement(selector, timeout);
      
      // Get element coordinates and click
      const clickScript = `
        (() => {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}}');
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          
          // Scroll element into view if needed
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Dispatch click event
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: centerX,
            clientY: centerY
          });
          
          element.dispatchEvent(clickEvent);
          
          return {
            success: true,
            selector: '${selector}',
            coordinates: { x: centerX, y: centerY },
            elementTag: element.tagName,
            elementText: element.textContent?.trim().substring(0, 50) || ''
          };
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: clickScript,
        returnByValue: true,
        timeout: timeout
      });
      
      if (result.exceptionDetails) {
        throw new Error(`Click failed: ${result.exceptionDetails.text}`);
      }
      
      // Take screenshot after click
      await this.takeScreenshot('click-action');
      
      this.logger.logInteraction('CLICK', { selector, result: result.result.value }, `Clicked element: ${selector}`);
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to click element ${selector}:`, error);
      this.logger.logError(error as Error, 'click_error');
      throw error;
    }
  }

  /**
   * Type text into an element
   */
  async typeText(selector: string, text: string, timeout: number = 5000, clear: boolean = false): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime } = this.client;
      
      // Wait for element to be available
      await this.waitForElement(selector, timeout);
      
      const typeScript = `
        (() => {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}}');
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          // Focus the element
          element.focus();
          
          // Clear existing content if requested
          if (${clear}) {
            if (element.value !== undefined) {
              element.value = '';
            } else {
              element.textContent = '';
            }
          }
          
          // Type the text
          const textToType = '${text.replace(/'/g, "\\'")}';
          
          if (element.value !== undefined) {
            // Input/textarea elements
            element.value += textToType;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            // ContentEditable elements
            element.textContent += textToType;
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          return {
            success: true,
            selector: '${selector}',
            text: textToType,
            elementTag: element.tagName,
            finalValue: element.value || element.textContent
          };
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: typeScript,
        returnByValue: true,
        timeout: timeout
      });
      
      if (result.exceptionDetails) {
        throw new Error(`Type failed: ${result.exceptionDetails.text}`);
      }
      
      this.logger.logInteraction('TYPE', { selector, text, clear, result: result.result.value }, `Typed text in: ${selector}`);
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to type in element ${selector}:`, error);
      this.logger.logError(error as Error, 'type_error');
      throw error;
    }
  }

  /**
   * Scroll to element or coordinates
   */
  async scrollTo(options: ScrollOptions): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime } = this.client;
      
      let scrollScript: string;
      
      if (options.selector) {
        // Scroll to element
        scrollScript = `
          (() => {
            const element = document.querySelector('${options.selector?.replace(/'/g, "\\'")}}');
            if (!element) {
              throw new Error('Element not found: ${options.selector}');
            }
            
            element.scrollIntoView({ 
              behavior: '${options.behavior || 'smooth'}',
              block: 'center',
              inline: 'center'
            });
            
            const rect = element.getBoundingClientRect();
            return {
              success: true,
              selector: '${options.selector}',
              elementPosition: { x: rect.left, y: rect.top },
              scrollBehavior: '${options.behavior || 'smooth'}'
            };
          })()
        `;
      } else if (options.x !== undefined || options.y !== undefined) {
        // Scroll to coordinates
        const x = options.x || 0;
        const y = options.y || 0;
        scrollScript = `
          (() => {
            window.scrollTo({
              left: ${x},
              top: ${y},
              behavior: '${options.behavior || 'smooth'}'
            });
            
            return {
              success: true,
              coordinates: { x: ${x}, y: ${y} },
              scrollBehavior: '${options.behavior || 'smooth'}'
            };
          })()
        `;
      } else {
        throw new Error('Either selector or coordinates (x, y) must be provided');
      }
      
      const result = await Runtime.evaluate({
        expression: scrollScript,
        returnByValue: true
      });
      
      if (result.exceptionDetails) {
        throw new Error(`Scroll failed: ${result.exceptionDetails.text}`);
      }
      
      this.logger.logInteraction('SCROLL', options, `Scrolled: ${JSON.stringify(options)}`);
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to scroll:`, error);
      this.logger.logError(error as Error, 'scroll_error');
      throw error;
    }
  }

  /**
   * Inspect DOM element properties
   */
  async inspectDOM(selector: string, properties: string[] = ['textContent', 'innerHTML', 'outerHTML', 'className', 'id']): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime } = this.client;
      
      const inspectScript = `
        (() => {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}}');
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          const properties = ${JSON.stringify(properties)};
          const result = {
            selector: '${selector}',
            tagName: element.tagName,
            properties: {},
            attributes: {},
            rect: element.getBoundingClientRect(),
            visible: element.offsetParent !== null
          };
          
          // Get requested properties
          properties.forEach(prop => {
            try {
              result.properties[prop] = element[prop];
            } catch (e) {
              result.properties[prop] = null;
            }
          });
          
          // Get all attributes
          for (let attr of element.attributes) {
            result.attributes[attr.name] = attr.value;
          }
          
          return result;
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: inspectScript,
        returnByValue: true
      });
      
      if (result.exceptionDetails) {
        throw new Error(`DOM inspection failed: ${result.exceptionDetails.text}`);
      }
      
      this.logger.logConsole('info', `Inspected DOM element: ${selector}`, undefined, undefined, 'DOM_INSPECT');
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to inspect DOM element ${selector}:`, error);
      this.logger.logError(error as Error, 'dom_inspect_error');
      throw error;
    }
  }

  /**
   * Get computed styles for an element
   */
  async getComputedStyles(selector: string, properties: string[] = ['color', 'background-color', 'font-size', 'display', 'position']): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime, DOM, CSS } = this.client;
      
      const stylesScript = `
        (() => {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}}');
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          const computedStyles = window.getComputedStyle(element);
          const properties = ${JSON.stringify(properties)};
          const result = {
            selector: '${selector}',
            styles: {}
          };
          
          properties.forEach(prop => {
            result.styles[prop] = computedStyles.getPropertyValue(prop);
          });
          
          return result;
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: stylesScript,
        returnByValue: true
      });
      
      if (result.exceptionDetails) {
        throw new Error(`Computed styles failed: ${result.exceptionDetails.text}`);
      }
      
      this.logger.logConsole('info', `Got computed styles for: ${selector}`, undefined, undefined, 'COMPUTED_STYLES');
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to get computed styles for ${selector}:`, error);
      this.logger.logError(error as Error, 'computed_styles_error');
      throw error;
    }
  }

  /**
   * Execute JavaScript code in browser context
   */
  async evaluateJavaScript(code: string, returnByValue: boolean = true, timeout: number = 10000): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime } = this.client;
      
      const result = await Runtime.evaluate({
        expression: code,
        returnByValue,
        timeout
      });
      
      if (result.exceptionDetails) {
        throw new Error(`JavaScript execution failed: ${result.exceptionDetails.text}`);
      }
      
      this.logger.logConsole('info', `Executed JavaScript code: ${code.substring(0, 100)}...`, undefined, undefined, 'JS_EVALUATE');
      
      return result.result;
    } catch (error) {
      console.error(`❌ Failed to execute JavaScript:`, error);
      this.logger.logError(error as Error, 'js_evaluate_error');
      throw error;
    }
  }

  /**
   * Wait for element to appear in DOM
   */
  async waitForElement(selector: string, timeout: number = 10000, visible: boolean = true): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime } = this.client;
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        const checkScript = `
          (() => {
            const element = document.querySelector('${selector.replace(/'/g, "\\'")}}');
            if (!element) return { found: false };
            
            const isVisible = ${visible} ? element.offsetParent !== null : true;
            return {
              found: true,
              visible: isVisible,
              ready: ${visible} ? isVisible : true
            };
          })()
        `;
        
        const result = await Runtime.evaluate({
          expression: checkScript,
          returnByValue: true
        });
        
        if (result.result?.value?.ready) {
          this.logger.logConsole('info', `Element found: ${selector}`, undefined, undefined, 'WAIT_FOR_ELEMENT');
          return result.result.value;
        }
        
        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      throw new Error(`Element not found within ${timeout}ms: ${selector}`);
    } catch (error) {
      console.error(`❌ Failed to wait for element ${selector}:`, error);
      this.logger.logError(error as Error, 'wait_for_element_error');
      throw error;
    }
  }

  /**
   * Wait for network to become idle
   */
  async waitForNetworkIdle(timeout: number = 10000, idleTime: number = 1000): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const startTime = Date.now();
      let lastNetworkActivity = Date.now();
      let currentCount = this.networkRequestCount;
      
      return new Promise((resolve, reject) => {
        const checkIdle = () => {
          const now = Date.now();
          
          // Check for timeout
          if (now - startTime > timeout) {
            reject(new Error(`Network idle timeout after ${timeout}ms`));
            return;
          }
          
          // Check if network activity changed
          if (this.networkRequestCount !== currentCount) {
            currentCount = this.networkRequestCount;
            lastNetworkActivity = now;
          }
          
          // Check if network has been idle for required time
          if (now - lastNetworkActivity >= idleTime && this.networkRequestCount === 0) {
            this.logger.logConsole('info', `Network idle achieved after ${now - startTime}ms`, undefined, undefined, 'NETWORK_IDLE');
            resolve({
              success: true,
              idleTime: now - lastNetworkActivity,
              totalTime: now - startTime
            });
            return;
          }
          
          // Continue checking
          setTimeout(checkIdle, 100);
        };
        
        checkIdle();
      });
    } catch (error) {
      console.error(`❌ Failed to wait for network idle:`, error);
      this.logger.logError(error as Error, 'wait_for_network_idle_error');
      throw error;
    }
  }

  /**
   * Get element bounds/position
   */
  async getElementBounds(selector: string): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime } = this.client;
      
      const boundsScript = `
        (() => {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}}');
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          const rect = element.getBoundingClientRect();
          const computedStyle = window.getComputedStyle(element);
          
          return {
            selector: '${selector}',
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left
            },
            scroll: {
              scrollX: window.scrollX,
              scrollY: window.scrollY
            },
            visible: element.offsetParent !== null,
            display: computedStyle.display,
            position: computedStyle.position
          };
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: boundsScript,
        returnByValue: true
      });
      
      if (result.exceptionDetails) {
        throw new Error(`Get element bounds failed: ${result.exceptionDetails.text}`);
      }
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to get element bounds for ${selector}:`, error);
      this.logger.logError(error as Error, 'get_element_bounds_error');
      throw error;
    }
  }

  /**
   * Get current page information
   */
  async getPageInfo(): Promise<any> {
    if (!this.client || !this.connected) {
      throw new Error('DevTools not connected');
    }

    try {
      const { Runtime, Page } = this.client;
      
      const pageInfoScript = `
        (() => {
          return {
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            scroll: {
              x: window.scrollX,
              y: window.scrollY,
              maxX: document.documentElement.scrollWidth - window.innerWidth,
              maxY: document.documentElement.scrollHeight - window.innerHeight
            },
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            document: {
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight
            },
            timestamp: Date.now()
          };
        })()
      `;
      
      const result = await Runtime.evaluate({
        expression: pageInfoScript,
        returnByValue: true
      });
      
      if (result.exceptionDetails) {
        throw new Error(`Get page info failed: ${result.exceptionDetails.text}`);
      }
      
      return result.result.value;
    } catch (error) {
      console.error(`❌ Failed to get page info:`, error);
      this.logger.logError(error as Error, 'get_page_info_error');
      throw error;
    }
  }
}