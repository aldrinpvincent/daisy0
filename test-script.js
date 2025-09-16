// Simple test script to verify daisy functionality
console.log('Test script starting...');

setTimeout(() => {
  console.log('Test script is running');
}, 1000);

setTimeout(() => {
  console.log('Test script completed');
  process.exit(0);
}, 3000);