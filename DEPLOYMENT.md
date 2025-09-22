# 🚀 PROCEED Dashboard - Netlify Deployment Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Database Setup](#database-setup)
- [Environment Configuration](#environment-configuration)
- [Deployment](#deployment)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)

## Prerequisites

### Required Tools
- Node.js 20+ LTS
- npm 10+
- Git
- Netlify CLI (`npm install -g netlify-cli`)
- Turso CLI (optional, for database management)

### Accounts Needed
- [Netlify Account](https://app.netlify.com/signup)
- [Turso Account](https://turso.tech) (for database)
- [Sentry Account](https://sentry.io) (optional, for monitoring)

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd "status_update_last"

# Install dependencies
npm run install:all
```

### 2. Set Up Database

#### Using Turso (Recommended for Production)

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Authenticate
turso auth login

# Create database
turso db create proceed-dashboard

# Get connection details
turso db show proceed-dashboard --url
turso db tokens create proceed-dashboard

# Add to .env.local
echo "DATABASE_URL=<your-url>" >> .env.local
echo "DATABASE_AUTH_TOKEN=<your-token>" >> .env.local
```

#### Initialize Database Schema

```bash
# Load environment variables
source .env.local

# Run database setup
node scripts/prepare-db.js
```

### 3. Local Development

```bash
# Start Netlify Dev server
npm run dev:netlify

# Or run components separately
npm run dev:backend  # Backend API
npm run dev:frontend # Frontend server
```

Visit http://localhost:8888 to see the dashboard.

## Database Setup

### Turso Configuration

1. **Create Database**:
   ```bash
   turso db create proceed-dashboard --location ord
   ```

2. **Get Credentials**:
   ```bash
   # Database URL
   turso db show proceed-dashboard --url

   # Authentication token
   turso db tokens create proceed-dashboard --expiration never
   ```

3. **Configure Netlify**:
   - Go to Netlify Dashboard → Site Settings → Environment Variables
   - Add `DATABASE_URL` and `DATABASE_AUTH_TOKEN`

### Database Schema

The application uses the following tables:
- `Snapshot` - Complete dashboard states
- `Headers` - Report metadata
- `Status` - Project status summary
- `Highlight` - Positive achievements
- `Lowlight` - Risks and issues
- `Milestone` - Upcoming milestones
- `Metrics` - Project metrics
- `CurrentSnapshot` - Active snapshot reference

## Environment Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Turso database URL | `libsql://db.turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso auth token | `eyJ...` |
| `NODE_ENV` | Environment mode | `production` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_CACHE` | Enable response caching | `true` |
| `CACHE_TTL` | Cache time-to-live (seconds) | `300` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `SENTRY_DSN` | Error tracking | - |
| `MAX_FILE_SIZE` | Max upload size (bytes) | `10485760` |

### Setting Variables in Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Navigate to Site Settings → Environment Variables
4. Add each variable with its value
5. Deploy or redeploy to apply changes

## Deployment

### Method 1: Netlify CLI (Recommended)

```bash
# Login to Netlify
netlify login

# Initialize site (first time only)
netlify init

# Build locally
npm run build:all

# Deploy to preview
netlify deploy

# Deploy to production
netlify deploy --prod
```

### Method 2: Git Integration

1. **Connect Repository**:
   - Go to Netlify Dashboard
   - Click "New site from Git"
   - Select your repository
   - Configure build settings:
     - Build command: `npm run build:all`
     - Publish directory: `dist`
     - Functions directory: `netlify/functions`

2. **Automatic Deployments**:
   - Push to `main` branch triggers production deploy
   - Pull requests create preview deployments

### Method 3: Drag and Drop

1. Build locally:
   ```bash
   npm run build:all
   ```

2. Go to [Netlify Drop](https://app.netlify.com/drop)

3. Drag the `dist` folder to deploy

## Post-Deployment

### 1. Verify Deployment

```bash
# Check function logs
netlify functions:log

# Test health endpoint
curl https://your-site.netlify.app/.netlify/functions/health

# Test dashboard API
curl https://your-site.netlify.app/.netlify/functions/dashboard
```

### 2. Configure Custom Domain (Optional)

1. Go to Site Settings → Domain Management
2. Add custom domain
3. Configure DNS:
   - Add CNAME record pointing to `your-site.netlify.app`
   - Or use Netlify DNS

### 3. Enable Analytics (Optional)

1. Go to Site Settings → Analytics
2. Enable Netlify Analytics
3. View metrics in Analytics tab

### 4. Set Up Monitoring

```bash
# Configure Sentry
netlify env:set SENTRY_DSN your-sentry-dsn
netlify deploy --prod
```

## Troubleshooting

### Common Issues

#### Function Timeout
**Problem**: Functions timing out after 10 seconds
**Solution**:
- Optimize database queries
- Implement caching
- Increase timeout in `netlify.toml`:
  ```toml
  [functions."upload"]
    timeout = 26
  ```

#### Database Connection Failed
**Problem**: Cannot connect to database
**Solution**:
- Verify `DATABASE_URL` is correct
- Check `DATABASE_AUTH_TOKEN` is valid
- Ensure database is not sleeping (Turso free tier)

#### CORS Errors
**Problem**: Cross-origin requests blocked
**Solution**:
- Check CORS headers in functions
- Verify API endpoints use relative paths
- Clear browser cache

#### Large File Upload Fails
**Problem**: Excel files over 10MB fail
**Solution**:
- Increase limit in function:
  ```javascript
  limits: { fileSize: 20 * 1024 * 1024 }
  ```
- Consider file compression

### Debug Commands

```bash
# View function logs
netlify functions:log dashboard --tail

# Check environment variables
netlify env:list

# Test function locally
netlify functions:serve

# Clear build cache
netlify build --clear-cache
```

## Architecture

### Frontend
- **Static HTML**: Main dashboard interface
- **dashboard-bind.js**: Data binding and interactivity
- **API Calls**: Routed through `/.netlify/functions/`

### Backend (Netlify Functions)
- **dashboard**: Retrieve current dashboard data
- **upload**: Process Excel/JSON uploads
- **template**: Generate Excel templates
- **health**: System health checks

### Database
- **Turso/LibSQL**: Serverless SQLite
- **Edge locations**: Global distribution
- **Connection pooling**: Automatic management

### Performance Optimizations
- **Response caching**: 5-minute TTL
- **CDN distribution**: Global edge network
- **Lazy loading**: On-demand data fetching
- **Compression**: Automatic gzip/brotli

### Security Features
- **HTTPS only**: Enforced by Netlify
- **Security headers**: CSP, HSTS, etc.
- **Input validation**: Zod schemas
- **Rate limiting**: Configurable per endpoint

## Production Checklist

- [ ] Database configured and tested
- [ ] Environment variables set in Netlify
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Monitoring enabled (Sentry)
- [ ] Analytics configured
- [ ] Backup strategy defined
- [ ] Rate limiting configured
- [ ] Health checks passing
- [ ] Performance benchmarks met

## Support

### Resources
- [Netlify Documentation](https://docs.netlify.com)
- [Turso Documentation](https://docs.turso.tech)
- [Project Issues](https://github.com/your-org/proceed-dashboard/issues)

### Getting Help
1. Check [Troubleshooting](#troubleshooting) section
2. Review Netlify function logs
3. Open an issue with:
   - Error messages
   - Steps to reproduce
   - Environment details

## License

MIT License - See LICENSE file for details

---

**Last Updated**: January 2025
**Version**: 2.0.0
**Maintained by**: PROCEED Team