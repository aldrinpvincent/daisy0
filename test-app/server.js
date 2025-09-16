const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(__dirname));
app.use(express.json());

// Routes for testing different scenarios
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoints for testing network requests
app.get('/api/success', (req, res) => {
  res.json({ message: 'Success response', timestamp: new Date().toISOString() });
});

app.get('/api/slow', (req, res) => {
  setTimeout(() => {
    res.json({ message: 'Slow response after 2s', timestamp: new Date().toISOString() });
  }, 2000);
});

app.get('/api/error', (req, res) => {
  res.status(500).json({ error: 'Internal server error', message: 'This is a test error' });
});

app.get('/api/notfound', (req, res) => {
  res.status(404).json({ error: 'Not found', message: 'This endpoint does not exist' });
});

app.post('/api/data', (req, res) => {
  console.log('Received POST data:', req.body);
  res.json({ message: 'Data received', data: req.body, timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Test app running on http://localhost:${PORT}`);
  console.log(`Use daisy to debug: node dist/index.js --script "npm start --prefix test-app"`);
});