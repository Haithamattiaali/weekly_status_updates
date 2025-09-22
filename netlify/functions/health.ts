import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@libsql/client';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'pass' | 'fail';
      latency?: number;
      error?: string;
    };
    memory: {
      status: 'pass' | 'warn' | 'fail';
      used: number;
      total: number;
      percentage: number;
    };
    environment: {
      status: 'pass' | 'fail';
      missing?: string[];
    };
  };
  version: {
    function: string;
    node: string;
    platform: string;
  };
}

async function checkDatabase(): Promise<HealthStatus['checks']['database']> {
  const start = Date.now();

  try {
    if (!process.env.DATABASE_URL) {
      return {
        status: 'fail',
        error: 'DATABASE_URL not configured',
      };
    }

    const client = createClient({
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });

    // Simple query to test connection
    await client.execute('SELECT 1');

    return {
      status: 'pass',
      latency: Date.now() - start,
    };
  } catch (error: any) {
    return {
      status: 'fail',
      latency: Date.now() - start,
      error: error.message || 'Unknown database error',
    };
  }
}

function checkMemory(): HealthStatus['checks']['memory'] {
  const used = process.memoryUsage();
  const total = 512 * 1024 * 1024; // 512MB default for Netlify functions
  const percentage = (used.heapUsed / total) * 100;

  return {
    status: percentage > 90 ? 'fail' : percentage > 75 ? 'warn' : 'pass',
    used: Math.round(used.heapUsed / 1024 / 1024), // MB
    total: Math.round(total / 1024 / 1024), // MB
    percentage: Math.round(percentage),
  };
}

function checkEnvironment(): HealthStatus['checks']['environment'] {
  const required = ['DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);

  return {
    status: missing.length > 0 ? 'fail' : 'pass',
    missing: missing.length > 0 ? missing : undefined,
  };
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Perform health checks
  const [database, memory, environment] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkMemory()),
    Promise.resolve(checkEnvironment()),
  ]);

  // Determine overall status
  let overallStatus: HealthStatus['status'] = 'healthy';
  if (database.status === 'fail' || environment.status === 'fail' || memory.status === 'fail') {
    overallStatus = 'unhealthy';
  } else if (memory.status === 'warn') {
    overallStatus = 'degraded';
  }

  const health: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database,
      memory,
      environment,
    },
    version: {
      function: '1.0.0',
      node: process.version,
      platform: process.platform,
    },
  };

  // Return appropriate status code
  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
    body: JSON.stringify(health, null, 2),
  };
};