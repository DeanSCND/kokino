#!/bin/bash

# Kokino Stop Script
# Stops all Kokino services

echo "🛑 Stopping Kokino services..."

# Kill broker (port 5050)
if lsof -ti:5050 >/dev/null 2>&1; then
    echo "   Stopping broker (port 5050)..."
    lsof -ti:5050 | xargs kill -9
    echo "   ✓ Broker stopped"
else
    echo "   ℹ Broker not running"
fi

# Kill UI (port 5173)
if lsof -ti:5173 >/dev/null 2>&1; then
    echo "   Stopping UI (port 5173)..."
    lsof -ti:5173 | xargs kill -9
    echo "   ✓ UI stopped"
else
    echo "   ℹ UI not running"
fi

# Clean up log files
if [ -f /tmp/kokino-broker.log ]; then
    rm /tmp/kokino-broker.log
fi

if [ -f /tmp/kokino-ui.log ]; then
    rm /tmp/kokino-ui.log
fi

echo "✅ All Kokino services stopped"
