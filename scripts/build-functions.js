#!/usr/bin/env node

/**
 * Build script for Netlify Functions
 * Compiles TypeScript functions and bundles dependencies
 */

import { build } from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FUNCTIONS_SRC = path.join(__dirname, '../netlify/functions');
const FUNCTIONS_DIST = path.join(__dirname, '../netlify/functions');

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

async function buildFunction(functionName) {
  const entryPoint = path.join(FUNCTIONS_SRC, `${functionName}.ts`);
  const outfile = path.join(FUNCTIONS_DIST, `${functionName}.js`);

  try {
    log(`  Building ${functionName}...`, 'cyan');

    const result = await build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      minify: process.env.NODE_ENV === 'production',
      sourcemap: process.env.NODE_ENV !== 'production',
      external: [
        '@libsql/client',
        '@netlify/functions',
        '@sentry/node',
      ],
      define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      },
      logLevel: 'warning',
      metafile: true,
    });

    // Calculate output size
    const stats = await fs.stat(outfile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    log(`  ✓ ${functionName} built successfully (${sizeKB} KB)`, 'green');

    return {
      name: functionName,
      size: stats.size,
      success: true,
    };
  } catch (error) {
    log(`  ✗ ${functionName} build failed: ${error.message}`, 'red');
    return {
      name: functionName,
      error: error.message,
      success: false,
    };
  }
}

async function copyStaticFiles() {
  try {
    // Copy any static configuration files needed by functions
    const staticFiles = [
      // Add any static files that need to be copied
    ];

    for (const file of staticFiles) {
      const src = path.join(FUNCTIONS_SRC, file);
      const dest = path.join(FUNCTIONS_DIST, file);

      try {
        await fs.copyFile(src, dest);
        log(`  ✓ Copied ${file}`, 'green');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log(`  ✗ Failed to copy ${file}: ${error.message}`, 'yellow');
        }
      }
    }
  } catch (error) {
    log(`  ⚠ Error copying static files: ${error.message}`, 'yellow');
  }
}

async function cleanDist() {
  try {
    // Remove old .js files (keep .ts source files)
    const files = await fs.readdir(FUNCTIONS_DIST);
    const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.js.map'));

    for (const file of jsFiles) {
      await fs.unlink(path.join(FUNCTIONS_DIST, file));
    }

    log('  ✓ Cleaned previous build artifacts', 'green');
  } catch (error) {
    log(`  ⚠ Could not clean dist: ${error.message}`, 'yellow');
  }
}

async function validateEnvironment() {
  const warnings = [];

  // Check Node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 20) {
    warnings.push(`Node.js version ${nodeVersion} detected. Netlify Functions require Node.js 20+`);
  }

  // Check for required environment variables in production
  if (process.env.NODE_ENV === 'production') {
    const required = ['DATABASE_URL'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      warnings.push(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  return warnings;
}

async function main() {
  console.log();
  log('🚀 Building Netlify Functions', 'bright');
  log('================================', 'bright');
  console.log();

  // Validate environment
  const warnings = await validateEnvironment();
  if (warnings.length > 0) {
    log('⚠️  Warnings:', 'yellow');
    warnings.forEach(w => log(`  - ${w}`, 'yellow'));
    console.log();
  }

  // Clean previous builds
  log('📦 Preparing build directory...', 'cyan');
  await cleanDist();
  console.log();

  // Get all TypeScript function files
  const files = await fs.readdir(FUNCTIONS_SRC);
  const functions = files
    .filter(f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.spec.'))
    .map(f => f.replace('.ts', ''));

  if (functions.length === 0) {
    log('⚠️  No functions found to build', 'yellow');
    process.exit(0);
  }

  log(`📝 Found ${functions.length} function(s) to build:`, 'cyan');
  functions.forEach(f => log(`  - ${f}`, 'cyan'));
  console.log();

  // Build all functions
  log('🔨 Building functions...', 'cyan');
  const results = await Promise.all(functions.map(buildFunction));
  console.log();

  // Copy static files
  log('📄 Copying static files...', 'cyan');
  await copyStaticFiles();
  console.log();

  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  log('📊 Build Summary', 'bright');
  log('================', 'bright');

  if (successful.length > 0) {
    const totalSize = successful.reduce((sum, r) => sum + r.size, 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

    log(`✅ Successfully built ${successful.length} function(s)`, 'green');
    log(`   Total size: ${totalSizeMB} MB`, 'green');
    console.log();

    successful.forEach(r => {
      const sizeMB = (r.size / 1024 / 1024).toFixed(2);
      log(`   • ${r.name}: ${sizeMB} MB`, 'green');
    });
  }

  if (failed.length > 0) {
    console.log();
    log(`❌ Failed to build ${failed.length} function(s)`, 'red');
    failed.forEach(r => {
      log(`   • ${r.name}: ${r.error}`, 'red');
    });
    process.exit(1);
  }

  console.log();
  log('✨ Build completed successfully!', 'green');

  // Check function size warnings
  const largeFunctions = successful.filter(r => r.size > 5 * 1024 * 1024); // 5MB
  if (largeFunctions.length > 0) {
    console.log();
    log('⚠️  Large function warning:', 'yellow');
    log('   The following functions exceed 5MB:', 'yellow');
    largeFunctions.forEach(r => {
      const sizeMB = (r.size / 1024 / 1024).toFixed(2);
      log(`   • ${r.name}: ${sizeMB} MB`, 'yellow');
    });
    log('   Consider optimizing bundle size for better performance', 'yellow');
  }

  console.log();
}

// Run the build
main().catch(error => {
  log(`\n❌ Build failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});