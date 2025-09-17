#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { program } = require('commander');

// CLI configuration
program
  .name('daisy-web-viewer')
  .description('Web interface for viewing daisy debugging logs')
  .version('1.0.0')
  .option('-f, --log-file <path>', 'Path to daisy log file', './debug.log')
  .option('-s, --screenshots-dir <path>', 'Directory containing screenshots', './screenshots')
  .option('-p, --port <number>', 'Port to run server on', '5000')
  .option('--host <host>', 'Host to bind server to', '0.0.0.0')
  .parse();

const options = program.opts();

const app = express();
const PORT = parseInt(options.port);
const HOST = options.host;
const LOG_FILE = path.resolve(options.logFile);
const SCREENSHOTS_DIR = path.resolve(options.screenshotsDir);

// Store for parsed logs and real-time connections
let logs = [];
let stats = {
  total: 0,
  console: 0,
  network: 0,
  error: 0,
  performance: 0,
  page: 0,
  security: 0,
  runtime: 0,
  levels: { info: 0, warn: 0, error: 0, debug: 0 }
};
let sseClients = [];

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache control and CORS headers
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

// Log Parser - handles daisy's markdown header + JSON format
class DaisyLogParser {
  constructor() {
    this.sessionMetadata = null;
    this.parseState = 'header'; // 'header', 'content'
  }

  parseLogFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Log file not found: ${filePath}`);
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return this.parseContent(content);
    } catch (error) {
      console.error('Error reading log file:', error);
      return [];
    }
  }

  parseContent(content) {
    const parsedLogs = [];
    
    // Split content by lines and look for complete JSON objects
    const lines = content.split('\n');
    let currentJsonBuffer = '';
    let inJsonObject = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines, markdown headers, and separators
      if (!line || line === '---' || line.startsWith('# Daisy') || line.startsWith('"daisy_session_start"')) {
        continue;
      }

      // Detect start of JSON object
      if (line.startsWith('{') && !inJsonObject) {
        inJsonObject = true;
        currentJsonBuffer = line;
        braceCount = this.countBraces(line);
        
        // Check if it's a complete single-line JSON
        if (braceCount === 0) {
          this.tryParseAndAdd(currentJsonBuffer, parsedLogs);
          currentJsonBuffer = '';
          inJsonObject = false;
        }
      } else if (inJsonObject) {
        // Continue building multi-line JSON
        currentJsonBuffer += '\n' + line;
        braceCount += this.countBraces(line);
        
        // Check if JSON object is complete
        if (braceCount <= 0) {
          this.tryParseAndAdd(currentJsonBuffer, parsedLogs);
          currentJsonBuffer = '';
          inJsonObject = false;
          braceCount = 0;
        }
      }
    }
    
    // Handle any remaining JSON buffer
    if (currentJsonBuffer && inJsonObject) {
      this.tryParseAndAdd(currentJsonBuffer, parsedLogs);
    }

    console.log(`Parsed ${parsedLogs.length} valid log entries`);
    return parsedLogs;
  }

  countBraces(line) {
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    return openBraces - closeBraces;
  }

  tryParseAndAdd(jsonBuffer, parsedLogs) {
    try {
      const logEntry = JSON.parse(jsonBuffer);
      
      // Only add valid log entries (must have timestamp, type, level, source)
      if (this.isValidLogEntry(logEntry)) {
        parsedLogs.push(this.enrichLogEntry(logEntry));
      }
    } catch (e) {
      // Silently ignore parsing errors for non-log JSON objects
    }
  }

  isValidLogEntry(entry) {
    return entry && 
           typeof entry === 'object' &&
           entry.timestamp &&
           entry.type &&
           entry.level &&
           entry.source;
  }

  enrichLogEntry(entry) {
    // Add computed fields for easier frontend handling
    const enriched = {
      ...entry,
      id: this.generateId(entry),
      displayTime: this.formatTime(entry.timestamp),
      hasScreenshot: this.checkForScreenshot(entry),
      summary: this.generateSummary(entry)
    };

    return enriched;
  }

  generateId(entry) {
    // Create a semi-unique ID based on timestamp and content
    const content = JSON.stringify(entry.data || '');
    return `${entry.timestamp}_${content.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  formatTime(timestamp) {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3
      });
    } catch (e) {
      return timestamp;
    }
  }

  checkForScreenshot(entry) {
    // Check if there's a corresponding screenshot for error entries
    if (entry.level === 'error' && entry.timestamp) {
      const screenshotPattern = entry.timestamp.replace(/[:.]/g, '-');
      return fs.readdirSync(SCREENSHOTS_DIR).some(file => 
        file.includes(screenshotPattern.substring(0, 16))
      );
    }
    return false;
  }

  generateSummary(entry) {
    switch (entry.type) {
      case 'console':
        return entry.data?.message || 'Console message';
      case 'network':
        const method = entry.data?.method || 'UNKNOWN';
        const url = entry.data?.url || 'unknown URL';
        const status = entry.data?.status || entry.context?.statusCode || '?';
        return `${method} ${url} (${status})`;
      case 'error':
        return entry.data?.message || entry.data?.name || 'Runtime error';
      case 'performance':
        return `${entry.data?.metric || 'Performance'}: ${entry.data?.details || ''}`;
      case 'page':
        return `Page ${entry.data?.event || 'event'}: ${entry.data?.details || ''}`;
      default:
        return `${entry.type} event`;
    }
  }
}

const parser = new DaisyLogParser();

// Update statistics
function updateStats(logs) {
  stats.total = logs.length;
  stats.console = logs.filter(l => l.type === 'console').length;
  stats.network = logs.filter(l => l.type === 'network').length;
  stats.error = logs.filter(l => l.type === 'error').length;
  stats.performance = logs.filter(l => l.type === 'performance').length;
  stats.page = logs.filter(l => l.type === 'page').length;
  stats.security = logs.filter(l => l.type === 'security').length;
  stats.runtime = logs.filter(l => l.type === 'runtime').length;
  
  stats.levels = {
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    debug: logs.filter(l => l.level === 'debug').length
  };
}

// Load initial logs
function loadLogs() {
  console.log(`Loading logs from: ${LOG_FILE}`);
  logs = parser.parseLogFile(LOG_FILE);
  updateStats(logs);
  console.log(`Loaded ${logs.length} log entries`);
}

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    logFile: LOG_FILE,
    screenshotsDir: SCREENSHOTS_DIR,
    logsLoaded: logs.length,
    fileExists: fs.existsSync(LOG_FILE)
  });
});

// Get logs with filtering
app.get('/api/logs', (req, res) => {
  const { 
    type, 
    level, 
    search, 
    limit = '100', 
    offset = '0',
    since 
  } = req.query;

  let filteredLogs = [...logs];

  // Apply filters
  if (type) {
    filteredLogs = filteredLogs.filter(log => log.type === type);
  }
  
  if (level) {
    filteredLogs = filteredLogs.filter(log => log.level === level);
  }
  
  if (search) {
    const searchTerm = search.toLowerCase();
    filteredLogs = filteredLogs.filter(log => 
      JSON.stringify(log).toLowerCase().includes(searchTerm)
    );
  }
  
  if (since) {
    filteredLogs = filteredLogs.filter(log => 
      new Date(log.timestamp) >= new Date(since)
    );
  }

  // Sort by timestamp (newest first)
  filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply pagination
  const limitNum = parseInt(limit);
  const offsetNum = parseInt(offset);
  const paginatedLogs = filteredLogs.slice(offsetNum, offsetNum + limitNum);

  res.json({
    logs: paginatedLogs,
    total: filteredLogs.length,
    offset: offsetNum,
    limit: limitNum
  });
});

// Get statistics
app.get('/api/stats', (req, res) => {
  res.json(stats);
});

// Server-Sent Events for real-time updates
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Add client to list
  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.push(client);

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`SSE client ${clientId} disconnected. Active clients: ${sseClients.length}`);
  });

  req.on('error', (err) => {
    console.error('SSE client error:', err);
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Screenshot serving with path sanitization
app.get('/screenshots/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Sanitize filename to prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const screenshotPath = path.join(SCREENSHOTS_DIR, filename);
  
  if (!fs.existsSync(screenshotPath)) {
    return res.status(404).json({ error: 'Screenshot not found' });
  }

  res.sendFile(screenshotPath);
});

// Broadcast to all SSE clients
function broadcastToClients(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(message);
    } catch (error) {
      console.error('Error sending SSE message:', error);
    }
  });
}

// File watcher for real-time updates
function setupFileWatcher() {
  if (!fs.existsSync(LOG_FILE)) {
    console.warn(`Log file does not exist yet: ${LOG_FILE}`);
    console.log('Will start watching once file is created...');
  }

  let debounceTimer = null;
  let lastFileSize = 0;

  const watcher = chokidar.watch(LOG_FILE, {
    persistent: true,
    usePolling: false,
    ignoreInitial: true
  });

  watcher.on('change', () => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce file changes to prevent spam
    debounceTimer = setTimeout(() => {
      try {
        // Check if file actually has new content
        if (fs.existsSync(LOG_FILE)) {
          const stats = fs.statSync(LOG_FILE);
          if (stats.size === lastFileSize) {
            return; // File size hasn't changed, skip reload
          }
          lastFileSize = stats.size;
        }

        console.log('🔄 Reloading current.log...');
        const previousCount = logs.length;
        loadLogs();
        
        // Notify clients of new logs
        const newLogsCount = logs.length - previousCount;
        if (newLogsCount > 0) {
          console.log(`✅ Reloaded ${newLogsCount} entries`);
          broadcastToClients({
            type: 'logs_updated',
            newCount: newLogsCount,
            total: logs.length,
            stats: stats
          });
        }
      } catch (error) {
        console.error('Error reloading logs:', error);
      }
    }, 1000); // 1 second debounce
  });

  watcher.on('error', (error) => {
    console.error('File watcher error:', error);
  });

  console.log(`Watching for changes: ${LOG_FILE}`);
}

// Root route serves the main interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
function startServer() {
  // Load initial logs
  loadLogs();
  
  // Setup file watcher
  setupFileWatcher();
  
  // Ensure screenshots directory exists
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    console.log(`Created screenshots directory: ${SCREENSHOTS_DIR}`);
  }

  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('🌼 Daisy Web Viewer Started');
    console.log(`📄 Log file: ${LOG_FILE}`);
    console.log(`📁 Screenshots: ${SCREENSHOTS_DIR}`);
    console.log(`🌐 Server: http://${HOST}:${PORT}`);
    console.log(`📊 Loaded ${logs.length} log entries`);
    console.log('');
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();