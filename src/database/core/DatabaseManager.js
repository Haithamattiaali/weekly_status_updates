/**
 * DatabaseManager - Central database orchestrator for browser-based SQLite
 * Manages worker lifecycle, connection pooling, and high-level operations
 */

export class DatabaseManager {
    constructor() {
        this.worker = null;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.isInitialized = false;
        this.initPromise = null;
        this.healthCheckInterval = null;
        this.config = {
            workerPath: '/src/database/workers/sqlite.worker.js',
            healthCheckIntervalMs: 60000, // 1 minute
            autoBackupIntervalMs: 300000, // 5 minutes
            maxRetries: 3,
            retryDelayMs: 1000
        };
        this.listeners = new Map();
        this.metrics = {
            totalQueries: 0,
            failedQueries: 0,
            totalTransactions: 0,
            failedTransactions: 0
        };
    }

    /**
     * Initialize the database manager and worker
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInitialize();
        return this.initPromise;
    }

    async _doInitialize() {
        try {
            console.log('[DatabaseManager] Initializing...');

            // Create worker
            this.worker = new Worker(this.config.workerPath, { type: 'module' });

            // Set up message handler
            this.worker.addEventListener('message', (event) => this.handleWorkerMessage(event));

            // Initialize SQLite in worker
            const result = await this.sendToWorker('initialize');

            if (!result.success) {
                throw new Error('Failed to initialize SQLite worker');
            }

            console.log(`[DatabaseManager] Initialized with ${result.vfs} VFS`);

            // Start health monitoring
            this.startHealthMonitoring();

            // Start auto-backup
            this.startAutoBackup();

            this.isInitialized = true;
            this.emit('initialized', result);

            return result;
        } catch (error) {
            console.error('[DatabaseManager] Initialization failed:', error);
            this.initPromise = null;
            throw error;
        }
    }

    /**
     * Send a message to the worker and wait for response
     */
    sendToWorker(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Worker timeout for method: ${method}`));
            }, 30000); // 30 second timeout

            this.pendingRequests.set(id, { resolve, reject, timeout });
            this.worker.postMessage({ id, method, params });
        });
    }

    /**
     * Handle messages from the worker
     */
    handleWorkerMessage(event) {
        const { id, success, result, error } = event.data;

        const pending = this.pendingRequests.get(id);
        if (!pending) {
            console.warn('[DatabaseManager] Received response for unknown request:', id);
            return;
        }

        clearTimeout(pending.timeout);
        this.pendingRequests.delete(id);

        if (success) {
            pending.resolve(result);
        } else {
            pending.reject(new Error(error?.message || 'Unknown worker error'));
        }
    }

    /**
     * Execute a SQL query
     */
    async query(sql, params = [], options = {}) {
        await this.ensureInitialized();

        this.metrics.totalQueries++;

        try {
            const result = await this.sendToWorker('executeQuery', {
                query: sql,
                params,
                options
            });

            this.emit('query', { sql, params, result });
            return result;
        } catch (error) {
            this.metrics.failedQueries++;
            this.emit('queryError', { sql, params, error });
            throw error;
        }
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction(callback, options = {}) {
        await this.ensureInitialized();

        this.metrics.totalTransactions++;

        const queries = [];
        const transactionContext = {
            addQuery: (sql, params = []) => {
                queries.push({ sql, params });
                return queries.length - 1;
            },
            execute: async (sql, params = []) => {
                queries.push({ sql, params });
                return queries.length - 1;
            }
        };

        try {
            // Build transaction queries
            await callback(transactionContext);

            // Execute transaction
            const result = await this.sendToWorker('transaction', {
                queries,
                options
            });

            this.emit('transaction', { queries, result });
            return result;
        } catch (error) {
            this.metrics.failedTransactions++;
            this.emit('transactionError', { queries, error });
            throw error;
        }
    }

    /**
     * Get a single value from the database
     */
    async getValue(sql, params = []) {
        const results = await this.query(sql, params);
        return results?.[0]?.[Object.keys(results[0])[0]] ?? null;
    }

    /**
     * Get a single row from the database
     */
    async getRow(sql, params = []) {
        const results = await this.query(sql, params);
        return results?.[0] ?? null;
    }

    /**
     * Check if a row exists
     */
    async exists(sql, params = []) {
        const count = await this.getValue(
            sql.replace(/^SELECT .* FROM/i, 'SELECT COUNT(*) FROM'),
            params
        );
        return count > 0;
    }

    /**
     * Export the database as an ArrayBuffer
     */
    async exportDatabase() {
        await this.ensureInitialized();
        const arrayBuffer = await this.sendToWorker('exportDatabase');
        this.emit('export', { size: arrayBuffer.byteLength });
        return arrayBuffer;
    }

    /**
     * Export database as a downloadable file
     */
    async downloadBackup(filename = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = filename || `proceed-dashboard-backup-${timestamp}.db`;

        const arrayBuffer = await this.exportDatabase();
        const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`[DatabaseManager] Downloaded backup: ${name}`);
        return name;
    }

    /**
     * Import a database from ArrayBuffer
     */
    async importDatabase(arrayBuffer) {
        await this.ensureInitialized();

        // Create backup of current database first
        const backupBuffer = await this.exportDatabase();

        try {
            await this.sendToWorker('importDatabase', { arrayBuffer });
            this.emit('import', { size: arrayBuffer.byteLength });
            console.log('[DatabaseManager] Database imported successfully');
        } catch (error) {
            // Restore from backup on failure
            console.error('[DatabaseManager] Import failed, restoring backup...', error);
            await this.sendToWorker('importDatabase', { arrayBuffer: backupBuffer });
            throw error;
        }
    }

    /**
     * Import database from file input
     */
    async importFromFile(file) {
        if (!file || file.type !== 'application/x-sqlite3') {
            throw new Error('Invalid file type. Please select a SQLite database file.');
        }

        const arrayBuffer = await file.arrayBuffer();
        await this.importDatabase(arrayBuffer);
        return { filename: file.name, size: file.size };
    }

    /**
     * Get database health metrics
     */
    async getHealthMetrics() {
        await this.ensureInitialized();
        const workerMetrics = await this.sendToWorker('getHealthMetrics');

        return {
            ...workerMetrics,
            manager: {
                ...this.metrics,
                pendingRequests: this.pendingRequests.size,
                isInitialized: this.isInitialized
            }
        };
    }

    /**
     * Optimize database (VACUUM and ANALYZE)
     */
    async optimize() {
        await this.ensureInitialized();
        console.log('[DatabaseManager] Starting database optimization...');
        await this.sendToWorker('vacuum');
        console.log('[DatabaseManager] Database optimization complete');
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            return;
        }

        this.healthCheckInterval = setInterval(async () => {
            try {
                const metrics = await this.getHealthMetrics();

                // Check for issues
                if (metrics.performance.avgQueryTime > 500) {
                    console.warn('[DatabaseManager] High average query time:', metrics.performance.avgQueryTime);
                }

                if (metrics.database.size > 100 * 1024 * 1024) { // 100MB
                    console.warn('[DatabaseManager] Database size exceeds 100MB:', metrics.database.size);
                }

                if (metrics.performance.cacheHitRate < 0.5) {
                    console.warn('[DatabaseManager] Low cache hit rate:', metrics.performance.cacheHitRate);
                }

                this.emit('healthCheck', metrics);
            } catch (error) {
                console.error('[DatabaseManager] Health check failed:', error);
            }
        }, this.config.healthCheckIntervalMs);
    }

    /**
     * Start automatic backups
     */
    startAutoBackup() {
        if (!('storage' in navigator && 'persisted' in navigator.storage)) {
            console.warn('[DatabaseManager] Auto-backup not available (no storage persistence API)');
            return;
        }

        // Request persistent storage
        navigator.storage.persist().then(granted => {
            if (granted) {
                console.log('[DatabaseManager] Persistent storage granted');
            } else {
                console.warn('[DatabaseManager] Persistent storage denied');
            }
        });

        setInterval(async () => {
            try {
                const arrayBuffer = await this.exportDatabase();
                await this.saveToLocalStorage('autoBackup', arrayBuffer);
                console.log('[DatabaseManager] Auto-backup saved');
                this.emit('autoBackup', { size: arrayBuffer.byteLength });
            } catch (error) {
                console.error('[DatabaseManager] Auto-backup failed:', error);
            }
        }, this.config.autoBackupIntervalMs);
    }

    /**
     * Save data to local storage
     */
    async saveToLocalStorage(key, arrayBuffer) {
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        try {
            localStorage.setItem(`proceed_db_${key}`, base64);
            localStorage.setItem(`proceed_db_${key}_timestamp`, Date.now().toString());
        } catch (error) {
            if (error.name === 'QuotaExceededError') {
                console.warn('[DatabaseManager] Local storage quota exceeded, clearing old backups...');
                this.clearOldBackups();
                localStorage.setItem(`proceed_db_${key}`, base64);
            } else {
                throw error;
            }
        }
    }

    /**
     * Load data from local storage
     */
    async loadFromLocalStorage(key) {
        const base64 = localStorage.getItem(`proceed_db_${key}`);
        if (!base64) {
            return null;
        }

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return bytes.buffer;
    }

    /**
     * Clear old backups from local storage
     */
    clearOldBackups() {
        const keys = Object.keys(localStorage);
        const backupKeys = keys.filter(k => k.startsWith('proceed_db_') && k.includes('_timestamp'));

        const backups = backupKeys.map(k => ({
            key: k.replace('_timestamp', ''),
            timestamp: parseInt(localStorage.getItem(k))
        }));

        backups.sort((a, b) => b.timestamp - a.timestamp);

        // Keep only the 3 most recent backups
        backups.slice(3).forEach(backup => {
            localStorage.removeItem(backup.key);
            localStorage.removeItem(`${backup.key}_timestamp`);
        });
    }

    /**
     * Ensure database is initialized
     */
    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    /**
     * Event emitter functionality
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[DatabaseManager] Event handler error for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Close the database and clean up
     */
    async close() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.worker) {
            await this.sendToWorker('close');
            this.worker.terminate();
            this.worker = null;
        }

        this.isInitialized = false;
        this.initPromise = null;
        this.pendingRequests.clear();
        this.listeners.clear();
    }
}

// Export singleton instance
export const db = new DatabaseManager();