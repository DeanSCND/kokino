# MCP Configuration Guide

This guide explains how to configure Kokino's MCP (Model Context Protocol) server for agent-to-agent communication.

## What is MCP?

The Model Context Protocol (MCP) is a standardized protocol that allows AI agents to extend their capabilities through external tools and resources. Kokino provides an MCP server that exposes tools for inter-agent messaging, discovery, and coordination.

## Overview

Kokino's MCP server enables agents to:

- **Send messages** to other agents asynchronously
- **Discover co-workers** and their capabilities
- **Register** with the central broker
- **Await replies** from other agents
- **Post replies** to received messages

## Prerequisites

1. **Node.js 20+** - Required to run the MCP server
2. **Kokino broker running** - The message broker must be active at `http://127.0.0.1:5050`
3. **Agent CLI with MCP support** - Claude Code, Droid, or other MCP-compatible AI CLI

## Setup Instructions

### 1. Build the MCP Server

```bash
cd mcp
npm install
npm run build
```

This creates the executable at `mcp/build/index.js`.

### 2. Configure Your Agent

Add the MCP server to your agent's configuration file (typically `.claude/mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050",
        "AGENT_ID": "YourAgentName"
      }
    }
  }
}
```

**Important:** Use an absolute path to `mcp/build/index.js`, not a relative path.

### 3. Restart Your Agent

Restart your AI agent CLI to load the MCP server configuration.

### 4. Verify Connection

In your agent session, try listing co-workers:

```
Can you call the co_workers tool?
```

You should see a list of registered agents if the broker is running.

## Available Tools

### `send_message`

Send a message to another agent.

**Parameters:**
- `agentId` (string, required) - Target agent handle
- `payload` (string, required) - Message content
- `ticketId` (string, optional) - Correlation ID (auto-generated if omitted)
- `timeoutMs` (number, optional) - Reply timeout in milliseconds (default: 60000)
- `awaitResponse` (boolean, optional) - DEPRECATED: Don't use, prefer async
- `metadata` (object, optional) - Additional metadata

**Example:**
```
Please send a message to Alice asking her to review the authentication code.

Use send_message with:
- agentId: "Alice"
- payload: "Can you review the authentication implementation in src/auth.ts?"
```

### `await_reply`

Wait for a reply to a previously sent message.

**Parameters:**
- `ticketId` (string, required) - Ticket ID from send_message
- `timeoutMs` (number, optional) - Maximum wait time (default: 60000)
- `pollIntervalMs` (number, optional) - Polling interval (default: 5000)

**Example:**
```
Please wait for Alice's reply to ticket abc-123.

Use await_reply with ticketId: "abc-123"
```

### `post_reply`

Reply to a message you received.

**Parameters:**
- `ticketId` (string, required) - Ticket ID from the message
- `payload` (any, required) - Reply content
- `metadata` (object, optional) - Additional metadata
- `status` (string, optional) - Status override (default: "responded")

**Example:**
```
Please reply to ticket xyz-789 with "The authentication looks good, approved!"

Use post_reply with:
- ticketId: "xyz-789"
- payload: "The authentication looks good, approved!"
```

### `co_workers`

List all registered agents with a human-readable summary.

**Parameters:** None

**Example:**
```
Who are my co-workers?

Use co_workers tool.
```

### `list_agents`

Get detailed information about registered agents.

**Parameters:**
- `type` (string, optional) - Filter by agent type (e.g., "claude-code")
- `status` (string, optional) - Filter by status (e.g., "online")

**Example:**
```
Show me all online claude-code agents.

Use list_agents with:
- type: "claude-code"
- status: "online"
```

### `register_agent`

Manually register an agent with the broker (usually handled by `bridge-register` script).

**Parameters:**
- `agentId` (string, required) - Agent handle
- `type` (string, optional) - Agent type
- `metadata` (object, optional) - Metadata (cwd, paneId, capabilities)
- `heartbeatIntervalMs` (number, optional) - Heartbeat interval

## Environment Variables

Configure the MCP server behavior via environment variables:

- `BRIDGE_BROKER_URL` - Broker URL (default: `http://127.0.0.1:5050`)
- `AGENT_ID` - Your agent's identifier (recommended to set)

Add these to the `env` section of your MCP configuration.

## Example Workflow

### 1. Agent Alice sends a message to Bob

**Alice:**
```
Please ask Bob to implement the login API endpoint.

Use send_message:
- agentId: "Bob"
- payload: "Can you implement POST /api/auth/login? It should accept email and password, validate credentials, and return a JWT token."
```

**Response:**
```json
{
  "ticketId": "abc-123-def",
  "status": "pending"
}
```

### 2. Bob receives the message

Bob's message watcher automatically injects the message into his terminal:

```
# =========================================
# 📬 NEW MESSAGE FROM: Alice
# =========================================
# Ticket-ID: abc-123-def
#
Can you implement POST /api/auth/login? It should accept email and password,
validate credentials, and return a JWT token.
#
# ---
# To reply, use the agent-bridge MCP tool:
#   post_reply(ticketId="abc-123-def", payload="your response")
# =========================================
```

### 3. Bob implements and replies

**Bob:**
```
I've implemented the login endpoint. Please reply to ticket abc-123-def.

Use post_reply:
- ticketId: "abc-123-def"
- payload: "Login endpoint implemented at POST /api/auth/login. Returns JWT on success, 401 on invalid credentials."
```

### 4. Alice receives the reply

Alice's message watcher injects the reply:

```
# =========================================
# ↩️ REPLY TO YOUR MESSAGE
# =========================================
# Ticket-ID: abc-123-def
#
Login endpoint implemented at POST /api/auth/login. Returns JWT on success,
401 on invalid credentials.
# =========================================
```

## Troubleshooting

### "Failed to contact broker"

**Problem:** The MCP server can't reach the broker.

**Solution:**
1. Verify the broker is running: `curl http://127.0.0.1:5050/health`
2. Check `BRIDGE_BROKER_URL` in your MCP config
3. Ensure no firewall is blocking localhost:5050

### "Agent not registered"

**Problem:** Your agent isn't registered with the broker.

**Solution:**
1. Run registration script: `node mcp/bin/bridge-register.js --agent YourName --type claude-code`
2. Or use automated spawn: `./bin/spawn-agent.sh --name YourName --type claude-code`

### "No co-workers found"

**Problem:** No other agents are registered.

**Solution:**
1. Other agents must also register with the broker
2. Check broker status: `curl http://127.0.0.1:5050/agents | jq`
3. Spawn additional agents using `spawn-agent.sh`

### Messages not appearing

**Problem:** Message watcher isn't running or isn't injecting messages.

**Solution:**
1. Verify watcher is running: `ps aux | grep message-watcher`
2. Check watcher logs: `tail -f logs/watcher-YourName.log`
3. Restart watcher: `node mcp/bin/message-watcher.js --agent YourName --session dev-YourName`

### Terminal injection issues

**Problem:** Messages are malformed or not executing.

**Solution:**
1. Ensure using tmux (not standard terminal)
2. Check terminal is at a prompt (not running another command)
3. Use `--no-auto-submit` flag for manual control
4. Verify pane ID is correct: `tmux display-message -p '#{pane_id}'`

## Advanced Configuration

### Custom Broker URL

If your broker runs on a different host/port:

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/path/to/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://192.168.1.100:5050"
      }
    }
  }
}
```

### Multiple Agent Profiles

You can create different MCP configurations for different agent roles:

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/path/to/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050",
        "AGENT_ID": "Alice-Frontend"
      }
    }
  }
}
```

## Security Considerations

⚠️ **Important:** The broker and MCP server currently have no authentication. Only use on trusted localhost networks.

Future versions will support:
- API key authentication
- TLS encryption
- Role-based access control

## Related Documentation

- [Agent Registration](../mcp/bin/bridge-register.js) - CLI registration script
- [Message Watcher](../mcp/bin/message-watcher.js) - Message polling and injection
- [Spawn Agent](../bin/spawn-agent.sh) - Automated agent spawning
- [Broker API](../broker/README.md) - Broker endpoints and API

## Support

If you encounter issues:

1. Check broker health: `curl http://127.0.0.1:5050/health`
2. Review watcher logs: `tail -f logs/watcher-*.log`
3. Verify tmux session: `tmux list-sessions`
4. Check agent registration: `curl http://127.0.0.1:5050/agents | jq`

For bugs or feature requests, please open an issue on GitHub.
