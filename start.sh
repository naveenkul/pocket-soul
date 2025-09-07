#!/bin/bash

echo "🚀 Starting Pocket Soul with Vision Support"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${GREEN}Activating virtual environment...${NC}"
source venv/bin/activate

# Install Python dependencies
echo -e "${GREEN}Installing Python dependencies...${NC}"
pip install -q -r requirements.txt

# Install Node dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${GREEN}Installing Node.js dependencies...${NC}"
    npm install
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    kill $VISION_PID 2>/dev/null
    kill $NODE_PID 2>/dev/null
    kill $NGROK_PID 2>/dev/null
    echo -e "${GREEN}Services stopped.${NC}"
    exit 0
}

# Set up trap for cleanup
trap cleanup INT TERM

# Start Vision Service (Python)
echo -e "${GREEN}Starting Vision Service on port 8001...${NC}"
python vision_service.py &
VISION_PID=$!

# Wait a moment for vision service to start
sleep 2

# Check if vision service is running
if ps -p $VISION_PID > /dev/null; then
    echo -e "${GREEN}✅ Vision Service started (PID: $VISION_PID)${NC}"
else
    echo -e "${YELLOW}⚠️  Vision Service failed to start (camera may not be available)${NC}"
    echo -e "${YELLOW}   Continuing without vision support...${NC}"
fi

# Start ngrok tunnel
echo -e "${GREEN}Starting ngrok tunnel...${NC}"
node start-ngrok.js &
NGROK_PID=$!

# Wait for ngrok to establish connection
sleep 4

# Start Node.js server
echo -e "${GREEN}Starting Pocket Soul server on port 3000...${NC}"
node server.js &
NODE_PID=$!

# Wait for Node server to start
sleep 2

# Check if Node server is running
if ps -p $NODE_PID > /dev/null; then
    echo -e "${GREEN}✅ Pocket Soul server started (PID: $NODE_PID)${NC}"
    echo ""
    echo -e "${GREEN}=========================================="
    echo -e "🎉 Pocket Soul is running!"
    echo -e "==========================================#{NC}"
    echo ""
    echo -e "📱 Local access: ${YELLOW}http://localhost:3000${NC}"
    echo -e "📷 Vision API: ${YELLOW}http://localhost:8001${NC}"
    
    # Check if ngrok URL file exists
    if [ -f ".ngrok-url" ]; then
        NGROK_URL=$(cat .ngrok-url)
        echo -e "🌐 Public HTTPS: ${YELLOW}${NGROK_URL}${NC}"
        echo -e "📱 Mobile hologram: ${YELLOW}${NGROK_URL}/hologram${NC}"
    fi
    
    echo ""
    echo -e "Press ${RED}Ctrl+C${NC} to stop all services"
    echo ""
    
    # Keep script running
    wait $NODE_PID
else
    echo -e "${RED}❌ Failed to start Pocket Soul server${NC}"
    cleanup
fi