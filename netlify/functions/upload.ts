import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@libsql/client';
import ExcelJS from 'exceljs';
import Busboy from 'busboy';
import { z } from 'zod';
import crypto from 'crypto';

// Validation schemas
const UploadParamsSchema = z.object({
  commit: z.enum(['true', 'false']).optional().default('false'),
  format: z.enum(['excel', 'json']).optional().default('excel'),
});

const ProjectRowSchema = z.object({
  project: z.string().min(1),
  statusColor: z.enum(['green', 'amber', 'red']),
  trend: z.enum(['up', 'down', 'flat']),
  manager: z.string().min(1),
  nextMilestone: z.string().min(1),
});

const MilestoneRowSchema = z.object({
  project: z.string().min(1),
  milestone: z.string().min(1),
  owner: z.string().min(1),
  dueDate: z.string(),
  statusBadge: z.enum(['On Track', 'At Risk', 'Delayed', 'Complete']),
  workstreamUpdate: z.string().optional(),
});

// File parser for multipart/form-data
async function parseMultipartForm(event: HandlerEvent): Promise<{
  file: Buffer;
  filename: string;
  mimetype: string;
  notes?: string;
}> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        'content-type': event.headers['content-type'] || event.headers['Content-Type'] || '',
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1,
      },
    });

    let fileData: Buffer | null = null;
    let filename = '';
    let mimetype = '';
    let notes = '';

    busboy.on('file', (name, file, info) => {
      filename = info.filename;
      mimetype = info.mimeType;

      const chunks: Buffer[] = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        fileData = Buffer.concat(chunks);
      });
      file.on('error', reject);
    });

    busboy.on('field', (name, value) => {
      if (name === 'notes') {
        notes = value;
      }
    });

    busboy.on('finish', () => {
      if (!fileData) {
        reject(new Error('No file uploaded'));
        return;
      }
      resolve({ file: fileData, filename, mimetype, notes });
    });

    busboy.on('error', reject);

    // Parse the base64 body
    const buffer = Buffer.from(event.body || '', 'base64');
    busboy.end(buffer);
  });
}

// Excel parser with validation
async function parseExcelFile(buffer: Buffer): Promise<{
  headers: any;
  statusSummary: any[];
  highlights: any[];
  lowlights: any[];
  milestones: any[];
  metrics: any[];
  warnings: string[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const warnings: string[] = [];
  const result: any = {
    headers: {},
    statusSummary: [],
    highlights: [],
    lowlights: [],
    milestones: [],
    metrics: [],
    warnings,
  };

  // Parse Headers sheet
  const headersSheet = workbook.getWorksheet('Headers');
  if (headersSheet) {
    const headers: Record<string, any> = {};
    headersSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(1).value && row.getCell(2).value) {
        const key = String(row.getCell(1).value).trim();
        const value = String(row.getCell(2).value).trim();
        headers[key] = value;
      }
    });

    result.headers = {
      portfolio: headers['Portfolio'] || 'PROCEED Portfolio',
      currentPeriodStart: headers['Current Period Start'] || new Date().toISOString().split('T')[0],
      currentPeriodEnd: headers['Current Period End'] || new Date().toISOString().split('T')[0],
      comparisonPeriodStart: headers['Comparison Period Start'],
      comparisonPeriodEnd: headers['Comparison Period End'],
      reportDate: headers['Report Date'] || new Date().toISOString().split('T')[0],
    };
  } else {
    warnings.push('Headers sheet not found - using defaults');
  }

  // Parse Status Summary sheet
  const statusSheet = workbook.getWorksheet('Status Summary');
  if (statusSheet) {
    const statusData: any[] = [];
    let headerRow: string[] = [];

    statusSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        // Header row
        row.eachCell((cell) => {
          headerRow.push(String(cell.value || '').trim());
        });
      } else if (row.getCell(1).value) {
        // Data row
        const rowData: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const header = headerRow[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });

        try {
          // Validate and transform
          const validated = ProjectRowSchema.parse({
            project: rowData['Project'] || rowData['project'],
            statusColor: String(rowData['Status'] || rowData['statusColor'] || 'green').toLowerCase(),
            trend: String(rowData['Trend'] || rowData['trend'] || 'flat').toLowerCase(),
            manager: rowData['PM/Owner'] || rowData['manager'] || 'TBD',
            nextMilestone: rowData['Next Milestone'] || rowData['nextMilestone'] || 'TBD',
          });

          statusData.push(validated);
        } catch (error) {
          warnings.push(`Row ${rowNumber}: Invalid project data - ${error}`);
        }
      }
    });

    result.statusSummary = statusData;
  } else {
    warnings.push('Status Summary sheet not found');
  }

  // Parse Highlights sheet
  const highlightsSheet = workbook.getWorksheet('Highlights');
  if (highlightsSheet) {
    const highlights: any[] = [];
    highlightsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(1).value) {
        highlights.push({
          project: String(row.getCell(1).value || '').trim(),
          description: String(row.getCell(2).value || '').trim(),
          order: rowNumber - 1,
        });
      }
    });
    result.highlights = highlights;
  }

  // Parse Lowlights sheet
  const lowlightsSheet = workbook.getWorksheet('Lowlights');
  if (lowlightsSheet) {
    const lowlights: any[] = [];
    lowlightsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && row.getCell(1).value) {
        lowlights.push({
          project: String(row.getCell(1).value || '').trim(),
          description: String(row.getCell(2).value || '').trim(),
          order: rowNumber - 1,
        });
      }
    });
    result.lowlights = lowlights;
  }

  // Parse Upcoming Milestones sheet
  const milestonesSheet = workbook.getWorksheet('Upcoming Milestones');
  if (milestonesSheet) {
    const milestones: any[] = [];
    let headerRow: string[] = [];

    milestonesSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          headerRow.push(String(cell.value || '').trim());
        });
      } else if (row.getCell(1).value) {
        const rowData: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const header = headerRow[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });

        try {
          const validated = MilestoneRowSchema.parse({
            project: rowData['Project'] || rowData['project'],
            milestone: rowData['Milestone'] || rowData['milestone'],
            owner: rowData['Owner'] || rowData['owner'] || 'TBD',
            dueDate: rowData['Due Date'] || rowData['dueDate'] || '',
            statusBadge: rowData['Status'] || rowData['statusBadge'] || 'On Track',
            workstreamUpdate: rowData['Workstream Update'] || rowData['workstreamUpdate'],
          });

          milestones.push({ ...validated, order: rowNumber - 1 });
        } catch (error) {
          warnings.push(`Milestone row ${rowNumber}: ${error}`);
        }
      }
    });

    result.milestones = milestones;
  }

  // Parse Metrics sheet if present
  const metricsSheet = workbook.getWorksheet('Metrics');
  if (metricsSheet) {
    const metrics: any[] = [];
    let headerRow: string[] = [];

    metricsSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell) => {
          headerRow.push(String(cell.value || '').trim());
        });
      } else if (row.getCell(1).value) {
        const rowData: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const header = headerRow[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });

        metrics.push({
          project: rowData['Project'] || rowData['project'],
          spi: parseFloat(rowData['SPI'] || rowData['spi'] || 0),
          cpi: parseFloat(rowData['CPI'] || rowData['cpi'] || 0),
          sev1Defects: parseInt(rowData['Sev1 Defects'] || rowData['sev1Defects'] || 0),
          sev2Defects: parseInt(rowData['Sev2 Defects'] || rowData['sev2Defects'] || 0),
          issues: parseInt(rowData['Issues'] || rowData['issues'] || 0),
          riskScore: parseFloat(rowData['Risk Score'] || rowData['riskScore'] || 0),
          milestoneCompletion: parseFloat(rowData['Milestone %'] || rowData['milestoneCompletion'] || 0),
        });
      }
    });

    result.metrics = metrics;
  }

  return result;
}

// JSON parser
async function parseJsonFile(buffer: Buffer, format: 'domain' | 'view'): Promise<any> {
  try {
    const data = JSON.parse(buffer.toString('utf-8'));

    if (format === 'view') {
      // Transform view model to domain model
      return transformViewToDomain(data);
    }

    // Validate domain model structure
    if (!data.headers || !Array.isArray(data.statusSummary)) {
      throw new Error('Invalid JSON structure');
    }

    return data;
  } catch (error) {
    throw new Error(`Invalid JSON file: ${error}`);
  }
}

// Transform view model to domain model
function transformViewToDomain(viewModel: any): any {
  return {
    headers: viewModel.headers || {},
    statusSummary: viewModel.statusSummary || [],
    highlights: viewModel.highlights || [],
    lowlights: viewModel.lowlights || [],
    milestones: viewModel.upcomingMilestones || [],
    metrics: viewModel.metrics?.projects || [],
  };
}

// Save to database
async function saveToDatabase(data: any, notes: string | undefined, env: any): Promise<string> {
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  });

  const snapshotId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Begin transaction
  const batch = [];

  // Insert snapshot
  batch.push({
    sql: `INSERT INTO Snapshot (id, createdAt, actor, notes, domainData, viewModel)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      snapshotId,
      now,
      'API Upload',
      notes || null,
      JSON.stringify(data),
      JSON.stringify(transformToViewModel(data)),
    ],
  });

  // Insert headers
  batch.push({
    sql: `INSERT INTO Headers (id, snapshotId, portfolio, currentPeriodStart, currentPeriodEnd, reportDate, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      crypto.randomUUID(),
      snapshotId,
      data.headers.portfolio,
      data.headers.currentPeriodStart,
      data.headers.currentPeriodEnd,
      data.headers.reportDate,
      now,
    ],
  });

  // Insert status records
  for (const [index, status] of data.statusSummary.entries()) {
    batch.push({
      sql: `INSERT INTO Status (id, snapshotId, project, statusColor, trend, manager, nextMilestone, "order", createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        snapshotId,
        status.project,
        status.statusColor,
        status.trend,
        status.manager,
        status.nextMilestone,
        index,
        now,
      ],
    });
  }

  // Insert highlights
  for (const highlight of data.highlights) {
    batch.push({
      sql: `INSERT INTO Highlight (id, snapshotId, project, description, "order", createdAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        snapshotId,
        highlight.project,
        highlight.description,
        highlight.order,
        now,
      ],
    });
  }

  // Insert lowlights
  for (const lowlight of data.lowlights) {
    batch.push({
      sql: `INSERT INTO Lowlight (id, snapshotId, project, description, "order", createdAt)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        snapshotId,
        lowlight.project,
        lowlight.description,
        lowlight.order,
        now,
      ],
    });
  }

  // Insert milestones
  for (const milestone of data.milestones) {
    batch.push({
      sql: `INSERT INTO Milestone (id, snapshotId, project, milestone, owner, dueDate, statusBadge, workstreamUpdate, "order", createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        snapshotId,
        milestone.project,
        milestone.milestone,
        milestone.owner,
        milestone.dueDate,
        milestone.statusBadge,
        milestone.workstreamUpdate,
        milestone.order,
        now,
      ],
    });
  }

  // Update current snapshot
  batch.push({
    sql: `INSERT OR REPLACE INTO CurrentSnapshot (id, snapshotId, updatedAt)
          VALUES ('current', ?, ?)`,
    args: [snapshotId, now],
  });

  // Execute batch
  await client.batch(batch);

  return snapshotId;
}

// Transform to view model for response
function transformToViewModel(data: any): any {
  // Calculate metrics summary
  const summary = {
    totalProjects: data.statusSummary.length,
    greenProjects: data.statusSummary.filter((p: any) => p.statusColor === 'green').length,
    amberProjects: data.statusSummary.filter((p: any) => p.statusColor === 'amber').length,
    redProjects: data.statusSummary.filter((p: any) => p.statusColor === 'red').length,
    avgSPI: data.metrics.reduce((sum: number, m: any) => sum + (m.spi || 0), 0) / (data.metrics.length || 1),
    avgCPI: data.metrics.reduce((sum: number, m: any) => sum + (m.cpi || 0), 0) / (data.metrics.length || 1),
    totalIssues: data.metrics.reduce((sum: number, m: any) => sum + (m.issues || 0), 0),
    totalRisks: data.metrics.reduce((sum: number, m: any) => sum + (m.sev1Defects || 0) + (m.sev2Defects || 0), 0),
  };

  return {
    headers: data.headers,
    statusSummary: data.statusSummary,
    highlights: data.highlights,
    lowlights: data.lowlights,
    upcomingMilestones: data.milestones,
    metrics: {
      summary,
      projects: data.metrics,
    },
  };
}

// Main handler
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse parameters
    const params = UploadParamsSchema.parse(event.queryStringParameters || {});

    // Parse multipart form
    const { file, filename, mimetype, notes } = await parseMultipartForm(event);

    // Determine file type and parse
    let parsedData: any;
    const warnings: string[] = [];

    if (mimetype.includes('spreadsheet') || filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      // Excel file
      parsedData = await parseExcelFile(file);
      warnings.push(...parsedData.warnings);
    } else if (mimetype.includes('json') || filename.endsWith('.json')) {
      // JSON file
      const format = event.queryStringParameters?.format === 'view' ? 'view' : 'domain';
      parsedData = await parseJsonFile(file, format);
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid file type. Please upload an Excel (.xlsx) or JSON (.json) file.',
        }),
      };
    }

    // Validate required data
    if (!parsedData.statusSummary || parsedData.statusSummary.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'No project data found in the uploaded file.',
          warnings,
        }),
      };
    }

    // Preview or commit
    if (params.commit === 'true') {
      // Save to database
      const env = {
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
      };

      const snapshotId = await saveToDatabase(parsedData, notes, env);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          ok: true,
          committed: true,
          snapshotId,
          message: 'Data successfully uploaded and saved',
          preview: transformToViewModel(parsedData),
          warnings: warnings.length > 0 ? warnings : undefined,
        }),
      };
    } else {
      // Preview only
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          ok: true,
          committed: false,
          message: 'Preview generated successfully. Add ?commit=true to save.',
          preview: transformToViewModel(parsedData),
          warnings: warnings.length > 0 ? warnings : undefined,
        }),
      };
    }
  } catch (error: any) {
    console.error('[Upload Error]', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Upload failed',
        message: error.message,
        stack: process.env.LOG_LEVEL === 'debug' ? error.stack : undefined,
      }),
    };
  }
};