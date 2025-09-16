// Test App JavaScript - Generates various debugging events

let elementCounter = 0;

// Console logging functions
function logInfo() {
    console.log('ℹ️ This is an info message from the test app', { timestamp: new Date().toISOString() });
    updateLogOutput('INFO logged to console');
}

function logWarning() {
    console.warn('⚠️ This is a warning message', { data: 'sample warning data', level: 'warn' });
    updateLogOutput('WARNING logged to console');
}

function logError() {
    console.error('🚨 This is an error message', { error: 'Sample error data', stack: 'fake-stack-trace' });
    updateLogOutput('ERROR logged to console');
}

function logDebug() {
    console.debug('🐛 Debug information', { debugData: 'detailed debug info', variables: { a: 1, b: 2 } });
    updateLogOutput('DEBUG logged to console');
}

function updateLogOutput(message) {
    const output = document.getElementById('log-output');
    const timestamp = new Date().toLocaleTimeString();
    output.innerHTML += `[${timestamp}] ${message}<br>`;
    output.scrollTop = output.scrollHeight;
}

// Network request functions
async function makeSuccessRequest() {
    try {
        updateNetworkStatus('Making successful API call...', 'info');
        const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        const data = await response.json();
        console.log('✅ API Response received:', data);
        updateNetworkStatus(`Success! Received post: "${data.title}"`, 'success');
    } catch (error) {
        console.error('Failed to fetch data:', error);
        updateNetworkStatus('Request failed: ' + error.message, 'error');
    }
}

async function make404Request() {
    try {
        updateNetworkStatus('Making 404 request...', 'info');
        const response = await fetch('https://jsonplaceholder.typicode.com/posts/999999');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Response:', data);
    } catch (error) {
        console.error('🚨 404 Request failed:', error);
        updateNetworkStatus('Expected 404 error: ' + error.message, 'error');
    }
}

async function makeSlowRequest() {
    try {
        updateNetworkStatus('Making slow request (3s delay)...', 'info');
        const response = await fetch('https://httpbin.org/delay/3');
        const data = await response.json();
        console.log('⏰ Slow request completed:', data);
        updateNetworkStatus('Slow request completed successfully', 'success');
    } catch (error) {
        console.error('Slow request failed:', error);
        updateNetworkStatus('Slow request failed: ' + error.message, 'error');
    }
}

async function makePostRequest() {
    try {
        updateNetworkStatus('Making POST request...', 'info');
        const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: 'Test Post from Daisy App',
                body: 'This is a test POST request body',
                userId: 1,
                timestamp: new Date().toISOString()
            })
        });
        const data = await response.json();
        console.log('📤 POST Response:', data);
        updateNetworkStatus('POST request successful, created post ID: ' + data.id, 'success');
    } catch (error) {
        console.error('POST request failed:', error);
        updateNetworkStatus('POST request failed: ' + error.message, 'error');
    }
}

function updateNetworkStatus(message, type) {
    const status = document.getElementById('network-status');
    status.innerHTML = `<div class="${type === 'error' ? 'error' : 'success'}">${message}</div>`;
}

// Error generation functions
function throwError() {
    console.log('🚨 About to throw an intentional error...');
    throw new Error('This is an intentional test error with stack trace');
}

function undefinedError() {
    console.log('🚨 About to access undefined variable...');
    try {
        console.log(nonExistentVariable.someProperty);
    } catch (error) {
        console.error('Caught undefined variable error:', error);
        throw error;
    }
}

async function asyncError() {
    console.log('🚨 About to create an async error...');
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error('This is an async error with timeout'));
        }, 1000);
    });
}

// DOM manipulation functions
function addElement() {
    elementCounter++;
    const container = document.getElementById('dynamic-content');
    const newElement = document.createElement('div');
    newElement.id = `element-${elementCounter}`;
    newElement.innerHTML = `<p>Dynamic Element #${elementCounter} <button onclick="removeSpecificElement('element-${elementCounter}')">Remove This</button></p>`;
    newElement.style.background = '#e8f5e8';
    newElement.style.padding = '10px';
    newElement.style.margin = '5px';
    newElement.style.border = '1px solid #4CAF50';
    newElement.style.borderRadius = '4px';
    container.appendChild(newElement);
    console.log(`➕ Added element: element-${elementCounter}`);
}

function modifyElement() {
    const elements = document.querySelectorAll('#dynamic-content > div');
    if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        randomElement.style.background = '#ffe8e8';
        randomElement.style.border = '2px solid #f44336';
        randomElement.innerHTML += ' <strong>[MODIFIED]</strong>';
        console.log('🔧 Modified element:', randomElement.id);
    } else {
        console.warn('⚠️ No elements to modify. Add some elements first.');
    }
}

function removeElement() {
    const elements = document.querySelectorAll('#dynamic-content > div');
    if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        const elementId = randomElement.id;
        randomElement.remove();
        console.log(`🗑️ Removed element: ${elementId}`);
    } else {
        console.warn('⚠️ No elements to remove. Add some elements first.');
    }
}

function removeSpecificElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.remove();
        console.log(`🗑️ Removed specific element: ${elementId}`);
    }
}

// Performance testing functions
function heavyComputation() {
    console.log('⚡ Starting heavy computation...');
    const start = performance.now();
    
    // Simulate heavy computation
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
        result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
    }
    
    const end = performance.now();
    const duration = end - start;
    
    console.log(`🎯 Heavy computation completed in ${duration.toFixed(2)}ms, result: ${result.toFixed(2)}`);
    performance.mark('heavy-computation-end');
    performance.measure('heavy-computation', 'heavy-computation-start', 'heavy-computation-end');
}

function memoryTest() {
    console.log('🧠 Starting memory test...');
    
    // Create a large array to test memory usage
    const largeArray = new Array(100000).fill(0).map((_, i) => ({
        id: i,
        data: `data-${i}`,
        timestamp: new Date().toISOString(),
        randomValue: Math.random()
    }));
    
    console.log(`📊 Created array with ${largeArray.length} objects`);
    
    // Log memory usage if available
    if (performance.memory) {
        console.log('Memory usage:', {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        });
    }
    
    // Clean up
    setTimeout(() => {
        console.log('🧹 Cleaning up memory test data...');
    }, 2000);
}

function performanceMarker() {
    console.log('📊 Creating performance markers...');
    performance.mark('test-marker-start');
    
    setTimeout(() => {
        performance.mark('test-marker-end');
        performance.measure('test-duration', 'test-marker-start', 'test-marker-end');
        
        const measures = performance.getEntriesByType('measure');
        console.log('Performance measures:', measures);
    }, 1000);
}

// Form handling
function handleFormSubmit(event) {
    event.preventDefault();
    
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const message = document.getElementById('message').value;
    
    console.log('📝 Form submitted with data:', { name, email, message });
    
    const resultDiv = document.getElementById('form-result');
    resultDiv.innerHTML = `<div class="success">Form submitted successfully! Data logged to console.</div>`;
    
    // Simulate form processing
    setTimeout(() => {
        console.log('✅ Form processing completed');
        document.getElementById('test-form').reset();
        resultDiv.innerHTML = '<div class="success">Form processed and reset!</div>';
    }, 1500);
}

// Initialize performance marker
performance.mark('heavy-computation-start');

// Page load logging
window.addEventListener('load', () => {
    console.log('🚀 Test app fully loaded and ready!');
    console.log('App initialization complete at:', new Date().toISOString());
});

// Error handling for unhandled errors
window.addEventListener('error', (event) => {
    console.error('🚨 Unhandled error caught by window error handler:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });
});

// Log page navigation
window.addEventListener('beforeunload', () => {
    console.log('👋 Page is about to unload');
});