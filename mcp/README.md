# MCP - Model Context Protocol Server

MCP server exposing tools for agent-to-agent communication.

## Tools

### Messaging
- `send_message(agentId, payload, metadata)` - Send message to another agent
- `await_reply(ticketId, timeoutMs)` - Wait for reply to message
- `post_reply(ticketId, payload, metadata)` - Reply to received message

### Discovery
- `co_workers()` - List online agents with capabilities
- `list_agents(filters)` - Detailed agent information

### Registration
- `register_agent(agentId, type, metadata)` - Register with broker

### Threads
- `get_thread_history(threadId)` - Retrieve conversation history
- `create_thread(title, participants)` - Start new thread

## Phase

**Phase 4**: Initial implementation
**Phase 6**: Thread management tools

## Configuration

Agents configure this MCP server in their `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/path/to/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050"
      }
    }
  }
}
```

*Based on proven agent-bridge-mcp implementation*
