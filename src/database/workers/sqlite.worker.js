/**
 * SQLite Web Worker - Handles all database operations in a separate thread
 * Uses OPFS (Origin Private File System) for optimal performance
 * Fallback to IndexedDB if OPFS is not available
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

class SQLiteWorker {
    constructor() {
        this.db = null;
        this.sqlite3 = null;
        this.dbFilename = '/proceed-dashboard.db';
        this.isInitialized = false;
        this.transactionQueue = [];
        this.processingTransaction = false;
        this.performanceMetrics = {
            queryCount: 0,
            totalQueryTime: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        this.queryCache = new Map();
        this.cacheMaxSize = 100;
        this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes
    }

    async initialize() {
        try {
            console.log('[SQLiteWorker] Initializing SQLite WASM...');

            // Initialize SQLite3 WASM module
            this.sqlite3 = await sqlite3InitModule({
                print: (...args) => console.log('[SQLite]', ...args),
                printErr: (...args) => console.error('[SQLite Error]', ...args)
            });

            // Check for OPFS support
            const hasOPFS = 'storage' in navigator && 'getDirectory' in navigator.storage;

            if (hasOPFS && this.sqlite3.capi.sqlite3_vfs_find('opfs')) {
                // Use OPFS for best performance
                console.log('[SQLiteWorker] Using OPFS VFS for optimal performance');
                this.db = new this.sqlite3.oo1.OpfsDb(this.dbFilename, 'c');
            } else {
                // Fallback to standard VFS (uses IndexedDB)
                console.log('[SQLiteWorker] Using IndexedDB VFS (OPFS not available)');
                this.db = new this.sqlite3.oo1.DB(this.dbFilename, 'c');
            }

            // Enable foreign keys and optimize performance
            await this.optimizeDatabase();

            // Initialize schema
            await this.initializeSchema();

            this.isInitialized = true;
            console.log('[SQLiteWorker] Initialization complete');

            return { success: true, vfs: hasOPFS ? 'OPFS' : 'IndexedDB' };
        } catch (error) {
            console.error('[SQLiteWorker] Initialization failed:', error);
            throw error;
        }
    }

    async optimizeDatabase() {
        // Performance optimizations
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = 10000;
            PRAGMA temp_store = MEMORY;
            PRAGMA mmap_size = 30000000000;
            PRAGMA page_size = 4096;
            PRAGMA optimize;
        `);
    }

    async initializeSchema() {
        // Check if schema exists
        const tableCount = this.db.selectValue(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
        );

        if (tableCount > 0) {
            console.log('[SQLiteWorker] Schema already exists');
            return;
        }

        console.log('[SQLiteWorker] Creating database schema...');

        // Create tables based on Prisma schema
        this.db.exec(`
            -- Snapshot table (main entity)
            CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                actor TEXT,
                notes TEXT,
                raw_excel BLOB,
                domain_data TEXT NOT NULL,
                view_model TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at);

            -- Headers table
            CREATE TABLE IF NOT EXISTS headers (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT UNIQUE NOT NULL,
                portfolio TEXT NOT NULL,
                current_period_start TEXT NOT NULL,
                current_period_end TEXT NOT NULL,
                comparison_period_start TEXT,
                comparison_period_end TEXT,
                report_date TEXT NOT NULL,
                section_titles TEXT,
                table_headers TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
            );

            -- Status table
            CREATE TABLE IF NOT EXISTS status (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT NOT NULL,
                project TEXT NOT NULL,
                status_color TEXT NOT NULL CHECK (status_color IN ('green', 'amber', 'red')),
                trend TEXT NOT NULL CHECK (trend IN ('up', 'down', 'flat')),
                manager TEXT NOT NULL,
                next_milestone TEXT NOT NULL,
                order_index INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_status_snapshot_id ON status(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_status_project ON status(project);

            -- Highlights table
            CREATE TABLE IF NOT EXISTS highlights (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT NOT NULL,
                project TEXT,
                description TEXT NOT NULL,
                order_index INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_highlights_snapshot_id ON highlights(snapshot_id);

            -- Lowlights table
            CREATE TABLE IF NOT EXISTS lowlights (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT NOT NULL,
                project TEXT,
                description TEXT NOT NULL,
                order_index INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_lowlights_snapshot_id ON lowlights(snapshot_id);

            -- Milestones table
            CREATE TABLE IF NOT EXISTS milestones (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT NOT NULL,
                project TEXT NOT NULL,
                milestone TEXT NOT NULL,
                owner TEXT NOT NULL,
                due_date TEXT NOT NULL,
                status_badge TEXT NOT NULL,
                workstream_update TEXT,
                order_index INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_milestones_snapshot_id ON milestones(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project);

            -- Metrics table
            CREATE TABLE IF NOT EXISTS metrics (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT NOT NULL,
                project TEXT NOT NULL,
                spi REAL,
                cpi REAL,
                sev1_defects INTEGER,
                sev2_defects INTEGER,
                issues INTEGER,
                risk_score REAL,
                milestone_completion REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_id ON metrics(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_metrics_project ON metrics(project);

            -- Current snapshot pointer
            CREATE TABLE IF NOT EXISTS current_snapshot (
                id TEXT PRIMARY KEY DEFAULT 'current',
                snapshot_id TEXT UNIQUE NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Version history for tracking changes
            CREATE TABLE IF NOT EXISTS version_history (
                id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
                snapshot_id TEXT NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
                actor TEXT,
                changes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS idx_version_history_created_at ON version_history(created_at);

            -- Query performance tracking
            CREATE TABLE IF NOT EXISTS query_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query_hash TEXT NOT NULL,
                query_text TEXT NOT NULL,
                execution_time_ms REAL NOT NULL,
                row_count INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_query_metrics_hash ON query_metrics(query_hash);
        `);

        console.log('[SQLiteWorker] Schema created successfully');
    }

    /**
     * Execute a query with automatic caching and performance tracking
     */
    async executeQuery(query, params = [], options = {}) {
        const startTime = performance.now();
        const queryHash = this.hashQuery(query, params);

        try {
            // Check cache for SELECT queries
            if (query.trim().toUpperCase().startsWith('SELECT') && !options.noCache) {
                const cached = this.getCachedResult(queryHash);
                if (cached) {
                    this.performanceMetrics.cacheHits++;
                    return cached;
                }
                this.performanceMetrics.cacheMisses++;
            }

            // Execute query
            let result;
            if (query.trim().toUpperCase().startsWith('SELECT')) {
                result = this.db.selectObjects(query, params);
            } else {
                result = this.db.exec(query, { bind: params, returnValue: 'resultRows' });
            }

            // Track performance
            const executionTime = performance.now() - startTime;
            this.performanceMetrics.queryCount++;
            this.performanceMetrics.totalQueryTime += executionTime;

            // Log slow queries
            if (executionTime > 100) {
                console.warn(`[SQLiteWorker] Slow query (${executionTime.toFixed(2)}ms):`, query);
                await this.logQueryMetrics(queryHash, query, executionTime, result?.length);
            }

            // Cache SELECT results
            if (query.trim().toUpperCase().startsWith('SELECT') && !options.noCache) {
                this.setCachedResult(queryHash, result);
            }

            return result;
        } catch (error) {
            console.error('[SQLiteWorker] Query execution failed:', error, query);
            throw error;
        }
    }

    /**
     * Transaction management with automatic retry
     */
    async transaction(callback, options = {}) {
        const maxRetries = options.maxRetries || 3;
        let retries = 0;

        while (retries < maxRetries) {
            try {
                await this.beginTransaction();
                const result = await callback();
                await this.commitTransaction();
                return result;
            } catch (error) {
                await this.rollbackTransaction();

                if (retries < maxRetries - 1 && this.isRetryableError(error)) {
                    retries++;
                    const delay = Math.min(100 * Math.pow(2, retries), 1000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    console.log(`[SQLiteWorker] Retrying transaction (attempt ${retries + 1})`);
                } else {
                    throw error;
                }
            }
        }
    }

    async beginTransaction() {
        return this.db.exec('BEGIN TRANSACTION');
    }

    async commitTransaction() {
        return this.db.exec('COMMIT');
    }

    async rollbackTransaction() {
        return this.db.exec('ROLLBACK');
    }

    isRetryableError(error) {
        const message = error.message?.toLowerCase() || '';
        return message.includes('locked') ||
               message.includes('busy') ||
               message.includes('timeout');
    }

    /**
     * Query caching utilities
     */
    hashQuery(query, params) {
        const normalized = query.replace(/\s+/g, ' ').trim();
        const key = `${normalized}::${JSON.stringify(params)}`;
        return this.simpleHash(key);
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    getCachedResult(hash) {
        const cached = this.queryCache.get(hash);
        if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
            return cached.result;
        }
        this.queryCache.delete(hash);
        return null;
    }

    setCachedResult(hash, result) {
        // Manage cache size
        if (this.queryCache.size >= this.cacheMaxSize) {
            const firstKey = this.queryCache.keys().next().value;
            this.queryCache.delete(firstKey);
        }

        this.queryCache.set(hash, {
            result,
            timestamp: Date.now()
        });
    }

    async logQueryMetrics(hash, query, executionTime, rowCount) {
        try {
            await this.db.exec(
                `INSERT INTO query_metrics (query_hash, query_text, execution_time_ms, row_count)
                 VALUES (?, ?, ?, ?)`,
                { bind: [hash, query.substring(0, 500), executionTime, rowCount || 0] }
            );
        } catch (error) {
            console.error('[SQLiteWorker] Failed to log query metrics:', error);
        }
    }

    /**
     * Backup and restore functionality
     */
    async exportDatabase() {
        try {
            const dbArrayBuffer = this.sqlite3.capi.sqlite3_js_db_export(this.db);
            return dbArrayBuffer;
        } catch (error) {
            console.error('[SQLiteWorker] Failed to export database:', error);
            throw error;
        }
    }

    async importDatabase(arrayBuffer) {
        try {
            // Close current database
            if (this.db) {
                this.db.close();
            }

            // Import new database
            this.db = new this.sqlite3.oo1.DB();
            this.sqlite3.capi.sqlite3_js_db_import(this.db, arrayBuffer);

            // Re-optimize
            await this.optimizeDatabase();

            return { success: true };
        } catch (error) {
            console.error('[SQLiteWorker] Failed to import database:', error);
            throw error;
        }
    }

    /**
     * Health check and maintenance
     */
    async getHealthMetrics() {
        const dbSize = this.db.selectValue('SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()');
        const tableCount = this.db.selectValue("SELECT COUNT(*) FROM sqlite_master WHERE type='table'");
        const indexCount = this.db.selectValue("SELECT COUNT(*) FROM sqlite_master WHERE type='index'");
        const snapshotCount = this.db.selectValue('SELECT COUNT(*) FROM snapshots');

        return {
            database: {
                size: dbSize,
                tables: tableCount,
                indexes: indexCount,
                snapshots: snapshotCount
            },
            performance: {
                ...this.performanceMetrics,
                avgQueryTime: this.performanceMetrics.queryCount > 0
                    ? this.performanceMetrics.totalQueryTime / this.performanceMetrics.queryCount
                    : 0,
                cacheHitRate: this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses > 0
                    ? this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses)
                    : 0
            },
            cache: {
                size: this.queryCache.size,
                maxSize: this.cacheMaxSize
            }
        };
    }

    async vacuum() {
        console.log('[SQLiteWorker] Running VACUUM to optimize database...');
        await this.db.exec('VACUUM');
        await this.db.exec('ANALYZE');
        console.log('[SQLiteWorker] Database optimization complete');
    }

    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }
}

// Worker message handler
const worker = new SQLiteWorker();

self.addEventListener('message', async (event) => {
    const { id, method, params } = event.data;

    try {
        let result;

        switch (method) {
            case 'initialize':
                result = await worker.initialize();
                break;

            case 'executeQuery':
                result = await worker.executeQuery(params.query, params.params, params.options);
                break;

            case 'transaction':
                // For transactions, we need to handle the callback differently
                // This is a simplified version - in production, you'd want more sophisticated handling
                result = await worker.transaction(async () => {
                    const results = [];
                    for (const query of params.queries) {
                        const queryResult = await worker.executeQuery(query.sql, query.params);
                        results.push(queryResult);
                    }
                    return results;
                }, params.options);
                break;

            case 'exportDatabase':
                result = await worker.exportDatabase();
                break;

            case 'importDatabase':
                result = await worker.importDatabase(params.arrayBuffer);
                break;

            case 'getHealthMetrics':
                result = await worker.getHealthMetrics();
                break;

            case 'vacuum':
                result = await worker.vacuum();
                break;

            case 'close':
                result = await worker.close();
                break;

            default:
                throw new Error(`Unknown method: ${method}`);
        }

        self.postMessage({ id, success: true, result });
    } catch (error) {
        self.postMessage({
            id,
            success: false,
            error: {
                message: error.message,
                stack: error.stack
            }
        });
    }
});

console.log('[SQLiteWorker] Worker ready');