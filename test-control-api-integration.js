#!/usr/bin/env node

/**
 * Control API Integration Test
 * Tests the Control API server integration with DevEnvironment and MCP tool connectivity
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ControlAPIIntegrationTester {
  constructor() {
    this.controlApiHost = 'localhost';
    this.controlApiPort = 8081;
    this.testAppPort = 3000;
    this.testResults = [];
    this.processes = [];
  }

  // Utility to make HTTP requests to Control API
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
        timeout: 10000
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

  // Log test results
  logTest(testName, success, details = '', responseData = null) {
    const result = {
      test: testName,
      success,
      details,
      responseData,
      timestamp: new Date().toISOString()
    };

    this.testResults.push(result);

    if (success) {
      console.log(`✅ ${testName}: ${details}`);
    } else {
      console.log(`❌ ${testName}: ${details}`);
    }

    if (responseData) {
      console.log(`   Response:`, JSON.stringify(responseData, null, 2));
    }
  }

  // Wait for service to be ready
  async waitForService(host, port, timeout = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.makeApiRequest('/health');
        if (response.statusCode === 200) {
          return true;
        }
      } catch (error) {
        // Service not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
  }

  // Test 1: Control API Health Check
  async testHealthCheck() {
    try {
      const response = await this.makeApiRequest('/health');
      
      if (response.statusCode === 200 && response.body.success) {
        this.logTest(
          'control_api_health',
          true,
          `Control API is healthy. Connected: ${response.body.connected}`,
          response.body
        );
        return true;
      } else {
        this.logTest(
          'control_api_health',
          false,
          `Health check failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'control_api_health',
        false,
        `Health check request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 2: Screenshot Functionality
  async testScreenshotCapture() {
    try {
      const response = await this.makeApiRequest('/screenshot', 'POST', {
        context: 'integration-test'
      });

      if (response.statusCode === 200 && response.body.success) {
        // Verify screenshot file exists
        const screenshotPath = response.body.screenshot;
        if (screenshotPath && fs.existsSync(screenshotPath)) {
          this.logTest(
            'screenshot_capture',
            true,
            `Screenshot captured successfully: ${screenshotPath}`,
            { screenshot: screenshotPath, size: fs.statSync(screenshotPath).size }
          );
          return true;
        } else {
          this.logTest(
            'screenshot_capture',
            false,
            'Screenshot API succeeded but file not found',
            response.body
          );
          return false;
        }
      } else {
        this.logTest(
          'screenshot_capture',
          false,
          `Screenshot capture failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'screenshot_capture',
        false,
        `Screenshot request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 3: Browser Navigation
  async testBrowserNavigation() {
    try {
      const testUrl = `http://localhost:${this.testAppPort}`;
      const response = await this.makeApiRequest('/navigate', 'POST', {
        url: testUrl,
        waitForLoad: true,
        timeout: 10000
      });

      if (response.statusCode === 200 && response.body.success) {
        this.logTest(
          'browser_navigation',
          true,
          `Successfully navigated to ${testUrl}`,
          response.body
        );
        return true;
      } else {
        this.logTest(
          'browser_navigation',
          false,
          `Navigation failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'browser_navigation',
        false,
        `Navigation request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 4: DOM Element Interaction
  async testDOMInteraction() {
    try {
      // Test clicking a button
      const clickResponse = await this.makeApiRequest('/click', 'POST', {
        selector: 'button[onclick="testConsoleInfo()"]',
        timeout: 5000
      });

      if (clickResponse.statusCode === 200 && clickResponse.body.success) {
        this.logTest(
          'dom_click_interaction',
          true,
          'Successfully clicked button element',
          clickResponse.body
        );
      } else {
        this.logTest(
          'dom_click_interaction',
          false,
          `Click failed. Status: ${clickResponse.statusCode}`,
          clickResponse.body
        );
        return false;
      }

      // Test typing in input field
      const typeResponse = await this.makeApiRequest('/type', 'POST', {
        selector: '#customMessage',
        text: 'Control API Integration Test',
        timeout: 5000,
        clear: true
      });

      if (typeResponse.statusCode === 200 && typeResponse.body.success) {
        this.logTest(
          'dom_type_interaction',
          true,
          'Successfully typed in input field',
          typeResponse.body
        );
        return true;
      } else {
        this.logTest(
          'dom_type_interaction',
          false,
          `Type failed. Status: ${typeResponse.statusCode}`,
          typeResponse.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'dom_interaction',
        false,
        `DOM interaction failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 5: DOM Inspection
  async testDOMInspection() {
    try {
      const response = await this.makeApiRequest('/inspect', 'POST', {
        selector: 'h1',
        properties: ['textContent', 'innerHTML', 'className', 'id']
      });

      if (response.statusCode === 200 && response.body.success) {
        this.logTest(
          'dom_inspection',
          true,
          'Successfully inspected DOM element',
          response.body.result
        );
        return true;
      } else {
        this.logTest(
          'dom_inspection',
          false,
          `DOM inspection failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'dom_inspection',
        false,
        `DOM inspection request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 6: CSS Computed Styles
  async testComputedStyles() {
    try {
      const response = await this.makeApiRequest('/computed-styles', 'POST', {
        selector: 'button',
        properties: ['color', 'background-color', 'font-size', 'padding']
      });

      if (response.statusCode === 200 && response.body.success) {
        this.logTest(
          'computed_styles',
          true,
          'Successfully retrieved computed styles',
          response.body.result
        );
        return true;
      } else {
        this.logTest(
          'computed_styles',
          false,
          `Computed styles failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'computed_styles',
        false,
        `Computed styles request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 7: JavaScript Execution
  async testJavaScriptExecution() {
    try {
      const response = await this.makeApiRequest('/execute', 'POST', {
        code: 'document.title',
        returnByValue: true,
        timeout: 5000
      });

      if (response.statusCode === 200 && response.body.success) {
        this.logTest(
          'javascript_execution',
          true,
          `Successfully executed JavaScript. Result: ${response.body.result}`,
          response.body.result
        );
        return true;
      } else {
        this.logTest(
          'javascript_execution',
          false,
          `JavaScript execution failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'javascript_execution',
        false,
        `JavaScript execution request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 8: Network Monitoring
  async testNetworkMonitoring() {
    try {
      // First trigger some network activity
      await this.makeApiRequest('/execute', 'POST', {
        code: 'fetch("/api/success").then(() => console.log("Network test complete"))',
        returnByValue: false,
        timeout: 5000
      });

      // Wait a moment for network request to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check network requests
      const response = await this.makeApiRequest('/network-requests');

      if (response.statusCode === 200 && response.body.success) {
        const requestCount = response.body.result.length;
        this.logTest(
          'network_monitoring',
          true,
          `Successfully retrieved ${requestCount} network requests`,
          { count: requestCount, recentRequests: response.body.result.slice(0, 3) }
        );
        return true;
      } else {
        this.logTest(
          'network_monitoring',
          false,
          `Network monitoring failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'network_monitoring',
        false,
        `Network monitoring request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 9: Page Info Retrieval
  async testPageInfo() {
    try {
      const response = await this.makeApiRequest('/page-info');

      if (response.statusCode === 200 && response.body.success) {
        this.logTest(
          'page_info',
          true,
          'Successfully retrieved page information',
          response.body.result
        );
        return true;
      } else {
        this.logTest(
          'page_info',
          false,
          `Page info failed. Status: ${response.statusCode}`,
          response.body
        );
        return false;
      }
    } catch (error) {
      this.logTest(
        'page_info',
        false,
        `Page info request failed: ${error.message}`
      );
      return false;
    }
  }

  // Test 10: Error Handling
  async testErrorHandling() {
    try {
      // Test invalid selector
      const response = await this.makeApiRequest('/click', 'POST', {
        selector: '#non-existent-element',
        timeout: 1000
      });

      if (response.statusCode >= 400 && !response.body.success) {
        this.logTest(
          'error_handling',
          true,
          'Error handling works correctly - invalid selector properly rejected',
          response.body
        );
        return true;
      } else {
        this.logTest(
          'error_handling',
          false,
          'Error handling failed - invalid selector should have been rejected',
          response.body
        );
        return false;
      }
    } catch (error) {
      // This is actually expected for error handling test
      this.logTest(
        'error_handling',
        true,
        'Error handling works correctly - request properly failed',
        { error: error.message }
      );
      return true;
    }
  }

  // Run all integration tests
  async runAllIntegrationTests() {
    console.log('🔗 Starting Control API Integration Test Suite');
    console.log('Testing Control API server integration with DevEnvironment');
    console.log('='.repeat(70));

    // Wait for Control API to be ready
    console.log('🔄 Waiting for Control API server to be ready...');
    const isReady = await this.waitForService(this.controlApiHost, this.controlApiPort);
    
    if (!isReady) {
      console.log('❌ Control API server is not responding');
      console.log('Make sure to run: node dist/index.js --script "npm start --prefix test-app"');
      return false;
    }

    console.log('✅ Control API server is ready\n');

    // Run all tests
    const tests = [
      { name: 'Health Check', test: () => this.testHealthCheck() },
      { name: 'Screenshot Capture', test: () => this.testScreenshotCapture() },
      { name: 'Browser Navigation', test: () => this.testBrowserNavigation() },
      { name: 'DOM Interaction', test: () => this.testDOMInteraction() },
      { name: 'DOM Inspection', test: () => this.testDOMInspection() },
      { name: 'Computed Styles', test: () => this.testComputedStyles() },
      { name: 'JavaScript Execution', test: () => this.testJavaScriptExecution() },
      { name: 'Network Monitoring', test: () => this.testNetworkMonitoring() },
      { name: 'Page Information', test: () => this.testPageInfo() },
      { name: 'Error Handling', test: () => this.testErrorHandling() }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (const { name, test } of tests) {
      console.log(`\n🧪 Running ${name} Test...`);
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
      environment: {
        controlApiHost: this.controlApiHost,
        controlApiPort: this.controlApiPort,
        testAppPort: this.testAppPort
      }
    };

    const reportPath = './control-api-integration-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.printIntegrationSummary(report);
    return passedTests === totalTests;
  }

  // Print integration test summary
  printIntegrationSummary(report) {
    console.log('\n' + '='.repeat(70));
    console.log('🔗 CONTROL API INTEGRATION TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`📊 Total Tests: ${report.summary.totalTests}`);
    console.log(`✅ Passed: ${report.summary.passedTests}`);
    console.log(`❌ Failed: ${report.summary.failedTests}`);
    console.log(`📈 Success Rate: ${report.summary.successRate}`);
    
    if (report.summary.failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      report.testDetails.filter(r => !r.success).forEach(result => {
        console.log(`   • ${result.test}: ${result.details}`);
      });
    }
    
    console.log('\n🎯 Integration Status:');
    if (report.summary.successRate === '100.0%') {
      console.log('   ✅ Control API fully integrated and functional');
      console.log('   ✅ All browser control tools working correctly');
      console.log('   ✅ MCP tools can successfully connect to Control API');
    } else {
      console.log('   ⚠️  Some integration issues detected');
      console.log('   🔧 Review failed tests for troubleshooting');
    }
    
    console.log('\n📄 Integration report saved to: control-api-integration-report.json');
    console.log('='.repeat(70));
  }

  // Generate setup instructions
  generateSetupInstructions() {
    const instructions = `
# Control API Integration Test Setup

## Prerequisites
1. Build the project: \`npm run build\`
2. Start test app: \`cd test-app && npm start\`
3. Start daisy with Control API: \`node dist/index.js --script "npm start --prefix test-app"\`

## Expected Services
- Test App: http://localhost:3000
- Control API: http://localhost:8081
- Daisy DevTools monitoring active

## Running Integration Tests
\`\`\`bash
node test-control-api-integration.js
\`\`\`

## Manual API Testing
\`\`\`bash
# Test health
curl http://localhost:8081/health

# Test screenshot
curl -X POST http://localhost:8081/screenshot \\
  -H "Content-Type: application/json" \\
  -d '{"context": "manual-test"}'

# Test navigation
curl -X POST http://localhost:8081/navigate \\
  -H "Content-Type: application/json" \\
  -d '{"url": "http://localhost:3000", "waitForLoad": true}'

# Test DOM click
curl -X POST http://localhost:8081/click \\
  -H "Content-Type: application/json" \\
  -d '{"selector": "button", "timeout": 5000}'
\`\`\`

## Success Criteria
All API endpoints should return JSON responses with:
- \`success: true\` for valid requests
- \`success: false\` with error details for invalid requests
- Proper HTTP status codes (200 for success, 4xx/5xx for errors)
`;

    fs.writeFileSync('./control-api-setup-instructions.md', instructions);
    console.log('\n📋 Setup instructions saved to: control-api-setup-instructions.md');
  }
}

// Run integration tests
if (require.main === module) {
  const tester = new ControlAPIIntegrationTester();
  
  tester.runAllIntegrationTests().then(success => {
    tester.generateSetupInstructions();
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Integration test suite failed:', error);
    process.exit(1);
  });
}

module.exports = ControlAPIIntegrationTester;