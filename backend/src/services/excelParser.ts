import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  PortfolioSnapshot,
  Headers,
  StatusRow,
  HighlightLowlight,
  MilestoneRow,
  MetricsRow,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  SHEET_NAMES,
  StatusColorEnum,
  TrendEnum,
  StatusBadgeEnum,
} from '../domain/types.js';

export class ExcelParser {
  private workbook: ExcelJS.Workbook | null = null;
  private errors: ValidationError[] = [];
  private warnings: ValidationWarning[] = [];

  async read(buffer: Buffer): Promise<ExcelJS.Workbook> {
    this.workbook = new ExcelJS.Workbook();
    await this.workbook.xlsx.load(buffer);
    return this.workbook;
  }

  async validate(workbook: ExcelJS.Workbook): Promise<ValidationResult> {
    this.workbook = workbook;
    this.errors = [];
    this.warnings = [];

    try {
      const headers = this.parseHeaders();
      const status = this.parseStatus();
      const highlights = this.parseHighlights();
      const lowlights = this.parseLowlights();
      const milestones = this.parseMilestones();
      const metrics = this.parseMetrics();
      const lookups = this.parseLookups();

      if (this.errors.length > 0) {
        return {
          ok: false,
          errors: this.errors,
          warnings: this.warnings,
        };
      }

      const data: PortfolioSnapshot = {
        headers,
        status,
        highlights,
        lowlights,
        milestones,
        metrics: metrics.length > 0 ? metrics : undefined,
        lookups: Object.keys(lookups).length > 0 ? lookups : undefined,
      };

      return {
        ok: true,
        errors: [],
        warnings: this.warnings,
        data,
      };
    } catch (error) {
      this.errors.push({
        sheet: 'GENERAL',
        row: 0,
        column: '',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        ok: false,
        errors: this.errors,
        warnings: this.warnings,
      };
    }
  }

  private parseHeaders(): Headers {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.HEADERS);
    if (!sheet) {
      throw new Error(`Sheet ${SHEET_NAMES.HEADERS} not found`);
    }

    const headers: any = {
      portfolio: '',
      currentPeriodStart: '',
      currentPeriodEnd: '',
      reportDate: '',
    };

    // Parse key-value pairs from rows
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const key = this.getCellValue(row, 1);
      const value = this.getCellValue(row, 2);

      if (key && value) {
        const cleanKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

        if (cleanKey.includes('portfolio')) headers.portfolio = String(value);
        else if (cleanKey.includes('currentperiodstart')) headers.currentPeriodStart = String(value);
        else if (cleanKey.includes('currentperiodend')) headers.currentPeriodEnd = String(value);
        else if (cleanKey.includes('comparisonperiodstart')) headers.comparisonPeriodStart = String(value);
        else if (cleanKey.includes('comparisonperiodend')) headers.comparisonPeriodEnd = String(value);
        else if (cleanKey.includes('reportdate')) headers.reportDate = String(value);
        else if (cleanKey.startsWith('section')) {
          if (!headers.sectionTitles) headers.sectionTitles = {};
          const sectionKey = cleanKey.replace('section', '');
          headers.sectionTitles[sectionKey] = String(value);
        }
        else if (cleanKey.startsWith('th')) {
          if (!headers.tableHeaders) headers.tableHeaders = {};
          const headerKey = cleanKey.replace('th', '');
          headers.tableHeaders[headerKey] = String(value);
        }
      }
    });

    // Validate required fields
    if (!headers.portfolio) {
      this.errors.push({
        sheet: SHEET_NAMES.HEADERS,
        row: 2,
        column: 'portfolio',
        reason: 'Portfolio name is required',
      });
    }

    return headers;
  }

  private parseStatus(): StatusRow[] {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.STATUS);
    if (!sheet) {
      throw new Error(`Sheet ${SHEET_NAMES.STATUS} not found`);
    }

    const statusRows: StatusRow[] = [];
    const headerRow = sheet.getRow(1);
    const columnMap = this.getColumnMap(headerRow);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const project = this.getCellValue(row, columnMap.project);
      if (!project) return; // Skip empty rows

      try {
        const statusColor = this.getCellValue(row, columnMap.statuscolor) || 'green';
        const trend = this.getCellValue(row, columnMap.trend) || 'flat';

        const statusRow: StatusRow = {
          project: String(project),
          statusColor: StatusColorEnum.parse(statusColor.toLowerCase()),
          trend: TrendEnum.parse(trend.toLowerCase()),
          manager: String(this.getCellValue(row, columnMap.manager) || ''),
          nextMilestone: String(this.getCellValue(row, columnMap.nextmilestone) || ''),
          order: Number(this.getCellValue(row, columnMap.order)) || rowNumber,
        };

        statusRows.push(statusRow);
      } catch (error) {
        this.errors.push({
          sheet: SHEET_NAMES.STATUS,
          row: rowNumber,
          column: 'statusColor or trend',
          reason: error instanceof Error ? error.message : 'Invalid value',
          value: { statusColor: this.getCellValue(row, columnMap.statuscolor), trend: this.getCellValue(row, columnMap.trend) },
        });
      }
    });

    return statusRows;
  }

  private parseHighlights(): HighlightLowlight[] {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.HIGHLIGHTS);
    if (!sheet) {
      this.warnings.push({
        sheet: SHEET_NAMES.HIGHLIGHTS,
        message: 'Highlights sheet not found, using empty list',
      });
      return [];
    }

    return this.parseHighlightLowlightSheet(sheet, 'highlight');
  }

  private parseLowlights(): HighlightLowlight[] {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.LOWLIGHTS);
    if (!sheet) {
      this.warnings.push({
        sheet: SHEET_NAMES.LOWLIGHTS,
        message: 'Lowlights sheet not found, using empty list',
      });
      return [];
    }

    return this.parseHighlightLowlightSheet(sheet, 'lowlight');
  }

  private parseHighlightLowlightSheet(sheet: ExcelJS.Worksheet, kind: 'highlight' | 'lowlight'): HighlightLowlight[] {
    const items: HighlightLowlight[] = [];
    const headerRow = sheet.getRow(1);
    const columnMap = this.getColumnMap(headerRow);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const description = this.getCellValue(row, columnMap.description);
      if (!description) return;

      items.push({
        kind,
        project: this.getCellValue(row, columnMap.project) || undefined,
        description: String(description),
        order: Number(this.getCellValue(row, columnMap.order)) || rowNumber,
      });
    });

    return items;
  }

  private parseMilestones(): MilestoneRow[] {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.MILESTONES);
    if (!sheet) {
      throw new Error(`Sheet ${SHEET_NAMES.MILESTONES} not found`);
    }

    const milestones: MilestoneRow[] = [];
    const headerRow = sheet.getRow(1);
    const columnMap = this.getColumnMap(headerRow);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const project = this.getCellValue(row, columnMap.project);
      const milestone = this.getCellValue(row, columnMap.milestone);

      if (!project || !milestone) return;

      try {
        const statusBadge = String(this.getCellValue(row, columnMap.statusbadge) || 'Pending');

        milestones.push({
          project: String(project),
          milestone: String(milestone),
          owner: String(this.getCellValue(row, columnMap.owner) || ''),
          dueDate: String(this.getCellValue(row, columnMap.duedate) || ''),
          statusBadge: StatusBadgeEnum.parse(statusBadge),
          workstreamUpdate: this.getCellValue(row, columnMap.workstreamupdate) || undefined,
          order: Number(this.getCellValue(row, columnMap.order)) || rowNumber,
        });
      } catch (error) {
        this.errors.push({
          sheet: SHEET_NAMES.MILESTONES,
          row: rowNumber,
          column: 'statusBadge',
          reason: 'Invalid status badge value',
          value: this.getCellValue(row, columnMap.statusbadge),
        });
      }
    });

    return milestones;
  }

  private parseMetrics(): MetricsRow[] {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.METRICS);
    if (!sheet) {
      return [];
    }

    const metrics: MetricsRow[] = [];
    const headerRow = sheet.getRow(1);
    const columnMap = this.getColumnMap(headerRow);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const project = this.getCellValue(row, columnMap.project);
      if (!project) return;

      metrics.push({
        project: String(project),
        spi: this.parseNumber(this.getCellValue(row, columnMap.spi)),
        cpi: this.parseNumber(this.getCellValue(row, columnMap.cpi)),
        sev1Defects: this.parseNumber(this.getCellValue(row, columnMap.sev1defects)),
        sev2Defects: this.parseNumber(this.getCellValue(row, columnMap.sev2defects)),
        issues: this.parseNumber(this.getCellValue(row, columnMap.issues)),
        riskScore: this.parseNumber(this.getCellValue(row, columnMap.riskscore)),
        milestoneCompletion: this.parseNumber(this.getCellValue(row, columnMap.milestonecompletion)),
      });
    });

    return metrics;
  }

  private parseLookups(): Record<string, string[]> {
    const sheet = this.workbook?.getWorksheet(SHEET_NAMES.LOOKUPS);
    if (!sheet) {
      return {};
    }

    const lookups: Record<string, string[]> = {};
    const headerRow = sheet.getRow(1);
    const columnMap = this.getColumnMap(headerRow);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const key = this.getCellValue(row, columnMap.key || 1);
      const value = this.getCellValue(row, columnMap.value || 2);

      if (key && value) {
        const keyStr = String(key);
        if (!lookups[keyStr]) {
          lookups[keyStr] = [];
        }
        lookups[keyStr].push(String(value));
      }
    });

    return lookups;
  }

  async buildImportReport(
    workbook: ExcelJS.Workbook,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<Buffer> {
    const reportSheet = workbook.addWorksheet(SHEET_NAMES.IMPORT_REPORT);

    // Set tab color to red for errors
    reportSheet.properties.tabColor = { argb: 'FFFF0000' };

    // Headers
    reportSheet.addRow(['Import Report', '', '', '']);
    reportSheet.addRow(['Generated', new Date().toISOString(), '', '']);
    reportSheet.addRow(['', '', '', '']);

    // Errors section
    reportSheet.addRow(['ERRORS', '', '', '']);
    reportSheet.addRow(['Sheet', 'Row', 'Column', 'Reason']);

    errors.forEach(error => {
      reportSheet.addRow([error.sheet, error.row, error.column, error.reason]);
    });

    reportSheet.addRow(['', '', '', '']);

    // Warnings section
    reportSheet.addRow(['WARNINGS', '', '', '']);
    reportSheet.addRow(['Sheet', 'Message', '', '']);

    warnings.forEach(warning => {
      reportSheet.addRow([warning.sheet, warning.message, '', '']);
    });

    // Style the report
    reportSheet.getColumn(1).width = 20;
    reportSheet.getColumn(2).width = 10;
    reportSheet.getColumn(3).width = 15;
    reportSheet.getColumn(4).width = 50;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private getCellValue(row: ExcelJS.Row, column: number): any {
    if (!column || column < 1) return null;
    const cell = row.getCell(column);
    return cell.value;
  }

  private getColumnMap(headerRow: ExcelJS.Row): Record<string, number> {
    const columnMap: Record<string, number> = {};

    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (header) {
        columnMap[header] = colNumber;
      }
    });

    return columnMap;
  }

  private parseNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }
}