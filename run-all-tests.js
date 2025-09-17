#!/usr/bin/env node

/**
 * Comprehensive End-to-End MCP Tools Test Runner
 * Executes all test suites and generates a complete validation report
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ComprehensiveTestRunner {
  constructor() {
    this.testSuites = [
      {
        name: 'MCP Tools Comprehensive Test',
        script: './test-mcp-tools.js',
        description: 'Tests all 16 MCP tools (5 log analysis + 11 browser control)',
        category: 'tool_functionality'
      },
      {
        name: 'Error Handling Test',
        script: './test-error-scenarios.js',
        description: 'Tests error handling for invalid selectors, timeouts, missing elements',
        category: 'error_handling'
      },
      {
        name: 'Control API Integration Test',
        script: './test-control-api-integration.js',
        description: 'Tests Control API server integration with DevEnvironment',
        category: 'integration'
      },
      {
        name: 'Core Functionality Test',
        script: './test-core-functionality.js',
        description: 'Tests screenshot capture, network monitoring, log parsing',
        category: 'core_functionality'
      }
    ];
    
    this.results = [];
    this.totalStartTime = Date.now();
  }

  // Run a single test script
  async runTestScript(testSuite) {
    return new Promise((resolve) => {
      console.log(`\n🚀 Running: ${testSuite.name}`);
      console.log(`📝 Description: ${testSuite.description}`);
      console.log('─'.repeat(80));

      const startTime = Date.now();
      let output = '';
      let errorOutput = '';

      const process = spawn('node', [testSuite.script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: __dirname
      });

      process.stdout.on('data', (data) => {
        const text = data.toString();
        console.log(text);
        output += text;
      });

      process.stderr.on('data', (data) => {
        const text = data.toString();
        console.error(text);
        errorOutput += text;
      });

      process.on('close', (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;

        const result = {
          ...testSuite,
          success,
          exitCode: code,
          duration,
          output,
          errorOutput,
          timestamp: new Date().toISOString()
        };

        this.results.push(result);

        console.log(`\n${success ? '✅' : '❌'} ${testSuite.name} ${success ? 'PASSED' : 'FAILED'} (${duration}ms)`);
        
        if (!success) {
          console.log(`Exit code: ${code}`);
          if (errorOutput) {
            console.log(`Error output: ${errorOutput.slice(0, 500)}`);
          }
        }

        resolve(result);
      });

      process.on('error', (error) => {
        console.error(`❌ Failed to start ${testSuite.name}:`, error);
        
        const result = {
          ...testSuite,
          success: false,
          exitCode: -1,
          duration: Date.now() - startTime,
          output,
          errorOutput: error.message,
          timestamp: new Date().toISOString()
        };

        this.results.push(result);
        resolve(result);
      });
    });
  }

  // Run all test suites
  async runAllTests() {
    console.log('🌼 COMPREHENSIVE MCP TOOLS VALIDATION');
    console.log('Testing all enhanced debugging capabilities end-to-end');
    console.log('='.repeat(80));
    console.log(`📅 Started: ${new Date().toISOString()}`);
    console.log(`📋 Test Suites: ${this.testSuites.length}`);
    console.log('='.repeat(80));

    // Check if test scripts exist
    const missingScripts = this.testSuites.filter(suite => !fs.existsSync(suite.script));
    if (missingScripts.length > 0) {
      console.log('❌ Missing test scripts:');
      missingScripts.forEach(suite => console.log(`   • ${suite.script}`));
      return false;
    }

    // Run each test suite
    for (const testSuite of this.testSuites) {
      await this.runTestScript(testSuite);
    }

    // Generate comprehensive report
    const report = this.generateComprehensiveReport();
    this.printFinalSummary(report);
    
    return report.summary.allTestsPassed;
  }

  // Generate comprehensive test report
  generateComprehensiveReport() {
    const totalDuration = Date.now() - this.totalStartTime;
    const passedSuites = this.results.filter(r => r.success).length;
    const failedSuites = this.results.filter(r => !r.success).length;

    const report = {
      metadata: {
        projectName: 'Daisy MCP Tools Validation',
        version: '1.0.0',
        testDate: new Date().toISOString(),
        totalDuration: `${totalDuration}ms`,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        }
      },
      summary: {
        totalTestSuites: this.testSuites.length,
        passedSuites,
        failedSuites,
        successRate: `${((passedSuites / this.testSuites.length) * 100).toFixed(1)}%`,
        allTestsPassed: failedSuites === 0
      },
      capabilities: {
        logAnalysisTools: 5,
        browserControlTools: 11,
        totalMCPTools: 16,
        testCoverage: {
          toolFunctionality: this.results.find(r => r.category === 'tool_functionality')?.success || false,
          errorHandling: this.results.find(r => r.category === 'error_handling')?.success || false,
          integration: this.results.find(r => r.category === 'integration')?.success || false,
          coreFunctionality: this.results.find(r => r.category === 'core_functionality')?.success || false
        }
      },
      testSuites: this.results.map(result => ({
        name: result.name,
        category: result.category,
        success: result.success,
        duration: result.duration,
        exitCode: result.exitCode,
        timestamp: result.timestamp
      })),
      detailedResults: this.results,
      recommendations: this.generateRecommendations()
    };

    // Save comprehensive report
    const reportPath = './comprehensive-mcp-tools-validation-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  // Generate recommendations based on test results
  generateRecommendations() {
    const recommendations = [];

    if (!this.results.every(r => r.success)) {
      recommendations.push({
        type: 'failure',
        message: 'Some test suites failed. Review individual test outputs for specific issues.',
        action: 'Check error logs and fix failing tests before deployment'
      });
    }

    const integrationTest = this.results.find(r => r.category === 'integration');
    if (!integrationTest?.success) {
      recommendations.push({
        type: 'critical',
        message: 'Control API integration test failed',
        action: 'Ensure Control API server is running and DevEnvironment is properly configured'
      });
    }

    const coreTest = this.results.find(r => r.category === 'core_functionality');
    if (!coreTest?.success) {
      recommendations.push({
        type: 'critical',
        message: 'Core functionality test failed',
        action: 'Verify screenshot capture, network monitoring, and log parsing are working'
      });
    }

    if (this.results.every(r => r.success)) {
      recommendations.push({
        type: 'success',
        message: 'All tests passed! MCP tools are fully validated and ready for use.',
        action: 'Deploy with confidence - all debugging capabilities are functional'
      });
    }

    return recommendations;
  }

  // Print final summary
  printFinalSummary(report) {
    console.log('\n' + '='.repeat(80));
    console.log('🌼 COMPREHENSIVE MCP TOOLS VALIDATION SUMMARY');
    console.log('='.repeat(80));
    
    console.log(`📊 Test Suites: ${report.summary.totalTestSuites}`);
    console.log(`✅ Passed: ${report.summary.passedSuites}`);
    console.log(`❌ Failed: ${report.summary.failedSuites}`);
    console.log(`📈 Success Rate: ${report.summary.successRate}`);
    console.log(`⏱️  Total Duration: ${report.metadata.totalDuration}`);

    console.log('\n🎯 Capability Validation:');
    Object.entries(report.capabilities.testCoverage).forEach(([capability, status]) => {
      const emoji = status ? '✅' : '❌';
      const name = capability.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`   ${emoji} ${name}`);
    });

    console.log('\n📋 Test Suite Results:');
    report.testSuites.forEach(suite => {
      const emoji = suite.success ? '✅' : '❌';
      console.log(`   ${emoji} ${suite.name} (${suite.duration}ms)`);
    });

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => {
        const emoji = rec.type === 'success' ? '🎉' : rec.type === 'critical' ? '🚨' : '⚠️';
        console.log(`   ${emoji} ${rec.message}`);
        console.log(`      Action: ${rec.action}`);
      });
    }

    console.log('\n🛠️  MCP Tools Validated:');
    console.log(`   🔍 Log Analysis Tools: ${report.capabilities.logAnalysisTools}`);
    console.log(`   🌐 Browser Control Tools: ${report.capabilities.browserControlTools}`);
    console.log(`   📊 Total MCP Tools: ${report.capabilities.totalMCPTools}`);

    if (report.summary.allTestsPassed) {
      console.log('\n🎉 SUCCESS: All MCP tools are validated and ready for AI debugging!');
      console.log('   ✅ AI assistants now have comprehensive browser debugging capabilities');
      console.log('   ✅ Complete "eyes and hands" functionality implemented');
      console.log('   ✅ End-to-end debugging workflow validated');
    } else {
      console.log('\n⚠️  ISSUES DETECTED: Some tests failed - review before deployment');
    }

    console.log('\n📄 Comprehensive report: comprehensive-mcp-tools-validation-report.json');
    console.log('='.repeat(80));
  }

  // Generate setup instructions
  generateSetupInstructions() {
    const instructions = `
# MCP Tools Comprehensive Test Setup & Execution Guide

## Prerequisites
1. **Build the project**:
   \`\`\`bash
   npm run build
   \`\`\`

2. **Start the test application**:
   \`\`\`bash
   cd test-app
   npm start
   # Should be running on http://localhost:3000
   \`\`\`

3. **Start Daisy with Control API** (in new terminal):
   \`\`\`bash
   node dist/index.js --script "npm start --prefix test-app"
   # This starts:
   # - Chrome debugging on port 9222
   # - Control API server on port 8081
   # - DevTools monitoring
   # - Log capture
   \`\`\`

## Running All Tests
\`\`\`bash
# Run comprehensive validation
node run-all-tests.js

# Or run individual test suites:
node test-mcp-tools.js              # Test all 16 MCP tools
node test-error-scenarios.js        # Test error handling
node test-control-api-integration.js # Test Control API integration
node test-core-functionality.js     # Test core capabilities
\`\`\`

## Test Coverage Summary

### 🔍 Log Analysis Tools (5)
- \`analyze_logs\` - Parse and categorize log entries
- \`find_errors\` - Extract JavaScript/network/console errors
- \`performance_insights\` - Analyze performance metrics
- \`suggest_fixes\` - Provide debugging suggestions
- \`get_log_summary\` - Generate session summaries

### 🌐 Browser Control Tools (11)
- \`take_screenshot\` - Capture page screenshots
- \`browser_navigate\` - Navigate to URLs
- \`browser_click\` - Click DOM elements
- \`browser_type\` - Type in form fields
- \`browser_scroll\` - Scroll to elements
- \`inspect_dom\` - Inspect element properties
- \`get_computed_styles\` - Get CSS styles
- \`evaluate_javascript\` - Execute JavaScript
- \`wait_for_element\` - Wait for elements
- \`wait_for_network_idle\` - Wait for network idle
- \`inspect_network_tab\` - Get network requests

### 🧪 Test Categories
1. **Tool Functionality**: All 16 MCP tools work correctly
2. **Error Handling**: Invalid inputs handled gracefully
3. **Integration**: Control API ↔ DevEnvironment ↔ MCP Server
4. **Core Functionality**: Screenshots, network monitoring, log parsing

## Expected Results
- **100% Success Rate**: All test suites pass
- **Screenshots**: Automatically captured on errors
- **Network Monitoring**: Ring buffer captures requests
- **Log Analysis**: Structured parsing and categorization
- **Error Handling**: Graceful failures with descriptive messages

## Troubleshooting
1. **Control API not responding**: 
   - Check if Daisy is running: \`curl http://localhost:8081/health\`
   - Restart Daisy environment

2. **Test app not accessible**:
   - Verify test app: \`curl http://localhost:3000\`
   - Check port conflicts

3. **Screenshot failures**:
   - Ensure screenshots directory exists
   - Check Chrome debugging connection

4. **Network monitoring issues**:
   - Verify DevTools monitoring is active
   - Check Chrome remote debugging port

## Success Criteria
✅ All 16 MCP tools functional
✅ Error handling robust
✅ Control API integration working
✅ Core debugging capabilities validated
✅ AI assistants can use all tools
✅ Complete debugging workflow functional

## Next Steps After Validation
1. Configure MCP server with AI assistant
2. Test real debugging scenarios
3. Deploy to production environment
4. Monitor MCP tool usage and performance
`;

    fs.writeFileSync('./MCP-TOOLS-TEST-GUIDE.md', instructions);
    console.log('📋 Setup instructions saved to: MCP-TOOLS-TEST-GUIDE.md');
  }
}

// Main execution
if (require.main === module) {
  const runner = new ComprehensiveTestRunner();
  
  runner.runAllTests().then(success => {
    runner.generateSetupInstructions();
    
    console.log('\n🎯 Test Execution Complete!');
    console.log(`Result: ${success ? 'SUCCESS' : 'FAILURES DETECTED'}`);
    
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = ComprehensiveTestRunner;