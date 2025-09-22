import { PortfolioSnapshot, PortfolioSnapshotSchema, DashboardVM } from '../domain/types.js';
import { ValidationError } from '../libs/errors.js';
import { logger } from '../libs/logger.js';
import { z } from 'zod';

/**
 * Service for handling JSON import/export of dashboard data
 * Supports both domain model and view model formats
 */
export class JsonHandler {
  /**
   * Export data as JSON
   * @param data - Either PortfolioSnapshot or DashboardVM
   * @param format - 'domain' for raw data model, 'view' for display-ready model
   */
  exportToJson(data: PortfolioSnapshot | DashboardVM, format: 'domain' | 'view' = 'domain'): string {
    try {
      // Pretty print with 2-space indentation for readability
      return JSON.stringify(data, null, 2);
    } catch (error) {
      logger.error({ error }, 'Failed to export to JSON');
      throw new ValidationError('Failed to export data to JSON format');
    }
  }

  /**
   * Import and validate JSON data
   * @param jsonString - JSON string to parse and validate
   * @param format - Expected format ('domain' or 'view')
   */
  importFromJson(jsonString: string, format: 'domain' | 'view' = 'domain'): PortfolioSnapshot | DashboardVM {
    try {
      // Parse JSON string
      const data = JSON.parse(jsonString);

      if (format === 'domain') {
        // Validate against domain schema
        return this.validateDomainModel(data);
      } else {
        // For view model, we return as-is (already transformed)
        // In practice, you might want to reverse-transform to domain model
        return this.validateViewModel(data);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new ValidationError(`JSON validation failed: ${issues}`);
      } else if (error instanceof SyntaxError) {
        throw new ValidationError('Invalid JSON format: ' + error.message);
      }

      logger.error({ error }, 'Failed to import from JSON');
      throw error;
    }
  }

  /**
   * Validate domain model data
   */
  private validateDomainModel(data: unknown): PortfolioSnapshot {
    const result = PortfolioSnapshotSchema.safeParse(data);

    if (!result.success) {
      throw result.error;
    }

    return result.data;
  }

  /**
   * Validate view model data (minimal validation since it's display-ready)
   */
  private validateViewModel(data: unknown): DashboardVM {
    // Basic structure validation for view model
    const ViewModelSchema = z.object({
      header: z.object({
        title: z.string(),
        portfolio: z.string(),
        currentPeriod: z.string(),
        comparisonPeriod: z.string().optional(),
        reportDate: z.string(),
        sectionTitles: z.record(z.string()).optional(),
        tableHeaders: z.record(z.string()).optional(),
      }),
      statusTable: z.array(z.object({
        project: z.string(),
        statusClass: z.string(),
        trendGlyph: z.string(),
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

    const result = ViewModelSchema.safeParse(data);

    if (!result.success) {
      throw result.error;
    }

    return result.data as DashboardVM;
  }

  /**
   * Generate a downloadable JSON filename with timestamp
   */
  generateFilename(format: 'domain' | 'view' = 'domain'): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const type = format === 'domain' ? 'data' : 'view';
    return `proceed_portfolio_${type}_${timestamp}.json`;
  }

  /**
   * Get MIME type for JSON files
   */
  getMimeType(): string {
    return 'application/json';
  }
}