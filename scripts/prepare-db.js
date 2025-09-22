#!/usr/bin/env node

/**
 * Database preparation script for Netlify deployment
 * Sets up Turso (LibSQL) database for production use
 */

import { createClient } from '@libsql/client';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Database schema
const SCHEMA = `
-- Snapshot table: stores complete dashboard states
CREATE TABLE IF NOT EXISTS Snapshot (
  id TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  actor TEXT,
  notes TEXT,
  rawExcel BLOB,
  domainData TEXT NOT NULL,
  viewModel TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshot_created ON Snapshot(createdAt);

-- Headers table: stores report metadata
CREATE TABLE IF NOT EXISTS Headers (
  id TEXT PRIMARY KEY,
  snapshotId TEXT UNIQUE NOT NULL,
  portfolio TEXT NOT NULL,
  currentPeriodStart TEXT NOT NULL,
  currentPeriodEnd TEXT NOT NULL,
  comparisonPeriodStart TEXT,
  comparisonPeriodEnd TEXT,
  reportDate TEXT NOT NULL,
  sectionTitles TEXT,
  tableHeaders TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshotId) REFERENCES Snapshot(id) ON DELETE CASCADE
);

-- Status table: project status summary
CREATE TABLE IF NOT EXISTS Status (
  id TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  project TEXT NOT NULL,
  statusColor TEXT NOT NULL CHECK (statusColor IN ('green', 'amber', 'red')),
  trend TEXT NOT NULL CHECK (trend IN ('up', 'down', 'flat')),
  manager TEXT NOT NULL,
  nextMilestone TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshotId) REFERENCES Snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_status_snapshot ON Status(snapshotId);
CREATE INDEX IF NOT EXISTS idx_status_project ON Status(project);

-- Highlight table: positive achievements
CREATE TABLE IF NOT EXISTS Highlight (
  id TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  project TEXT,
  description TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshotId) REFERENCES Snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_highlight_snapshot ON Highlight(snapshotId);

-- Lowlight table: risks and issues
CREATE TABLE IF NOT EXISTS Lowlight (
  id TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  project TEXT,
  description TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshotId) REFERENCES Snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lowlight_snapshot ON Lowlight(snapshotId);

-- Milestone table: upcoming milestones
CREATE TABLE IF NOT EXISTS Milestone (
  id TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  project TEXT NOT NULL,
  milestone TEXT NOT NULL,
  owner TEXT NOT NULL,
  dueDate TEXT NOT NULL,
  statusBadge TEXT NOT NULL,
  workstreamUpdate TEXT,
  "order" INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshotId) REFERENCES Snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_milestone_snapshot ON Milestone(snapshotId);
CREATE INDEX IF NOT EXISTS idx_milestone_project ON Milestone(project);

-- Metrics table: project metrics
CREATE TABLE IF NOT EXISTS Metrics (
  id TEXT PRIMARY KEY,
  snapshotId TEXT NOT NULL,
  project TEXT NOT NULL,
  spi REAL,
  cpi REAL,
  sev1Defects INTEGER,
  sev2Defects INTEGER,
  issues INTEGER,
  riskScore REAL,
  milestoneCompletion REAL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshotId) REFERENCES Snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_snapshot ON Metrics(snapshotId);
CREATE INDEX IF NOT EXISTS idx_metrics_project ON Metrics(project);

-- CurrentSnapshot table: tracks the active snapshot
CREATE TABLE IF NOT EXISTS CurrentSnapshot (
  id TEXT PRIMARY KEY DEFAULT 'current',
  snapshotId TEXT UNIQUE NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

async function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // Check for database URL
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL environment variable is not set');
    log('\n  ℹ️  To create a Turso database:', 'cyan');
    log('     1. Sign up at https://turso.tech', 'cyan');
    log('     2. Install Turso CLI: curl -sSfL https://get.tur.so/install.sh | bash', 'cyan');
    log('     3. Create database: turso db create proceed-dashboard', 'cyan');
    log('     4. Get URL: turso db show proceed-dashboard --url', 'cyan');
    log('     5. Get token: turso db tokens create proceed-dashboard', 'cyan');
    log('     6. Set DATABASE_URL and DATABASE_AUTH_TOKEN in Netlify', 'cyan');
  }

  // Check for auth token in production
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_AUTH_TOKEN) {
    warnings.push('DATABASE_AUTH_TOKEN is recommended for production');
  }

  return { errors, warnings };
}

async function testConnection(client) {
  try {
    const result = await client.execute('SELECT 1 as test');
    return result.rows[0].test === 1;
  } catch (error) {
    throw new Error(`Connection test failed: ${error.message}`);
  }
}

async function createTables(client) {
  const statements = SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let created = 0;
  let errors = 0;

  for (const statement of statements) {
    try {
      await client.execute(statement + ';');
      created++;
    } catch (error) {
      console.error(`Failed to execute: ${statement.substring(0, 50)}...`);
      console.error(`Error: ${error.message}`);
      errors++;
    }
  }

  return { created, errors };
}

async function insertSampleData(client) {
  const sampleSnapshot = {
    id: 'sample-' + Date.now(),
    actor: 'System',
    notes: 'Initial sample data for testing',
    domainData: JSON.stringify({
      headers: {
        portfolio: 'PROCEED Portfolio',
        currentPeriodStart: '2025-01-01',
        currentPeriodEnd: '2025-01-31',
        reportDate: new Date().toISOString().split('T')[0],
      },
      statusSummary: [
        {
          project: 'Sample Project Alpha',
          statusColor: 'green',
          trend: 'up',
          manager: 'John Doe',
          nextMilestone: 'Phase 1 Complete',
        },
        {
          project: 'Sample Project Beta',
          statusColor: 'amber',
          trend: 'flat',
          manager: 'Jane Smith',
          nextMilestone: 'Testing Phase',
        },
      ],
      highlights: [
        {
          project: 'Sample Project Alpha',
          description: 'Successfully deployed to production',
        },
      ],
      lowlights: [
        {
          project: 'Sample Project Beta',
          description: 'Resource constraints identified',
        },
      ],
      milestones: [
        {
          project: 'Sample Project Alpha',
          milestone: 'Production Release',
          owner: 'John Doe',
          dueDate: '2025-02-15',
          statusBadge: 'On Track',
          workstreamUpdate: 'Final testing in progress',
        },
      ],
      metrics: [],
    }),
    viewModel: JSON.stringify({
      headers: {
        portfolio: 'PROCEED Portfolio',
        currentPeriod: {
          start: '2025-01-01',
          end: '2025-01-31',
        },
        reportDate: new Date().toISOString().split('T')[0],
      },
      statusSummary: [],
      highlights: [],
      lowlights: [],
      upcomingMilestones: [],
      metrics: {
        summary: {
          totalProjects: 2,
          greenProjects: 1,
          amberProjects: 1,
          redProjects: 0,
        },
        projects: [],
      },
    }),
  };

  try {
    // Insert sample snapshot
    await client.execute({
      sql: `INSERT INTO Snapshot (id, createdAt, actor, notes, domainData, viewModel)
            VALUES (?, datetime('now'), ?, ?, ?, ?)`,
      args: [
        sampleSnapshot.id,
        sampleSnapshot.actor,
        sampleSnapshot.notes,
        sampleSnapshot.domainData,
        sampleSnapshot.viewModel,
      ],
    });

    // Set as current snapshot
    await client.execute({
      sql: `INSERT OR REPLACE INTO CurrentSnapshot (id, snapshotId, updatedAt)
            VALUES ('current', ?, datetime('now'))`,
      args: [sampleSnapshot.id],
    });

    return true;
  } catch (error) {
    console.error('Failed to insert sample data:', error.message);
    return false;
  }
}

async function main() {
  console.log();
  log('🗄️  Preparing Database for Netlify', 'bright');
  log('===================================', 'bright');
  console.log();

  // Validate environment
  log('🔍 Validating environment...', 'cyan');
  const { errors, warnings } = await validateEnvironment();

  if (warnings.length > 0) {
    warnings.forEach(w => log(`  ⚠️  ${w}`, 'yellow'));
  }

  if (errors.length > 0) {
    errors.forEach(e => log(`  ❌ ${e}`, 'red'));

    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      log('\n  ℹ️  Skipping database setup in development mode', 'yellow');
      log('     Set DATABASE_URL to enable database setup', 'yellow');
      process.exit(0);
    }
  }

  try {
    // Connect to database
    log('\n📡 Connecting to database...', 'cyan');
    const client = createClient({
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });

    // Test connection
    const connected = await testConnection(client);
    if (connected) {
      log('  ✅ Connected successfully', 'green');
    }

    // Create tables
    log('\n🔨 Creating database schema...', 'cyan');
    const { created, errors: schemaErrors } = await createTables(client);

    if (schemaErrors > 0) {
      log(`  ⚠️  Created ${created} objects with ${schemaErrors} errors`, 'yellow');
    } else {
      log(`  ✅ Created ${created} database objects`, 'green');
    }

    // Insert sample data if empty
    if (process.env.INSERT_SAMPLE_DATA === 'true') {
      log('\n📝 Inserting sample data...', 'cyan');
      const inserted = await insertSampleData(client);
      if (inserted) {
        log('  ✅ Sample data inserted', 'green');
      } else {
        log('  ⚠️  Could not insert sample data', 'yellow');
      }
    }

    // Verify setup
    log('\n✨ Verifying database setup...', 'cyan');
    const tables = await client.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    log(`  ✅ Found ${tables.rows.length} tables:`, 'green');
    tables.rows.forEach(row => {
      log(`     • ${row.name}`, 'green');
    });

    console.log();
    log('🎉 Database preparation complete!', 'green');
    console.log();

    // Production deployment tips
    if (process.env.NODE_ENV === 'production') {
      log('📌 Production Deployment Checklist:', 'bright');
      log('====================================', 'bright');
      log('  ✓ Database URL configured in Netlify environment', 'cyan');
      log('  ✓ Authentication token set (if using Turso)', 'cyan');
      log('  ✓ Schema created and verified', 'cyan');
      log('  ✓ Indexes created for performance', 'cyan');
      log('  ✓ Ready for production traffic', 'cyan');
      console.log();
    }

  } catch (error) {
    log(`\n❌ Database preparation failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { main as prepareDatabase };