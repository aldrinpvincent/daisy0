// Daisy Web Viewer - Frontend Application
class DaisyViewer {
    constructor() {
        this.logs = [];
        this.filteredLogs = [];
        this.selectedLog = null;
        this.eventSource = null;
        this.autoScroll = true;
        this.currentOffset = 0;
        this.filters = {
            search: '',
            types: ['console', 'network', 'error', 'performance', 'page', 'security', 'runtime'],
            levels: ['info', 'warn', 'error', 'debug']
        };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.connectSSE();
        await this.loadLogs();
        await this.loadStats();
    }

    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.debounce(() => this.applyFilters(), 300)();
        });

        // Filter checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateFiltersFromCheckboxes();
                this.applyFilters();
            });
        });

        // Filter buttons
        document.getElementById('apply-filters').addEventListener('click', () => {
            this.applyFilters();
        });

        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });

        document.getElementById('refresh-logs').addEventListener('click', () => {
            this.loadLogs(true);
        });

        // Auto-scroll toggle
        document.getElementById('auto-scroll-toggle').addEventListener('click', () => {
            this.toggleAutoScroll();
        });

        // Limit select
        document.getElementById('limit-select').addEventListener('change', () => {
            this.loadLogs(true);
        });

        // Load more button
        document.getElementById('load-more').addEventListener('click', () => {
            this.loadMore();
        });

        // Detail panel close
        document.getElementById('close-detail').addEventListener('click', () => {
            this.closeDetailPanel();
        });

        // Screenshot modal
        document.getElementById('modal-backdrop').addEventListener('click', () => {
            this.closeScreenshotModal();
        });

        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeScreenshotModal();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDetailPanel();
                this.closeScreenshotModal();
            }
            if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.loadLogs(true);
            }
        });
    }

    connectSSE() {
        try {
            // Close existing connection if any
            if (this.eventSource) {
                this.eventSource.close();
            }
            
            this.updateConnectionStatus('connecting');
            this.eventSource = new EventSource('/events');
            
            this.eventSource.onopen = () => {
                this.updateConnectionStatus('connected');
                console.log('SSE connection established');
            };

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleSSEMessage(data);
                } catch (error) {
                    console.error('Error parsing SSE message:', error);
                }
            };

            this.eventSource.onerror = (error) => {
                console.error('SSE connection error:', error);
                this.updateConnectionStatus('disconnected');
                
                // Only reconnect if not manually closed
                if (this.eventSource.readyState === EventSource.CLOSED) {
                    console.log('Attempting to reconnect SSE in 3 seconds...');
                    setTimeout(() => {
                        this.connectSSE();
                    }, 3000);
                }
            };

        } catch (error) {
            console.error('Failed to establish SSE connection:', error);
            this.updateConnectionStatus('disconnected');
            
            // Retry connection after 5 seconds
            setTimeout(() => {
                this.connectSSE();
            }, 5000);
        }
    }

    handleSSEMessage(data) {
        switch (data.type) {
            case 'connected':
                console.log('SSE client connected with ID:', data.clientId);
                break;
            case 'logs_updated':
                console.log(`${data.newCount} new logs added`);
                this.loadLogs(true);
                this.updateStats(data.stats);
                break;
        }
    }

    updateConnectionStatus(status) {
        const indicator = document.getElementById('connection-status');
        const dot = indicator.querySelector('.status-dot');
        const text = indicator.querySelector('.status-text');
        
        dot.className = `status-dot ${status}`;
        
        switch (status) {
            case 'connected':
                text.textContent = 'Connected';
                break;
            case 'connecting':
                text.textContent = 'Connecting...';
                break;
            case 'disconnected':
                text.textContent = 'Disconnected';
                break;
        }
    }

    async loadLogs(reset = false) {
        try {
            if (reset) {
                this.currentOffset = 0;
                this.logs = [];
            }

            this.showLoading();

            const limit = document.getElementById('limit-select').value;
            const params = new URLSearchParams({
                limit: limit,
                offset: this.currentOffset.toString()
            });

            const response = await fetch(`/api/logs?${params}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();

            if (reset) {
                this.logs = data.logs;
            } else {
                this.logs.push(...data.logs);
            }

            this.currentOffset = this.logs.length;
            
            // Update pagination controls
            const hasMore = data.total > this.logs.length;
            document.getElementById('pagination-controls').style.display = hasMore ? 'block' : 'none';

            this.applyFilters();
            this.hideLoading();

        } catch (error) {
            console.error('Error loading logs:', error);
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.showError('Failed to load logs: ' + error.message);
        }
    }

    async loadMore() {
        await this.loadLogs(false);
    }

    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const stats = await response.json();
            this.updateStats(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    updateStats(stats) {
        document.getElementById('total-logs').textContent = stats.total;
    }

    updateFiltersFromCheckboxes() {
        // Type filters
        this.filters.types = Array.from(document.querySelectorAll('input[type="checkbox"]:not([name="level"]):checked'))
            .map(cb => cb.value);

        // Level filters
        this.filters.levels = Array.from(document.querySelectorAll('input[name="level"]:checked'))
            .map(cb => cb.value);
    }

    applyFilters() {
        this.filteredLogs = this.logs.filter(log => {
            // Type filter
            if (!this.filters.types.includes(log.type)) {
                return false;
            }

            // Level filter
            if (!this.filters.levels.includes(log.level)) {
                return false;
            }

            // Search filter
            if (this.filters.search) {
                const searchTerm = this.filters.search.toLowerCase();
                const searchableText = JSON.stringify(log).toLowerCase();
                if (!searchableText.includes(searchTerm)) {
                    return false;
                }
            }

            return true;
        });

        this.renderLogList();
    }

    renderLogList() {
        const logList = document.getElementById('log-list');
        
        if (this.filteredLogs.length === 0) {
            logList.innerHTML = `
                <div class="empty-state">
                    <p>No logs found matching current filters</p>
                    <button class="btn btn-secondary" onclick="viewer.clearFilters()">Clear Filters</button>
                </div>
            `;
            return;
        }

        const logEntries = this.filteredLogs.map(log => this.createLogEntryElement(log));
        logList.innerHTML = logEntries.join('');

        // Add click event listeners
        logList.querySelectorAll('.log-entry').forEach((element, index) => {
            element.addEventListener('click', () => {
                this.selectLog(this.filteredLogs[index], element);
            });
        });

        // Auto-scroll to bottom if enabled
        if (this.autoScroll) {
            logList.scrollTop = logList.scrollHeight;
        }
    }

    createLogEntryElement(log) {
        const screenshotIndicator = log.hasScreenshot ? 
            '<span class="screenshot-indicator">📷 Screenshot</span>' : '';

        return `
            <div class="log-entry" data-log-id="${log.id}">
                <div class="log-entry-header">
                    <div class="log-meta">
                        <span class="log-timestamp">${log.displayTime}</span>
                        <span class="type-badge type-${log.type}">${log.type}</span>
                        <span class="level-badge level-${log.level}">${log.level}</span>
                        ${screenshotIndicator}
                    </div>
                </div>
                <div class="log-summary">${this.escapeHtml(log.summary)}</div>
                <div class="log-source">${this.escapeHtml(log.source)}</div>
            </div>
        `;
    }

    selectLog(log, element) {
        // Update selected state
        document.querySelectorAll('.log-entry').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        
        this.selectedLog = log;
        this.showDetailPanel(log);
    }

    showDetailPanel(log) {
        const detailPanel = document.getElementById('detail-panel');
        const detailContent = document.getElementById('detail-content');
        
        detailContent.innerHTML = `
            <div class="detail-section">
                <h4>Summary</h4>
                <p>${this.escapeHtml(log.summary)}</p>
            </div>
            
            <div class="detail-section">
                <h4>Metadata</h4>
                <div class="json-display">${this.formatJson({
                    timestamp: log.timestamp,
                    type: log.type,
                    level: log.level,
                    source: log.source
                })}</div>
            </div>
            
            <div class="detail-section">
                <h4>Data</h4>
                <div class="json-display">${this.formatJson(log.data)}</div>
            </div>
            
            ${log.context ? `
            <div class="detail-section">
                <h4>Context</h4>
                <div class="json-display">${this.formatJson(log.context)}</div>
            </div>
            ` : ''}
            
            ${log.hasScreenshot ? this.createScreenshotSection(log) : ''}
        `;
        
        // Show panel (important for mobile)
        detailPanel.classList.add('show');
    }

    createScreenshotSection(log) {
        const screenshotPath = this.guessScreenshotPath(log);
        return `
            <div class="detail-section">
                <h4>Screenshot</h4>
                <img 
                    src="/screenshots/${screenshotPath}" 
                    alt="Screenshot for ${log.timestamp}"
                    class="screenshot-preview"
                    onclick="viewer.showScreenshotModal('/screenshots/${screenshotPath}')"
                    onerror="this.style.display='none'; this.parentElement.innerHTML='<p>Screenshot not found</p>'"
                />
            </div>
        `;
    }

    guessScreenshotPath(log) {
        // Try to construct screenshot filename from timestamp
        const timestamp = log.timestamp.replace(/[:.]/g, '-').substring(0, 19);
        return `error_${timestamp}.png`;
    }

    showScreenshotModal(imageSrc) {
        const modal = document.getElementById('screenshot-modal');
        const img = document.getElementById('modal-screenshot');
        
        img.src = imageSrc;
        modal.classList.add('show');
    }

    closeScreenshotModal() {
        const modal = document.getElementById('screenshot-modal');
        modal.classList.remove('show');
    }

    closeDetailPanel() {
        const detailPanel = document.getElementById('detail-panel');
        detailPanel.classList.remove('show');
        
        // Clear selection
        document.querySelectorAll('.log-entry').forEach(el => el.classList.remove('selected'));
        this.selectedLog = null;
    }

    clearFilters() {
        // Clear search
        document.getElementById('search-input').value = '';
        
        // Check all checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
        });
        
        // Update filters
        this.filters = {
            search: '',
            types: ['console', 'network', 'error', 'performance', 'page', 'security', 'runtime'],
            levels: ['info', 'warn', 'error', 'debug']
        };
        
        this.applyFilters();
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        const button = document.getElementById('auto-scroll-toggle');
        const text = document.getElementById('auto-scroll-text');
        
        if (this.autoScroll) {
            text.textContent = '🔄 Auto-scroll';
            button.classList.add('btn-primary');
            button.classList.remove('btn-secondary');
        } else {
            text.textContent = '⏸️ Paused';
            button.classList.add('btn-secondary');
            button.classList.remove('btn-primary');
        }
    }

    showLoading() {
        document.getElementById('loading-state').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loading-state').style.display = 'none';
    }

    showError(message) {
        const logList = document.getElementById('log-list');
        logList.innerHTML = `
            <div class="empty-state">
                <p>⚠️ ${message}</p>
                <button class="btn btn-primary" onclick="viewer.loadLogs(true)">Retry</button>
            </div>
        `;
    }

    formatJson(obj) {
        if (obj === null || obj === undefined) {
            return '<span class="json-null">null</span>';
        }
        
        try {
            return this.syntaxHighlightJson(JSON.stringify(obj, null, 2));
        } catch (error) {
            return this.escapeHtml(String(obj));
        }
    }

    syntaxHighlightJson(json) {
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Cleanup on page unload
    cleanup() {
        if (this.eventSource) {
            this.eventSource.close();
        }
    }
}

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.viewer = new DaisyViewer();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.viewer) {
        window.viewer.cleanup();
    }
});