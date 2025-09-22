import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';
import { z } from 'zod';

// Environment validation
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_AUTH_TOKEN: z.string().optional(),
});

// Generate Excel template with current data or empty template
async function generateExcelTemplate(currentData?: any): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Set workbook properties
  workbook.creator = 'PROCEED Dashboard';
  workbook.lastModifiedBy = 'PROCEED Dashboard API';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Define styles
  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF424046' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    },
  };

  const labelStyle: Partial<ExcelJS.Style> = {
    font: { bold: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F4' } },
  };

  // 1. Headers Sheet
  const headersSheet = workbook.addWorksheet('Headers', {
    properties: { tabColor: { argb: 'FF9E1F63' } },
  });

  headersSheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 40 },
    { header: 'Description', key: 'description', width: 50 },
  ];

  // Apply header style
  headersSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  // Add header data
  const headerData = currentData?.headers || {};
  const headerRows = [
    {
      field: 'Portfolio',
      value: headerData.portfolio || 'PROCEED Portfolio',
      description: 'Name of the portfolio being reported',
    },
    {
      field: 'Current Period Start',
      value: headerData.currentPeriodStart || new Date().toISOString().split('T')[0],
      description: 'Start date of the current reporting period (YYYY-MM-DD)',
    },
    {
      field: 'Current Period End',
      value: headerData.currentPeriodEnd || new Date().toISOString().split('T')[0],
      description: 'End date of the current reporting period (YYYY-MM-DD)',
    },
    {
      field: 'Comparison Period Start',
      value: headerData.comparisonPeriodStart || '',
      description: 'Optional: Start date for comparison period',
    },
    {
      field: 'Comparison Period End',
      value: headerData.comparisonPeriodEnd || '',
      description: 'Optional: End date for comparison period',
    },
    {
      field: 'Report Date',
      value: headerData.reportDate || new Date().toISOString().split('T')[0],
      description: 'Date this report was generated (YYYY-MM-DD)',
    },
  ];

  headerRows.forEach((row, index) => {
    const excelRow = headersSheet.addRow(row);
    excelRow.getCell('field').style = labelStyle;
  });

  // 2. Status Summary Sheet
  const statusSheet = workbook.addWorksheet('Status Summary', {
    properties: { tabColor: { argb: 'FF00A86B' } },
  });

  statusSheet.columns = [
    { header: 'Project', key: 'project', width: 35 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Trend', key: 'trend', width: 15 },
    { header: 'PM/Owner', key: 'manager', width: 25 },
    { header: 'Next Milestone', key: 'nextMilestone', width: 40 },
  ];

  statusSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  // Add status data or sample rows
  const statusData = currentData?.statusSummary || [
    {
      project: 'Example Project Alpha',
      status: 'green',
      trend: 'up',
      manager: 'John Smith',
      nextMilestone: 'Phase 2 Completion - Q1 2025',
    },
    {
      project: 'Example Project Beta',
      status: 'amber',
      trend: 'flat',
      manager: 'Jane Doe',
      nextMilestone: 'Testing Complete - Q2 2025',
    },
  ];

  statusData.forEach((row: any) => {
    const excelRow = statusSheet.addRow({
      project: row.project,
      status: row.statusColor || row.status,
      trend: row.trend,
      manager: row.manager,
      nextMilestone: row.nextMilestone,
    });

    // Color code status cell
    const statusCell = excelRow.getCell('status');
    const statusValue = String(statusCell.value).toLowerCase();
    if (statusValue === 'green') {
      statusCell.style = { ...statusCell.style, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00A86B' } } };
    } else if (statusValue === 'amber') {
      statusCell.style = { ...statusCell.style, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC107' } } };
    } else if (statusValue === 'red') {
      statusCell.style = { ...statusCell.style, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } } };
    }
  });

  // Add data validation for status and trend
  statusSheet.dataValidations.add('B2:B100', {
    type: 'list',
    allowBlank: false,
    formulae: ['"green,amber,red"'],
    showErrorMessage: true,
    errorTitle: 'Invalid Status',
    error: 'Please select green, amber, or red',
  });

  statusSheet.dataValidations.add('C2:C100', {
    type: 'list',
    allowBlank: false,
    formulae: ['"up,down,flat"'],
    showErrorMessage: true,
    errorTitle: 'Invalid Trend',
    error: 'Please select up, down, or flat',
  });

  // 3. Highlights Sheet
  const highlightsSheet = workbook.addWorksheet('Highlights', {
    properties: { tabColor: { argb: 'FF28A745' } },
  });

  highlightsSheet.columns = [
    { header: 'Project', key: 'project', width: 35 },
    { header: 'Highlight', key: 'description', width: 80 },
  ];

  highlightsSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  const highlights = currentData?.highlights || [
    { project: 'Example Project Alpha', description: 'Successfully completed Phase 1 ahead of schedule' },
    { project: 'Example Project Beta', description: 'Secured additional funding for expansion' },
  ];

  highlights.forEach((row: any) => {
    highlightsSheet.addRow(row);
  });

  // 4. Lowlights Sheet
  const lowlightsSheet = workbook.addWorksheet('Lowlights', {
    properties: { tabColor: { argb: 'FFDC3545' } },
  });

  lowlightsSheet.columns = [
    { header: 'Project', key: 'project', width: 35 },
    { header: 'Lowlight/Risk', key: 'description', width: 80 },
  ];

  lowlightsSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  const lowlights = currentData?.lowlights || [
    { project: 'Example Project Alpha', description: 'Resource constraints may impact Q2 timeline' },
    { project: 'Example Project Beta', description: 'Technical debt accumulating in legacy modules' },
  ];

  lowlights.forEach((row: any) => {
    lowlightsSheet.addRow(row);
  });

  // 5. Upcoming Milestones Sheet
  const milestonesSheet = workbook.addWorksheet('Upcoming Milestones', {
    properties: { tabColor: { argb: 'FF007BFF' } },
  });

  milestonesSheet.columns = [
    { header: 'Project', key: 'project', width: 35 },
    { header: 'Milestone', key: 'milestone', width: 40 },
    { header: 'Owner', key: 'owner', width: 25 },
    { header: 'Due Date', key: 'dueDate', width: 15 },
    { header: 'Status', key: 'statusBadge', width: 15 },
    { header: 'Workstream Update', key: 'workstreamUpdate', width: 50 },
  ];

  milestonesSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  const milestones = currentData?.milestones || [
    {
      project: 'Example Project Alpha',
      milestone: 'Phase 2 Kickoff',
      owner: 'John Smith',
      dueDate: '2025-03-15',
      statusBadge: 'On Track',
      workstreamUpdate: 'Requirements gathering in progress',
    },
    {
      project: 'Example Project Beta',
      milestone: 'UAT Complete',
      owner: 'Jane Doe',
      dueDate: '2025-04-30',
      statusBadge: 'At Risk',
      workstreamUpdate: 'Testing environment setup delayed',
    },
  ];

  milestones.forEach((row: any) => {
    milestonesSheet.addRow(row);
  });

  // Add data validation for milestone status
  milestonesSheet.dataValidations.add('E2:E100', {
    type: 'list',
    allowBlank: false,
    formulae: ['"On Track,At Risk,Delayed,Complete"'],
    showErrorMessage: true,
    errorTitle: 'Invalid Status',
    error: 'Please select: On Track, At Risk, Delayed, or Complete',
  });

  // 6. Metrics Sheet
  const metricsSheet = workbook.addWorksheet('Metrics', {
    properties: { tabColor: { argb: 'FF6C757D' } },
  });

  metricsSheet.columns = [
    { header: 'Project', key: 'project', width: 35 },
    { header: 'SPI', key: 'spi', width: 10 },
    { header: 'CPI', key: 'cpi', width: 10 },
    { header: 'Sev1 Defects', key: 'sev1Defects', width: 15 },
    { header: 'Sev2 Defects', key: 'sev2Defects', width: 15 },
    { header: 'Issues', key: 'issues', width: 10 },
    { header: 'Risk Score', key: 'riskScore', width: 12 },
    { header: 'Milestone %', key: 'milestoneCompletion', width: 15 },
  ];

  metricsSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  const metrics = currentData?.metrics || [
    {
      project: 'Example Project Alpha',
      spi: 1.05,
      cpi: 0.98,
      sev1Defects: 0,
      sev2Defects: 3,
      issues: 5,
      riskScore: 2.5,
      milestoneCompletion: 85,
    },
    {
      project: 'Example Project Beta',
      spi: 0.92,
      cpi: 1.02,
      sev1Defects: 1,
      sev2Defects: 7,
      issues: 12,
      riskScore: 4.0,
      milestoneCompletion: 60,
    },
  ];

  metrics.forEach((row: any) => {
    metricsSheet.addRow(row);
  });

  // 7. Instructions Sheet
  const instructionsSheet = workbook.addWorksheet('Instructions', {
    properties: { tabColor: { argb: 'FF17A2B8' } },
  });

  instructionsSheet.columns = [
    { header: 'Instructions for Using This Template', key: 'instructions', width: 100 },
  ];

  instructionsSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle;
  });

  const instructions = [
    '',
    '📋 GENERAL GUIDELINES',
    '• Fill out all sheets with your project data',
    '• Use the exact column headers as provided',
    '• Dates should be in YYYY-MM-DD format',
    '• Status values must be: green, amber, or red (lowercase)',
    '• Trend values must be: up, down, or flat (lowercase)',
    '',
    '📊 SHEET DESCRIPTIONS',
    '',
    '1. Headers: Basic information about the portfolio and reporting period',
    '2. Status Summary: Current status of all projects in the portfolio',
    '3. Highlights: Positive achievements and successes',
    '4. Lowlights: Challenges, risks, and issues',
    '5. Upcoming Milestones: Key deliverables and their status',
    '6. Metrics: Quantitative project metrics (optional)',
    '',
    '💡 TIPS',
    '• You can add more rows as needed',
    '• Leave optional fields blank if not applicable',
    '• Use data validation dropdowns where provided',
    '• Save as .xlsx format before uploading',
    '',
    '📤 UPLOADING',
    '• Save this file with your updates',
    '• Go to the dashboard and use the Upload feature',
    '• Select this file and click Upload',
    '• Review the preview before committing',
  ];

  instructions.forEach((line) => {
    const row = instructionsSheet.addRow([line]);
    if (line.startsWith('📋') || line.startsWith('📊') || line.startsWith('💡') || line.startsWith('📤')) {
      row.getCell(1).font = { bold: true, size: 12 };
    }
  });

  // Protect the instructions sheet
  instructionsSheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false,
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Fetch current data from database
async function fetchCurrentData(env: z.infer<typeof EnvSchema>): Promise<any | null> {
  try {
    const client = createClient({
      url: env.DATABASE_URL,
      authToken: env.DATABASE_AUTH_TOKEN,
    });

    const result = await client.execute(`
      SELECT s.domainData
      FROM CurrentSnapshot cs
      JOIN Snapshot s ON s.id = cs.snapshotId
      LIMIT 1
    `);

    if (result.rows.length > 0 && result.rows[0].domainData) {
      return JSON.parse(result.rows[0].domainData as string);
    }
  } catch (error) {
    console.error('[Template] Error fetching current data:', error);
  }

  return null;
}

// Main handler
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Validate environment
    const env = EnvSchema.parse(process.env);

    // Check if we should include current data
    const includeData = event.queryStringParameters?.includeData !== 'false';

    let currentData = null;
    if (includeData) {
      currentData = await fetchCurrentData(env);
    }

    // Generate Excel template
    const excelBuffer = await generateExcelTemplate(currentData);

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const filename = currentData
      ? `proceed-dashboard-template-${date}.xlsx`
      : `proceed-dashboard-blank-template.xlsx`;

    // Return Excel file
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: excelBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error: any) {
    console.error('[Template Error]', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to generate template',
        message: error.message,
        stack: process.env.LOG_LEVEL === 'debug' ? error.stack : undefined,
      }),
    };
  }
};