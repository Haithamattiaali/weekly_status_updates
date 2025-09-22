#!/usr/bin/env node

/**
 * Build script for frontend assets
 * Prepares HTML and JavaScript files for Netlify deployment
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify as minifyJS } from 'terser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

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

async function ensureDistDirectory() {
  try {
    await fs.mkdir(DIST_DIR, { recursive: true });
    log('  ✓ Created dist directory', 'green');
  } catch (error) {
    log(`  ✗ Failed to create dist directory: ${error.message}`, 'red');
    throw error;
  }
}

async function processHTML() {
  try {
    // Read the main HTML file
    const htmlPath = path.join(PROJECT_ROOT, 'fareye-b2b-project-update.html');
    let html = await fs.readFile(htmlPath, 'utf-8');

    // Update API endpoints for Netlify Functions
    html = html.replace(
      /http:\/\/localhost:3001\/api\//g,
      '/.netlify/functions/'
    );

    // Update dashboard-bind.js path
    html = html.replace(
      /src="dashboard-bind\.js"/g,
      'src="/dashboard-bind.js"'
    );

    // Add production optimizations
    if (process.env.NODE_ENV === 'production') {
      // Add preconnect for performance
      const preconnects = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="dns-prefetch" href="https://fonts.googleapis.com">`;

      html = html.replace('<head>', `<head>${preconnects}`);

      // Add meta tags for better SEO and performance
      const metaTags = `
    <meta name="description" content="PROCEED Portfolio Management Dashboard - Track project status, milestones, and metrics">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
    <meta name="theme-color" content="#424046">`;

      html = html.replace('<head>', `<head>${metaTags}`);

      // Minify inline styles
      html = html.replace(/<style>([\s\S]*?)<\/style>/g, (match, css) => {
        const minified = css
          .replace(/\s+/g, ' ')
          .replace(/:\s+/g, ':')
          .replace(/;\s+/g, ';')
          .replace(/\{\s+/g, '{')
          .replace(/\}\s+/g, '}')
          .trim();
        return `<style>${minified}</style>`;
      });

      // Minify HTML (basic)
      html = html
        .replace(/\n\s+/g, '\n')
        .replace(/<!--.*?-->/g, '')
        .replace(/\n+/g, '\n');
    }

    // Write to dist
    await fs.writeFile(path.join(DIST_DIR, 'fareye-b2b-project-update.html'), html);
    log('  ✓ Processed main dashboard HTML', 'green');

    // Copy other HTML files
    const otherHTMLFiles = [
      'test-integration.html',
      'multi_project_status_dashboard.html',
    ];

    for (const file of otherHTMLFiles) {
      try {
        const content = await fs.readFile(path.join(PROJECT_ROOT, file), 'utf-8');
        const updated = content.replace(
          /http:\/\/localhost:3001\/api\//g,
          '/.netlify/functions/'
        );
        await fs.writeFile(path.join(DIST_DIR, file), updated);
        log(`  ✓ Copied ${file}`, 'green');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          log(`  ⚠ Could not process ${file}: ${error.message}`, 'yellow');
        }
      }
    }

    // Create index.html redirect
    const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=/fareye-b2b-project-update.html">
    <title>PROCEED Dashboard - Redirecting...</title>
    <script>window.location.replace('/fareye-b2b-project-update.html');</script>
</head>
<body>
    <p>Redirecting to dashboard...</p>
</body>
</html>`;

    await fs.writeFile(path.join(DIST_DIR, 'index.html'), indexHTML);
    log('  ✓ Created index.html redirect', 'green');

    return true;
  } catch (error) {
    log(`  ✗ Failed to process HTML: ${error.message}`, 'red');
    throw error;
  }
}

async function processJavaScript() {
  try {
    // Read dashboard-bind.js
    const jsPath = path.join(PROJECT_ROOT, 'dashboard-bind.js');
    let js = await fs.readFile(jsPath, 'utf-8');

    // Update API endpoints
    js = js.replace(
      /http:\/\/localhost:3001\/api\//g,
      '/.netlify/functions/'
    );

    // Add production optimizations
    if (process.env.NODE_ENV === 'production') {
      log('  Minifying JavaScript...', 'cyan');

      const result = await minifyJS(js, {
        compress: {
          drop_console: false, // Keep console for debugging
          drop_debugger: true,
          passes: 2,
        },
        mangle: {
          toplevel: false,
          reserved: ['DashboardBinder', 'window', 'document'],
        },
        format: {
          comments: false,
        },
      });

      js = result.code || js;
      log('  ✓ JavaScript minified', 'green');
    }

    // Write to dist
    await fs.writeFile(path.join(DIST_DIR, 'dashboard-bind.js'), js);
    log('  ✓ Processed dashboard-bind.js', 'green');

    return true;
  } catch (error) {
    log(`  ✗ Failed to process JavaScript: ${error.message}`, 'red');
    throw error;
  }
}

async function copyStaticAssets() {
  try {
    // Copy JSON data files
    const jsonFiles = await fs.readdir(PROJECT_ROOT);
    const dataFiles = jsonFiles.filter(f => f.endsWith('.json') && f.includes('project'));

    for (const file of dataFiles) {
      try {
        await fs.copyFile(
          path.join(PROJECT_ROOT, file),
          path.join(DIST_DIR, file)
        );
        log(`  ✓ Copied ${file}`, 'green');
      } catch (error) {
        log(`  ⚠ Could not copy ${file}: ${error.message}`, 'yellow');
      }
    }

    // Create _redirects file for Netlify
    const redirects = `# API redirects
/api/*  /.netlify/functions/:splat  200

# SPA fallback
/*  /fareye-b2b-project-update.html  200`;

    await fs.writeFile(path.join(DIST_DIR, '_redirects'), redirects);
    log('  ✓ Created _redirects file', 'green');

    // Create _headers file for Netlify
    const headers = `/*
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/dashboard-bind.js
  Cache-Control: public, max-age=604800, must-revalidate

/*.html
  Cache-Control: public, max-age=0, must-revalidate`;

    await fs.writeFile(path.join(DIST_DIR, '_headers'), headers);
    log('  ✓ Created _headers file', 'green');

    return true;
  } catch (error) {
    log(`  ✗ Failed to copy static assets: ${error.message}`, 'red');
    throw error;
  }
}

async function generateManifest() {
  try {
    const manifest = {
      name: 'PROCEED Dashboard',
      short_name: 'PROCEED',
      description: 'Portfolio Management Dashboard',
      start_url: '/fareye-b2b-project-update.html',
      display: 'standalone',
      theme_color: '#424046',
      background_color: '#f2f2f4',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    };

    await fs.writeFile(
      path.join(DIST_DIR, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    log('  ✓ Generated manifest.json', 'green');
    return true;
  } catch (error) {
    log(`  ⚠ Could not generate manifest: ${error.message}`, 'yellow');
    return false;
  }
}

async function main() {
  console.log();
  log('🎨 Building Frontend Assets', 'bright');
  log('============================', 'bright');
  console.log();

  try {
    // Create dist directory
    log('📁 Setting up dist directory...', 'cyan');
    await ensureDistDirectory();
    console.log();

    // Process HTML files
    log('📄 Processing HTML files...', 'cyan');
    await processHTML();
    console.log();

    // Process JavaScript files
    log('📜 Processing JavaScript files...', 'cyan');
    await processJavaScript();
    console.log();

    // Copy static assets
    log('🎁 Copying static assets...', 'cyan');
    await copyStaticAssets();
    console.log();

    // Generate manifest
    log('📱 Generating PWA manifest...', 'cyan');
    await generateManifest();
    console.log();

    // Calculate dist size
    const files = await fs.readdir(DIST_DIR);
    let totalSize = 0;

    for (const file of files) {
      const stats = await fs.stat(path.join(DIST_DIR, file));
      totalSize += stats.size;
    }

    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

    log('📊 Build Summary', 'bright');
    log('================', 'bright');
    log(`✅ Successfully built frontend assets`, 'green');
    log(`   Files: ${files.length}`, 'green');
    log(`   Total size: ${totalSizeMB} MB`, 'green');
    console.log();

    log('✨ Frontend build completed successfully!', 'green');
    console.log();

    // Production tips
    if (process.env.NODE_ENV === 'production') {
      log('💡 Production Tips:', 'cyan');
      log('   • All assets have been optimized and minified', 'cyan');
      log('   • API endpoints updated for Netlify Functions', 'cyan');
      log('   • Cache headers configured for optimal performance', 'cyan');
      log('   • Security headers will be applied by Netlify', 'cyan');
      console.log();
    }
  } catch (error) {
    log(`\n❌ Frontend build failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the build
main();