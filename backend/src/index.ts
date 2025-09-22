import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { logger } from './libs/logger.js';
import { AppError } from './libs/errors.js';
import { createUploadRouter } from './routes/upload.js';
import { createTemplateRouter } from './routes/template.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createVersionsRouter } from './routes/versions.js';
import { createJsonRouter } from './routes/json.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, 'Request received');
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/upload', createUploadRouter(prisma));
app.use('/api/template', createTemplateRouter(prisma));
app.use('/api/dashboard', createDashboardRouter(prisma));
app.use('/api/versions', createVersionsRouter(prisma));
app.use('/api/json', createJsonRouter(prisma));

// Serve static files (for dashboard-bind.js and other assets)
app.use('/static', express.static(path.join(__dirname, '../public')));

// Also serve dashboard-bind.js directly at root for easy access
app.use('/dashboard-bind.js', express.static(path.join(__dirname, '../public/dashboard-bind.js')));

// OpenAPI documentation endpoint
app.get('/api/openapi.json', (req: Request, res: Response) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'PROCEED Dashboard API',
      version: '1.0.0',
      description: 'Excel-driven dashboard service for portfolio management',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    paths: {
      '/api/template': {
        get: {
          summary: 'Download Excel template',
          description: 'Returns a pre-filled Excel template with current data',
          responses: {
            '200': {
              description: 'Excel file',
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
              },
            },
          },
        },
      },
      '/api/upload': {
        post: {
          summary: 'Upload Excel file',
          description: 'Parse and validate Excel file, optionally commit to database',
          parameters: [
            {
              name: 'commit',
              in: 'query',
              schema: { type: 'boolean' },
              description: 'Whether to save the data (true) or just preview (false)',
            },
          ],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                    },
                    notes: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Upload successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      warnings: { type: 'array' },
                      preview: { type: 'object' },
                      versionId: { type: 'string' },
                      committed: { type: 'boolean' },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Validation failed',
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {},
              },
            },
          },
        },
      },
      '/api/dashboard': {
        get: {
          summary: 'Get dashboard data',
          description: 'Returns current dashboard view model',
          responses: {
            '200': {
              description: 'Dashboard data',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
      '/api/versions': {
        get: {
          summary: 'List versions',
          description: 'Get list of saved versions',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20 },
            },
          ],
          responses: {
            '200': {
              description: 'Version list',
            },
          },
        },
      },
      '/api/versions/{id}': {
        get: {
          summary: 'Get version details',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Version data',
            },
            '404': {
              description: 'Version not found',
            },
          },
        },
      },
      '/api/versions/{id}/rollback': {
        post: {
          summary: 'Rollback to version',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Rollback successful',
            },
          },
        },
      },
      '/api/json/download': {
        get: {
          summary: 'Download dashboard data as JSON',
          parameters: [
            {
              name: 'format',
              in: 'query',
              schema: { type: 'string', enum: ['domain', 'view'], default: 'domain' },
              description: 'JSON format: domain (raw data) or view (display-ready)',
            },
          ],
          responses: {
            '200': {
              description: 'JSON file',
              content: {
                'application/json': {},
              },
            },
          },
        },
      },
      '/api/json/upload': {
        post: {
          summary: 'Upload JSON data',
          parameters: [
            {
              name: 'commit',
              in: 'query',
              schema: { type: 'boolean' },
              description: 'Whether to save the data (true) or just preview (false)',
            },
            {
              name: 'format',
              in: 'query',
              schema: { type: 'string', enum: ['domain', 'view'], default: 'domain' },
              description: 'JSON format being uploaded',
            },
          ],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                    },
                    notes: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Upload successful',
            },
          },
        },
      },
      '/api/json/schema': {
        get: {
          summary: 'Get JSON schema information',
          parameters: [
            {
              name: 'format',
              in: 'query',
              schema: { type: 'string', enum: ['domain', 'view'], default: 'domain' },
            },
          ],
          responses: {
            '200': {
              description: 'Schema information with examples',
            },
          },
        },
      },
    },
  });
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn({
      statusCode: err.statusCode,
      message: err.message,
      details: err.details,
    }, 'Application error');

    res.status(err.statusCode).json({
      error: {
        message: err.message,
        details: err.details,
      },
    });
  } else {
    logger.error({
      err,
      method: req.method,
      url: req.url,
    }, 'Unhandled error');

    res.status(500).json({
      error: {
        message: 'Internal server error',
      },
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      path: req.path,
    },
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
async function start() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected');

    app.listen(PORT, () => {
      logger.info({ port: PORT }, `Server running at http://localhost:${PORT}`);
      logger.info('API documentation available at /api/openapi.json');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();