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
            this.updateTextContent(`th_${key}`, value);
            // Also try with different naming conventions
            this.updateTextContent(`th_${this.capitalizeFirst(key)}`, value);
        });

        // Calculate and update metrics (if element exists)
        this.updateMetrics(data.statusTable);

        // Render status table
        this.renderStatusTable(data.statusTable);

        // Render highlights and lowlights
        this.renderHighlightsLowlights(data.highlights, data.lowlights);

        // Render milestones table
        this.renderMilestonesTable(data.milestonesTable);

        // Update footer if exists
        this.updateTextContent('footerText', `Portfolio Management Office | Weekly Status Update | ${data.header.currentPeriod}`);
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

        // Update total projects if element exists
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
            const statusColorClass = row.statusClass.replace('status-', '');
            const statusText = this.capitalizeFirst(statusColorClass);

            tr.innerHTML = `
                <td class="project-name">${this.escapeHtml(row.project)}</td>
                <td><span class="status-indicator ${row.statusClass}">${statusText} ${row.trendGlyph}</span></td>
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
                const div = document.createElement('div');
                div.className = 'highlight-item';

                // Parse project prefix if exists
                const colonIndex = item.indexOf(':');
                if (colonIndex > 0 && colonIndex < 20) { // Reasonable project name length
                    const project = item.substring(0, colonIndex);
                    const desc = item.substring(colonIndex + 1).trim();
                    div.innerHTML = `<strong>${this.escapeHtml(project)}:</strong> ${this.escapeHtml(desc)}`;
                } else {
                    div.textContent = item;
                }

                highlightsList.appendChild(div);
            });
        }

        // Render lowlights
        const lowlightsList = document.querySelector('[data-bind="lowlightsList"]');
        if (lowlightsList) {
            lowlightsList.innerHTML = '';
            lowlights.forEach(item => {
                const div = document.createElement('div');
                div.className = 'highlight-item';

                // Parse project prefix if exists
                const colonIndex = item.indexOf(':');
                if (colonIndex > 0 && colonIndex < 20) {
                    const project = item.substring(0, colonIndex);
                    const desc = item.substring(colonIndex + 1).trim();
                    div.innerHTML = `<strong>${this.escapeHtml(project)}:</strong> ${this.escapeHtml(desc)}`;
                } else {
                    div.textContent = item;
                }

                lowlightsList.appendChild(div);
            });
        }
    }

    renderMilestonesTable(milestonesData) {
        const tbody = document.querySelector('[data-bind="milestonesTableBody"]');
        if (!tbody) return;

        tbody.innerHTML = '';

        // Group milestones by project
        const groupedMilestones = this.groupBy(milestonesData, 'project');

        let isFirst = true;
        Object.entries(groupedMilestones).forEach(([project, milestones]) => {
            // Add separator between projects (except first)
            if (!isFirst) {
                const separatorRow = document.createElement('tr');
                separatorRow.innerHTML = '<td colspan="6" class="project-separator"></td>';
                tbody.appendChild(separatorRow);
            }
            isFirst = false;

            // Add milestone rows with rowspan for project name
            milestones.forEach((milestone, index) => {
                const tr = document.createElement('tr');

                let projectCell = '';
                if (index === 0) {
                    projectCell = `<td rowspan="${milestones.length}"><strong>${this.escapeHtml(project)}</strong></td>`;
                }

                const statusBadgeClass = this.getStatusBadgeClass(milestone.statusBadgeClass);
                const statusBadgeText = this.getStatusBadgeText(milestone.statusBadgeClass, milestone.dueDateBadge);

                tr.innerHTML = `
                    ${projectCell}
                    <td><strong>${this.escapeHtml(milestone.milestone)}</strong></td>
                    <td>${this.escapeHtml(milestone.owner)}</td>
                    <td><span class="date-badge">${this.escapeHtml(milestone.dueDateBadge)}</span></td>
                    <td><span class="status-badge ${statusBadgeClass}">${statusBadgeText}</span></td>
                    <td><div class="workstream-update">${this.escapeHtml(milestone.workstreamUpdate)}</div></td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    getStatusBadgeClass(badgeClass) {
        if (badgeClass.includes('completed')) return 'status-completed';
        if (badgeClass.includes('progress')) return 'status-in-progress';
        if (badgeClass.includes('pending')) return 'status-pending';
        if (badgeClass.includes('risk') || badgeClass.includes('blocked')) return 'status-blocked';
        return 'status-in-progress'; // Default for percentage values
    }

    getStatusBadgeText(badgeClass, dueDateBadge) {
        if (badgeClass.includes('completed')) return 'Completed';
        if (badgeClass.includes('progress')) {
            // Check if there's a percentage in the data
            const match = dueDateBadge?.match(/\d+%/);
            return match ? match[0] : 'In Progress';
        }
        if (badgeClass.includes('pending')) return 'Pending';
        if (badgeClass.includes('risk')) return 'At Risk';
        if (badgeClass.includes('blocked')) return 'At Risk';

        // Check for percentage values
        const percentMatch = badgeClass.match(/\d+%/);
        if (percentMatch) return percentMatch[0];

        return 'Pending';
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