// Daisy Test Application JavaScript

let requestCounter = 0;

// Utility function to add results to the page
function addResult(message, type = 'info') {
    const results = document.getElementById('results');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong>: ${message}`;
    results.appendChild(entry);
    results.scrollTop = results.scrollHeight;
}

// Update status
function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

// Console Logging Tests
function testConsoleInfo() {
    const message = `Info log test #${++requestCounter}`;
    console.log(message, { timestamp: new Date().toISOString(), level: 'info' });
    addResult(`Console.log: ${message}`, 'info');
    updateStatus('Generated console info log');
}

function testConsoleWarn() {
    const message = `Warning log test #${++requestCounter}`;
    console.warn(message, { timestamp: new Date().toISOString(), level: 'warn' });
    addResult(`Console.warn: ${message}`, 'warn');
    updateStatus('Generated console warning');
}

function testConsoleError() {
    const message = `Error log test #${++requestCounter}`;
    console.error(message, { timestamp: new Date().toISOString(), level: 'error' });
    addResult(`Console.error: ${message}`, 'error');
    updateStatus('Generated console error');
}

function testConsoleGroup() {
    console.group('🔍 Grouped Log Test');
    console.log('This is inside a group');
    console.log('Multiple items in group:', { a: 1, b: 2, c: 3 });
    console.warn('Group warning');
    console.groupEnd();
    addResult('Generated grouped console logs', 'info');
    updateStatus('Generated grouped logs');
}

// Network Request Tests
async function testSuccessRequest() {
    try {
        updateStatus('Making success request...');
        const response = await fetch('/api/success');
        const data = await response.json();
        console.log('Success response:', data);
        addResult(`Success request: ${JSON.stringify(data)}`, 'info');
        updateStatus('Success request completed');
    } catch (error) {
        console.error('Request failed:', error);
        addResult(`Request failed: ${error.message}`, 'error');
    }
}

async function testSlowRequest() {
    try {
        updateStatus('Making slow request (2s delay)...');
        const startTime = performance.now();
        const response = await fetch('/api/slow');
        const endTime = performance.now();
        const data = await response.json();
        const duration = Math.round(endTime - startTime);
        console.log('Slow response:', data, `(${duration}ms)`);
        addResult(`Slow request completed in ${duration}ms`, 'warn');
        updateStatus(`Slow request completed (${duration}ms)`);
    } catch (error) {
        console.error('Slow request failed:', error);
        addResult(`Slow request failed: ${error.message}`, 'error');
    }
}

async function testErrorRequest() {
    try {
        updateStatus('Making error request...');
        const response = await fetch('/api/error');
        const data = await response.json();
        console.error('Server error response:', data);
        addResult(`Server error (${response.status}): ${data.message}`, 'error');
        updateStatus('Error request completed');
    } catch (error) {
        console.error('Error request failed:', error);
        addResult(`Error request failed: ${error.message}`, 'error');
    }
}

async function testNotFoundRequest() {
    try {
        updateStatus('Making 404 request...');
        const response = await fetch('/api/notfound');
        const data = await response.json();
        console.warn('404 response:', data);
        addResult(`404 response: ${data.message}`, 'warn');
        updateStatus('404 request completed');
    } catch (error) {
        console.error('404 request failed:', error);
        addResult(`404 request failed: ${error.message}`, 'error');
    }
}

async function testPostRequest() {
    try {
        updateStatus('Making POST request...');
        const postData = {
            user: 'test-user',
            action: 'daisy-test',
            timestamp: new Date().toISOString(),
            data: { counter: requestCounter }
        };
        
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(postData)
        });
        
        const data = await response.json();
        console.log('POST response:', data);
        addResult(`POST request: ${JSON.stringify(data)}`, 'info');
        updateStatus('POST request completed');
    } catch (error) {
        console.error('POST request failed:', error);
        addResult(`POST request failed: ${error.message}`, 'error');
    }
}

// JavaScript Error Tests
function testReferenceError() {
    try {
        updateStatus('Generating reference error...');
        // This will cause a ReferenceError
        console.log(undefinedVariable);
    } catch (error) {
        console.error('Caught ReferenceError:', error);
        addResult(`ReferenceError: ${error.message}`, 'error');
        updateStatus('ReferenceError generated');
    }
}

function testTypeError() {
    try {
        updateStatus('Generating type error...');
        // This will cause a TypeError
        const nullValue = null;
        nullValue.someMethod();
    } catch (error) {
        console.error('Caught TypeError:', error);
        addResult(`TypeError: ${error.message}`, 'error');
        updateStatus('TypeError generated');
    }
}

function testCustomError() {
    try {
        updateStatus('Generating custom error...');
        throw new Error('This is a custom test error for daisy debugging');
    } catch (error) {
        console.error('Caught custom error:', error);
        addResult(`Custom Error: ${error.message}`, 'error');
        updateStatus('Custom error generated');
    }
}

function testUnhandledPromise() {
    updateStatus('Generating unhandled promise rejection...');
    // This will create an unhandled promise rejection
    Promise.reject(new Error('Unhandled promise rejection for daisy testing'));
    addResult('Generated unhandled promise rejection', 'error');
    updateStatus('Promise rejection generated');
}

// Performance Tests
function testDOMManipulation() {
    updateStatus('Running DOM manipulation test...');
    const startTime = performance.now();
    
    // Create and manipulate DOM elements
    for (let i = 0; i < 1000; i++) {
        const div = document.createElement('div');
        div.textContent = `Test element ${i}`;
        div.style.display = 'none';
        document.body.appendChild(div);
    }
    
    // Remove the elements
    const testElements = document.querySelectorAll('div[style*="display: none"]');
    testElements.forEach(el => el.remove());
    
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    console.log(`DOM manipulation test completed in ${duration}ms`);
    addResult(`DOM manipulation: ${duration}ms (created/removed 1000 elements)`, 'info');
    updateStatus(`DOM test completed (${duration}ms)`);
}

function testLargeDataProcessing() {
    updateStatus('Running data processing test...');
    const startTime = performance.now();
    
    // Process large array
    const largeArray = Array.from({ length: 100000 }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
        timestamp: Date.now()
    }));
    
    const filtered = largeArray.filter(item => item.value > 500);
    const mapped = filtered.map(item => ({ ...item, processed: true }));
    const sum = mapped.reduce((acc, item) => acc + item.value, 0);
    
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    console.log(`Data processing completed in ${duration}ms`, {
        originalLength: largeArray.length,
        filteredLength: filtered.length,
        sum: sum.toFixed(2)
    });
    
    addResult(`Data processing: ${duration}ms (processed ${largeArray.length} items)`, 'info');
    updateStatus(`Data processing completed (${duration}ms)`);
}

function testMemoryUsage() {
    updateStatus('Running memory usage test...');
    
    // Create large objects to test memory
    const memoryTest = [];
    for (let i = 0; i < 10000; i++) {
        memoryTest.push({
            id: i,
            data: new Array(100).fill(`memory-test-${i}`),
            nested: {
                level1: { level2: { level3: `deep-${i}` } }
            }
        });
    }
    
    console.log('Memory test objects created:', {
        count: memoryTest.length,
        sampleItem: memoryTest[0]
    });
    
    // Check memory usage if available
    if (performance.memory) {
        console.log('Memory usage:', {
            usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
            totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB'
        });
    }
    
    addResult(`Memory test: Created ${memoryTest.length} objects`, 'info');
    updateStatus('Memory test completed');
    
    // Clean up
    memoryTest.length = 0;
}

function testTimingAPI() {
    updateStatus('Testing Performance Timing API...');
    
    performance.mark('daisy-test-start');
    
    setTimeout(() => {
        performance.mark('daisy-test-end');
        performance.measure('daisy-test-duration', 'daisy-test-start', 'daisy-test-end');
        
        const entries = performance.getEntriesByName('daisy-test-duration');
        if (entries.length > 0) {
            const duration = entries[0].duration;
            console.log('Performance timing:', {
                name: entries[0].name,
                duration: `${duration.toFixed(2)}ms`,
                startTime: entries[0].startTime,
                entryType: entries[0].entryType
            });
            
            addResult(`Performance timing: ${duration.toFixed(2)}ms`, 'info');
            updateStatus(`Timing test completed (${duration.toFixed(2)}ms)`);
        }
        
        // Clean up performance entries
        performance.clearMarks();
        performance.clearMeasures();
    }, 100);
}

// Custom Tests
function testCustomLog() {
    const customMessage = document.getElementById('customMessage').value || 'Default custom message';
    console.log('Custom test:', customMessage, {
        timestamp: new Date().toISOString(),
        counter: ++requestCounter,
        userGenerated: true
    });
    addResult(`Custom log: ${customMessage}`, 'info');
    updateStatus('Custom log generated');
    document.getElementById('customMessage').value = '';
}

function clearResults() {
    document.getElementById('results').innerHTML = '';
    updateStatus('Results cleared');
}

// MCP Tool Testing Functions
function handleMCPClick(type) {
    const timestamp = new Date().toISOString();
    console.log(`MCP Click Test: ${type} button clicked`, { timestamp, type });
    addResult(`MCP Click Test: ${type} button clicked`, 'info');
    updateStatus(`MCP ${type} button clicked`);
}

function showDelayedElement() {
    updateStatus('Showing element after 2 second delay...');
    addResult('Starting delayed element show test', 'info');
    
    setTimeout(() => {
        const element = document.getElementById('mcpDelayedElement');
        element.style.display = 'block';
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.5s ease';
        
        // Fade in the element
        setTimeout(() => {
            element.style.opacity = '1';
        }, 50);
        
        console.log('Delayed element is now visible', { 
            timestamp: new Date().toISOString(),
            elementId: 'mcpDelayedElement',
            visible: true 
        });
        addResult('Delayed element is now visible', 'info');
        updateStatus('Delayed element shown - ready for MCP testing');
    }, 2000);
}

function hideElement() {
    const element = document.getElementById('mcpDelayedElement');
    element.style.display = 'none';
    element.style.opacity = '0';
    
    console.log('Element hidden for MCP testing', { 
        timestamp: new Date().toISOString(),
        elementId: 'mcpDelayedElement',
        visible: false 
    });
    addResult('Element hidden', 'info');
    updateStatus('Element hidden - ready for wait_for_element testing');
}

// Test MCP JavaScript evaluation capabilities
function testMCPJavaScript() {
    // This function can be called by evaluate_javascript MCP tool
    const testData = {
        timestamp: new Date().toISOString(),
        pageTitle: document.title,
        inputValues: {
            customMessage: document.getElementById('customMessage').value,
            mcpTestInput: document.getElementById('mcpTestInput').value,
            mcpEmailInput: document.getElementById('mcpEmailInput').value,
            mcpTextarea: document.getElementById('mcpTextarea').value
        },
        elementCounts: {
            buttons: document.querySelectorAll('button').length,
            inputs: document.querySelectorAll('input').length,
            divs: document.querySelectorAll('div').length
        },
        windowDimensions: {
            width: window.innerWidth,
            height: window.innerHeight
        }
    };
    
    console.log('MCP JavaScript evaluation test data:', testData);
    return testData;
}

// Generate artificial network activity for network monitoring tests
function generateNetworkActivity() {
    updateStatus('Generating network activity for MCP testing...');
    
    const requests = [
        fetch('/api/success'),
        fetch('/api/slow'),
        fetch('/api/error').catch(() => {}), // Catch to prevent unhandled rejection
        fetch('/api/notfound').catch(() => {})
    ];
    
    Promise.allSettled(requests).then(results => {
        console.log('Network activity completed for MCP testing', {
            timestamp: new Date().toISOString(),
            requestCount: requests.length,
            results: results.map(r => r.status)
        });
        addResult(`Generated ${requests.length} network requests for MCP testing`, 'info');
        updateStatus('Network activity completed');
    });
}

// Test MCP form interaction
function testMCPFormInteraction() {
    const inputs = {
        mcpTestInput: 'MCP Test Value',
        mcpEmailInput: 'mcp@test.com',
        mcpTextarea: 'This is a test message for MCP browser_type tool validation.'
    };
    
    // Fill inputs programmatically (simulating MCP tool behavior)
    Object.entries(inputs).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    
    console.log('MCP form interaction test completed', {
        timestamp: new Date().toISOString(),
        inputs
    });
    addResult('MCP form inputs filled programmatically', 'info');
    updateStatus('Form interaction test completed');
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌼 Daisy Test Application Loaded');
    console.log('Application ready for debugging tests', {
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    });
    
    updateStatus('Application loaded - Ready for testing!');
    addResult('Daisy Test Application initialized', 'info');
    
    // Expose MCP testing functions to global scope for evaluate_javascript testing
    window.testMCPJavaScript = testMCPJavaScript;
    window.generateNetworkActivity = generateNetworkActivity;
    window.testMCPFormInteraction = testMCPFormInteraction;
    window.handleMCPClick = handleMCPClick;
    window.showDelayedElement = showDelayedElement;
    window.hideElement = hideElement;
    
    console.log('MCP testing functions exposed to global scope', {
        functions: ['testMCPJavaScript', 'generateNetworkActivity', 'testMCPFormInteraction', 'handleMCPClick', 'showDelayedElement', 'hideElement']
    });
    
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection detected:', event.reason);
        addResult(`Unhandled rejection: ${event.reason}`, 'error');
    });
});