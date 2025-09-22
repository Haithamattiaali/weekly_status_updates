import ExcelJS from 'exceljs';
import { PortfolioSnapshot, SHEET_NAMES } from '../domain/types.js';

export class TemplateBuilder {
  async buildTemplate(currentData?: PortfolioSnapshot): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Set workbook properties
    workbook.creator = 'PROCEED Dashboard';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Create sheets
    this.createHeadersSheet(workbook, currentData?.headers);
    this.createStatusSheet(workbook, currentData?.status);
    this.createHighlightsSheet(workbook, currentData?.highlights);
    this.createLowlightsSheet(workbook, currentData?.lowlights);
    this.createMilestonesSheet(workbook, currentData?.milestones);
    this.createMetricsSheet(workbook, currentData?.metrics);
    this.createLookupsSheet(workbook, currentData?.lookups);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private createHeadersSheet(workbook: ExcelJS.Workbook, data?: any) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.HEADERS);

    // Headers
    sheet.addRow(['Key', 'Value']);

    // Add data rows
    const rows = [
      ['portfolio', data?.portfolio || 'Enterprise Projects'],
      ['currentPeriodStart', data?.currentPeriodStart || 'Sept 11'],
      ['currentPeriodEnd', data?.currentPeriodEnd || 'Sept 17, 2025'],
      ['comparisonPeriodStart', data?.comparisonPeriodStart || 'Sept 3'],
      ['comparisonPeriodEnd', data?.comparisonPeriodEnd || 'Sept 10, 2025'],
      ['reportDate', data?.reportDate || 'September 17, 2025'],
      ['section_portfolioStatus', data?.sectionTitles?.portfolioStatus || 'Portfolio Projects Status'],
      ['section_highlightsLowlights', data?.sectionTitles?.highlightsLowlights || 'Consolidated Highlights & Lowlights'],
      ['section_keyMilestones', data?.sectionTitles?.keyMilestones || 'Key Milestones by Project'],
      ['th_Project', 'Project'],
      ['th_Status', 'Status'],
      ['th_ProjectManager', 'Project Manager'],
      ['th_NextMilestone', 'Next Milestone'],
    ];

    rows.forEach(row => sheet.addRow(row));

    // Style
    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      B2: 'Enter the portfolio or program name',
      B3: 'Start date of current reporting period',
      B4: 'End date of current reporting period',
      B5: 'Start date of comparison period (optional)',
      B6: 'End date of comparison period (optional)',
      B7: 'Date when report was generated',
      B8: 'Custom title for status section',
      B9: 'Custom title for highlights section',
      B10: 'Custom title for milestones section',
    });

    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 40;
  }

  private createStatusSheet(workbook: ExcelJS.Workbook, data?: any[]) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.STATUS);

    // Headers
    const headers = ['project', 'statusColor', 'trend', 'manager', 'nextMilestone', 'order'];
    sheet.addRow(headers);

    // Add data or sample rows
    if (data && data.length > 0) {
      data.forEach(row => {
        sheet.addRow([
          row.project,
          row.statusColor,
          row.trend,
          row.manager,
          row.nextMilestone,
          row.order || '',
        ]);
      });
    } else {
      // Sample data
      sheet.addRow(['FarEye B2B Transportation', 'amber', 'down', 'Syed Zeeshan Mustafa', 'UAT Completion (Sept 30)', 1]);
      sheet.addRow(['Warehouse Automation Ph2', 'green', 'up', 'Ahmed Al-Rahman', 'Integration Testing (Sept 25)', 2]);
      sheet.addRow(['Digital Transformation', 'red', 'down', 'Sarah Mitchell', 'Platform Selection (Delayed)', 3]);
      sheet.addRow(['Customer Portal Upgrade', 'amber', 'flat', 'John Davies', 'Beta Release (Oct 5)', 4]);
      sheet.addRow(['Supply Chain Optimization', 'green', 'flat', 'Maria Rodriguez', 'Pilot Launch (Oct 1)', 5]);
    }

    // Add data validation for statusColor
    const colorValidation: ExcelJS.DataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"green,amber,red"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Please select green, amber, or red',
    };

    // Add data validation for trend
    const trendValidation: ExcelJS.DataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"up,down,flat"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Trend',
      error: 'Please select up, down, or flat',
    };

    // Apply validations to columns
    for (let i = 2; i <= 100; i++) {
      sheet.getCell(`B${i}`).dataValidation = colorValidation;
      sheet.getCell(`C${i}`).dataValidation = trendValidation;
    }

    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      A1: 'Project name or identifier',
      B1: 'RAG status: green, amber, or red',
      C1: 'Trend direction: up, down, or flat',
      D1: 'Name of project manager',
      E1: 'Next major milestone with date',
      F1: 'Optional: display order (lower numbers appear first)',
    });

    // Set column widths
    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 12;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 25;
    sheet.getColumn(5).width = 35;
    sheet.getColumn(6).width = 10;
  }

  private createHighlightsSheet(workbook: ExcelJS.Workbook, data?: any[]) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.HIGHLIGHTS);

    // Headers
    sheet.addRow(['project', 'description', 'order']);

    // Add data or samples
    if (data && data.length > 0) {
      data.forEach(item => {
        sheet.addRow([item.project || '', item.description, item.order || '']);
      });
    } else {
      sheet.addRow(['FarEye B2B', 'Sprint 1 demo completed successfully', 1]);
      sheet.addRow(['FarEye B2B', 'Master data setup 75% complete', 2]);
      sheet.addRow(['Warehouse', 'Ahead of schedule by 5%', 3]);
      sheet.addRow(['Warehouse', 'Cost savings of 8% achieved', 4]);
    }

    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      A1: 'Optional: Project name (leave blank for general highlight)',
      B1: 'Description of the highlight or achievement',
      C1: 'Optional: display order',
    });

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 60;
    sheet.getColumn(3).width = 10;
  }

  private createLowlightsSheet(workbook: ExcelJS.Workbook, data?: any[]) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.LOWLIGHTS);

    // Headers
    sheet.addRow(['project', 'description', 'order']);

    // Add data or samples
    if (data && data.length > 0) {
      data.forEach(item => {
        sheet.addRow([item.project || '', item.description, item.order || '']);
      });
    } else {
      sheet.addRow(['FarEye B2B', '30+ UAT issues pending classification', 1]);
      sheet.addRow(['FarEye B2B', 'API limited to single order creation', 2]);
      sheet.addRow(['Digital', '15% schedule slippage on critical path', 3]);
      sheet.addRow(['Digital', 'Resource gap - 3 key positions unfilled', 4]);
    }

    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      A1: 'Optional: Project name (leave blank for general lowlight)',
      B1: 'Description of the issue or concern',
      C1: 'Optional: display order',
    });

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 60;
    sheet.getColumn(3).width = 10;
  }

  private createMilestonesSheet(workbook: ExcelJS.Workbook, data?: any[]) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.MILESTONES);

    // Headers
    sheet.addRow(['project', 'milestone', 'owner', 'dueDate', 'statusBadge', 'workstreamUpdate', 'order']);

    // Add data or samples
    if (data && data.length > 0) {
      data.forEach(row => {
        sheet.addRow([
          row.project,
          row.milestone,
          row.owner,
          row.dueDate,
          row.statusBadge,
          row.workstreamUpdate || '',
          row.order || '',
        ]);
      });
    } else {
      sheet.addRow(['FarEye B2B', 'UAT Testing', 'Ismail Farhan', '30-Sep', 'In Progress', 'Testing 60% complete', 1]);
      sheet.addRow(['FarEye B2B', 'API Integration', 'Nischal/Haitham', '25-Sep', 'At Risk', 'Awaiting vendor response', 2]);
      sheet.addRow(['Warehouse', 'Integration Testing', 'QA Team', '25-Sep', 'In Progress', 'On track', 3]);
      sheet.addRow(['Warehouse', 'Go-Live', 'All Teams', '01-Oct', 'Pending', 'Preparation in progress', 4]);
    }

    // Add status badge validation
    const badgeValidation: ExcelJS.DataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Completed,In Progress,Pending,At Risk"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Select: Completed, In Progress, Pending, At Risk, or enter percentage (e.g., 75%)',
    };

    for (let i = 2; i <= 100; i++) {
      sheet.getCell(`E${i}`).dataValidation = badgeValidation;
    }

    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      A1: 'Project name',
      B1: 'Milestone description',
      C1: 'Person responsible for milestone',
      D1: 'Due date (any format)',
      E1: 'Status: Completed, In Progress, Pending, At Risk, or percentage',
      F1: 'Optional: Additional update or notes',
      G1: 'Optional: display order within project',
    });

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 15;
    sheet.getColumn(6).width = 40;
    sheet.getColumn(7).width = 10;
  }

  private createMetricsSheet(workbook: ExcelJS.Workbook, data?: any[]) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.METRICS);

    // Headers
    sheet.addRow(['project', 'spi', 'cpi', 'sev1Defects', 'sev2Defects', 'issues', 'riskScore', 'milestoneCompletion']);

    // Add data if available
    if (data && data.length > 0) {
      data.forEach(row => {
        sheet.addRow([
          row.project,
          row.spi || '',
          row.cpi || '',
          row.sev1Defects || 0,
          row.sev2Defects || 0,
          row.issues || 0,
          row.riskScore || '',
          row.milestoneCompletion || '',
        ]);
      });
    }

    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      A1: 'Project name',
      B1: 'Schedule Performance Index (1.0 = on schedule)',
      C1: 'Cost Performance Index (1.0 = on budget)',
      D1: 'Count of Severity 1 defects',
      E1: 'Count of Severity 2 defects',
      F1: 'Total open issues',
      G1: 'Risk score (0.0 to 1.0)',
      H1: 'Milestone completion rate (0.0 to 1.0)',
    });

    sheet.getColumn(1).width = 25;
    for (let i = 2; i <= 8; i++) {
      sheet.getColumn(i).width = 15;
    }

    // Add note about automatic calculation
    sheet.getCell('A10').value = 'Note: When METRICS sheet is provided, status colors can be automatically calculated';
    sheet.getCell('A10').font = { italic: true, color: { argb: 'FF666666' } };
  }

  private createLookupsSheet(workbook: ExcelJS.Workbook, data?: any) {
    const sheet = workbook.addWorksheet(SHEET_NAMES.LOOKUPS);

    // Headers
    sheet.addRow(['key', 'value']);

    // Default lookups
    const lookups = [
      ['statusColor', 'green'],
      ['statusColor', 'amber'],
      ['statusColor', 'red'],
      ['trend', 'up'],
      ['trend', 'down'],
      ['trend', 'flat'],
      ['statusBadge', 'Completed'],
      ['statusBadge', 'In Progress'],
      ['statusBadge', 'Pending'],
      ['statusBadge', 'At Risk'],
      ['spi.green', '0.98'],
      ['spi.amber', '0.90'],
      ['cpi.green', '0.98'],
      ['cpi.amber', '0.90'],
      ['quality.sev1.amber', '0'],
      ['quality.sev2.amber', '3'],
      ['risk.green', '0.3'],
      ['risk.amber', '0.6'],
    ];

    lookups.forEach(row => sheet.addRow(row));

    this.styleHeaderRow(sheet);
    this.addComments(sheet, {
      A1: 'Lookup category or threshold name',
      B1: 'Valid value or threshold number',
    });

    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 20;

    // Add note
    sheet.getCell('A25').value = 'Note: These values are used for dropdowns and automatic status calculation';
    sheet.getCell('A25').font = { italic: true, color: { argb: 'FF666666' } };
  }

  private styleHeaderRow(sheet: ExcelJS.Worksheet) {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF424046' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 25;

    // Freeze the header row
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

  private addComments(sheet: ExcelJS.Worksheet, comments: Record<string, string>) {
    Object.entries(comments).forEach(([cell, comment]) => {
      const excelCell = sheet.getCell(cell);
      excelCell.note = {
        texts: [{ text: comment }],
        editAs: 'oneCells',
      };
    });
  }
}