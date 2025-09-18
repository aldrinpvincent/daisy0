import express, { Request, Response } from 'express';
import { DevToolsMonitor } from './devtools-monitor';
import { DaisyLogger } from './logger';
import * as http from 'http';

export interface ControlServerConfig {
  port: number;
  host?: string;
}

export class ControlServer {
  private app: express.Application;
  private server?: http.Server;
  private devToolsMonitor: DevToolsMonitor;
  private logger: DaisyLogger;
  private config: ControlServerConfig;

  constructor(devToolsMonitor: DevToolsMonitor, logger: DaisyLogger, config: ControlServerConfig) {
    this.devToolsMonitor = devToolsMonitor;
    this.logger = logger;
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '50mb' }));
    
    // Enable CORS for all origins (useful for testing)
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Log all requests
    this.app.use((req, res, next) => {
      this.logger.logConsole('info', `Control API: ${req.method} ${req.path}`, undefined, undefined, req.ip);
      next();
    });

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, next: any) => {
      this.logger.logError(error, 'control_server_error');
      res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        status: 'healthy',
        connected: this.devToolsMonitor.isConnected(),
        timestamp: new Date().toISOString()
      });
    });

    // Take screenshot
    this.app.post('/screenshot', async (req: Request, res: Response) => {
      try {
        const { context = 'api-request' } = req.body;
        const screenshotPath = await this.devToolsMonitor.takeScreenshot(context);
        
        res.json({
          success: true,
          screenshot: screenshotPath,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Click element
    this.app.post('/click', async (req: Request, res: Response) => {
      try {
        const { selector, timeout = 5000 } = req.body;
        if (!selector) {
          return res.status(400).json({
            success: false,
            error: 'selector is required'
          });
        }

        const result = await this.devToolsMonitor.clickElement(selector, timeout);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Type text in element
    this.app.post('/type', async (req: Request, res: Response) => {
      try {
        const { selector, text, timeout = 5000, clear = false } = req.body;
        if (!selector || text === undefined) {
          return res.status(400).json({
            success: false,
            error: 'selector and text are required'
          });
        }

        const result = await this.devToolsMonitor.typeText(selector, text, timeout, clear);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Navigate to URL
    this.app.post('/navigate', async (req: Request, res: Response) => {
      try {
        const { url, waitForLoad = true, timeout = 30000 } = req.body;
        if (!url) {
          return res.status(400).json({
            success: false,
            error: 'url is required'
          });
        }

        const result = await this.devToolsMonitor.navigateTo(url, waitForLoad, timeout);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Scroll to element or position
    this.app.post('/scroll', async (req: Request, res: Response) => {
      try {
        const { selector, x, y, behavior = 'smooth' } = req.body;

        const result = await this.devToolsMonitor.scrollTo({ selector, x, y, behavior });
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Inspect DOM element
    this.app.post('/inspect', async (req: Request, res: Response) => {
      try {
        const { selector, properties = ['textContent', 'innerHTML', 'outerHTML', 'className', 'id'] } = req.body;
        if (!selector) {
          return res.status(400).json({
            success: false,
            error: 'selector is required'
          });
        }

        const result = await this.devToolsMonitor.inspectDOM(selector, properties);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get computed styles
    this.app.post('/computed-styles', async (req: Request, res: Response) => {
      try {
        const { selector, properties = ['color', 'background-color', 'font-size', 'display', 'position'] } = req.body;
        if (!selector) {
          return res.status(400).json({
            success: false,
            error: 'selector is required'
          });
        }

        const result = await this.devToolsMonitor.getComputedStyles(selector, properties);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Execute JavaScript
    this.app.post('/execute', async (req: Request, res: Response) => {
      try {
        const { code, returnByValue = true, timeout = 10000 } = req.body;
        if (!code) {
          return res.status(400).json({
            success: false,
            error: 'code is required'
          });
        }

        const result = await this.devToolsMonitor.evaluateJavaScript(code, returnByValue, timeout);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get network requests
    this.app.get('/network-requests', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const result = this.devToolsMonitor.getNetworkRequests(limit);
        
        res.json({
          success: true,
          result,
          count: result.length,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get current page info
    this.app.get('/page-info', async (req: Request, res: Response) => {
      try {
        const result = await this.devToolsMonitor.getPageInfo();
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Wait for element
    this.app.post('/wait-for-element', async (req: Request, res: Response) => {
      try {
        const { selector, timeout = 10000, visible = true } = req.body;
        if (!selector) {
          return res.status(400).json({
            success: false,
            error: 'selector is required'
          });
        }

        const result = await this.devToolsMonitor.waitForElement(selector, timeout, visible);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Wait for network idle
    this.app.post('/wait-for-network-idle', async (req: Request, res: Response) => {
      try {
        const { timeout = 10000, idleTime = 1000 } = req.body;
        
        const result = await this.devToolsMonitor.waitForNetworkIdle(timeout, idleTime);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get element bounds/position
    this.app.post('/element-bounds', async (req: Request, res: Response) => {
      try {
        const { selector } = req.body;
        if (!selector) {
          return res.status(400).json({
            success: false,
            error: 'selector is required'
          });
        }

        const result = await this.devToolsMonitor.getElementBounds(selector);
        res.json({
          success: true,
          result,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const host = this.config.host || '0.0.0.0';
        this.server = this.app.listen(this.config.port, host, () => {
          this.logger.logConsole('info', `Control API server listening on ${host}:${this.config.port}`);
          console.log(`🎮 Control API server started on ${host}:${this.config.port}`);
          resolve();
        });

        if (this.server) {
          this.server.on('error', (error) => {
            this.logger.logError(error, 'control_server_start_error');
            reject(error);
          });
        }
      } catch (error) {
        this.logger.logError(error as Error, 'control_server_start_error');
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🎮 Control API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getPort(): number {
    return this.config.port;
  }

  isRunning(): boolean {
    return !!this.server && this.server.listening;
  }
}