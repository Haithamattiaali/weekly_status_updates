/**
 * TemplateGenerator - Generates Excel templates in the browser
 * Creates pre-formatted Excel files with validation and sample data
 */

import * as ExcelJS from 'exceljs';

export class TemplateGenerator {
    constructor() {
        this.workbook = null;
        this.styles = {
            header: {
                font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } },
                alignment: { horizontal: 'center', vertical: 'middle' }
            },
            subHeader: {
                font: { bold: true, size: 12 },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } },
                alignment: { horizontal: 'left', vertical: 'middle' }
            },
            title: {
                font: { bold: true, size: 16 },
                alignment: { horizontal: 'center', vertical: 'middle' }
            },
            greenStatus: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27AE60' } },
                font: { color: { argb: 'FFFFFFFF' } }
            },
            amberStatus: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF39C12' } },
                font: { color: { argb: 'FF000000' } }
            },
            redStatus: {
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' } },
                font: { color: { argb: 'FFFFFFFF' } }
            },
            date: {
                numFmt: 'mm/dd/yyyy'
            },
            percentage: {
                numFmt: '0.00%'
            },
            number: {
                numFmt: '#,##0.00'
            }
        };
    }

    /**
     * Generate a complete Excel template
     */
    async generateTemplate(options = {}) {
        const {
            type = 'standard', // standard, detailed, minimal
            includeSampleData = true,
            portfolio = 'PROCEED Portfolio',
            projects = ['Project Alpha', 'Project Beta', 'Project Gamma']
        } = options;

        this.workbook = new ExcelJS.Workbook();
        this.setupWorkbookProperties(portfolio);

        // Create sheets based on template type
        switch (type) {
            case 'detailed':
                await this.createDetailedTemplate(portfolio, projects, includeSampleData);
                break;
            case 'minimal':
                await this.createMinimalTemplate(portfolio, projects, includeSampleData);
                break;
            default:
                await this.createStandardTemplate(portfolio, projects, includeSampleData);
                break;
        }

        // Add data validation
        this.addDataValidation();

        // Generate the Excel file
        const buffer = await this.workbook.xlsx.writeBuffer();
        return buffer;
    }

    /**
     * Setup workbook properties
     */
    setupWorkbookProperties(portfolio) {
        this.workbook.creator = 'PROCEED Dashboard';
        this.workbook.lastModifiedBy = 'Template Generator';
        this.workbook.created = new Date();
        this.workbook.modified = new Date();
        this.workbook.properties.title = `${portfolio} Status Template`;
        this.workbook.properties.description = 'Excel template for portfolio status reporting';
        this.workbook.properties.keywords = 'portfolio, status, dashboard, proceed';
    }

    /**
     * Create standard template
     */
    async createStandardTemplate(portfolio, projects, includeSampleData) {
        // Dashboard Overview
        this.createDashboardSheet(portfolio, includeSampleData);

        // Project Status
        this.createStatusSheet(projects, includeSampleData);

        // Milestones
        this.createMilestoneSheet(projects, includeSampleData);

        // Highlights & Lowlights
        this.createHighlightsSheet(projects, includeSampleData);
        this.createLowlightsSheet(projects, includeSampleData);

        // Instructions
        this.createInstructionsSheet();
    }

    /**
     * Create detailed template with additional sheets
     */
    async createDetailedTemplate(portfolio, projects, includeSampleData) {
        // All standard sheets
        await this.createStandardTemplate(portfolio, projects, includeSampleData);

        // Additional detailed sheets
        this.createMetricsSheet(projects, includeSampleData);
        this.createRiskRegisterSheet(projects, includeSampleData);
        this.createResourceSheet(projects, includeSampleData);
        this.createBudgetSheet(projects, includeSampleData);
    }

    /**
     * Create minimal template
     */
    async createMinimalTemplate(portfolio, projects, includeSampleData) {
        // Just the essentials
        this.createDashboardSheet(portfolio, includeSampleData);
        this.createStatusSheet(projects, includeSampleData);
        this.createMilestoneSheet(projects, includeSampleData);
    }

    /**
     * Create Dashboard sheet
     */
    createDashboardSheet(portfolio, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Dashboard');

        // Title
        sheet.mergeCells('A1:H2');
        const titleCell = sheet.getCell('A1');
        titleCell.value = portfolio + ' Dashboard';
        titleCell.style = this.styles.title;

        // Report Information
        sheet.getCell('A4').value = 'Report Date:';
        sheet.getCell('B4').value = new Date();
        sheet.getCell('B4').style = this.styles.date;

        sheet.getCell('A5').value = 'Reporting Period:';
        sheet.getCell('B5').value = this.getCurrentPeriod();

        sheet.getCell('A6').value = 'Prepared By:';
        sheet.getCell('B6').value = includeSampleData ? 'John Smith' : '';

        // Summary Section
        sheet.getCell('A8').value = 'Portfolio Summary';
        sheet.getCell('A8').style = this.styles.subHeader;
        sheet.mergeCells('A8:D8');

        const summaryHeaders = ['Metric', 'Current', 'Previous', 'Change'];
        const summaryData = includeSampleData ? [
            ['Total Projects', 12, 10, '+2'],
            ['Green Status', 8, 7, '+1'],
            ['Amber Status', 3, 2, '+1'],
            ['Red Status', 1, 1, '0'],
            ['Upcoming Milestones', 15, 12, '+3'],
            ['Overdue Tasks', 2, 4, '-2']
        ] : [];

        this.addTableToSheet(sheet, 10, 1, summaryHeaders, summaryData);

        // Key Dates
        sheet.getCell('F8').value = 'Key Dates';
        sheet.getCell('F8').style = this.styles.subHeader;
        sheet.mergeCells('F8:H8');

        const dateHeaders = ['Event', 'Date', 'Status'];
        const dateData = includeSampleData ? [
            ['Q4 Planning Complete', new Date('2024-01-15'), 'Complete'],
            ['Phase 1 Go-Live', new Date('2024-02-01'), 'On Track'],
            ['Security Audit', new Date('2024-02-15'), 'Scheduled'],
            ['Board Review', new Date('2024-03-01'), 'Scheduled']
        ] : [];

        this.addTableToSheet(sheet, 10, 6, dateHeaders, dateData);

        // Format columns
        sheet.columns = [
            { width: 20 }, { width: 15 }, { width: 15 }, { width: 15 },
            { width: 5 },
            { width: 25 }, { width: 15 }, { width: 15 }
        ];

        // Add borders
        this.addBordersToRange(sheet, 'A1:H20');

        return sheet;
    }

    /**
     * Create Status sheet
     */
    createStatusSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Status');

        // Title
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = 'Project Status Report';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Project', 'Status', 'Trend', 'Manager', 'Next Milestone', 'Due Date', 'Notes'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const sampleData = projects.map((project, index) => {
                const statuses = ['green', 'amber', 'red'];
                const trends = ['up', 'flat', 'down'];
                const status = statuses[index % 3];
                const trend = trends[index % 3];

                return [
                    project,
                    status.toUpperCase(),
                    trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→',
                    `Manager ${index + 1}`,
                    `Milestone ${index + 1}`,
                    new Date(Date.now() + (index + 1) * 7 * 24 * 60 * 60 * 1000),
                    `Progress notes for ${project}`
                ];
            });

            sampleData.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    // Apply status color
                    if (colIndex === 1) {
                        const status = value.toLowerCase();
                        if (status === 'green') cell.style = this.styles.greenStatus;
                        else if (status === 'amber') cell.style = this.styles.amberStatus;
                        else if (status === 'red') cell.style = this.styles.redStatus;
                    }

                    // Format date
                    if (colIndex === 5) {
                        cell.style = this.styles.date;
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 12 }, { width: 10 }, { width: 20 },
            { width: 30 }, { width: 15 }, { width: 40 }
        ];

        // Freeze panes
        sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

        return sheet;
    }

    /**
     * Create Milestone sheet
     */
    createMilestoneSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Milestones');

        // Title
        sheet.mergeCells('A1:F1');
        sheet.getCell('A1').value = 'Milestone Tracker';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Project', 'Milestone', 'Owner', 'Due Date', 'Status', 'Comments'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const milestones = [];
            projects.forEach((project, pIndex) => {
                for (let i = 0; i < 3; i++) {
                    const dueDate = new Date(Date.now() + (pIndex * 3 + i) * 5 * 24 * 60 * 60 * 1000);
                    const status = dueDate < new Date() ? 'Overdue' :
                                  dueDate < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? 'At Risk' : 'On Track';

                    milestones.push([
                        project,
                        `${project} - Phase ${i + 1} Completion`,
                        `Owner ${pIndex + 1}`,
                        dueDate,
                        status,
                        `Milestone ${i + 1} progress notes`
                    ]);
                }
            });

            milestones.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    // Format date
                    if (colIndex === 3) {
                        cell.style = this.styles.date;
                    }

                    // Apply status color
                    if (colIndex === 4) {
                        if (value === 'On Track') {
                            cell.style = { ...this.styles.greenStatus, font: { color: { argb: 'FF27AE60' } } };
                        } else if (value === 'At Risk') {
                            cell.style = { ...this.styles.amberStatus, font: { color: { argb: 'FFF39C12' } } };
                        } else if (value === 'Overdue') {
                            cell.style = { ...this.styles.redStatus, font: { color: { argb: 'FFE74C3C' } } };
                        }
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 35 }, { width: 20 }, { width: 15 }, { width: 12 }, { width: 40 }
        ];

        // Freeze panes
        sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

        return sheet;
    }

    /**
     * Create Highlights sheet
     */
    createHighlightsSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Highlights');

        // Title
        sheet.mergeCells('A1:C1');
        sheet.getCell('A1').value = 'Project Highlights';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Project', 'Highlight', 'Impact'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const highlights = [
                ['Project Alpha', 'Successfully completed Phase 1 ahead of schedule', 'High'],
                ['Project Alpha', 'Secured additional funding for expansion', 'Medium'],
                ['Project Beta', 'Key stakeholder approval received', 'High'],
                ['Project Beta', 'Performance improvements achieved 150% target', 'High'],
                ['Project Gamma', 'New partnership agreement signed', 'Medium'],
                ['Overall', 'Team satisfaction score increased to 85%', 'Medium']
            ];

            highlights.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    row.getCell(colIndex + 1).value = value;
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 50 }, { width: 15 }
        ];

        return sheet;
    }

    /**
     * Create Lowlights sheet
     */
    createLowlightsSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Lowlights');

        // Title
        sheet.mergeCells('A1:D1');
        sheet.getCell('A1').value = 'Issues & Risks';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Project', 'Issue/Risk', 'Impact', 'Mitigation'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const lowlights = [
                ['Project Alpha', 'Resource constraints affecting timeline', 'High', 'Hiring additional contractors'],
                ['Project Beta', 'Technical debt accumulation', 'Medium', 'Scheduled refactoring sprint'],
                ['Project Beta', 'Key team member resignation', 'High', 'Knowledge transfer in progress'],
                ['Project Gamma', 'Budget overrun risk', 'Medium', 'Cost optimization review underway'],
                ['Overall', 'Vendor delivery delays', 'Low', 'Alternative suppliers identified']
            ];

            lowlights.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    // Highlight high impact items
                    if (colIndex === 2 && value === 'High') {
                        cell.style = { font: { color: { argb: 'FFE74C3C' }, bold: true } };
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 40 }, { width: 12 }, { width: 40 }
        ];

        return sheet;
    }

    /**
     * Create Metrics sheet
     */
    createMetricsSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Metrics');

        // Title
        sheet.mergeCells('A1:H1');
        sheet.getCell('A1').value = 'Project Metrics';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Project', 'SPI', 'CPI', 'Sev1 Defects', 'Sev2 Defects', 'Open Issues', 'Risk Score', 'Completion %'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const metrics = projects.map((project, index) => [
                project,
                0.95 + Math.random() * 0.2,  // SPI
                0.90 + Math.random() * 0.25, // CPI
                Math.floor(Math.random() * 3), // Sev1
                Math.floor(Math.random() * 8), // Sev2
                Math.floor(Math.random() * 15), // Issues
                Math.floor(Math.random() * 10), // Risk Score
                0.3 + Math.random() * 0.6 // Completion
            ]);

            metrics.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    // Format numbers
                    if (colIndex === 1 || colIndex === 2) {
                        cell.style = this.styles.number;
                    } else if (colIndex === 7) {
                        cell.style = this.styles.percentage;
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 10 }, { width: 10 }, { width: 12 },
            { width: 12 }, { width: 12 }, { width: 12 }, { width: 15 }
        ];

        return sheet;
    }

    /**
     * Create Risk Register sheet
     */
    createRiskRegisterSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Risk Register');

        // Title
        sheet.mergeCells('A1:G1');
        sheet.getCell('A1').value = 'Risk Register';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Risk ID', 'Project', 'Description', 'Probability', 'Impact', 'Score', 'Mitigation'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Add sample risks if requested
        if (includeSampleData) {
            const risks = [];
            projects.forEach((project, pIndex) => {
                for (let i = 0; i < 2; i++) {
                    const probability = Math.floor(Math.random() * 5) + 1;
                    const impact = Math.floor(Math.random() * 5) + 1;
                    risks.push([
                        `R${String(risks.length + 1).padStart(3, '0')}`,
                        project,
                        `Risk description for ${project} item ${i + 1}`,
                        probability,
                        impact,
                        probability * impact,
                        'Mitigation strategy defined'
                    ]);
                }
            });

            risks.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    // Color code risk scores
                    if (colIndex === 5) {
                        if (value >= 15) {
                            cell.style = this.styles.redStatus;
                        } else if (value >= 8) {
                            cell.style = this.styles.amberStatus;
                        } else {
                            cell.style = this.styles.greenStatus;
                        }
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 10 }, { width: 20 }, { width: 40 }, { width: 12 },
            { width: 10 }, { width: 10 }, { width: 35 }
        ];

        return sheet;
    }

    /**
     * Create Resource sheet
     */
    createResourceSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Resources');

        // Title
        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = 'Resource Allocation';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Resource', 'Role', 'Project', 'Allocation %', 'Available From'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const resources = [];
            const roles = ['Developer', 'Designer', 'PM', 'QA', 'Architect'];
            const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];

            projects.forEach((project, pIndex) => {
                for (let i = 0; i < 3; i++) {
                    resources.push([
                        names[Math.floor(Math.random() * names.length)],
                        roles[Math.floor(Math.random() * roles.length)],
                        project,
                        Math.floor(Math.random() * 100) / 100,
                        new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000)
                    ]);
                }
            });

            resources.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    if (colIndex === 3) {
                        cell.style = this.styles.percentage;
                    } else if (colIndex === 4) {
                        cell.style = this.styles.date;
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 20 }, { width: 15 }, { width: 25 }, { width: 15 }, { width: 15 }
        ];

        return sheet;
    }

    /**
     * Create Budget sheet
     */
    createBudgetSheet(projects, includeSampleData) {
        const sheet = this.workbook.addWorksheet('Budget');

        // Title
        sheet.mergeCells('A1:F1');
        sheet.getCell('A1').value = 'Budget Tracking';
        sheet.getCell('A1').style = this.styles.title;

        // Headers
        const headers = ['Project', 'Budget', 'Spent', 'Committed', 'Available', 'Variance %'];
        const headerRow = sheet.getRow(3);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = header;
            cell.style = this.styles.header;
        });

        // Sample data
        if (includeSampleData) {
            const budgets = projects.map(project => {
                const budget = 100000 + Math.floor(Math.random() * 500000);
                const spent = Math.floor(budget * (0.3 + Math.random() * 0.5));
                const committed = Math.floor((budget - spent) * (0.2 + Math.random() * 0.3));
                const available = budget - spent - committed;
                const variance = (budget - spent - committed) / budget;

                return [project, budget, spent, committed, available, variance];
            });

            budgets.forEach((data, rowIndex) => {
                const row = sheet.getRow(rowIndex + 4);
                data.forEach((value, colIndex) => {
                    const cell = row.getCell(colIndex + 1);
                    cell.value = value;

                    // Format currency
                    if (colIndex >= 1 && colIndex <= 4) {
                        cell.numFmt = '$#,##0';
                    } else if (colIndex === 5) {
                        cell.style = this.styles.percentage;
                        // Color code variance
                        if (value < 0) {
                            cell.font = { color: { argb: 'FFE74C3C' } };
                        } else if (value < 0.1) {
                            cell.font = { color: { argb: 'FFF39C12' } };
                        } else {
                            cell.font = { color: { argb: 'FF27AE60' } };
                        }
                    }
                });
            });
        }

        // Column widths
        sheet.columns = [
            { width: 25 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }
        ];

        return sheet;
    }

    /**
     * Create Instructions sheet
     */
    createInstructionsSheet() {
        const sheet = this.workbook.addWorksheet('Instructions');

        // Title
        sheet.mergeCells('A1:D1');
        sheet.getCell('A1').value = 'Template Instructions';
        sheet.getCell('A1').style = this.styles.title;

        // Instructions content
        const instructions = [
            ['Sheet', 'Purpose', 'Required Fields', 'Notes'],
            ['Dashboard', 'Overview and summary', 'Report Date', 'Auto-calculated summaries'],
            ['Status', 'Project health status', 'Project, Status, Manager', 'Use RAG status colors'],
            ['Milestones', 'Key deliverables tracking', 'Project, Milestone, Due Date', 'Track completion status'],
            ['Highlights', 'Positive achievements', 'Description', 'Include project context'],
            ['Lowlights', 'Issues and risks', 'Description, Impact', 'Include mitigation plans'],
            ['Metrics', 'Quantitative measures', 'Project, SPI, CPI', 'Update weekly'],
            ['Risk Register', 'Risk management', 'Risk ID, Probability, Impact', 'Calculate risk scores'],
            ['Resources', 'Team allocation', 'Resource, Project, %', 'Track availability'],
            ['Budget', 'Financial tracking', 'Project, Budget, Spent', 'Monitor variance']
        ];

        // Add instructions to sheet
        instructions.forEach((row, rowIndex) => {
            const sheetRow = sheet.getRow(rowIndex + 3);
            row.forEach((cell, colIndex) => {
                const sheetCell = sheetRow.getCell(colIndex + 1);
                sheetCell.value = cell;
                if (rowIndex === 0) {
                    sheetCell.style = this.styles.header;
                }
            });
        });

        // Add color legend
        sheet.getCell('A15').value = 'Status Color Legend:';
        sheet.getCell('A15').style = this.styles.subHeader;

        sheet.getCell('A16').value = 'GREEN';
        sheet.getCell('A16').style = this.styles.greenStatus;
        sheet.getCell('B16').value = 'On track, no issues';

        sheet.getCell('A17').value = 'AMBER';
        sheet.getCell('A17').style = this.styles.amberStatus;
        sheet.getCell('B17').value = 'Minor issues, monitoring required';

        sheet.getCell('A18').value = 'RED';
        sheet.getCell('A18').style = this.styles.redStatus;
        sheet.getCell('B18').value = 'Critical issues, immediate action required';

        // Add tips
        sheet.getCell('A20').value = 'Tips:';
        sheet.getCell('A20').style = this.styles.subHeader;

        const tips = [
            '1. Update all sheets weekly for accurate reporting',
            '2. Use consistent project names across all sheets',
            '3. Dates should be in MM/DD/YYYY format',
            '4. Percentages should be entered as decimals (e.g., 0.95 for 95%)',
            '5. Save file with date in filename for version control',
            '6. Review with stakeholders before distribution'
        ];

        tips.forEach((tip, index) => {
            sheet.getCell(`A${21 + index}`).value = tip;
        });

        // Column widths
        sheet.columns = [
            { width: 20 }, { width: 30 }, { width: 25 }, { width: 35 }
        ];

        return sheet;
    }

    /**
     * Add data validation to sheets
     */
    addDataValidation() {
        // Status sheet validations
        const statusSheet = this.workbook.getWorksheet('Status');
        if (statusSheet) {
            // Status column validation
            for (let row = 4; row <= 50; row++) {
                statusSheet.getCell(`B${row}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['"GREEN,AMBER,RED"']
                };

                // Trend column validation
                statusSheet.getCell(`C${row}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['"↑,→,↓"']
                };
            }
        }

        // Milestones sheet validations
        const milestoneSheet = this.workbook.getWorksheet('Milestones');
        if (milestoneSheet) {
            for (let row = 4; row <= 100; row++) {
                milestoneSheet.getCell(`E${row}`).dataValidation = {
                    type: 'list',
                    allowBlank: true,
                    formulae: ['"On Track,At Risk,Overdue,Complete"']
                };
            }
        }
    }

    /**
     * Utility: Add table to sheet
     */
    addTableToSheet(sheet, startRow, startCol, headers, data) {
        // Add headers
        const headerRow = sheet.getRow(startRow);
        headers.forEach((header, index) => {
            const cell = headerRow.getCell(startCol + index);
            cell.value = header;
            cell.style = this.styles.subHeader;
        });

        // Add data
        data.forEach((rowData, rowIndex) => {
            const row = sheet.getRow(startRow + rowIndex + 1);
            rowData.forEach((cellData, colIndex) => {
                const cell = row.getCell(startCol + colIndex);
                cell.value = cellData;

                // Apply date format if it's a date
                if (cellData instanceof Date) {
                    cell.style = this.styles.date;
                }
            });
        });
    }

    /**
     * Utility: Add borders to range
     */
    addBordersToRange(sheet, range) {
        const [start, end] = range.split(':');
        const startCol = start.match(/[A-Z]+/)[0];
        const startRow = parseInt(start.match(/\d+/)[0]);
        const endCol = end.match(/[A-Z]+/)[0];
        const endRow = parseInt(end.match(/\d+/)[0]);

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol.charCodeAt(0); col <= endCol.charCodeAt(0); col++) {
                const cell = sheet.getCell(`${String.fromCharCode(col)}${row}`);
                if (!cell.style) cell.style = {};
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
        }
    }

    /**
     * Utility: Get current period string
     */
    getCurrentPeriod() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    }

    /**
     * Download the generated template
     */
    async downloadTemplate(options = {}) {
        const buffer = await this.generateTemplate(options);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = options.filename || `proceed-template-${timestamp}.xlsx`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return filename;
    }
}

// Export singleton instance
export const templateGenerator = new TemplateGenerator();