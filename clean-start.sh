#!/bin/bash

echo "🧹 Cleaning up existing processes..."
echo "=========================================="

# Kill any existing processes
pkill -f "node server.js" 2>/dev/null
pkill -f "python vision_service.py" 2>/dev/null
pkill -f "python3 vision_service.py" 2>/dev/null
pkill -f ngrok 2>/dev/null
pkill -f electron 2>/dev/null

# Force kill processes on our ports
lsof -ti:8001 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3002 | xargs kill -9 2>/dev/null

# Wait for ports to be released
sleep 2

echo "✅ All processes stopped"
echo ""

# Now start fresh
echo "🚀 Starting Pocket Soul (Clean Start)"
echo "=========================================="

./start.sh