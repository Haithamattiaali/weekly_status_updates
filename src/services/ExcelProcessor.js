/**
 * ExcelProcessor - Browser-based Excel file processing
 * Handles Excel parsing, validation, and data extraction entirely client-side
 */

import * as ExcelJS from 'exceljs';

export class ExcelProcessor {
    constructor() {
        this.workbook = null;
        this.validationErrors = [];
        this.warnings = [];
        this.metadata = {};
    }

    /**
     * Process an Excel file from File or ArrayBuffer
     */
    async processFile(input) {
        try {
            this.reset();

            // Load workbook
            this.workbook = new ExcelJS.Workbook();

            if (input instanceof File) {
                const arrayBuffer = await input.arrayBuffer();
                await this.workbook.xlsx.load(arrayBuffer);
                this.metadata.filename = input.name;
                this.metadata.fileSize = input.size;
                this.metadata.lastModified = new Date(input.lastModified);
            } else if (input instanceof ArrayBuffer) {
                await this.workbook.xlsx.load(input);
                this.metadata.fileSize = input.byteLength;
            } else {
                throw new Error('Invalid input type. Expected File or ArrayBuffer');
            }

            // Validate workbook structure
            this.validateWorkbookStructure();

            // Extract data from sheets
            const data = await this.extractData();

            // Transform to dashboard format
            const transformed = this.transformToPortfolioSnapshot(data);

            return {
                success: true,
                data: transformed,
                metadata: this.metadata,
                warnings: this.warnings
            };
        } catch (error) {
            console.error('[ExcelProcessor] Processing failed:', error);
            return {
                success: false,
                error: error.message,
                validationErrors: this.validationErrors,
                warnings: this.warnings
            };
        }
    }

    /**
     * Validate workbook structure
     */
    validateWorkbookStructure() {
        if (!this.workbook || this.workbook.worksheets.length === 0) {
            throw new Error('Invalid Excel file: No worksheets found');
        }

        // Expected sheets for PROCEED dashboard
        const requiredSheets = ['Dashboard', 'Status', 'Milestones'];
        const worksheetNames = this.workbook.worksheets.map(ws => ws.name);

        requiredSheets.forEach(sheetName => {
            if (!worksheetNames.some(name => name.toLowerCase() === sheetName.toLowerCase())) {
                this.warnings.push(`Optional sheet '${sheetName}' not found`);
            }
        });

        this.metadata.sheets = worksheetNames;
        this.metadata.sheetCount = worksheetNames.length;
    }

    /**
     * Extract data from all relevant sheets
     */
    async extractData() {
        const data = {
            headers: {},
            status: [],
            milestones: [],
            highlights: [],
            lowlights: [],
            metrics: []
        };

        // Process each worksheet
        for (const worksheet of this.workbook.worksheets) {
            const sheetName = worksheet.name.toLowerCase();

            switch (sheetName) {
                case 'dashboard':
                    Object.assign(data, this.extractDashboardData(worksheet));
                    break;
                case 'status':
                    data.status = this.extractStatusData(worksheet);
                    break;
                case 'milestones':
                    data.milestones = this.extractMilestoneData(worksheet);
                    break;
                case 'highlights':
                    data.highlights = this.extractHighlightData(worksheet);
                    break;
                case 'lowlights':
                    data.lowlights = this.extractLowlightData(worksheet);
                    break;
                case 'metrics':
                    data.metrics = this.extractMetricsData(worksheet);
                    break;
                default:
                    // Handle custom sheets
                    if (sheetName.includes('project')) {
                        this.extractProjectSpecificData(worksheet, data);
                    }
                    break;
            }
        }

        // Extract headers from first sheet if not found
        if (Object.keys(data.headers).length === 0) {
            const firstSheet = this.workbook.worksheets[0];
            data.headers = this.extractHeaders(firstSheet);
        }

        return data;
    }

    /**
     * Extract dashboard overview data
     */
    extractDashboardData(worksheet) {
        const data = {
            headers: {},
            summary: {}
        };

        // Find header section (usually in first 10 rows)
        for (let rowNum = 1; rowNum <= Math.min(10, worksheet.rowCount); rowNum++) {
            const row = worksheet.getRow(rowNum);
            const firstCell = row.getCell(1).value;

            if (!firstCell) continue;

            const cellValue = String(firstCell).toLowerCase();

            // Portfolio name
            if (cellValue.includes('portfolio')) {
                data.headers.portfolio = this.getCellValue(row.getCell(2)) || 'PROCEED Portfolio';
            }

            // Report date
            if (cellValue.includes('date') || cellValue.includes('as of')) {
                const dateValue = this.getCellValue(row.getCell(2));
                data.headers.reportDate = this.parseDate(dateValue);
            }

            // Period information
            if (cellValue.includes('period')) {
                const periodValue = this.getCellValue(row.getCell(2));
                const periods = this.parsePeriod(periodValue);
                if (periods) {
                    data.headers.currentPeriodStart = periods.start;
                    data.headers.currentPeriodEnd = periods.end;
                }
            }
        }

        return data;
    }

    /**
     * Extract status data from status sheet
     */
    extractStatusData(worksheet) {
        const statusData = [];
        const headers = this.findHeaderRow(worksheet, ['project', 'status', 'manager']);

        if (!headers) {
            this.warnings.push('Could not find status headers');
            return statusData;
        }

        // Process data rows
        for (let rowNum = headers.rowIndex + 1; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);
            const project = this.getCellValue(row.getCell(headers.columns.project));

            if (!project || project === '') continue;

            const status = {
                project: project,
                statusColor: this.parseStatusColor(
                    this.getCellValue(row.getCell(headers.columns.status))
                ),
                trend: this.parseTrend(
                    this.getCellValue(row.getCell(headers.columns.trend || headers.columns.status + 1))
                ),
                manager: this.getCellValue(row.getCell(headers.columns.manager)) || 'TBD',
                nextMilestone: this.getCellValue(row.getCell(headers.columns.milestone || headers.columns.manager + 1)) || 'TBD'
            };

            statusData.push(status);
        }

        return statusData;
    }

    /**
     * Extract milestone data
     */
    extractMilestoneData(worksheet) {
        const milestoneData = [];
        const headers = this.findHeaderRow(worksheet, ['project', 'milestone', 'owner', 'due']);

        if (!headers) {
            this.warnings.push('Could not find milestone headers');
            return milestoneData;
        }

        for (let rowNum = headers.rowIndex + 1; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);
            const project = this.getCellValue(row.getCell(headers.columns.project));

            if (!project) continue;

            const milestone = {
                project: project,
                milestone: this.getCellValue(row.getCell(headers.columns.milestone)) || 'TBD',
                owner: this.getCellValue(row.getCell(headers.columns.owner)) || 'TBD',
                dueDate: this.parseDate(this.getCellValue(row.getCell(headers.columns.due))),
                statusBadge: this.parseStatusColor(
                    this.getCellValue(row.getCell(headers.columns.status || headers.columns.due + 1))
                ),
                workstreamUpdate: this.getCellValue(row.getCell(headers.columns.update || headers.columns.due + 2))
            };

            milestoneData.push(milestone);
        }

        return milestoneData;
    }

    /**
     * Extract highlight data
     */
    extractHighlightData(worksheet) {
        const highlights = [];
        const headers = this.findHeaderRow(worksheet, ['highlight', 'description', 'project']);

        if (!headers) {
            // Try to find highlights in a list format
            for (let rowNum = 1; rowNum <= worksheet.rowCount; rowNum++) {
                const row = worksheet.getRow(rowNum);
                const firstCell = this.getCellValue(row.getCell(1));

                if (firstCell && firstCell !== '' && !this.isHeader(firstCell)) {
                    highlights.push({
                        description: firstCell,
                        project: this.getCellValue(row.getCell(2)) || null
                    });
                }
            }
        } else {
            // Process structured highlights
            for (let rowNum = headers.rowIndex + 1; rowNum <= worksheet.rowCount; rowNum++) {
                const row = worksheet.getRow(rowNum);
                const description = this.getCellValue(row.getCell(headers.columns.highlight || headers.columns.description));

                if (description) {
                    highlights.push({
                        description: description,
                        project: this.getCellValue(row.getCell(headers.columns.project)) || null
                    });
                }
            }
        }

        return highlights;
    }

    /**
     * Extract lowlight data
     */
    extractLowlightData(worksheet) {
        const lowlights = [];
        const headers = this.findHeaderRow(worksheet, ['lowlight', 'issue', 'risk', 'description']);

        if (!headers) {
            // Try to find lowlights in a list format
            for (let rowNum = 1; rowNum <= worksheet.rowCount; rowNum++) {
                const row = worksheet.getRow(rowNum);
                const firstCell = this.getCellValue(row.getCell(1));

                if (firstCell && firstCell !== '' && !this.isHeader(firstCell)) {
                    lowlights.push({
                        description: firstCell,
                        project: this.getCellValue(row.getCell(2)) || null
                    });
                }
            }
        } else {
            // Process structured lowlights
            for (let rowNum = headers.rowIndex + 1; rowNum <= worksheet.rowCount; rowNum++) {
                const row = worksheet.getRow(rowNum);
                const description = this.getCellValue(
                    row.getCell(headers.columns.lowlight || headers.columns.issue || headers.columns.description)
                );

                if (description) {
                    lowlights.push({
                        description: description,
                        project: this.getCellValue(row.getCell(headers.columns.project)) || null
                    });
                }
            }
        }

        return lowlights;
    }

    /**
     * Extract metrics data
     */
    extractMetricsData(worksheet) {
        const metrics = [];
        const headers = this.findHeaderRow(worksheet, ['project', 'spi', 'cpi', 'defects']);

        if (!headers) {
            this.warnings.push('Could not find metrics headers');
            return metrics;
        }

        for (let rowNum = headers.rowIndex + 1; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);
            const project = this.getCellValue(row.getCell(headers.columns.project));

            if (!project) continue;

            const metric = {
                project: project,
                spi: this.parseNumber(this.getCellValue(row.getCell(headers.columns.spi))),
                cpi: this.parseNumber(this.getCellValue(row.getCell(headers.columns.cpi))),
                sev1Defects: this.parseNumber(this.getCellValue(row.getCell(headers.columns.sev1 || headers.columns.defects))),
                sev2Defects: this.parseNumber(this.getCellValue(row.getCell(headers.columns.sev2 || headers.columns.defects + 1))),
                issues: this.parseNumber(this.getCellValue(row.getCell(headers.columns.issues || headers.columns.defects + 2))),
                riskScore: this.parseNumber(this.getCellValue(row.getCell(headers.columns.risk || headers.columns.defects + 3))),
                milestoneCompletion: this.parseNumber(this.getCellValue(row.getCell(headers.columns.completion || headers.columns.defects + 4)))
            };

            metrics.push(metric);
        }

        return metrics;
    }

    /**
     * Extract headers from worksheet
     */
    extractHeaders(worksheet) {
        const headers = {
            portfolio: 'PROCEED Portfolio',
            reportDate: new Date().toISOString().split('T')[0],
            currentPeriodStart: '',
            currentPeriodEnd: '',
            sectionTitles: {},
            tableHeaders: {}
        };

        // Extract from specific cells or patterns
        for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
            const row = worksheet.getRow(rowNum);

            for (let colNum = 1; colNum <= Math.min(10, row.cellCount); colNum++) {
                const cell = row.getCell(colNum);
                const value = this.getCellValue(cell);

                if (!value) continue;

                const lowerValue = value.toLowerCase();

                if (lowerValue.includes('portfolio') && !headers.portfolio) {
                    headers.portfolio = value.replace(/portfolio:?/i, '').trim() || 'PROCEED Portfolio';
                }

                if ((lowerValue.includes('date') || lowerValue.includes('as of')) && !headers.reportDate) {
                    const nextCell = this.getCellValue(row.getCell(colNum + 1));
                    if (nextCell) {
                        headers.reportDate = this.parseDate(nextCell);
                    }
                }
            }
        }

        return headers;
    }

    /**
     * Find header row in worksheet
     */
    findHeaderRow(worksheet, searchTerms) {
        for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
            const row = worksheet.getRow(rowNum);
            const columns = {};
            let foundCount = 0;

            for (let colNum = 1; colNum <= row.cellCount; colNum++) {
                const cellValue = this.getCellValue(row.getCell(colNum));
                if (!cellValue) continue;

                const lowerValue = cellValue.toLowerCase();

                searchTerms.forEach(term => {
                    if (lowerValue.includes(term.toLowerCase())) {
                        columns[term] = colNum;
                        foundCount++;
                    }
                });
            }

            if (foundCount >= Math.ceil(searchTerms.length / 2)) {
                return { rowIndex: rowNum, columns };
            }
        }

        return null;
    }

    /**
     * Extract project-specific data
     */
    extractProjectSpecificData(worksheet, data) {
        // Extract any project-specific information
        const projectName = worksheet.name.replace(/project[_\s-]*/i, '').trim();

        // Try to extract status
        const statusCell = this.findCellWithText(worksheet, ['status', 'rag', 'health']);
        if (statusCell) {
            const statusValue = this.getCellValue(worksheet.getCell(statusCell.row, statusCell.col + 1));
            if (statusValue) {
                data.status.push({
                    project: projectName,
                    statusColor: this.parseStatusColor(statusValue),
                    trend: 'flat',
                    manager: 'TBD',
                    nextMilestone: 'TBD'
                });
            }
        }
    }

    /**
     * Find cell containing specific text
     */
    findCellWithText(worksheet, searchTerms) {
        for (let rowNum = 1; rowNum <= worksheet.rowCount; rowNum++) {
            const row = worksheet.getRow(rowNum);
            for (let colNum = 1; colNum <= row.cellCount; colNum++) {
                const cellValue = this.getCellValue(row.getCell(colNum));
                if (!cellValue) continue;

                const lowerValue = cellValue.toLowerCase();
                if (searchTerms.some(term => lowerValue.includes(term.toLowerCase()))) {
                    return { row: rowNum, col: colNum };
                }
            }
        }
        return null;
    }

    /**
     * Transform extracted data to PortfolioSnapshot format
     */
    transformToPortfolioSnapshot(data) {
        const snapshot = {
            domainData: {
                headers: data.headers || {},
                status: data.status || [],
                milestones: data.milestones || [],
                highlights: data.highlights || [],
                lowlights: data.lowlights || [],
                metrics: data.metrics || []
            },
            viewModel: this.generateViewModel(data),
            metadata: {
                ...this.metadata,
                extractedAt: new Date().toISOString(),
                projectCount: data.status.length,
                milestoneCount: data.milestones.length,
                highlightCount: data.highlights.length,
                lowlightCount: data.lowlights.length
            }
        };

        // Enrich with calculated fields
        this.enrichSnapshot(snapshot);

        return snapshot;
    }

    /**
     * Generate view model for dashboard rendering
     */
    generateViewModel(data) {
        const viewModel = {
            summary: {
                totalProjects: data.status.length,
                greenProjects: data.status.filter(s => s.statusColor === 'green').length,
                amberProjects: data.status.filter(s => s.statusColor === 'amber').length,
                redProjects: data.status.filter(s => s.statusColor === 'red').length,
                upcomingMilestones: data.milestones.filter(m => {
                    const dueDate = new Date(m.dueDate);
                    const inTwoWeeks = new Date();
                    inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
                    return dueDate <= inTwoWeeks && dueDate >= new Date();
                }).length,
                overdueMilestones: data.milestones.filter(m => {
                    const dueDate = new Date(m.dueDate);
                    return dueDate < new Date();
                }).length
            },
            charts: {
                statusDistribution: this.calculateStatusDistribution(data.status),
                trendAnalysis: this.calculateTrendAnalysis(data.status),
                milestoneTimeline: this.generateMilestoneTimeline(data.milestones),
                riskMatrix: this.generateRiskMatrix(data.metrics)
            }
        };

        return viewModel;
    }

    /**
     * Enrich snapshot with calculated fields
     */
    enrichSnapshot(snapshot) {
        // Add risk scores
        snapshot.domainData.status.forEach(status => {
            if (!status.riskScore) {
                status.riskScore = this.calculateRiskScore(status);
            }
        });

        // Sort by priority
        snapshot.domainData.status.sort((a, b) => {
            const priority = { red: 3, amber: 2, green: 1 };
            return (priority[b.statusColor] || 0) - (priority[a.statusColor] || 0);
        });

        // Add milestone badges
        snapshot.domainData.milestones.forEach(milestone => {
            if (!milestone.statusBadge) {
                const dueDate = new Date(milestone.dueDate);
                const today = new Date();
                const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                if (daysUntilDue < 0) {
                    milestone.statusBadge = 'red';
                } else if (daysUntilDue <= 7) {
                    milestone.statusBadge = 'amber';
                } else {
                    milestone.statusBadge = 'green';
                }
            }
        });
    }

    /**
     * Calculate status distribution
     */
    calculateStatusDistribution(statusData) {
        const distribution = {
            green: 0,
            amber: 0,
            red: 0
        };

        statusData.forEach(status => {
            distribution[status.statusColor]++;
        });

        return distribution;
    }

    /**
     * Calculate trend analysis
     */
    calculateTrendAnalysis(statusData) {
        const trends = {
            improving: statusData.filter(s => s.trend === 'up').length,
            stable: statusData.filter(s => s.trend === 'flat').length,
            declining: statusData.filter(s => s.trend === 'down').length
        };

        return trends;
    }

    /**
     * Generate milestone timeline
     */
    generateMilestoneTimeline(milestones) {
        const timeline = milestones
            .map(m => ({
                ...m,
                dueDateParsed: new Date(m.dueDate)
            }))
            .sort((a, b) => a.dueDateParsed - b.dueDateParsed)
            .slice(0, 10); // Top 10 upcoming

        return timeline;
    }

    /**
     * Generate risk matrix
     */
    generateRiskMatrix(metrics) {
        const matrix = {
            high: [],
            medium: [],
            low: []
        };

        metrics.forEach(m => {
            const riskLevel = this.calculateRiskLevel(m);
            matrix[riskLevel].push(m.project);
        });

        return matrix;
    }

    /**
     * Calculate risk score for status
     */
    calculateRiskScore(status) {
        let score = 0;

        // Status color contributes to risk
        if (status.statusColor === 'red') score += 3;
        else if (status.statusColor === 'amber') score += 2;
        else score += 1;

        // Trend contributes to risk
        if (status.trend === 'down') score += 2;
        else if (status.trend === 'flat') score += 1;

        return score;
    }

    /**
     * Calculate risk level from metrics
     */
    calculateRiskLevel(metrics) {
        const score = (metrics.riskScore || 0) +
                     (metrics.sev1Defects || 0) * 3 +
                     (metrics.sev2Defects || 0) * 1;

        if (score > 10) return 'high';
        if (score > 5) return 'medium';
        return 'low';
    }

    /**
     * Utility: Get cell value safely
     */
    getCellValue(cell) {
        if (!cell) return null;

        if (cell.value && cell.value.result !== undefined) {
            return cell.value.result;
        }

        if (cell.value && cell.value.richText) {
            return cell.value.richText.map(rt => rt.text).join('');
        }

        if (cell.text) {
            return cell.text;
        }

        return cell.value;
    }

    /**
     * Utility: Parse date
     */
    parseDate(value) {
        if (!value) return new Date().toISOString().split('T')[0];

        if (value instanceof Date) {
            return value.toISOString().split('T')[0];
        }

        if (typeof value === 'number') {
            // Excel date number
            const date = new Date((value - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
        }

        if (typeof value === 'string') {
            try {
                const date = new Date(value);
                if (!isNaN(date)) {
                    return date.toISOString().split('T')[0];
                }
            } catch {
                // Fall through
            }
        }

        return new Date().toISOString().split('T')[0];
    }

    /**
     * Utility: Parse period
     */
    parsePeriod(value) {
        if (!value) return null;

        const match = value.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (match) {
            return {
                start: this.parseDate(match[1]),
                end: this.parseDate(match[2])
            };
        }

        return null;
    }

    /**
     * Utility: Parse status color
     */
    parseStatusColor(value) {
        if (!value) return 'green';

        const lowerValue = String(value).toLowerCase();

        if (lowerValue.includes('red') || lowerValue === 'r') return 'red';
        if (lowerValue.includes('amber') || lowerValue.includes('yellow') || lowerValue === 'a' || lowerValue === 'y') return 'amber';
        if (lowerValue.includes('green') || lowerValue === 'g') return 'green';

        // Check for color codes
        if (value === 3 || value === '3') return 'red';
        if (value === 2 || value === '2') return 'amber';
        if (value === 1 || value === '1') return 'green';

        return 'green'; // Default
    }

    /**
     * Utility: Parse trend
     */
    parseTrend(value) {
        if (!value) return 'flat';

        const lowerValue = String(value).toLowerCase();

        if (lowerValue.includes('up') || lowerValue.includes('↑') || lowerValue === '+') return 'up';
        if (lowerValue.includes('down') || lowerValue.includes('↓') || lowerValue === '-') return 'down';

        return 'flat';
    }

    /**
     * Utility: Parse number
     */
    parseNumber(value) {
        if (value === null || value === undefined || value === '') return null;

        const num = parseFloat(value);
        return isNaN(num) ? null : num;
    }

    /**
     * Utility: Check if value is likely a header
     */
    isHeader(value) {
        const headers = ['project', 'status', 'milestone', 'owner', 'date', 'highlight', 'lowlight', 'metric'];
        const lowerValue = String(value).toLowerCase();
        return headers.some(h => lowerValue.includes(h));
    }

    /**
     * Reset processor state
     */
    reset() {
        this.workbook = null;
        this.validationErrors = [];
        this.warnings = [];
        this.metadata = {};
    }
}

// Export singleton instance
export const excelProcessor = new ExcelProcessor();