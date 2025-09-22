import { Router, Request, Response, NextFunction } from 'express';
import { VersioningService } from '../services/versioning.js';
import { NotFoundError, ValidationError } from '../libs/errors.js';
import { logger } from '../libs/logger.js';
import { PrismaClient } from '@prisma/client';

const router = Router();

export function createVersionsRouter(prisma: PrismaClient) {
  const versioning = new VersioningService(prisma);

  // List all versions
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const versions = await versioning.listSnapshots(limit);

      res.json({
        versions,
        total: versions.length,
      });

      logger.info({ count: versions.length }, 'Versions listed');
    } catch (error) {
      next(error);
    }
  });

  // Get specific version
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const snapshot = await versioning.getSnapshot(id);

      if (!snapshot) {
        throw new NotFoundError(`Version ${id} not found`);
      }

      res.json({
        id,
        domain: snapshot.domain,
        viewModel: snapshot.viewModel,
      });

      logger.info({ id }, 'Version retrieved');
    } catch (error) {
      next(error);
    }
  });

  // Rollback to version
  router.post('/:id/rollback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const success = await versioning.rollback(id);

      if (!success) {
        throw new NotFoundError(`Version ${id} not found`);
      }

      // Get the rolled back data
      const snapshot = await versioning.getCurrentSnapshot();

      res.json({
        ok: true,
        message: `Rolled back to version ${id}`,
        current: snapshot?.viewModel,
      });

      logger.info({ id }, 'Rollback successful');
    } catch (error) {
      next(error);
    }
  });

  // Get diff between versions
  router.get('/diff/:from/:to', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from, to } = req.params;

      const diff = await versioning.diffSnapshots(from, to);

      res.json({
        from,
        to,
        diff,
      });

      logger.info({ from, to }, 'Diff generated');
    } catch (error) {
      next(error);
    }
  });

  // Download Excel file for version
  router.get('/:id/excel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const excelBuffer = await versioning.getExcelFile(id);

      if (!excelBuffer) {
        throw new NotFoundError(`Excel file for version ${id} not found`);
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="version_${id}_${new Date().toISOString().split('T')[0]}.xlsx"`
      );

      res.send(excelBuffer);

      logger.info({ id }, 'Excel file downloaded');
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createVersionsRouter;