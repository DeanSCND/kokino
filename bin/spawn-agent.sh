#!/usr/bin/env bash

# spawn-agent.sh - Automated agent spawning in tmux with full setup
#
# Usage:
#   ./bin/spawn-agent.sh --name <agentName> --type <agentType> [--role <role>] [--cwd <path>]
#
# Supported agent types:
#   - claude-code: Claude Code CLI (cld)
#   - droid: Droid CLI
#   - gemini: Gemini CLI
#
# Example:
#   ./bin/spawn-agent.sh --name Alice --type claude-code --role frontend-engineer
#

set -euo pipefail

# Source tmux helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/tmux-helpers.sh"

# Default values
AGENT_NAME=""
AGENT_TYPE=""
AGENT_ROLE=""
AGENT_CWD="${PWD}"
BROKER_URL="${BRIDGE_BROKER_URL:-http://127.0.0.1:5050}"
AUTO_SUBMIT="true"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      AGENT_NAME="$2"
      shift 2
      ;;
    --type)
      AGENT_TYPE="$2"
      shift 2
      ;;
    --role)
      AGENT_ROLE="$2"
      shift 2
      ;;
    --cwd)
      AGENT_CWD="$2"
      shift 2
      ;;
    --broker-url)
      BROKER_URL="$2"
      shift 2
      ;;
    --no-auto-submit)
      AUTO_SUBMIT="false"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$AGENT_NAME" ]]; then
  echo "Error: --name is required"
  echo ""
  echo "Usage: spawn-agent.sh --name <agentName> --type <agentType> [options]"
  echo ""
  echo "Options:"
  echo "  --name <name>           Agent name (required)"
  echo "  --type <type>           Agent type: claude-code, droid, gemini (required)"
  echo "  --role <role>           Agent role/capability (e.g., frontend-engineer)"
  echo "  --cwd <path>            Working directory (default: current directory)"
  echo "  --broker-url <url>      Broker URL (default: http://127.0.0.1:5050)"
  echo "  --no-auto-submit        Disable auto-submit for message watcher"
  echo ""
  echo "Example:"
  echo "  ./bin/spawn-agent.sh --name Alice --type claude-code --role frontend-engineer"
  exit 1
fi

if [[ -z "$AGENT_TYPE" ]]; then
  echo "Error: --type is required"
  echo "Supported types: claude-code, droid, gemini"
  exit 1
fi

# Determine CLI command based on agent type
case "$AGENT_TYPE" in
  claude-code)
    CLI_CMD="claude --dangerously-skip-permissions"
    CLI_CHECK="claude"
    ;;
  droid)
    CLI_CMD="droid"
    CLI_CHECK="droid"
    ;;
  gemini)
    CLI_CMD="gemini"
    CLI_CHECK="gemini"
    ;;
  *)
    echo "Error: Unknown agent type '$AGENT_TYPE'"
    echo "Supported types: claude-code, droid, gemini"
    exit 1
    ;;
esac

# Check if CLI is available
if ! command -v "$CLI_CHECK" &> /dev/null; then
  echo "Error: '$CLI_CHECK' command not found"
  echo "Please install the $AGENT_TYPE CLI first"
  exit 1
fi

SESSION_NAME="dev-${AGENT_NAME}"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "Error: Tmux session '$SESSION_NAME' already exists"
  echo "Attach with: tmux attach -t $SESSION_NAME"
  exit 1
fi

echo "🚀 Spawning agent: $AGENT_NAME ($AGENT_TYPE)"
echo "   Session: $SESSION_NAME"
echo "   CWD: $AGENT_CWD"
echo "   Broker: $BROKER_URL"

# Create tmux session
echo "📦 Creating tmux session..."
tmux new-session -d -s "$SESSION_NAME" -c "$AGENT_CWD"

# Get pane ID
PANE_ID=$(tmux display-message -p -t "${SESSION_NAME}:0.0" -F "#{pane_id}")

echo "   Pane ID: $PANE_ID"

# Register agent with broker
echo "📝 Registering agent with broker..."

REGISTER_ARGS="--agent $AGENT_NAME --type $AGENT_TYPE --cwd $AGENT_CWD --session $SESSION_NAME --pane $PANE_ID --broker-url $BROKER_URL"

if [[ -n "$AGENT_ROLE" ]]; then
  REGISTER_ARGS="$REGISTER_ARGS --capability $AGENT_ROLE"
fi

if node mcp/bin/bridge-register.js $REGISTER_ARGS; then
  echo "   ✅ Agent registered"
else
  echo "   ⚠️ Registration failed (broker might be offline)"
fi

# Start message watcher in background
echo "👀 Starting message watcher..."

WATCHER_ARGS="--agent $AGENT_NAME --session $SESSION_NAME --pane $PANE_ID"
if [[ "$AUTO_SUBMIT" == "false" ]]; then
  WATCHER_ARGS="$WATCHER_ARGS --no-auto-submit"
fi

# Start watcher in background and save PID
nohup node mcp/bin/message-watcher.js $WATCHER_ARGS > "logs/watcher-${AGENT_NAME}.log" 2>&1 &
WATCHER_PID=$!

echo "   Watcher PID: $WATCHER_PID"
echo "   Watcher logs: logs/watcher-${AGENT_NAME}.log"

# Generate agent-specific MCP config
echo "📝 Generating MCP config for $AGENT_NAME..."
MCP_CONFIG_DIR="${PWD}/mcp/configs"
mkdir -p "$MCP_CONFIG_DIR"
MCP_CONFIG_PATH="${MCP_CONFIG_DIR}/${AGENT_NAME}.mcp.json"

cat > "$MCP_CONFIG_PATH" << EOF
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["${PWD}/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "${BROKER_URL}",
        "AGENT_ID": "${AGENT_NAME}"
      }
    }
  }
}
EOF

echo "   Config: $MCP_CONFIG_PATH"

# Build identity system prompt
IDENTITY_PROMPT="You are agent '$AGENT_NAME' ($AGENT_TYPE)"
if [[ -n "$AGENT_ROLE" ]]; then
  IDENTITY_PROMPT="$IDENTITY_PROMPT with role: $AGENT_ROLE"
fi
IDENTITY_PROMPT="$IDENTITY_PROMPT. You have been automatically registered with the agent-bridge broker. Use co_workers() to see other agents and send_message() to communicate with them."

# Start the agent CLI in the tmux session with identity
echo "🤖 Starting $AGENT_TYPE CLI with identity: $AGENT_NAME..."
tmux_send_and_wait "$SESSION_NAME" "cd '$AGENT_CWD' && $CLI_CMD --mcp-config '$MCP_CONFIG_PATH' --append-system-prompt '$IDENTITY_PROMPT'" 3

# Auto-register the agent with the broker by calling the tool directly
echo "📝 Auto-registering agent with broker..."
REGISTER_METADATA="{\"cwd\":\"$AGENT_CWD\",\"session\":\"$SESSION_NAME\",\"paneId\":\"$PANE_ID\""
if [[ -n "$AGENT_ROLE" ]]; then
  REGISTER_METADATA="$REGISTER_METADATA,\"capabilities\":[\"$AGENT_ROLE\"]"
fi
REGISTER_METADATA="$REGISTER_METADATA}"

REGISTER_CMD="register_agent(agentId=\"$AGENT_NAME\", type=\"$AGENT_TYPE\", metadata=$REGISTER_METADATA)"
tmux_send_and_wait "$SESSION_NAME" "$REGISTER_CMD" 2

echo ""
echo "✅ Agent '$AGENT_NAME' spawned successfully!"
echo ""
echo "Next steps:"
echo "  - Attach to session: tmux attach -t $SESSION_NAME"
echo "  - View watcher logs: tail -f logs/watcher-${AGENT_NAME}.log"
echo "  - Stop watcher: kill $WATCHER_PID"
echo "  - Kill session: tmux kill-session -t $SESSION_NAME"
echo ""
