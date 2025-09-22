import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@libsql/client';
import { z } from 'zod';

// Environment configuration with validation
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  ENABLE_CACHE: z.enum(['true', 'false']).default('true'),
  CACHE_TTL: z.string().regex(/^\d+$/).default('300'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Cache implementation for performance
class ResponseCache {
  private static instance: ResponseCache;
  private cache = new Map<string, { data: any; expires: number }>();
  private readonly ttl: number;

  private constructor(ttl: number) {
    this.ttl = ttl * 1000; // Convert to milliseconds
  }

  static getInstance(ttl: number): ResponseCache {
    if (!ResponseCache.instance) {
      ResponseCache.instance = new ResponseCache(ttl);
    }
    return ResponseCache.instance;
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.ttl,
    });

    // Clean up old entries
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (v.expires < now) {
          this.cache.delete(k);
        }
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// Error response builder
class ErrorResponse {
  static build(statusCode: number, message: string, details?: any) {
    const response = {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Request-ID': crypto.randomUUID(),
      },
      body: JSON.stringify({
        error: {
          message,
          statusCode,
          timestamp: new Date().toISOString(),
          details,
        },
      }),
    };

    // Log error for monitoring
    console.error('[Dashboard Error]', {
      statusCode,
      message,
      details,
      timestamp: new Date().toISOString(),
    });

    return response;
  }
}

// Success response builder
class SuccessResponse {
  static build(data: any, options?: { cache?: boolean; headers?: Record<string, string> }) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'X-Request-ID': crypto.randomUUID(),
      ...options?.headers,
    };

    if (options?.cache) {
      headers['Cache-Control'] = 'public, max-age=300, s-maxage=600';
      headers['CDN-Cache-Control'] = 'public, max-age=600';
    } else {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  }
}

// Database connection manager with pooling
class DatabaseManager {
  private static instance: DatabaseManager;
  private client: any;
  private lastConnectTime: number = 0;
  private readonly reconnectInterval = 60000; // 1 minute

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async getClient(env: z.infer<typeof EnvSchema>) {
    const now = Date.now();

    // Reconnect if needed
    if (!this.client || now - this.lastConnectTime > this.reconnectInterval) {
      try {
        this.client = createClient({
          url: env.DATABASE_URL,
          authToken: env.DATABASE_AUTH_TOKEN,
        });

        this.lastConnectTime = now;
        console.info('[Database] Connected successfully');
      } catch (error) {
        console.error('[Database] Connection failed:', error);
        throw new Error('Database connection failed');
      }
    }

    return this.client;
  }

  async executeQuery(sql: string, params: any[] = [], env: z.infer<typeof EnvSchema>) {
    const client = await this.getClient(env);

    try {
      const result = await client.execute({
        sql,
        args: params,
      });

      return result;
    } catch (error) {
      console.error('[Database] Query execution failed:', error);
      throw error;
    }
  }
}

// Transform database result to dashboard view model
function transformToDashboardVM(snapshot: any): any {
  try {
    // Parse JSON fields
    const domainData = JSON.parse(snapshot.domainData || '{}');
    const viewModel = JSON.parse(snapshot.viewModel || '{}');

    // Merge with additional data if needed
    return {
      ...viewModel,
      metadata: {
        snapshotId: snapshot.id,
        createdAt: snapshot.createdAt,
        actor: snapshot.actor,
        notes: snapshot.notes,
      },
      _links: {
        self: `/api/dashboard`,
        template: `/api/template`,
        upload: `/api/upload`,
        versions: `/api/versions`,
        json: `/api/json/download`,
      },
    };
  } catch (error) {
    console.error('[Transform] Failed to transform data:', error);
    throw new Error('Data transformation failed');
  }
}

// Main handler with comprehensive error handling and recovery
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  // Validate environment
  let env: z.infer<typeof EnvSchema>;
  try {
    env = EnvSchema.parse(process.env);
  } catch (error) {
    return ErrorResponse.build(500, 'Invalid environment configuration', error);
  }

  // Initialize cache if enabled
  const cache = env.ENABLE_CACHE === 'true'
    ? ResponseCache.getInstance(parseInt(env.CACHE_TTL))
    : null;

  // Generate cache key
  const cacheKey = `dashboard:${event.queryStringParameters?.version || 'current'}`;

  // Check cache first
  if (cache && event.httpMethod === 'GET') {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.info('[Cache] Hit for key:', cacheKey);
      return SuccessResponse.build(cachedData, {
        cache: true,
        headers: { 'X-Cache': 'HIT' }
      });
    }
  }

  try {
    const db = DatabaseManager.getInstance();

    // Determine which snapshot to fetch
    const versionId = event.queryStringParameters?.version;

    let query: string;
    let params: any[];

    if (versionId) {
      // Fetch specific version
      query = `
        SELECT
          s.*,
          h.portfolio,
          h.currentPeriodStart,
          h.currentPeriodEnd,
          h.reportDate
        FROM Snapshot s
        LEFT JOIN Headers h ON h.snapshotId = s.id
        WHERE s.id = ?
        LIMIT 1
      `;
      params = [versionId];
    } else {
      // Fetch current snapshot
      query = `
        SELECT
          s.*,
          h.portfolio,
          h.currentPeriodStart,
          h.currentPeriodEnd,
          h.reportDate
        FROM CurrentSnapshot cs
        JOIN Snapshot s ON s.id = cs.snapshotId
        LEFT JOIN Headers h ON h.snapshotId = s.id
        LIMIT 1
      `;
      params = [];
    }

    // Execute query with retry logic
    let result;
    let retries = 3;

    while (retries > 0) {
      try {
        result = await db.executeQuery(query, params, env);
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw error;
        }
        console.warn(`[Database] Query failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!result || result.rows.length === 0) {
      // Return empty dashboard if no data
      const emptyDashboard = {
        headers: {
          portfolio: 'PROCEED Portfolio',
          currentPeriod: {
            start: new Date().toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0],
          },
          reportDate: new Date().toISOString().split('T')[0],
        },
        statusSummary: [],
        highlights: [],
        lowlights: [],
        upcomingMilestones: [],
        metrics: {
          summary: {
            totalProjects: 0,
            greenProjects: 0,
            amberProjects: 0,
            redProjects: 0,
            avgSPI: 0,
            avgCPI: 0,
            totalIssues: 0,
            totalRisks: 0,
          },
          projects: [],
        },
        _links: {
          self: `/api/dashboard`,
          template: `/api/template`,
          upload: `/api/upload`,
          versions: `/api/versions`,
          json: `/api/json/download`,
        },
        _metadata: {
          isEmpty: true,
          message: 'No data available. Please upload an Excel file to get started.',
        },
      };

      return SuccessResponse.build(emptyDashboard, { cache: false });
    }

    // Transform the data
    const dashboard = transformToDashboardVM(result.rows[0]);

    // Cache the response if enabled
    if (cache) {
      cache.set(cacheKey, dashboard);
      console.info('[Cache] Stored for key:', cacheKey);
    }

    return SuccessResponse.build(dashboard, {
      cache: true,
      headers: { 'X-Cache': 'MISS' }
    });

  } catch (error: any) {
    // Detailed error handling with different response codes
    if (error.message?.includes('Database connection')) {
      return ErrorResponse.build(503, 'Database service unavailable', {
        retry: true,
        retryAfter: 30,
      });
    }

    if (error.message?.includes('transformation')) {
      return ErrorResponse.build(500, 'Data processing error', {
        type: 'transformation_error',
      });
    }

    // Generic error with stack trace in development
    return ErrorResponse.build(500, 'Internal server error', {
      message: error.message,
      stack: env.LOG_LEVEL === 'debug' ? error.stack : undefined,
    });
  }
};