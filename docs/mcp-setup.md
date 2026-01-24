# MCP Configuration for Kokino

## Overview

Headless agents spawned by Kokino's broker require MCP (Model Context Protocol) configuration to access inter-agent communication tools provided by the `agent-bridge` MCP server.

**Without MCP:**
- Agent tasks take 60-80 seconds due to nested Task tool spawning
- No direct access to `list_agents`, `send_message`, `await_reply`
- Poor inter-agent communication performance

**With MCP:**
- Direct tool access, <10 second response times
- Efficient agent-to-agent messaging
- Access to broker's agent registry

## Setup

The `agent-bridge` MCP server must be registered with Claude Code CLI's global configuration.

### 1. Add MCP Server

```bash
cd /Users/deanskelton/Devlopment/agent-collab/kokino

claude mcp add agent-bridge node \
  /Users/deanskelton/Devlopment/agent-collab/agent-bridge-mcp/build/index.js \
  --env BROKER_URL=http://127.0.0.1:5050
```

### 2. Verify Configuration

```bash
# List configured MCP servers
claude mcp list

# Expected output:
# agent-bridge: node .../agent-bridge-mcp/build/index.js - ✓ Connected
```

### 3. Test MCP Tools

```bash
# Test that spawned agents can use MCP tools
echo "List all online agents using the agent-bridge MCP" | claude --dangerously-skip-permissions

# Should show agent-bridge in tools list:
# tools: [..., "mcp__agent-bridge__list_agents", "mcp__agent-bridge__send_message", ...]
```

## Available Tools

Once configured, headless agents have access to:

- **`mcp__agent-bridge__list_agents`** - Get all registered agents
- **`mcp__agent-bridge__co_workers`** - Alias for list_agents (backwards compatibility)
- **`mcp__agent-bridge__send_message`** - Send message to another agent
- **`mcp__agent-bridge__await_reply`** - Wait for reply to a ticket
- **`mcp__agent-bridge__register_agent`** - Register new agent with broker
- **`mcp__agent-bridge__post_reply`** - Post reply to a ticket

## Configuration Files

### Global Config (~/.claude.json)

Created automatically by `claude mcp add`:

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": [
        "/Users/deanskelton/Devlopment/agent-collab/agent-bridge-mcp/build/index.js"
      ],
      "env": {
        "BROKER_URL": "http://127.0.0.1:5050"
      }
    }
  }
}
```

### Project Config (~/.claude/mcp.json)

**Not used** - MCP configuration is global, not project-specific.

## Troubleshooting

### MCP Server Not Loading

**Symptom:** `"mcp_servers": []` in agent init logs

**Solution:**
1. Verify MCP is configured: `claude mcp list`
2. Check broker is running on port 5050
3. Rebuild agent-bridge-mcp: `cd ../agent-bridge-mcp && npm run build`

### Agent-Bridge Connection Failed

**Symptom:** `agent-bridge: ✗ Failed to connect`

**Solution:**
1. Ensure broker is running: `lsof -i:5050`
2. Check BROKER_URL env var: `claude mcp list` (should show env)
3. Verify agent-bridge build exists: `ls ../agent-bridge-mcp/build/index.js`

### High Latency Despite MCP

**Symptom:** Simple queries still take >30 seconds

**Possible causes:**
1. Agent using Task tool instead of direct MCP calls
2. MCP server spawning slowly
3. Network/broker latency

**Debug:**
1. Check agent logs for MCP tool use
2. Run `tests/mcp-test.js` to measure baseline latency
3. Enable `--debug` flag to see MCP server logs

## Testing

Run automated MCP configuration test:

```bash
cd /Users/deanskelton/Devlopment/agent-collab/kokino
node tests/mcp-test.js
```

Expected results:
- ✓ Agent starts with MCP configured
- ✓ Direct MCP tool access (<15s response)
- ✓ Successful cleanup

## Related Issues

- **#112** - Enable MCP Configuration for Headless Agents (this feature)
- **#110** - Agent Lifecycle States (completed, but slow without MCP)
- **#17** - MCP Configuration Guide (closed, was for deprecated tmux mode)

## Performance Impact

| Operation | Without MCP | With MCP | Improvement |
|-----------|-------------|----------|-------------|
| List agents | 60-80s | <10s | **8x faster** |
| Send message | 45-60s | <5s | **10x faster** |
| Agent query | 78s (observed) | <10s | **7x faster** |

## Maintenance

### Updating Agent-Bridge

When agent-bridge MCP code changes:

```bash
cd /Users/deanskelton/Devlopment/agent-collab/agent-bridge-mcp
npm run build
```

No need to re-register - Claude CLI will use the updated build automatically.

### Removing MCP Configuration

```bash
claude mcp remove agent-bridge
```

**Warning:** This will break headless agent inter-agent communication.
