import * as chromeLauncher from 'chrome-launcher';

export class ChromeLauncher {
  private chrome: any;
  private port: number;

  constructor(port: number = 9222) {
    this.port = port;
  }

  async launch(): Promise<any> {
    this.chrome = await chromeLauncher.launch({
      port: this.port,
      chromeFlags: [
        // '--headless',  // Commented out for manual testing
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--remote-debugging-address=127.0.0.1',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-crash-upload'
      ]
    });

    return this.chrome;
  }

  async kill(): Promise<void> {
    if (this.chrome) {
      await this.chrome.kill();
    }
  }

  getPort(): number {
    return this.port;
  }

  getChromeInstance(): any {
    return this.chrome;
  }
}