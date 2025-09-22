import { Router, Request, Response, NextFunction } from 'express';
import { VersioningService } from '../services/versioning.js';
import { NotFoundError } from '../libs/errors.js';
import { logger } from '../libs/logger.js';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = Router();

export function createDashboardRouter(prisma: PrismaClient) {
  const versioning = new VersioningService(prisma);

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const current = await versioning.getCurrentSnapshot();

      if (!current) {
        // Return default empty dashboard
        res.json({
          header: {
            title: 'PROCEED® Weekly Project Portfolio Updates',
            portfolio: 'No Data Loaded',
            currentPeriod: 'N/A',
            comparisonPeriod: 'N/A',
            reportDate: new Date().toLocaleDateString(),
            sectionTitles: {
              portfolioStatus: 'Portfolio Projects Status',
              highlightsLowlights: 'Consolidated Highlights & Lowlights',
              keyMilestones: 'Key Milestones by Project',
            },
            tableHeaders: {
              project: 'Project',
              status: 'Status',
              projectManager: 'Project Manager',
              nextMilestone: 'Next Milestone',
            },
          },
          statusTable: [],
          highlights: ['Upload an Excel file to populate the dashboard'],
          lowlights: [],
          milestonesTable: [],
        });
        return;
      }

      // Generate ETag for caching
      const content = JSON.stringify(current.viewModel);
      const etag = crypto
        .createHash('md5')
        .update(content)
        .digest('hex');

      // Check If-None-Match header
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag === etag) {
        res.status(304).end();
        return;
      }

      // Set caching headers
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, max-age=60');

      res.json(current.viewModel);

      logger.info('Dashboard data served');
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createDashboardRouter;