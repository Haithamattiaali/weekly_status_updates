import { z } from 'zod';

// Enums
export const StatusColorEnum = z.enum(['green', 'amber', 'red']);
export const TrendEnum = z.enum(['up', 'down', 'flat']);
export const StatusBadgeEnum = z.union([
  z.enum(['Completed', 'In Progress', 'Pending', 'At Risk']),
  z.string().regex(/^\d+%$/) // Allow percentage like "75%"
]);

// Domain Schemas
export const HeadersSchema = z.object({
  portfolio: z.string(),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  comparisonPeriodStart: z.string().optional(),
  comparisonPeriodEnd: z.string().optional(),
  reportDate: z.string(),
  sectionTitles: z.object({
    portfolioStatus: z.string().optional(),
    highlightsLowlights: z.string().optional(),
    keyMilestones: z.string().optional(),
  }).optional(),
  tableHeaders: z.record(z.string()).optional(),
});

export const StatusRowSchema = z.object({
  project: z.string(),
  statusColor: StatusColorEnum,
  trend: TrendEnum,
  manager: z.string(),
  nextMilestone: z.string(),
  order: z.number().optional(),
});

export const HighlightLowlightSchema = z.object({
  kind: z.enum(['highlight', 'lowlight']),
  project: z.string().optional(),
  description: z.string(),
  order: z.number().optional(),
});

export const MilestoneRowSchema = z.object({
  project: z.string(),
  milestone: z.string(),
  owner: z.string(),
  dueDate: z.string(),
  statusBadge: StatusBadgeEnum,
  workstreamUpdate: z.string().optional(),
  order: z.number().optional(),
});

export const MetricsRowSchema = z.object({
  project: z.string(),
  spi: z.number().optional(),
  cpi: z.number().optional(),
  sev1Defects: z.number().optional(),
  sev2Defects: z.number().optional(),
  issues: z.number().optional(),
  riskScore: z.number().min(0).max(1).optional(),
  milestoneCompletion: z.number().min(0).max(1).optional(),
});

export const PortfolioSnapshotSchema = z.object({
  headers: HeadersSchema,
  status: z.array(StatusRowSchema),
  highlights: z.array(HighlightLowlightSchema.extend({ kind: z.literal('highlight') })),
  lowlights: z.array(HighlightLowlightSchema.extend({ kind: z.literal('lowlight') })),
  milestones: z.array(MilestoneRowSchema),
  metrics: z.array(MetricsRowSchema).optional(),
  lookups: z.record(z.array(z.string())).optional(),
});

// View Model Schemas
export const DashboardVMSchema = z.object({
  header: z.object({
    title: z.string(),
    portfolio: z.string(),
    currentPeriod: z.string(),
    comparisonPeriod: z.string(),
    reportDate: z.string(),
    sectionTitles: z.object({
      portfolioStatus: z.string(),
      highlightsLowlights: z.string(),
      keyMilestones: z.string(),
    }),
    tableHeaders: z.record(z.string()),
  }),
  statusTable: z.array(z.object({
    project: z.string(),
    statusClass: z.enum(['status-green', 'status-amber', 'status-red']),
    trendGlyph: z.enum(['↑', '↓', '→']),
    manager: z.string(),
    nextMilestone: z.string(),
  })),
  highlights: z.array(z.string()),
  lowlights: z.array(z.string()),
  milestonesTable: z.array(z.object({
    project: z.string(),
    milestone: z.string(),
    owner: z.string(),
    dueDateBadge: z.string(),
    statusBadgeClass: z.string(),
    workstreamUpdate: z.string(),
  })),
});

// Type exports
export type Headers = z.infer<typeof HeadersSchema>;
export type StatusRow = z.infer<typeof StatusRowSchema>;
export type HighlightLowlight = z.infer<typeof HighlightLowlightSchema>;
export type MilestoneRow = z.infer<typeof MilestoneRowSchema>;
export type MetricsRow = z.infer<typeof MetricsRowSchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;
export type DashboardVM = z.infer<typeof DashboardVMSchema>;

// Excel sheet names
export const SHEET_NAMES = {
  HEADERS: 'HEADERS',
  STATUS: 'STATUS',
  HIGHLIGHTS: 'HIGHLIGHTS',
  LOWLIGHTS: 'LOWLIGHTS',
  MILESTONES: 'MILESTONES',
  METRICS: 'METRICS',
  LOOKUPS: 'LOOKUPS',
  IMPORT_REPORT: 'IMPORT-REPORT',
} as const;

// Error types
export interface ValidationError {
  sheet: string;
  row: number;
  column: string;
  reason: string;
  value?: any;
}

export interface ValidationWarning {
  sheet: string;
  message: string;
  details?: any;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data?: PortfolioSnapshot;
}