/**
 * Dashboard Binder - Lightweight DOM binding for Excel-driven dashboard
 * Fetches data from API and updates DOM elements with data-bind attributes
 */

class DashboardBinder {
    constructor() {
        this.apiBase = 'http://localhost:3001/api';
        this.data = null;
    }

    async init() {
        try {
            await this.fetchDashboard();
            this.render(this.data);
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async fetchDashboard() {
        const response = await fetch(`${this.apiBase}/dashboard`, {
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        this.data = await response.json();
        return this.data;
    }

    render(data) {
        if (!data) return;

        // Update header information
        this.updateTextContent('title', data.header.title);
        this.updateTextContent('portfolio', data.header.portfolio);
        this.updateTextContent('currentPeriod', data.header.currentPeriod);
        this.updateTextContent('comparisonPeriod', data.header.comparisonPeriod);
        this.updateTextContent('reportDate', data.header.reportDate);

        // Update section titles
        this.updateTextContent('title_portfolioStatus', data.header.sectionTitles.portfolioStatus);
        this.updateTextContent('title_highlightsLowlights', data.header.sectionTitles.highlightsLowlights);
        this.updateTextContent('title_keyMilestones', data.header.sectionTitles.keyMilestones);

        // Update table headers
        Object.entries(data.header.tableHeaders).forEach(([key, value]) => {
            this.updateTextContent(`th_${this.capitalizeFirst(key)}`, value);
        });

        // Calculate and update metrics
        this.updateMetrics(data.statusTable);

        // Render status table
        this.renderStatusTable(data.statusTable);

        // Render highlights and lowlights
        this.renderHighlightsLowlights(data.highlights, data.lowlights);

        // Render milestones table
        this.renderMilestonesTable(data.milestonesTable);
    }

    updateTextContent(bindKey, value) {
        const elements = document.querySelectorAll(`[data-bind="${bindKey}"]`);
        elements.forEach(el => {
            el.textContent = value;
        });
    }

    updateMetrics(statusTable) {
        const counts = {
            green: 0,
            amber: 0,
            red: 0
        };

        statusTable.forEach(row => {
            if (row.statusClass.includes('green')) counts.green++;
            else if (row.statusClass.includes('amber')) counts.amber++;
            else if (row.statusClass.includes('red')) counts.red++;
        });

        // Update total projects
        this.updateTextContent('totalProjects', statusTable.length);

        // Update status counts with trends (simplified for now)
        const greenEl = document.querySelector('[data-bind="greenCount"]');
        if (greenEl) greenEl.innerHTML = `${counts.green}<span class="metric-trend">→</span>`;

        const amberEl = document.querySelector('[data-bind="amberCount"]');
        if (amberEl) amberEl.innerHTML = `${counts.amber}<span class="metric-trend">→</span>`;

        const redEl = document.querySelector('[data-bind="redCount"]');
        if (redEl) redEl.innerHTML = `${counts.red}<span class="metric-trend">→</span>`;
    }

    renderStatusTable(statusData) {
        const tbody = document.querySelector('[data-bind="statusTableBody"]');
        if (!tbody) return;

        tbody.innerHTML = '';

        statusData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${this.escapeHtml(row.project)}</td>
                <td>
                    <span class="status-indicator ${row.statusClass}">
                        ${this.getStatusText(row.statusClass)}
                        <span class="trend-indicator">${row.trendGlyph}</span>
                    </span>
                </td>
                <td>${row.trendGlyph}</td>
                <td>${this.escapeHtml(row.manager)}</td>
                <td>${this.escapeHtml(row.nextMilestone)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderHighlightsLowlights(highlights, lowlights) {
        // Render highlights
        const highlightsList = document.querySelector('[data-bind="highlightsList"]');
        if (highlightsList) {
            highlightsList.innerHTML = '';
            highlights.forEach(item => {
                const li = document.createElement('li');
                li.className = 'hl-item';
                li.textContent = item;
                highlightsList.appendChild(li);
            });
        }

        // Render lowlights
        const lowlightsList = document.querySelector('[data-bind="lowlightsList"]');
        if (lowlightsList) {
            lowlightsList.innerHTML = '';
            lowlights.forEach(item => {
                const li = document.createElement('li');
                li.className = 'hl-item';
                li.textContent = item;
                lowlightsList.appendChild(li);
            });
        }
    }

    renderMilestonesTable(milestonesData) {
        const tbody = document.querySelector('[data-bind="milestonesTableBody"]');
        if (!tbody) return;

        tbody.innerHTML = '';

        // Group milestones by project
        const groupedMilestones = this.groupBy(milestonesData, 'project');

        Object.entries(groupedMilestones).forEach(([project, milestones]) => {
            // Add project header row
            const headerRow = document.createElement('tr');
            headerRow.className = 'project-header';
            headerRow.innerHTML = `<td colspan="5">${this.escapeHtml(project)}</td>`;
            tbody.appendChild(headerRow);

            // Add milestone rows
            milestones.forEach(milestone => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${this.escapeHtml(milestone.milestone)}</td>
                    <td>${this.escapeHtml(milestone.owner)}</td>
                    <td>${this.escapeHtml(milestone.dueDateBadge)}</td>
                    <td>
                        <span class="milestone-status ${milestone.statusBadgeClass}">
                            ${this.getStatusBadgeText(milestone.statusBadgeClass)}
                        </span>
                    </td>
                    <td>${this.escapeHtml(milestone.workstreamUpdate)}</td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    getStatusText(statusClass) {
        if (statusClass.includes('green')) return 'GREEN';
        if (statusClass.includes('amber')) return 'AMBER';
        if (statusClass.includes('red')) return 'RED';
        return 'UNKNOWN';
    }

    getStatusBadgeText(badgeClass) {
        if (badgeClass.includes('completed')) return 'Completed';
        if (badgeClass.includes('progress')) return 'In Progress';
        if (badgeClass.includes('pending')) return 'Pending';
        if (badgeClass.includes('risk')) return 'At Risk';
        return badgeClass; // Return as-is for percentage values
    }

    groupBy(array, key) {
        return array.reduce((result, item) => {
            (result[item[key]] = result[item[key]] || []).push(item);
            return result;
        }, {});
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    showError(message) {
        if (typeof showNotification === 'function') {
            showNotification(message, 'error');
        } else {
            console.error(message);
        }
    }

    async refresh() {
        try {
            await this.fetchDashboard();
            this.render(this.data);
            if (typeof showNotification === 'function') {
                showNotification('Dashboard refreshed', 'success');
            }
        } catch (error) {
            this.showError('Failed to refresh dashboard');
        }
    }
}

// Create global instance
window.DashboardBinder = new DashboardBinder();

// Auto-refresh every 5 minutes
setInterval(() => {
    window.DashboardBinder.refresh();
}, 5 * 60 * 1000);