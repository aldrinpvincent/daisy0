const CDP = require('chrome-remote-interface');

async function demo() {
  console.log('🌼 Daisy demo test starting...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    const client = await CDP({ port: 9222 });
    const { Page, Runtime } = client;
    
    await Page.enable();
    await Runtime.enable();
    
    console.log('📱 Navigating to test app...');
    await Page.navigate({ url: 'http://localhost:5000' });
    await Page.loadEventFired();
    
    console.log('🎯 Triggering test interactions...');
    await Runtime.evaluate({
      expression: `
        console.log('✅ Demo test - Page loaded successfully');
        console.warn('⚠️ Demo test - Sample warning');
        console.error('❌ Demo test - Sample error');
        
        // Try some interactions if functions exist
        if (typeof logInfo === 'function') logInfo();
        if (typeof makeSuccessRequest === 'function') makeSuccessRequest();
      `
    });
    
    console.log('⏰ Demo complete - waiting for data capture...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await client.close();
  } catch (error) {
    console.error('Demo error:', error.message);
  }
}

demo();