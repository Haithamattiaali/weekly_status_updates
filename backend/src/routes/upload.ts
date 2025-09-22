import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ExcelParser } from '../services/excelParser.js';
import { Transformer } from '../services/transformer.js';
import { VersioningService } from '../services/versioning.js';
import { ValidationError, InternalError } from '../libs/errors.js';
import { logger } from '../libs/logger.js';
import { PrismaClient } from '@prisma/client';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
  },
  fileFilter: (req, file, cb) => {
    // Check file extension
    const allowedExtensions = ['.xlsx', '.xlsm'];
    const hasValidExtension = allowedExtensions.some(ext =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      cb(new ValidationError('Only .xlsx and .xlsm files are allowed'));
      return;
    }

    // Check MIME type
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      cb(new ValidationError('Invalid file type'));
      return;
    }

    cb(null, true);
  },
});

export function createUploadRouter(prisma: PrismaClient) {
  const excelParser = new ExcelParser();
  const transformer = new Transformer();
  const versioning = new VersioningService(prisma);

  router.post(
    '/',
    upload.single('file'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          throw new ValidationError('No file uploaded');
        }

        const { buffer, originalname } = req.file;
        const commit = req.query.commit === 'true';
        const actor = req.headers['x-actor'] as string | undefined;
        const notes = req.body.notes as string | undefined;

        logger.info({ originalname, commit, actor }, 'Processing Excel upload');

        // Parse the Excel file
        const workbook = await excelParser.read(buffer);
        const validationResult = await excelParser.validate(workbook);

        // If there are errors, return the import report
        if (!validationResult.ok || !validationResult.data) {
          logger.warn(
            { errors: validationResult.errors.length, warnings: validationResult.warnings.length },
            'Validation failed'
          );

          const reportBuffer = await excelParser.buildImportReport(
            workbook,
            validationResult.errors,
            validationResult.warnings
          );

          res.status(400);
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          );
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="import-report.xlsx"'
          );
          res.send(reportBuffer);
          return;
        }

        // Transform to view model
        const viewModel = transformer.toViewModel(validationResult.data);

        // If commit is true, save to database
        let versionId: string | undefined;
        if (commit) {
          versionId = await versioning.createSnapshot(
            validationResult.data,
            viewModel,
            buffer,
            actor,
            notes
          );

          logger.info({ versionId }, 'Snapshot created');
        }

        // Get current data for diff if exists
        let diff = undefined;
        const current = await versioning.getCurrentSnapshot();
        if (current && versionId) {
          try {
            diff = await versioning.diffSnapshots(
              current.domain.headers.portfolio, // Using portfolio as ID placeholder
              versionId
            );
          } catch (error) {
            logger.warn({ error }, 'Could not generate diff');
          }
        }

        // Return success response
        res.json({
          ok: true,
          warnings: validationResult.warnings,
          preview: viewModel,
          versionId,
          diff,
          committed: commit,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createUploadRouter;