#!/usr/bin/env node

/**
 * Deployment Verification Script
 * Checks that all requirements are met for Netlify deployment
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Color codes
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

// Verification checks
const checks = {
  async nodeVersion() {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);

    if (major >= 20) {
      return { pass: true, message: `Node.js ${version}` };
    } else {
      return {
        pass: false,
        message: `Node.js ${version} (requires v20+)`,
        fix: 'Install Node.js 20 LTS or later'
      };
    }
  },

  async npmVersion() {
    try {
      const version = execSync('npm -v', { encoding: 'utf-8' }).trim();
      const major = parseInt(version.split('.')[0]);

      if (major >= 10) {
        return { pass: true, message: `npm ${version}` };
      } else {
        return {
          pass: false,
          message: `npm ${version} (requires v10+)`,
          fix: 'Update npm: npm install -g npm@latest'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'npm not found',
        fix: 'Install npm (comes with Node.js)'
      };
    }
  },

  async netlifyConfig() {
    const configPath = path.join(PROJECT_ROOT, 'netlify.toml');

    try {
      await fs.access(configPath);
      const content = await fs.readFile(configPath, 'utf-8');

      // Check for required sections
      const hasBuil = content.includes('[build]');
      const hasFunctions = content.includes('functions =');
      const hasHeaders = content.includes('[[headers]]');

      if (hasBuil && hasFunctions && hasHeaders) {
        return { pass: true, message: 'netlify.toml configured' };
      } else {
        return {
          pass: false,
          message: 'netlify.toml incomplete',
          fix: 'Review netlify.toml configuration'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'netlify.toml not found',
        fix: 'Create netlify.toml configuration file'
      };
    }
  },

  async functionsDirectory() {
    const functionsPath = path.join(PROJECT_ROOT, 'netlify/functions');

    try {
      const files = await fs.readdir(functionsPath);
      const tsFiles = files.filter(f => f.endsWith('.ts'));

      if (tsFiles.length > 0) {
        return {
          pass: true,
          message: `${tsFiles.length} function(s) found`
        };
      } else {
        return {
          pass: false,
          message: 'No TypeScript functions found',
          fix: 'Add functions to netlify/functions/'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'Functions directory not found',
        fix: 'Create netlify/functions/ directory'
      };
    }
  },

  async packageJson() {
    const packagePath = path.join(PROJECT_ROOT, 'package.json');

    try {
      const content = await fs.readFile(packagePath, 'utf-8');
      const pkg = JSON.parse(content);

      const requiredScripts = ['build:all', 'install:all'];
      const hasScripts = requiredScripts.every(s => pkg.scripts[s]);

      if (hasScripts) {
        return { pass: true, message: 'Build scripts configured' };
      } else {
        return {
          pass: false,
          message: 'Missing build scripts',
          fix: 'Add build:all and install:all scripts to package.json'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'package.json not found or invalid',
        fix: 'Create valid package.json file'
      };
    }
  },

  async envExample() {
    const envPath = path.join(PROJECT_ROOT, '.env.example');

    try {
      await fs.access(envPath);
      return { pass: true, message: '.env.example found' };
    } catch (error) {
      return {
        pass: 'warn',
        message: '.env.example not found',
        fix: 'Create .env.example with required variables'
      };
    }
  },

  async htmlFiles() {
    try {
      const files = await fs.readdir(PROJECT_ROOT);
      const htmlFiles = files.filter(f => f.endsWith('.html'));

      if (htmlFiles.length > 0) {
        // Check if main dashboard exists
        const mainDashboard = htmlFiles.includes('fareye-b2b-project-update.html');

        if (mainDashboard) {
          return {
            pass: true,
            message: `${htmlFiles.length} HTML file(s) found`
          };
        } else {
          return {
            pass: false,
            message: 'Main dashboard HTML not found',
            fix: 'Ensure fareye-b2b-project-update.html exists'
          };
        }
      } else {
        return {
          pass: false,
          message: 'No HTML files found',
          fix: 'Add HTML files to project root'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'Could not read project directory',
        fix: 'Check directory permissions'
      };
    }
  },

  async dashboardBindJs() {
    const jsPath = path.join(PROJECT_ROOT, 'dashboard-bind.js');

    try {
      const content = await fs.readFile(jsPath, 'utf-8');

      // Check if updated for Netlify
      const hasNetlifyEndpoint = content.includes('/.netlify/functions');

      if (hasNetlifyEndpoint) {
        return { pass: true, message: 'dashboard-bind.js updated' };
      } else {
        return {
          pass: false,
          message: 'dashboard-bind.js not updated for Netlify',
          fix: 'Update API endpoints in dashboard-bind.js'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'dashboard-bind.js not found',
        fix: 'Create dashboard-bind.js file'
      };
    }
  },

  async buildScripts() {
    const scriptsPath = path.join(PROJECT_ROOT, 'scripts');

    try {
      const files = await fs.readdir(scriptsPath);
      const requiredScripts = ['build-functions.js', 'build-frontend.js', 'prepare-db.js'];
      const hasAllScripts = requiredScripts.every(s => files.includes(s));

      if (hasAllScripts) {
        return { pass: true, message: 'Build scripts present' };
      } else {
        const missing = requiredScripts.filter(s => !files.includes(s));
        return {
          pass: false,
          message: `Missing scripts: ${missing.join(', ')}`,
          fix: 'Create missing build scripts'
        };
      }
    } catch (error) {
      return {
        pass: false,
        message: 'Scripts directory not found',
        fix: 'Create scripts/ directory with build scripts'
      };
    }
  },

  async documentation() {
    const deploymentDoc = path.join(PROJECT_ROOT, 'DEPLOYMENT.md');

    try {
      await fs.access(deploymentDoc);
      return { pass: true, message: 'Deployment documentation found' };
    } catch (error) {
      return {
        pass: 'warn',
        message: 'DEPLOYMENT.md not found',
        fix: 'Create deployment documentation'
      };
    }
  },

  async netlifyCliInstalled() {
    try {
      execSync('netlify --version', { stdio: 'pipe' });
      return { pass: true, message: 'Netlify CLI installed' };
    } catch (error) {
      return {
        pass: 'warn',
        message: 'Netlify CLI not installed',
        fix: 'Install: npm install -g netlify-cli'
      };
    }
  },

  async gitRepository() {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: PROJECT_ROOT,
        stdio: 'pipe'
      });

      // Check if there are uncommitted changes
      const status = execSync('git status --porcelain', {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8'
      });

      if (status.trim() === '') {
        return { pass: true, message: 'Git repository (clean)' };
      } else {
        return {
          pass: 'warn',
          message: 'Git repository (uncommitted changes)',
          fix: 'Commit or stash changes before deploying'
        };
      }
    } catch (error) {
      return {
        pass: 'warn',
        message: 'Not a git repository',
        fix: 'Initialize git: git init'
      };
    }
  },
};

async function runChecks() {
  console.log();
  log('🔍 PROCEED Dashboard - Deployment Verification', 'bright');
  log('==============================================', 'bright');
  console.log();

  const results = {
    passed: 0,
    warned: 0,
    failed: 0,
    fixes: [],
  };

  // Run all checks
  for (const [name, check] of Object.entries(checks)) {
    const displayName = name.replace(/([A-Z])/g, ' $1').trim();
    process.stdout.write(`Checking ${displayName}... `);

    try {
      const result = await check();

      if (result.pass === true) {
        log('✅', 'green');
        log(`  ${result.message}`, 'green');
        results.passed++;
      } else if (result.pass === 'warn') {
        log('⚠️', 'yellow');
        log(`  ${result.message}`, 'yellow');
        if (result.fix) {
          log(`  Fix: ${result.fix}`, 'yellow');
          results.fixes.push({ level: 'warn', fix: result.fix });
        }
        results.warned++;
      } else {
        log('❌', 'red');
        log(`  ${result.message}`, 'red');
        if (result.fix) {
          log(`  Fix: ${result.fix}`, 'red');
          results.fixes.push({ level: 'error', fix: result.fix });
        }
        results.failed++;
      }
    } catch (error) {
      log('❌', 'red');
      log(`  Error: ${error.message}`, 'red');
      results.failed++;
    }

    console.log();
  }

  // Summary
  log('📊 Verification Summary', 'bright');
  log('=======================', 'bright');
  console.log();

  log(`✅ Passed: ${results.passed}`, 'green');
  if (results.warned > 0) {
    log(`⚠️  Warnings: ${results.warned}`, 'yellow');
  }
  if (results.failed > 0) {
    log(`❌ Failed: ${results.failed}`, 'red');
  }

  console.log();

  // Show fixes needed
  if (results.fixes.length > 0) {
    log('🔧 Required Fixes:', 'bright');
    log('==================', 'bright');
    console.log();

    const errors = results.fixes.filter(f => f.level === 'error');
    const warnings = results.fixes.filter(f => f.level === 'warn');

    if (errors.length > 0) {
      log('Critical (must fix):', 'red');
      errors.forEach((f, i) => {
        log(`  ${i + 1}. ${f.fix}`, 'red');
      });
      console.log();
    }

    if (warnings.length > 0) {
      log('Recommended:', 'yellow');
      warnings.forEach((f, i) => {
        log(`  ${i + 1}. ${f.fix}`, 'yellow');
      });
      console.log();
    }
  }

  // Deployment readiness
  console.log();
  if (results.failed === 0) {
    log('🚀 Ready for Deployment!', 'green');
    console.log();
    log('Next steps:', 'cyan');
    log('  1. Set environment variables in Netlify', 'cyan');
    log('  2. Run: netlify deploy --prod', 'cyan');
    log('  3. Verify deployment at your Netlify URL', 'cyan');
  } else {
    log('⛔ Not ready for deployment', 'red');
    log(`   Fix ${results.failed} critical issue(s) before deploying`, 'red');
  }

  console.log();

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run verification
runChecks().catch(error => {
  log(`\n❌ Verification failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});