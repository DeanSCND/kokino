#!/bin/bash

# Kokino Startup Script
# Starts broker and UI services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BROKER_DIR="$SCRIPT_DIR/broker"
UI_DIR="$SCRIPT_DIR/ui"

echo "🚀 Starting Kokino services..."

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $BROKER_PID $UI_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if ports are already in use
if lsof -ti:5050 >/dev/null 2>&1; then
    echo "⚠️  Port 5050 already in use. Killing existing process..."
    lsof -ti:5050 | xargs kill -9
fi

if lsof -ti:5173 >/dev/null 2>&1; then
    echo "⚠️  Port 5173 already in use. Killing existing process..."
    lsof -ti:5173 | xargs kill -9
fi

# Start broker
echo "📡 Starting broker on port 5050..."
cd "$BROKER_DIR"
# Preserve NVM environment for headless CLI execution
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
export NVM_BIN="${NVM_BIN:-$NVM_DIR/versions/node/$(node -v)/bin}"
npm start > /tmp/kokino-broker.log 2>&1 &
BROKER_PID=$!
echo "   Broker PID: $BROKER_PID"

# Wait for broker to be ready
echo "   Waiting for broker to start..."
for i in {1..30}; do
    if curl -s http://localhost:5050/health >/dev/null 2>&1; then
        echo "   ✓ Broker ready"
        break
    fi
    sleep 1
done

# Start UI
echo "🎨 Starting UI on port 5173..."
cd "$UI_DIR"
npm run dev > /tmp/kokino-ui.log 2>&1 &
UI_PID=$!
echo "   UI PID: $UI_PID"

# Wait for UI to be ready
echo "   Waiting for UI to start..."
for i in {1..30}; do
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        echo "   ✓ UI ready"
        break
    fi
    sleep 1
done

echo ""
echo "✅ Kokino is running!"
echo ""
echo "   Broker: http://localhost:5050"
echo "   UI:     http://localhost:5173"
echo ""
echo "   Logs:"
echo "   - Broker: tail -f /tmp/kokino-broker.log"
echo "   - UI:     tail -f /tmp/kokino-ui.log"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for processes
wait $BROKER_PID $UI_PID
