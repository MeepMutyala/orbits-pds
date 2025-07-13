#!/bin/bash

# Simple Orbits PDS deployment script

set -e

echo "🚀 Deploying Orbits PDS..."

# Check environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Please set DATABASE_URL environment variable"
    exit 1
fi

if [ -z "$PDS_HOSTNAME" ]; then
    echo "❌ Please set PDS_HOSTNAME environment variable"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build
echo "🔨 Building..."
npm run build

# Start with PM2 if available, otherwise direct
if command -v pm2 &> /dev/null; then
    echo "🔄 Starting with PM2..."
    pm2 stop orbits-pds || true
    pm2 start dist/server.js --name orbits-pds
else
    echo "🔄 Starting server..."
    npm start
fi

echo "✅ Deployment complete!"
