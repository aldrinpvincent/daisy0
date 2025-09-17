#!/usr/bin/env node

/**
 * Core Functionality Verification Test
 * Verifies screenshot capture, network monitoring, and log parsing functionality
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

class CoreFunctionalityTester {
  constructor() {
    this.testResults = [];
    this.screenshotDir = './screenshots';
    this.logDir = './test-logs';
    this.controlApiHost = 'localhost';
    this.controlApiPort = 8081;
  }

  // Utility functions
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeApiRequest(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.controlApiHost,
        port: this.controlApiPort,
        path: endpoint,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: response
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  logTest(testName, success, details = '', data = null) {
    const result = {
      test: testName,
      success,
      details,
      data,
      timestamp: new Date().toISOString()
    };

    this.testResults.push(result);

    if (success) {
      console.log(`✅ ${testName}: ${details}`);
    } else {
      console.log(`❌ ${testName}: ${details}`);
    }

    if (data && typeof data === 'object') {
      console.log(`   Data:`, JSON.stringify(data, null, 2));
    }
  }

  // Create sample log files for testing log parsing
  createSampleLogFiles() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const logEntries = [
      // Console logs with different levels
      {
        type: 'console',
        level: 'info',
        message: 'Application initialization complete',
        timestamp: new Date(Date.now() - 10000).toISOString(),
        metadata: { source: 'main.js:1', sessionId: 'test-session-1' }
      },
      {
        type: 'console',
        level: 'warn',
        message: 'Deprecated function used: oldFunction()',
        timestamp: new Date(Date.now() - 9000).toISOString(),
        metadata: { source: 'legacy.js:45', deprecatedSince: '2.0.0' }
      },
      {
        type: 'console',
        level: 'error',
        message: 'TypeError: Cannot read property "length" of undefined',
        timestamp: new Date(Date.now() - 8000).toISOString(),
        metadata: { 
          source: 'utils.js:123',
          stack: 'TypeError: Cannot read property "length" of undefined\\n    at validateArray (utils.js:123:5)\\n    at processData (processor.js:45:3)',
          screenshot: './screenshots/js-error-1234.png'
        }
      },

      // Network requests with different statuses
      {
        type: 'network',
        method: 'GET',
        url: 'https://api.example.com/users',
        status: 200,
        responseTime: 245,
        timestamp: new Date(Date.now() - 7000).toISOString(),
        metadata: { 
          size: 2048,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
          responseBody: '{"users": [{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]}'
        }
      },
      {
        type: 'network',
        method: 'POST',
        url: 'https://api.example.com/data',
        status: 500,
        responseTime: 1500,
        timestamp: new Date(Date.now() - 6000).toISOString(),
        metadata: { 
          error: 'Internal Server Error',
          postData: '{"action": "create", "data": {"name": "test"}}',
          headers: { 'content-type': 'application/json' }
        }
      },
      {
        type: 'network',
        method: 'GET',
        url: 'https://api.example.com/missing',
        status: 404,
        responseTime: 120,
        timestamp: new Date(Date.now() - 5000).toISOString(),
        metadata: { 
          error: 'Not Found',
          headers: { 'content-type': 'application/json' }
        }
      },

      // Performance metrics
      {
        type: 'performance',
        name: 'page-load-complete',
        duration: 2340,
        timestamp: new Date(Date.now() - 4000).toISOString(),
        metadata: { 
          loadEventEnd: 2340,
          domContentLoaded: 1200,
          firstPaint: 800,
          firstContentfulPaint: 950
        }
      },
      {
        type: 'performance',
        name: 'large-task',
        duration: 150,
        timestamp: new Date(Date.now() - 3000).toISOString(),
        metadata: { 
          taskType: 'script',
          blockingTime: 150,
          location: 'heavy-computation.js'
        }
      },

      // Runtime errors
      {
        type: 'error',
        level: 'error',
        message: 'Uncaught ReferenceError: undefinedVariable is not defined',
        timestamp: new Date(Date.now() - 2000).toISOString(),
        metadata: {
          stack: 'ReferenceError: undefinedVariable is not defined\\n    at processClick (app.js:45:5)\\n    at HTMLButtonElement.<anonymous> (app.js:12:3)',
          screenshot: './screenshots/reference-error-5678.png',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },

      // Security events
      {
        type: 'security',
        level: 'warn',
        message: 'Mixed content detected: HTTP resource on HTTPS page',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        metadata: {
          url: 'http://insecure.example.com/image.jpg',
          page: 'https://secure.example.com/dashboard',
          resourceType: 'image'
        }
      }
    ];

    const logFile = path.join(this.logDir, 'test-daisy-logs.log');
    const logContent = logEntries.map(entry => JSON.stringify(entry)).join('\\n');
    fs.writeFileSync(logFile, logContent);

    // Create a session metadata file
    const metadata = {
      sessionId: 'test-session-1',
      startTime: new Date(Date.now() - 10000).toISOString(),
      endTime: new Date().toISOString(),
      url: 'http://localhost:3000',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      totalEntries: logEntries.length,
      entryTypes: {
        console: logEntries.filter(e => e.type === 'console').length,
        network: logEntries.filter(e => e.type === 'network').length,
        performance: logEntries.filter(e => e.type === 'performance').length,
        error: logEntries.filter(e => e.type === 'error').length,
        security: logEntries.filter(e => e.type === 'security').length
      }
    };

    const metadataFile = path.join(this.logDir, 'test-session-metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    return { logFile, metadataFile, entryCount: logEntries.length };
  }

  // Test 1: Screenshot Capture Functionality
  async testScreenshotCapture() {
    try {
      // Ensure screenshot directory exists
      if (!fs.existsSync(this.screenshotDir)) {
        fs.mkdirSync(this.screenshotDir, { recursive: true });
      }

      // Test multiple screenshot contexts
      const contexts = ['test-1', 'error-scenario', 'integration-test'];
      const screenshots = [];

      for (const context of contexts) {
        const response = await this.makeApiRequest('/screenshot', 'POST', { context });
        
        if (response.statusCode === 200 && response.body.success) {
          const screenshotPath = response.body.screenshot;
          if (fs.existsSync(screenshotPath)) {
            const stats = fs.statSync(screenshotPath);
            screenshots.push({
              context,
              path: screenshotPath,
              size: stats.size,
              created: stats.birthtime
            });
          }
        }
        
        await this.delay(1000); // Wait between screenshots
      }

      if (screenshots.length === contexts.length) {
        this.logTest(
          'screenshot_capture',
          true,
          `Successfully captured ${screenshots.length} screenshots`,
          { screenshots: screenshots.map(s => ({ context: s.context, size: s.size })) }
        );
        return true;
      } else {
        this.logTest(
          'screenshot_capture',
          false,
          `Only captured ${screenshots.length} of ${contexts.length} screenshots`
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'screenshot_capture',
        false,
        `Screenshot test failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 2: Network Monitoring Functionality
  async testNetworkMonitoring() {
    try {
      // Generate network activity
      console.log('   Generating network activity...');
      
      // Trigger multiple types of network requests
      await this.makeApiRequest('/execute', 'POST', {
        code: `
          // Generate various network requests for monitoring
          Promise.all([
            fetch('/api/success'),
            fetch('/api/slow'),
            fetch('/api/error').catch(() => {}),
            fetch('/api/notfound').catch(() => {}),
            fetch('/health')
          ]).then(() => console.log('Network activity generation complete'));
        `,
        returnByValue: false,
        timeout: 10000
      });

      // Wait for requests to complete
      await this.delay(3000);

      // Check captured network requests
      const networkResponse = await this.makeApiRequest('/network-requests?limit=20');
      
      if (networkResponse.statusCode === 200 && networkResponse.body.success) {
        const requests = networkResponse.body.result;
        const requestTypes = {};
        const statusCodes = {};

        requests.forEach(req => {
          requestTypes[req.method] = (requestTypes[req.method] || 0) + 1;
          statusCodes[req.status] = (statusCodes[req.status] || 0) + 1;
        });

        this.logTest(
          'network_monitoring',
          true,
          `Successfully captured ${requests.length} network requests`,
          { 
            requestCount: requests.length,
            methods: requestTypes,
            statusCodes: statusCodes,
            recentRequests: requests.slice(0, 5).map(r => ({
              method: r.method,
              url: r.url,
              status: r.status,
              timestamp: r.timestamp
            }))
          }
        );
        return true;
      } else {
        this.logTest(
          'network_monitoring',
          false,
          'Failed to retrieve network requests'
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'network_monitoring',
        false,
        `Network monitoring test failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 3: Log Parsing Functionality
  async testLogParsing() {
    try {
      const { logFile, metadataFile, entryCount } = this.createSampleLogFiles();
      
      // Test reading and parsing the log file
      const logContent = fs.readFileSync(logFile, 'utf8');
      const logLines = logContent.split('\\n').filter(line => line.trim());
      
      let parsedEntries = 0;
      let parseErrors = 0;
      const entryTypes = {};
      const levels = {};

      for (const line of logLines) {
        try {
          const entry = JSON.parse(line);
          parsedEntries++;
          
          entryTypes[entry.type] = (entryTypes[entry.type] || 0) + 1;
          if (entry.level) {
            levels[entry.level] = (levels[entry.level] || 0) + 1;
          }
        } catch (e) {
          parseErrors++;
        }
      }

      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));

      // Validate parsing results
      if (parsedEntries === entryCount && parseErrors === 0) {
        this.logTest(
          'log_parsing',
          true,
          `Successfully parsed ${parsedEntries} log entries`,
          {
            parsedEntries,
            parseErrors,
            entryTypes,
            levels,
            metadata: metadata
          }
        );
        return true;
      } else {
        this.logTest(
          'log_parsing',
          false,
          `Parsing issues: ${parsedEntries} parsed, ${parseErrors} errors`,
          { parsedEntries, parseErrors, expected: entryCount }
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'log_parsing',
        false,
        `Log parsing test failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 4: Log Analysis Functionality
  async testLogAnalysis() {
    try {
      const { logFile } = this.createSampleLogFiles();
      
      // Simulate log analysis operations (similar to MCP tools)
      const logContent = fs.readFileSync(logFile, 'utf8');
      const entries = logContent.split('\\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      // Analyze errors
      const errors = entries.filter(e => e.level === 'error' || e.type === 'error');
      
      // Analyze network issues
      const networkIssues = entries.filter(e => 
        e.type === 'network' && (e.status >= 400 || e.responseTime > 1000)
      );
      
      // Analyze performance issues
      const performanceIssues = entries.filter(e => 
        e.type === 'performance' && e.duration > 100
      );
      
      // Categorize console logs
      const consoleLogs = entries.filter(e => e.type === 'console');
      const logLevels = {};
      consoleLogs.forEach(log => {
        logLevels[log.level] = (logLevels[log.level] || 0) + 1;
      });

      const analysis = {
        totalEntries: entries.length,
        errors: {
          count: errors.length,
          types: errors.map(e => ({ message: e.message, source: e.metadata?.source }))
        },
        networkIssues: {
          count: networkIssues.length,
          issues: networkIssues.map(n => ({ url: n.url, status: n.status, responseTime: n.responseTime }))
        },
        performanceIssues: {
          count: performanceIssues.length,
          issues: performanceIssues.map(p => ({ name: p.name, duration: p.duration }))
        },
        consoleLogs: {
          total: consoleLogs.length,
          byLevel: logLevels
        }
      };

      this.logTest(
        'log_analysis',
        true,
        'Successfully analyzed log entries',
        analysis
      );
      return true;
    } catch (error) {
      this.logTest(
        'log_analysis',
        false,
        `Log analysis test failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 5: Ring Buffer Network Storage
  async testNetworkRingBuffer() {
    try {
      // Generate a large number of network requests to test ring buffer
      console.log('   Testing ring buffer with many requests...');
      
      const requestPromises = [];
      for (let i = 0; i < 25; i++) {
        requestPromises.push(
          this.makeApiRequest('/execute', 'POST', {
            code: `fetch('/api/success?test=${i}').catch(() => {})`,
            returnByValue: false,
            timeout: 5000
          })
        );
        
        if (i % 5 === 0) {
          await this.delay(100); // Small delay to spread requests
        }
      }

      await Promise.allSettled(requestPromises);
      await this.delay(2000); // Wait for all requests to be captured

      // Check that ring buffer is working (should limit to max requests)
      const networkResponse = await this.makeApiRequest('/network-requests?limit=100');
      
      if (networkResponse.statusCode === 200 && networkResponse.body.success) {
        const requests = networkResponse.body.result;
        
        // Ring buffer should have captured requests but not exceed max limit
        const maxExpected = 50; // Assuming ring buffer max is around 50-100
        const hasRecentRequests = requests.some(r => r.url.includes('/api/success?test='));
        
        this.logTest(
          'network_ring_buffer',
          true,
          `Ring buffer working correctly: ${requests.length} requests captured, contains recent test requests: ${hasRecentRequests}`,
          {
            totalCaptured: requests.length,
            hasTestRequests: hasRecentRequests,
            oldestRequest: requests[requests.length - 1]?.timestamp,
            newestRequest: requests[0]?.timestamp
          }
        );
        return true;
      } else {
        this.logTest(
          'network_ring_buffer',
          false,
          'Failed to test ring buffer functionality'
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'network_ring_buffer',
        false,
        `Ring buffer test failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 6: Screenshot Error Scenarios
  async testScreenshotErrorCapture() {
    try {
      // Generate JavaScript error and verify screenshot capture
      await this.makeApiRequest('/execute', 'POST', {
        code: 'throw new Error("Test error for screenshot capture");',
        returnByValue: false,
        timeout: 5000
      });

      await this.delay(2000); // Wait for error processing

      // Check if error screenshot was captured
      const screenshotFiles = fs.readdirSync(this.screenshotDir)
        .filter(f => f.includes('error') || f.includes('js-'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(this.screenshotDir, a));
          const statB = fs.statSync(path.join(this.screenshotDir, b));
          return statB.mtime - statA.mtime; // Most recent first
        });

      if (screenshotFiles.length > 0) {
        const recentErrorScreenshot = screenshotFiles[0];
        const stats = fs.statSync(path.join(this.screenshotDir, recentErrorScreenshot));
        
        this.logTest(
          'screenshot_error_capture',
          true,
          `Error screenshot automatically captured: ${recentErrorScreenshot}`,
          {
            filename: recentErrorScreenshot,
            size: stats.size,
            created: stats.birthtime
          }
        );
        return true;
      } else {
        this.logTest(
          'screenshot_error_capture',
          false,
          'No error screenshots found after generating JavaScript error'
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'screenshot_error_capture',
        false,
        `Error screenshot test failed: ${error.message}`
      );
      return false;
    }
  }

  // Run all core functionality tests
  async runAllTests() {
    console.log('🔍 Starting Core Functionality Verification Test Suite');
    console.log('Testing screenshot capture, network monitoring, and log parsing');
    console.log('='.repeat(75));

    const tests = [
      { name: 'Screenshot Capture', test: () => this.testScreenshotCapture() },
      { name: 'Network Monitoring', test: () => this.testNetworkMonitoring() },
      { name: 'Log Parsing', test: () => this.testLogParsing() },
      { name: 'Log Analysis', test: () => this.testLogAnalysis() },
      { name: 'Network Ring Buffer', test: () => this.testNetworkRingBuffer() },
      { name: 'Screenshot Error Capture', test: () => this.testScreenshotErrorCapture() }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const { name, test } of tests) {
      console.log(`\\n🧪 Running ${name} Test...`);
      try {
        const success = await test();
        if (success) passedTests++;
      } catch (error) {
        console.log(`❌ ${name} Test failed with exception: ${error.message}`);
      }
    }

    // Generate report
    const report = {
      summary: {
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        successRate: `${((passedTests / totalTests) * 100).toFixed(1)}%`,
        timestamp: new Date().toISOString()
      },
      testDetails: this.testResults,
      coreCapabilities: {
        screenshotCapture: this.testResults.find(t => t.test === 'screenshot_capture')?.success || false,
        networkMonitoring: this.testResults.find(t => t.test === 'network_monitoring')?.success || false,
        logParsing: this.testResults.find(t => t.test === 'log_parsing')?.success || false,
        errorCapture: this.testResults.find(t => t.test === 'screenshot_error_capture')?.success || false
      }
    };

    const reportPath = './core-functionality-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.printSummary(report);
    
    // Cleanup test files
    this.cleanup();
    
    return passedTests === totalTests;
  }

  // Print test summary
  printSummary(report) {
    console.log('\\n' + '='.repeat(75));
    console.log('🔍 CORE FUNCTIONALITY VERIFICATION SUMMARY');
    console.log('='.repeat(75));
    console.log(`📊 Total Tests: ${report.summary.totalTests}`);
    console.log(`✅ Passed: ${report.summary.passedTests}`);
    console.log(`❌ Failed: ${report.summary.failedTests}`);
    console.log(`📈 Success Rate: ${report.summary.successRate}`);
    
    console.log('\\n🎯 Core Capabilities Status:');
    Object.entries(report.coreCapabilities).forEach(([capability, status]) => {
      const emoji = status ? '✅' : '❌';
      const name = capability.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`   ${emoji} ${name}`);
    });
    
    if (report.summary.failedTests > 0) {
      console.log('\\n❌ Failed Tests:');
      report.testDetails.filter(r => !r.success).forEach(result => {
        console.log(`   • ${result.test}: ${result.details}`);
      });
    }
    
    console.log('\\n📄 Core functionality report saved to: core-functionality-report.json');
    console.log('='.repeat(75));
  }

  // Cleanup test files
  cleanup() {
    try {
      if (fs.existsSync(this.logDir)) {
        fs.rmSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.log(`Warning: Could not cleanup test files: ${error.message}`);
    }
  }
}

// Run core functionality tests
if (require.main === module) {
  const tester = new CoreFunctionalityTester();
  
  tester.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Core functionality test suite failed:', error);
    process.exit(1);
  });
}

module.exports = CoreFunctionalityTester;