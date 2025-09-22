import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { JsonHandler } from '../services/jsonHandler.js';
import { Transformer } from '../services/transformer.js';
import { VersioningService } from '../services/versioning.js';
import { ValidationError, InternalError } from '../libs/errors.js';
import { logger } from '../libs/logger.js';
import { PrismaClient } from '@prisma/client';
import { PortfolioSnapshot, DashboardVM } from '../domain/types.js';

const router = Router();

// Configure multer for JSON uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Check file extension
    if (!file.originalname.toLowerCase().endsWith('.json')) {
      cb(new ValidationError('Only .json files are allowed'));
      return;
    }

    // Check MIME type
    if (!file.mimetype.includes('json')) {
      cb(new ValidationError('Invalid file type - must be JSON'));
      return;
    }

    cb(null, true);
  },
});

export function createJsonRouter(prisma: PrismaClient) {
  const jsonHandler = new JsonHandler();
  const transformer = new Transformer();
  const versioning = new VersioningService(prisma);

  /**
   * GET /api/json/download
   * Download current dashboard data as JSON
   * Query params:
   * - format: 'domain' (raw data) or 'view' (display-ready)
   */
  router.get('/download', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const format = (req.query.format as 'domain' | 'view') || 'domain';

      logger.info({ format }, 'JSON download requested');

      // Get current snapshot
      const snapshot = await versioning.getCurrentSnapshot();

      if (!snapshot) {
        throw new InternalError('No data available');
      }

      // Select data based on format
      const data = format === 'domain' ? snapshot.domain : snapshot.viewModel;

      // Convert to JSON
      const jsonContent = jsonHandler.exportToJson(data, format);

      // Generate filename
      const filename = jsonHandler.generateFilename(format);

      // Set response headers
      res.setHeader('Content-Type', jsonHandler.getMimeType());
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(jsonContent));

      // Send JSON
      res.send(jsonContent);

      logger.info({ format, filename }, 'JSON download completed');
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/json/upload
   * Upload JSON data to update dashboard
   * Query params:
   * - commit: true to save, false to preview
   * - format: 'domain' or 'view' (default: domain)
   */
  router.post('/upload',
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          throw new ValidationError('No file uploaded');
        }

        const commit = req.query.commit === 'true';
        const format = (req.query.format as 'domain' | 'view') || 'domain';
        const notes = req.body.notes || 'JSON upload';

        logger.info({
          filename: req.file.originalname,
          size: req.file.size,
          format,
          commit
        }, 'JSON upload received');

        // Parse and validate JSON
        const jsonContent = req.file.buffer.toString('utf-8');
        const data = jsonHandler.importFromJson(jsonContent, format);

        let domainData: PortfolioSnapshot;
        let viewModel: DashboardVM;

        if (format === 'domain') {
          domainData = data as PortfolioSnapshot;
          viewModel = transformer.toViewModel(domainData);
        } else {
          // If uploaded as view model, we need domain model too
          // For now, we'll use the current domain and update with view changes
          const current = await versioning.getCurrentSnapshot();
          if (!current) {
            throw new ValidationError('Cannot upload view model without existing domain data');
          }
          domainData = current.domain;
          viewModel = data as DashboardVM;
        }

        // Preview response
        const response: any = {
          ok: true,
          format,
          dataStats: {
            projects: domainData.status.length,
            highlights: domainData.highlights.length,
            lowlights: domainData.lowlights.length,
            milestones: domainData.milestones.length,
          },
          preview: viewModel,
        };

        // Commit if requested
        if (commit) {
          const versionId = await versioning.createSnapshot(
            domainData,
            viewModel,
            req.file.buffer,
            req.ip || 'Unknown',
            notes
          );

          response.committed = true;
          response.versionId = versionId;

          logger.info({ versionId }, 'JSON data committed');
        } else {
          response.committed = false;
        }

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/json/schema
   * Get JSON schema for validation
   * Query params:
   * - format: 'domain' or 'view'
   */
  router.get('/schema', (req: Request, res: Response) => {
    const format = (req.query.format as 'domain' | 'view') || 'domain';

    // Return schema information
    const schemaInfo = {
      format,
      description: format === 'domain'
        ? 'Raw domain model schema for PROCEED dashboard'
        : 'View model schema for display-ready dashboard data',
      example: format === 'domain' ? {
        headers: {
          portfolio: 'Enterprise Projects',
          currentPeriodStart: 'Sept 11',
          currentPeriodEnd: 'Sept 17, 2025',
          reportDate: 'September 17, 2025',
        },
        status: [{
          project: 'Project Name',
          statusColor: 'green',
          trend: 'up',
          manager: 'Manager Name',
          nextMilestone: 'Milestone Description',
        }],
        highlights: [{
          kind: 'highlight',
          project: 'Project',
          description: 'Achievement description',
        }],
        lowlights: [{
          kind: 'lowlight',
          project: 'Project',
          description: 'Issue description',
        }],
        milestones: [{
          project: 'Project Name',
          milestone: 'Milestone Name',
          owner: 'Owner Name',
          dueDate: '30-Sep',
          statusBadge: 'In Progress',
          workstreamUpdate: 'Update text',
        }],
      } : {
        header: {
          title: 'PROCEED® Weekly Project Portfolio Updates',
          portfolio: 'Enterprise Projects',
          currentPeriod: 'Sept 11 - Sept 17, 2025',
          reportDate: 'September 17, 2025',
        },
        statusTable: [{
          project: 'Project Name',
          statusClass: 'status-green',
          trendGlyph: '↑',
          manager: 'Manager Name',
          nextMilestone: 'Milestone Description',
        }],
        highlights: [
          'Project: Achievement description',
        ],
        lowlights: [
          'Project: Issue description',
        ],
        milestonesTable: [{
          project: 'Project Name',
          milestone: 'Milestone Name',
          owner: 'Owner Name',
          dueDateBadge: '30-Sep',
          statusBadgeClass: 'status-in-progress',
          workstreamUpdate: 'Update text',
        }],
      },
    };

    res.json(schemaInfo);
  });

  return router;
}