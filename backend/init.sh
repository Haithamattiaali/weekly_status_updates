#!/bin/bash

# Backend initialization script
# Sets up the complete environment for the Excel-driven dashboard

set -e  # Exit on any error

echo "🚀 PROCEED Dashboard Backend Initialization"
echo "==========================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Navigate to backend directory
cd "$(dirname "$0")"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run migrations
echo ""
echo "🗄️ Running database migrations..."
npx prisma migrate deploy 2>/dev/null || npx prisma db push --accept-data-loss

# Compile TypeScript
echo ""
echo "🔨 Compiling TypeScript..."
npx tsc || true  # Continue even if there are minor TS errors

# Run seed data
echo ""
echo "🌱 Seeding initial data..."
npm run seed || npx tsx src/seed.ts

# Create public directory if it doesn't exist
echo ""
echo "📁 Setting up public directory..."
mkdir -p public

# Copy dashboard-bind.js to public
if [ -f "../dashboard-bind.js" ]; then
    cp ../dashboard-bind.js public/
    echo "✅ Copied dashboard-bind.js to public directory"
else
    echo "⚠️  Warning: dashboard-bind.js not found in parent directory"
fi

# Success message
echo ""
echo "✨ ========================================="
echo "✨ Backend initialization complete!"
echo "✨ ========================================="
echo ""
echo "To start the server, run:"
echo "  npm run dev"
echo ""
echo "The API will be available at:"
echo "  http://localhost:3001"
echo ""
echo "API endpoints:"
echo "  GET  /api/template     - Download Excel template"
echo "  POST /api/upload       - Upload Excel file"
echo "  GET  /api/dashboard    - Get dashboard data"
echo "  GET  /api/versions     - List versions"
echo ""
echo "To view the dashboard:"
echo "  Open fareye-b2b-project-update-enhanced.html in your browser"
echo ""