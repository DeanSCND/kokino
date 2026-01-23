#!/usr/bin/env bash

# cleanup-agents.sh - Clean up all agent sessions, watchers, and broker registrations
#
# Usage:
#   ./bin/cleanup-agents.sh [--all|--session <name>]
#
# Options:
#   --all              Clean up everything (all sessions, watchers, registrations)
#   --session <name>   Clean up specific agent by name
#

set -euo pipefail

BROKER_URL="${BRIDGE_BROKER_URL:-http://127.0.0.1:5050}"
CLEANUP_ALL=false
SPECIFIC_SESSION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      CLEANUP_ALL=true
      shift
      ;;
    --session)
      SPECIFIC_SESSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: cleanup-agents.sh [--all|--session <name>]"
      exit 1
      ;;
  esac
done

# If no args, default to --all
if [[ "$CLEANUP_ALL" == "false" && -z "$SPECIFIC_SESSION" ]]; then
  CLEANUP_ALL=true
fi

echo "🧹 Kokino Agent Cleanup"
echo "======================"

if [[ "$CLEANUP_ALL" == "true" ]]; then
  echo "Mode: Clean ALL agents"
else
  echo "Mode: Clean agent '$SPECIFIC_SESSION'"
fi
echo ""

# Function to kill tmux sessions
cleanup_tmux_sessions() {
  echo "📦 Cleaning tmux sessions..."

  if [[ "$CLEANUP_ALL" == "true" ]]; then
    # Kill all dev-* sessions
    tmux list-sessions 2>/dev/null | grep "^dev-" | cut -d: -f1 | while read -r session; do
      echo "   Killing session: $session"
      tmux kill-session -t "$session" 2>/dev/null || true
    done

    # Also kill any test sessions
    tmux list-sessions 2>/dev/null | grep -E "^(test-|autotest-)" | cut -d: -f1 | while read -r session; do
      echo "   Killing session: $session"
      tmux kill-session -t "$session" 2>/dev/null || true
    done
  else
    # Kill specific session
    SESSION_NAME="dev-${SPECIFIC_SESSION}"
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
      echo "   Killing session: $SESSION_NAME"
      tmux kill-session -t "$SESSION_NAME"
    else
      echo "   Session $SESSION_NAME not found"
    fi
  fi

  echo "   ✅ Tmux cleanup complete"
}

# Function to kill message watchers
cleanup_watchers() {
  echo "👀 Cleaning message watchers..."

  if [[ "$CLEANUP_ALL" == "true" ]]; then
    # Kill all message-watcher processes
    WATCHER_PIDS=$(ps aux | grep "message-watcher.js" | grep -v grep | awk '{print $2}')
    if [[ -n "$WATCHER_PIDS" ]]; then
      echo "$WATCHER_PIDS" | while read -r pid; do
        echo "   Killing watcher PID: $pid"
        kill "$pid" 2>/dev/null || true
      done
    else
      echo "   No watchers running"
    fi
  else
    # Kill specific watcher
    WATCHER_PID=$(ps aux | grep "message-watcher.js.*--agent $SPECIFIC_SESSION" | grep -v grep | awk '{print $2}')
    if [[ -n "$WATCHER_PID" ]]; then
      echo "   Killing watcher for $SPECIFIC_SESSION (PID: $WATCHER_PID)"
      kill "$WATCHER_PID" 2>/dev/null || true
    else
      echo "   No watcher found for $SPECIFIC_SESSION"
    fi
  fi

  echo "   ✅ Watcher cleanup complete"
}

# Function to deregister agents from broker
cleanup_broker_registrations() {
  echo "📝 Cleaning broker registrations..."

  # Check if broker is running
  if ! curl -s --max-time 2 "$BROKER_URL/health" > /dev/null 2>&1; then
    echo "   ⚠️  Broker not running at $BROKER_URL - skipping deregistration"
    return
  fi

  if [[ "$CLEANUP_ALL" == "true" ]]; then
    # Get all registered agents
    AGENTS=$(curl -s "$BROKER_URL/agents" | jq -r '.[].agentId' 2>/dev/null || echo "")

    if [[ -n "$AGENTS" ]]; then
      echo "$AGENTS" | while read -r agent; do
        if [[ -n "$agent" ]]; then
          echo "   Deregistering: $agent"
          curl -s -X DELETE "$BROKER_URL/agents/$agent" > /dev/null 2>&1 || true
        fi
      done
    else
      echo "   No agents registered"
    fi
  else
    # Deregister specific agent
    echo "   Deregistering: $SPECIFIC_SESSION"
    curl -s -X DELETE "$BROKER_URL/agents/$SPECIFIC_SESSION" > /dev/null 2>&1 || true
  fi

  echo "   ✅ Broker cleanup complete"
}

# Function to clean log files
cleanup_logs() {
  echo "📋 Cleaning log files..."

  if [[ "$CLEANUP_ALL" == "true" ]]; then
    # Remove all watcher logs
    if ls logs/watcher-*.log > /dev/null 2>&1; then
      rm -f logs/watcher-*.log
      echo "   Removed all watcher logs"
    else
      echo "   No watcher logs found"
    fi
  else
    # Remove specific watcher log
    if [[ -f "logs/watcher-${SPECIFIC_SESSION}.log" ]]; then
      rm -f "logs/watcher-${SPECIFIC_SESSION}.log"
      echo "   Removed watcher-${SPECIFIC_SESSION}.log"
    else
      echo "   No log found for $SPECIFIC_SESSION"
    fi
  fi

  echo "   ✅ Log cleanup complete"
}

# Function to clean MCP configs
cleanup_mcp_configs() {
  echo "🔧 Cleaning MCP configs..."

  if [[ "$CLEANUP_ALL" == "true" ]]; then
    # Remove all agent MCP configs
    if ls mcp/configs/*.mcp.json > /dev/null 2>&1; then
      rm -f mcp/configs/*.mcp.json
      echo "   Removed all agent MCP configs"
    else
      echo "   No MCP configs found"
    fi
  else
    # Remove specific agent config
    if [[ -f "mcp/configs/${SPECIFIC_SESSION}.mcp.json" ]]; then
      rm -f "mcp/configs/${SPECIFIC_SESSION}.mcp.json"
      echo "   Removed ${SPECIFIC_SESSION}.mcp.json"
    else
      echo "   No config found for $SPECIFIC_SESSION"
    fi
  fi

  echo "   ✅ MCP config cleanup complete"
}

# Confirm cleanup if doing --all
if [[ "$CLEANUP_ALL" == "true" ]]; then
  echo "⚠️  This will:"
  echo "   - Kill ALL dev-* tmux sessions"
  echo "   - Kill ALL message-watcher processes"
  echo "   - Deregister ALL agents from broker"
  echo "   - Remove ALL watcher log files"
  echo ""
  read -p "Continue? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

# Run cleanup steps
cleanup_tmux_sessions
cleanup_watchers
cleanup_broker_registrations
cleanup_logs
cleanup_mcp_configs

echo ""
echo "✅ Cleanup complete!"
echo ""

# Show status
echo "📊 Current status:"
echo "-------------------"

# Count remaining tmux sessions
TMUX_COUNT=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')
echo "Tmux sessions: $TMUX_COUNT"

# Count remaining watchers
WATCHER_COUNT=$(ps aux | grep "message-watcher.js" | grep -v grep | wc -l | tr -d ' ')
echo "Active watchers: $WATCHER_COUNT"

# Count broker agents
if curl -s --max-time 2 "$BROKER_URL/health" > /dev/null 2>&1; then
  AGENT_COUNT=$(curl -s "$BROKER_URL/agents" | jq '. | length' 2>/dev/null || echo "0")
  echo "Registered agents: $AGENT_COUNT"
else
  echo "Registered agents: N/A (broker offline)"
fi

echo ""
echo "Ready for fresh testing! 🚀"
