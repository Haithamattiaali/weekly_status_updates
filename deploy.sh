#!/bin/bash

# PROCEED Dashboard - One-Click Deployment Script
# This script automates the deployment process to Netlify

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
print_color() {
    color=$1
    message=$2
    echo -e "${color}${message}${NC}"
}

# Banner
print_color "$CYAN" "
╔══════════════════════════════════════════════╗
║   PROCEED Dashboard - Netlify Deployment    ║
╚══════════════════════════════════════════════╝
"

# Check if running in the correct directory
if [ ! -f "netlify.toml" ]; then
    print_color "$RED" "❌ Error: netlify.toml not found"
    print_color "$YELLOW" "Please run this script from the project root directory"
    exit 1
fi

# Step 1: Verify prerequisites
print_color "$BLUE" "📋 Step 1: Verifying prerequisites..."
node scripts/verify-deployment.js
if [ $? -ne 0 ]; then
    print_color "$RED" "❌ Verification failed. Please fix the issues above."
    exit 1
fi

# Step 2: Install dependencies
print_color "$BLUE" "\n📦 Step 2: Installing dependencies..."
npm run install:all

# Step 3: Build the project
print_color "$BLUE" "\n🔨 Step 3: Building project..."
npm run build:all

# Step 4: Check for Netlify CLI
print_color "$BLUE" "\n🔍 Step 4: Checking Netlify CLI..."
if ! command -v netlify &> /dev/null; then
    print_color "$YELLOW" "⚠️  Netlify CLI not found"
    read -p "Install Netlify CLI now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install -g netlify-cli
    else
        print_color "$RED" "❌ Netlify CLI is required for deployment"
        exit 1
    fi
fi

# Step 5: Check login status
print_color "$BLUE" "\n🔐 Step 5: Checking Netlify authentication..."
if ! netlify status &> /dev/null; then
    print_color "$YELLOW" "Please log in to Netlify:"
    netlify login
fi

# Step 6: Initialize or link site
print_color "$BLUE" "\n🔗 Step 6: Linking to Netlify site..."
if [ ! -f ".netlify/state.json" ]; then
    print_color "$YELLOW" "No Netlify site linked. Initializing..."
    netlify init
else
    print_color "$GREEN" "✅ Site already linked"
fi

# Step 7: Set environment variables
print_color "$BLUE" "\n⚙️  Step 7: Environment variables..."
if [ -f ".env.production" ]; then
    print_color "$YELLOW" "Found .env.production file"
    read -p "Import environment variables to Netlify? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        netlify env:import .env.production
    fi
else
    print_color "$YELLOW" "⚠️  No .env.production file found"
    print_color "$CYAN" "Remember to set environment variables in Netlify dashboard:"
    print_color "$CYAN" "  - DATABASE_URL"
    print_color "$CYAN" "  - DATABASE_AUTH_TOKEN"
fi

# Step 8: Deploy
print_color "$BLUE" "\n🚀 Step 8: Deploying to Netlify..."
echo
print_color "$YELLOW" "Choose deployment type:"
print_color "$CYAN" "  1) Preview deployment (draft)"
print_color "$CYAN" "  2) Production deployment"
read -p "Enter choice (1 or 2): " deploy_choice

case $deploy_choice in
    1)
        print_color "$BLUE" "Deploying to preview environment..."
        netlify deploy
        ;;
    2)
        print_color "$BLUE" "Deploying to production..."
        netlify deploy --prod
        ;;
    *)
        print_color "$RED" "Invalid choice. Exiting."
        exit 1
        ;;
esac

# Step 9: Post-deployment
if [ $? -eq 0 ]; then
    print_color "$GREEN" "\n✨ Deployment successful!"

    # Get site info
    site_info=$(netlify status --json 2>/dev/null)
    if [ $? -eq 0 ]; then
        site_url=$(echo "$site_info" | grep -o '"URL":"[^"]*' | sed 's/"URL":"//')
        if [ ! -z "$site_url" ]; then
            print_color "$CYAN" "\n📍 Your site is available at:"
            print_color "$GREEN" "   $site_url"
        fi
    fi

    print_color "$CYAN" "\n📊 Next steps:"
    print_color "$CYAN" "  1. Visit your Netlify dashboard"
    print_color "$CYAN" "  2. Check function logs: netlify functions:log"
    print_color "$CYAN" "  3. Test the health endpoint: curl <your-site>/.netlify/functions/health"
    print_color "$CYAN" "  4. Upload test data through the dashboard"
else
    print_color "$RED" "\n❌ Deployment failed"
    print_color "$YELLOW" "Check the error messages above and try again"
    exit 1
fi

print_color "$GREEN" "\n🎉 Deployment process complete!"