/**
 * Browser-Based Dashboard Binder
 * Uses client-side SQLite database with zero backend dependencies
 * Full offline support with automatic sync and recovery
 */

import { db } from './src/database/core/DatabaseManager.js';
import { snapshotRepository } from './src/database/repositories/SnapshotRepository.js';
import { excelProcessor } from './src/services/ExcelProcessor.js';
import { templateGenerator } from './src/services/TemplateGenerator.js';

class BrowserDashboardBinder {
    constructor() {
        this.db = db;
        this.snapshotRepo = snapshotRepository;
        this.currentSnapshot = null;
        this.isInitialized = false;
        this.offlineQueue = [];
        this.syncInterval = null;
        this.config = {
            autoSaveInterval: 30000, // 30 seconds
            syncInterval: 60000, // 1 minute
            maxOfflineQueueSize: 100,
            enableAutoBackup: true
        };
        this.eventHandlers = new Map();
    }

    /**
     * Initialize the dashboard with browser database
     */
    async init() {
        try {
            console.log('[Dashboard] Initializing browser-based dashboard...');

            // Initialize database
            await this.db.initialize();

            // Load current snapshot
            this.currentSnapshot = await this.snapshotRepo.getCurrentSnapshot();

            if (!this.currentSnapshot) {
                console.log('[Dashboard] No snapshot found, creating default...');
                await this.createDefaultSnapshot();
            }

            // Render dashboard
            await this.render();

            // Set up auto-save
            this.startAutoSave();

            // Set up event listeners
            this.setupEventListeners();

            // Monitor online/offline status
            this.setupNetworkMonitoring();

            this.isInitialized = true;
            console.log('[Dashboard] Initialization complete');

            // Emit ready event
            this.emit('ready', { snapshot: this.currentSnapshot });

        } catch (error) {
            console.error('[Dashboard] Initialization failed:', error);
            this.showError('Failed to initialize dashboard', error);
            throw error;
        }
    }

    /**
     * Create a default snapshot with sample data
     */
    async createDefaultSnapshot() {
        const defaultData = {
            domainData: {
                headers: {
                    portfolio: 'PROCEED Portfolio',
                    reportDate: new Date().toISOString().split('T')[0],
                    currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    currentPeriodEnd: new Date().toISOString().split('T')[0]
                },
                status: [
                    {
                        project: 'Sample Project',
                        statusColor: 'green',
                        trend: 'up',
                        manager: 'John Doe',
                        nextMilestone: 'Phase 1 Completion'
                    }
                ],
                milestones: [
                    {
                        project: 'Sample Project',
                        milestone: 'Phase 1 Completion',
                        owner: 'Jane Smith',
                        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        statusBadge: 'green',
                        workstreamUpdate: 'On track for delivery'
                    }
                ],
                highlights: [
                    {
                        description: 'Successfully deployed new features',
                        project: 'Sample Project'
                    }
                ],
                lowlights: [],
                metrics: []
            },
            viewModel: {
                summary: {
                    totalProjects: 1,
                    greenProjects: 1,
                    amberProjects: 0,
                    redProjects: 0
                }
            },
            actor: 'System',
            notes: 'Default snapshot created on initialization'
        };

        const snapshotId = await this.snapshotRepo.createSnapshot(defaultData);
        this.currentSnapshot = await this.snapshotRepo.getSnapshotWithRelations(snapshotId);
    }

    /**
     * Render the dashboard with current data
     */
    async render() {
        if (!this.currentSnapshot) {
            console.warn('[Dashboard] No snapshot to render');
            return;
        }

        console.log('[Dashboard] Rendering dashboard...');

        // Update all elements with data-bind attributes
        this.bindData(this.currentSnapshot);

        // Update charts and visualizations
        this.updateCharts(this.currentSnapshot.viewModel);

        // Update status indicators
        this.updateStatusIndicators();

        // Emit render event
        this.emit('rendered', { snapshot: this.currentSnapshot });
    }

    /**
     * Bind data to DOM elements
     */
    bindData(snapshot) {
        // Find all elements with data-bind attribute
        const bindElements = document.querySelectorAll('[data-bind]');

        bindElements.forEach(element => {
            const bindPath = element.getAttribute('data-bind');
            const value = this.getValueByPath(snapshot, bindPath);

            if (value !== undefined) {
                // Handle different element types
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.value = value;
                } else if (element.tagName === 'SELECT') {
                    element.value = value;
                } else {
                    // Handle special formatting
                    const format = element.getAttribute('data-format');
                    element.textContent = this.formatValue(value, format);
                }

                // Apply conditional styling
                this.applyConditionalStyling(element, value);
            }
        });

        // Bind repeating elements (tables, lists)
        this.bindRepeatingElements(snapshot);
    }

    /**
     * Bind repeating elements like tables and lists
     */
    bindRepeatingElements(snapshot) {
        const repeatElements = document.querySelectorAll('[data-repeat]');

        repeatElements.forEach(container => {
            const repeatPath = container.getAttribute('data-repeat');
            const template = container.querySelector('[data-template]');

            if (!template) return;

            const items = this.getValueByPath(snapshot, repeatPath);
            if (!Array.isArray(items)) return;

            // Clear existing items (except template)
            Array.from(container.children).forEach(child => {
                if (!child.hasAttribute('data-template')) {
                    child.remove();
                }
            });

            // Hide template
            template.style.display = 'none';

            // Create items from template
            items.forEach((item, index) => {
                const clone = template.cloneNode(true);
                clone.removeAttribute('data-template');
                clone.style.display = '';

                // Bind item data
                const itemBindElements = clone.querySelectorAll('[data-item-bind]');
                itemBindElements.forEach(element => {
                    const itemPath = element.getAttribute('data-item-bind');
                    const value = this.getValueByPath(item, itemPath);

                    if (value !== undefined) {
                        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                            element.value = value;
                        } else {
                            const format = element.getAttribute('data-format');
                            element.textContent = this.formatValue(value, format);
                        }

                        this.applyConditionalStyling(element, value);
                    }
                });

                // Add index attribute for tracking
                clone.setAttribute('data-index', index);

                container.appendChild(clone);
            });
        });
    }

    /**
     * Update charts and visualizations
     */
    updateCharts(viewModel) {
        // Status distribution pie chart
        const statusChart = document.querySelector('[data-chart="status-distribution"]');
        if (statusChart && viewModel?.charts?.statusDistribution) {
            this.renderPieChart(statusChart, viewModel.charts.statusDistribution);
        }

        // Trend analysis bar chart
        const trendChart = document.querySelector('[data-chart="trend-analysis"]');
        if (trendChart && viewModel?.charts?.trendAnalysis) {
            this.renderBarChart(trendChart, viewModel.charts.trendAnalysis);
        }

        // Milestone timeline
        const timeline = document.querySelector('[data-chart="milestone-timeline"]');
        if (timeline && viewModel?.charts?.milestoneTimeline) {
            this.renderTimeline(timeline, viewModel.charts.milestoneTimeline);
        }
    }

    /**
     * Render a simple pie chart using canvas
     */
    renderPieChart(canvas, data) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) / 2 - 20;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Calculate total
        const total = Object.values(data).reduce((sum, val) => sum + val, 0);
        if (total === 0) return;

        // Colors for each status
        const colors = {
            green: '#27AE60',
            amber: '#F39C12',
            red: '#E74C3C'
        };

        let currentAngle = -Math.PI / 2;

        Object.entries(data).forEach(([status, count]) => {
            if (count === 0) return;

            const sliceAngle = (count / total) * 2 * Math.PI;

            // Draw slice
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.lineTo(centerX, centerY);
            ctx.fillStyle = colors[status];
            ctx.fill();

            // Draw label
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
            const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${count}`, labelX, labelY);

            currentAngle += sliceAngle;
        });

        // Draw legend
        let legendY = 20;
        Object.entries(data).forEach(([status, count]) => {
            ctx.fillStyle = colors[status];
            ctx.fillRect(10, legendY, 15, 15);

            ctx.fillStyle = '#333';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${status.toUpperCase()}: ${count}`, 30, legendY + 12);

            legendY += 25;
        });
    }

    /**
     * Render a simple bar chart
     */
    renderBarChart(canvas, data) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const padding = 40;
        const barWidth = (width - padding * 2) / Object.keys(data).length;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Find max value
        const maxValue = Math.max(...Object.values(data), 1);

        // Draw bars
        let x = padding;
        Object.entries(data).forEach(([label, value]) => {
            const barHeight = (value / maxValue) * (height - padding * 2);
            const y = height - padding - barHeight;

            // Draw bar
            ctx.fillStyle = '#3498DB';
            ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);

            // Draw value
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(value, x + barWidth / 2, y - 5);

            // Draw label
            ctx.save();
            ctx.translate(x + barWidth / 2, height - padding + 15);
            ctx.rotate(-Math.PI / 4);
            ctx.textAlign = 'right';
            ctx.fillText(label, 0, 0);
            ctx.restore();

            x += barWidth;
        });
    }

    /**
     * Render milestone timeline
     */
    renderTimeline(container, milestones) {
        container.innerHTML = '';

        const timeline = document.createElement('div');
        timeline.className = 'milestone-timeline';

        milestones.forEach(milestone => {
            const item = document.createElement('div');
            item.className = `timeline-item status-${milestone.statusBadge}`;

            item.innerHTML = `
                <div class="timeline-date">${this.formatDate(milestone.dueDate)}</div>
                <div class="timeline-content">
                    <div class="timeline-project">${milestone.project}</div>
                    <div class="timeline-milestone">${milestone.milestone}</div>
                    <div class="timeline-owner">${milestone.owner}</div>
                </div>
            `;

            timeline.appendChild(item);
        });

        container.appendChild(timeline);
    }

    /**
     * Update status indicators
     */
    updateStatusIndicators() {
        // Update sync status
        const syncIndicator = document.querySelector('[data-sync-status]');
        if (syncIndicator) {
            const isOnline = navigator.onLine;
            const hasOfflineData = this.offlineQueue.length > 0;

            if (!isOnline) {
                syncIndicator.className = 'sync-status offline';
                syncIndicator.textContent = 'Offline Mode';
            } else if (hasOfflineData) {
                syncIndicator.className = 'sync-status syncing';
                syncIndicator.textContent = 'Syncing...';
            } else {
                syncIndicator.className = 'sync-status online';
                syncIndicator.textContent = 'All changes saved';
            }
        }

        // Update last updated time
        const lastUpdated = document.querySelector('[data-last-updated]');
        if (lastUpdated && this.currentSnapshot) {
            lastUpdated.textContent = `Last updated: ${this.formatDate(this.currentSnapshot.created_at, 'relative')}`;
        }
    }

    /**
     * Handle Excel file upload
     */
    async handleExcelUpload(file) {
        try {
            console.log('[Dashboard] Processing Excel file:', file.name);
            this.showLoading('Processing Excel file...');

            // Process Excel file
            const result = await excelProcessor.processFile(file);

            if (!result.success) {
                throw new Error(result.error || 'Failed to process Excel file');
            }

            // Save raw Excel for later export
            const arrayBuffer = await file.arrayBuffer();
            result.data.rawExcel = new Uint8Array(arrayBuffer);

            // Create new snapshot
            const snapshotData = {
                ...result.data,
                actor: this.getCurrentUser(),
                notes: `Imported from ${file.name}`
            };

            const snapshotId = await this.snapshotRepo.createSnapshot(snapshotData);
            this.currentSnapshot = await this.snapshotRepo.getSnapshotWithRelations(snapshotId);

            // Render updated dashboard
            await this.render();

            this.hideLoading();
            this.showSuccess(`Successfully imported ${file.name}`);

            // Emit import event
            this.emit('excelImported', {
                filename: file.name,
                snapshotId,
                warnings: result.warnings
            });

        } catch (error) {
            console.error('[Dashboard] Excel upload failed:', error);
            this.hideLoading();
            this.showError('Failed to import Excel file', error);
        }
    }

    /**
     * Generate and download Excel template
     */
    async downloadTemplate(options = {}) {
        try {
            console.log('[Dashboard] Generating Excel template...');
            this.showLoading('Generating template...');

            const filename = await templateGenerator.downloadTemplate({
                type: options.type || 'standard',
                includeSampleData: options.includeSampleData !== false,
                portfolio: this.currentSnapshot?.domainData?.headers?.portfolio || 'PROCEED Portfolio',
                projects: this.currentSnapshot?.domainData?.status?.map(s => s.project) || ['Project Alpha', 'Project Beta']
            });

            this.hideLoading();
            this.showSuccess(`Downloaded template: ${filename}`);

            // Emit download event
            this.emit('templateDownloaded', { filename });

        } catch (error) {
            console.error('[Dashboard] Template generation failed:', error);
            this.hideLoading();
            this.showError('Failed to generate template', error);
        }
    }

    /**
     * Export current snapshot as Excel
     */
    async exportToExcel() {
        try {
            if (!this.currentSnapshot) {
                throw new Error('No data to export');
            }

            console.log('[Dashboard] Exporting to Excel...');
            this.showLoading('Generating Excel file...');

            // Create workbook from current data
            const workbook = new ExcelJS.Workbook();

            // Add dashboard data to workbook
            await this.populateWorkbookWithSnapshot(workbook, this.currentSnapshot);

            // Generate file
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });

            // Download
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `proceed-export-${timestamp}.xlsx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.hideLoading();
            this.showSuccess(`Exported to ${filename}`);

            // Emit export event
            this.emit('excelExported', { filename });

        } catch (error) {
            console.error('[Dashboard] Export failed:', error);
            this.hideLoading();
            this.showError('Failed to export Excel file', error);
        }
    }

    /**
     * Populate workbook with snapshot data
     */
    async populateWorkbookWithSnapshot(workbook, snapshot) {
        // Implementation would mirror TemplateGenerator but with actual data
        // This is a simplified version - you'd expand this based on needs

        const dashboardSheet = workbook.addWorksheet('Dashboard');
        const statusSheet = workbook.addWorksheet('Status');
        const milestonesSheet = workbook.addWorksheet('Milestones');

        // Dashboard sheet
        dashboardSheet.getCell('A1').value = snapshot.domainData.headers.portfolio;
        dashboardSheet.getCell('A2').value = 'Report Date:';
        dashboardSheet.getCell('B2').value = snapshot.domainData.headers.reportDate;

        // Status sheet
        const statusHeaders = ['Project', 'Status', 'Trend', 'Manager', 'Next Milestone'];
        statusHeaders.forEach((header, i) => {
            statusSheet.getCell(1, i + 1).value = header;
        });

        snapshot.domainData.status.forEach((status, row) => {
            statusSheet.getCell(row + 2, 1).value = status.project;
            statusSheet.getCell(row + 2, 2).value = status.statusColor;
            statusSheet.getCell(row + 2, 3).value = status.trend;
            statusSheet.getCell(row + 2, 4).value = status.manager;
            statusSheet.getCell(row + 2, 5).value = status.nextMilestone;
        });

        // Milestones sheet
        const milestoneHeaders = ['Project', 'Milestone', 'Owner', 'Due Date', 'Status'];
        milestoneHeaders.forEach((header, i) => {
            milestonesSheet.getCell(1, i + 1).value = header;
        });

        snapshot.domainData.milestones.forEach((milestone, row) => {
            milestonesSheet.getCell(row + 2, 1).value = milestone.project;
            milestonesSheet.getCell(row + 2, 2).value = milestone.milestone;
            milestonesSheet.getCell(row + 2, 3).value = milestone.owner;
            milestonesSheet.getCell(row + 2, 4).value = milestone.dueDate;
            milestonesSheet.getCell(row + 2, 5).value = milestone.statusBadge;
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // File upload
        const fileInput = document.querySelector('[data-upload="excel"]');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleExcelUpload(file);
                }
            });
        }

        // Template download
        const templateBtn = document.querySelector('[data-action="download-template"]');
        if (templateBtn) {
            templateBtn.addEventListener('click', () => {
                this.downloadTemplate();
            });
        }

        // Export button
        const exportBtn = document.querySelector('[data-action="export-excel"]');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportToExcel();
            });
        }

        // Backup/restore buttons
        const backupBtn = document.querySelector('[data-action="backup"]');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => {
                this.createBackup();
            });
        }

        const restoreBtn = document.querySelector('[data-action="restore"]');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', () => {
                this.showRestoreDialog();
            });
        }

        // Drag and drop for file upload
        const dropZone = document.querySelector('[data-dropzone="excel"]');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');

                const file = e.dataTransfer.files[0];
                if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
                    this.handleExcelUpload(file);
                } else {
                    this.showError('Please drop an Excel file (.xlsx or .xls)');
                }
            });
        }
    }

    /**
     * Setup network monitoring
     */
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            console.log('[Dashboard] Connection restored');
            this.processOfflineQueue();
            this.updateStatusIndicators();
        });

        window.addEventListener('offline', () => {
            console.log('[Dashboard] Connection lost - entering offline mode');
            this.updateStatusIndicators();
            this.showInfo('You are now offline. Changes will be saved locally.');
        });
    }

    /**
     * Process offline queue when back online
     */
    async processOfflineQueue() {
        if (this.offlineQueue.length === 0) return;

        console.log(`[Dashboard] Processing ${this.offlineQueue.length} offline changes...`);

        while (this.offlineQueue.length > 0) {
            const action = this.offlineQueue.shift();

            try {
                await this.executeAction(action);
            } catch (error) {
                console.error('[Dashboard] Failed to process offline action:', error);
                // Re-queue failed action
                this.offlineQueue.unshift(action);
                break;
            }
        }

        this.updateStatusIndicators();
    }

    /**
     * Execute a queued action
     */
    async executeAction(action) {
        switch (action.type) {
            case 'updateSnapshot':
                await this.snapshotRepo.update(action.data.id, action.data.updates);
                break;
            case 'createSnapshot':
                await this.snapshotRepo.createSnapshot(action.data);
                break;
            default:
                console.warn('[Dashboard] Unknown action type:', action.type);
        }
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (!this.config.enableAutoBackup) return;

        setInterval(() => {
            this.autoSave();
        }, this.config.autoSaveInterval);
    }

    /**
     * Auto-save current state
     */
    async autoSave() {
        try {
            // Save to local storage as well for quick recovery
            const state = {
                snapshotId: this.currentSnapshot?.id,
                timestamp: Date.now()
            };

            localStorage.setItem('proceed_dashboard_state', JSON.stringify(state));

            console.log('[Dashboard] Auto-saved state');
        } catch (error) {
            console.error('[Dashboard] Auto-save failed:', error);
        }
    }

    /**
     * Create a backup of the database
     */
    async createBackup() {
        try {
            this.showLoading('Creating backup...');

            const filename = await this.db.downloadBackup();

            this.hideLoading();
            this.showSuccess(`Backup created: ${filename}`);

            // Emit backup event
            this.emit('backupCreated', { filename });

        } catch (error) {
            console.error('[Dashboard] Backup failed:', error);
            this.hideLoading();
            this.showError('Failed to create backup', error);
        }
    }

    /**
     * Show restore dialog
     */
    showRestoreDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.db';

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.restoreFromBackup(file);
            }
        });

        input.click();
    }

    /**
     * Restore from backup file
     */
    async restoreFromBackup(file) {
        try {
            this.showLoading('Restoring from backup...');

            const result = await this.db.importFromFile(file);

            // Reload current snapshot
            this.currentSnapshot = await this.snapshotRepo.getCurrentSnapshot();
            await this.render();

            this.hideLoading();
            this.showSuccess('Successfully restored from backup');

            // Emit restore event
            this.emit('backupRestored', { filename: result.filename });

        } catch (error) {
            console.error('[Dashboard] Restore failed:', error);
            this.hideLoading();
            this.showError('Failed to restore from backup', error);
        }
    }

    /**
     * Utility: Get value by path
     */
    getValueByPath(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Utility: Format value
     */
    formatValue(value, format) {
        if (!format) return value;

        switch (format) {
            case 'date':
                return this.formatDate(value);
            case 'percentage':
                return `${(value * 100).toFixed(1)}%`;
            case 'currency':
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                }).format(value);
            case 'number':
                return new Intl.NumberFormat('en-US').format(value);
            default:
                return value;
        }
    }

    /**
     * Utility: Format date
     */
    formatDate(date, format = 'short') {
        if (!date) return '';

        const d = new Date(date);

        if (format === 'relative') {
            const now = Date.now();
            const then = d.getTime();
            const diff = now - then;

            if (diff < 60000) return 'just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
            if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

            return d.toLocaleDateString();
        }

        return d.toLocaleDateString();
    }

    /**
     * Apply conditional styling based on value
     */
    applyConditionalStyling(element, value) {
        const condition = element.getAttribute('data-condition');
        if (!condition) return;

        // Parse condition (e.g., "status:green:success,amber:warning,red:danger")
        const conditions = condition.split(',');

        conditions.forEach(cond => {
            const [field, match, className] = cond.split(':');

            if (field === 'status' && value === match) {
                element.classList.add(`status-${className}`);
            } else if (field === 'value') {
                const operator = match[0];
                const threshold = parseFloat(match.substring(1));
                const numValue = parseFloat(value);

                if (
                    (operator === '>' && numValue > threshold) ||
                    (operator === '<' && numValue < threshold) ||
                    (operator === '=' && numValue === threshold)
                ) {
                    element.classList.add(className);
                }
            }
        });
    }

    /**
     * Get current user (from localStorage or default)
     */
    getCurrentUser() {
        return localStorage.getItem('proceed_dashboard_user') || 'Anonymous';
    }

    /**
     * UI Helper: Show loading
     */
    showLoading(message = 'Loading...') {
        const loader = document.querySelector('[data-loading]') || this.createLoader();
        loader.textContent = message;
        loader.style.display = 'block';
    }

    /**
     * UI Helper: Hide loading
     */
    hideLoading() {
        const loader = document.querySelector('[data-loading]');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    /**
     * UI Helper: Show error
     */
    showError(message, error = null) {
        console.error(message, error);
        this.showNotification(message, 'error');
    }

    /**
     * UI Helper: Show success
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * UI Helper: Show info
     */
    showInfo(message) {
        this.showNotification(message, 'info');
    }

    /**
     * UI Helper: Show notification
     */
    showNotification(message, type = 'info') {
        const container = document.querySelector('[data-notifications]') || this.createNotificationContainer();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    /**
     * Create loader element
     */
    createLoader() {
        const loader = document.createElement('div');
        loader.setAttribute('data-loading', '');
        loader.className = 'dashboard-loader';
        loader.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
        `;
        document.body.appendChild(loader);
        return loader;
    }

    /**
     * Create notification container
     */
    createNotificationContainer() {
        const container = document.createElement('div');
        container.setAttribute('data-notifications', '');
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
        `;
        document.body.appendChild(container);
        return container;
    }

    /**
     * Event emitter: on
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Event emitter: off
     */
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Event emitter: emit
     */
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[Dashboard] Event handler error for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get dashboard health metrics
     */
    async getHealthMetrics() {
        return await this.db.getHealthMetrics();
    }

    /**
     * Optimize database
     */
    async optimizeDatabase() {
        try {
            this.showLoading('Optimizing database...');
            await this.db.optimize();
            this.hideLoading();
            this.showSuccess('Database optimized successfully');
        } catch (error) {
            this.hideLoading();
            this.showError('Failed to optimize database', error);
        }
    }
}

// Export singleton instance
export const dashboard = new BrowserDashboardBinder();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        dashboard.init().catch(error => {
            console.error('[Dashboard] Failed to initialize:', error);
        });
    });
} else {
    dashboard.init().catch(error => {
        console.error('[Dashboard] Failed to initialize:', error);
    });
}