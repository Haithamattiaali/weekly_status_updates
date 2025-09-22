import { Router, Request, Response, NextFunction } from 'express';
import { TemplateBuilder } from '../services/templateBuilder.js';
import { VersioningService } from '../services/versioning.js';
import { logger } from '../libs/logger.js';
import { PrismaClient } from '@prisma/client';

const router = Router();

export function createTemplateRouter(prisma: PrismaClient) {
  const templateBuilder = new TemplateBuilder();
  const versioning = new VersioningService(prisma);

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Generating template');

      // Get current data if exists
      const current = await versioning.getCurrentSnapshot();

      // Build template with current data or empty template
      const buffer = await templateBuilder.buildTemplate(current?.domain);

      // Set response headers for Excel download
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="proceed_portfolio_template_${new Date().toISOString().split('T')[0]}.xlsx"`
      );

      res.send(buffer);

      logger.info('Template sent successfully');
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createTemplateRouter;