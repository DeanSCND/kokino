# MCP Module - Model Context Protocol Server

> **Module-Specific Context for AI Agents Working in mcp/**
>
> Last Updated: 2026-01-26

## What This Module Does

The **mcp** module is a TypeScript-based Model Context Protocol (MCP) server that exposes tools for agent-to-agent communication. AI agents (Claude Code, Gemini, etc.) configure this MCP server in their `.claude/mcp.json` to access inter-agent messaging capabilities.

**Core Responsibilities:**
- Provide MCP tools for sending messages to other agents
- List online agents and their capabilities
- Register agents with the broker
- Wait for replies to messages (async messaging)
- Query conversation history

---

## Architecture Overview

```
mcp/
├── src/
│   ├── index.ts              # Main MCP server entry point
│   ├── tools/                # MCP tool definitions
│   │   ├── send_message.ts
│   │   ├── await_reply.ts
│   │   ├── list_agents.ts
│   │   ├── co_workers.ts
│   │   ├── register_agent.ts
│   │   └── post_reply.ts
│   ├── schemas/              # Zod schemas for validation
│   │   └── MessageSchema.ts
│   └── utils/                # Helper functions
│       └── broker-client.ts  # HTTP client for broker
├── build/                    # Compiled JavaScript output
│   └── index.js             # Built MCP server (used by agents)
├── configs/                  # Example configurations
│   └── mcp.json.example
├── bin/                      # CLI scripts
│   ├── bridge-register.js   # Register agent from command line
│   └── bridge-reply.js      # Reply to message from command line
├── package.json
└── tsconfig.json
```

---

## Available MCP Tools

### 1. send_message
**Purpose:** Send a message to another agent

**Parameters:**
```typescript
{
  agentId: string;        // Target agent handle (e.g., "Bob")
  payload: string;        // Message content
  metadata?: object;      // Optional metadata (e.g., {origin: "Alice"})
  awaitResponse?: boolean; // Wait for reply (default: true)
  timeoutMs?: number;     // Timeout in milliseconds (default: 30000)
}
```

**Returns:**
```typescript
{
  ticketId: string;       // Unique message ID
  status: string;         // 'pending', 'delivered', 'responded'
  response?: string;      // Reply payload (if awaitResponse=true)
}
```

**Example Usage (in Claude Code):**
```
Send a message to Bob saying "Please review the latest commit"
```

**Behind the scenes:**
```typescript
await send_message({
  agentId: "Bob",
  payload: "Please review the latest commit",
  metadata: { origin: "Alice", priority: "high" },
  awaitResponse: true,
  timeoutMs: 45000
});
```

### 2. co_workers
**Purpose:** List all online agents with their capabilities

**Parameters:** None

**Returns:**
```typescript
Array<{
  agentId: string;
  cwd: string;
  capabilities: string[];
  type: string;           // 'claude-code', 'gemini', etc.
  lastSeen: string;       // ISO timestamp
}>
```

**Example Usage:**
```
Who are my co-workers?
```

### 3. list_agents
**Purpose:** Detailed agent information with optional filtering

**Parameters:**
```typescript
{
  status?: string;        // Filter by status ('online', 'offline')
  type?: string;          // Filter by agent type
}
```

**Returns:** Same as co_workers, but with filtering

### 4. await_reply
**Purpose:** Wait for a reply to a previously sent message

**Parameters:**
```typescript
{
  ticketId: string;       // Message ID from send_message
  timeoutMs?: number;     // Timeout (default: 30000)
  pollIntervalMs?: number; // Polling interval (default: 1000)
}
```

**Returns:**
```typescript
{
  ticketId: string;
  status: string;
  response?: string;      // Reply payload
  metadata?: object;
}
```

**Use Case:** Fire-and-forget messaging
```typescript
// Send without waiting
const { ticketId } = await send_message({
  agentId: "Bob",
  payload: "Task for you",
  awaitResponse: false  // Don't block
});

// Do other work...

// Later, wait for reply
const reply = await await_reply({ ticketId });
```

### 5. register_agent
**Purpose:** Register this agent with the broker

**Parameters:**
```typescript
{
  agentId: string;        // Agent handle
  type: string;           // 'claude-code', 'gemini', 'codex'
  metadata?: object;      // {cwd, capabilities, etc.}
  heartbeatIntervalMs?: number; // Heartbeat frequency
}
```

**Returns:**
```typescript
{
  success: boolean;
  agentId: string;
  message: string;
}
```

**Auto-Registration:** Most agents auto-register on spawn, but this tool allows manual registration

### 6. post_reply
**Purpose:** Reply to a message received from another agent

**Parameters:**
```typescript
{
  ticketId: string;       // Message ID to reply to
  payload: string;        // Reply content
  metadata?: object;
  status?: string;        // Override ticket status (default: 'responded')
}
```

**Returns:**
```typescript
{
  success: boolean;
  ticketId: string;
}
```

---

## Agent Configuration

Agents configure this MCP server in their `.claude/mcp.json`:

**File:** `.claude/mcp.json`
```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050"
      }
    }
  }
}
```

**Important:**
- Use **absolute paths** for `args` (no relative paths)
- Use **127.0.0.1** (not localhost) for broker URL
- Ensure `mcp/build/index.js` exists (run `npm run build` first)

---

## Development Workflow

### Building the MCP Server
```bash
cd mcp
npm install
npm run build  # → build/index.js
```

**Output:** Compiled JavaScript in `build/index.js` (this is what agents reference)

### Testing the MCP Server
```bash
# Run TypeScript tests
npm test

# Test with MCP inspector
npx @modelcontextprotocol/inspector node build/index.js
```

### Manual Testing with CLI Scripts

**Register an agent:**
```bash
node bin/bridge-register.js \
  --agent Alice \
  --type claude-code \
  --cwd /workspace/project \
  --session tmux-alice
```

**Send a message:**
```bash
# Using send_message tool (via agent)
# Or via broker API directly:
curl -X POST http://127.0.0.1:5050/agents/Bob/send \
  -H "Content-Type: application/json" \
  -d '{"payload":"Hello from Alice","metadata":{"origin":"Alice"}}'
```

**Reply to a message:**
```bash
node bin/bridge-reply.js \
  --agent Bob \
  --ticket ticket-123 \
  --payload "Got it, working on it!"
```

---

## Adding a New MCP Tool

### 1. Define Tool Schema
**File:** `src/tools/my_tool.ts`
```typescript
import { z } from 'zod';
import { McpTool } from '../types';
import { brokerClient } from '../utils/broker-client';

export const myToolSchema = z.object({
  param1: z.string(),
  param2: z.number().optional()
});

export const myTool: McpTool = {
  name: 'my_tool',
  description: 'Description of what this tool does',
  inputSchema: myToolSchema,

  async execute(params) {
    // Validate params
    const validated = myToolSchema.parse(params);

    // Call broker API
    const response = await brokerClient.post('/api/my-endpoint', {
      param1: validated.param1,
      param2: validated.param2
    });

    // Return result
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }
};
```

### 2. Register Tool
**File:** `src/index.ts`
```typescript
import { myTool } from './tools/my_tool';

// In server initialization
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    send_message,
    co_workers,
    list_agents,
    myTool  // ✅ Add here
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'send_message':
      return await send_message.execute(args);
    case 'my_tool':  // ✅ Add here
      return await myTool.execute(args);
    // ...
  }
});
```

### 3. Build and Test
```bash
npm run build
npm test

# Test in MCP inspector
npx @modelcontextprotocol/inspector node build/index.js
```

### 4. Update Documentation
- Add tool to this file's "Available MCP Tools" section
- Update `README.md` with usage examples
- Document in `../docs/reference/API.md` if tool adds new broker endpoints

---

## Broker Communication

### HTTP Client Setup
**File:** `src/utils/broker-client.ts`
```typescript
import axios from 'axios';

const BROKER_URL = process.env.BRIDGE_BROKER_URL || 'http://127.0.0.1:5050';

export const brokerClient = axios.create({
  baseURL: BROKER_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### API Endpoints Used
- `POST /agents/register` - Register agent
- `POST /agents/:agentId/send` - Send message
- `GET /agents/:agentId/tickets/pending` - Poll for messages
- `POST /replies` - Reply to ticket
- `GET /agents` - List all agents
- `GET /tickets/:ticketId` - Get ticket status

**See:** `../docs/reference/API.md` for complete broker API

---

## Schema Validation (Zod)

All tool parameters are validated using Zod schemas.

**Example:**
```typescript
import { z } from 'zod';

const sendMessageSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  payload: z.string().min(1, 'payload is required'),
  metadata: z.record(z.any()).optional(),
  awaitResponse: z.boolean().default(true),
  timeoutMs: z.number().int().positive().max(600000).default(30000)
});

// Usage
const params = sendMessageSchema.parse(userInput);  // Throws if invalid
```

**Benefits:**
- Type-safe tool parameters
- Automatic validation errors
- IntelliSense support in TypeScript
- Runtime type checking

---

## Common Tasks

### Update Broker URL
**Environment Variable:**
```bash
export BRIDGE_BROKER_URL=http://127.0.0.1:5050
```

**Or in agent's .claude/mcp.json:**
```json
{
  "env": {
    "BRIDGE_BROKER_URL": "http://127.0.0.1:5050"
  }
}
```

### Debug Tool Execution
**Enable debug logging:**
```bash
# In agent's .claude/mcp.json
{
  "env": {
    "DEBUG": "kokino:*"
  }
}
```

**Check MCP server logs:** Agents write MCP logs to their working directory

### Handle Tool Errors
**Error Handling Pattern:**
```typescript
async execute(params) {
  try {
    const response = await brokerClient.post('/endpoint', params);
    return { content: [{ type: 'text', text: JSON.stringify(response.data) }] };
  } catch (error) {
    // Return error as tool response (don't throw)
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
}
```

---

## Testing Strategy

### Unit Tests
**File:** `src/tools/my_tool.test.ts`
```typescript
import { describe, it, expect, vi } from 'vitest';
import { myTool } from './my_tool';
import { brokerClient } from '../utils/broker-client';

vi.mock('../utils/broker-client');

describe('myTool', () => {
  it('should call broker API with correct params', async () => {
    const mockResponse = { data: { success: true } };
    vi.mocked(brokerClient.post).mockResolvedValue(mockResponse);

    const result = await myTool.execute({ param1: 'test' });

    expect(brokerClient.post).toHaveBeenCalledWith('/api/my-endpoint', {
      param1: 'test'
    });
    expect(result.content[0].text).toContain('success');
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(brokerClient.post).mockRejectedValue(new Error('Network error'));

    const result = await myTool.execute({ param1: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });
});
```

### Integration Tests
**Manual testing with real broker:**
```bash
# Start broker
cd ../broker && npm start

# Build MCP server
npm run build

# Test with MCP inspector
npx @modelcontextprotocol/inspector node build/index.js

# Or configure in agent's .claude/mcp.json and test via agent
```

---

## Common Gotchas

### 1. Must Build Before Using
**Problem:** Agent references `build/index.js` but it doesn't exist

**Fix:**
```bash
cd mcp
npm run build  # Always build after code changes
```

### 2. Use Absolute Paths in .claude/mcp.json
**Wrong:**
```json
{
  "args": ["./mcp/build/index.js"]  // ❌ Relative path breaks
}
```

**Correct:**
```json
{
  "args": ["/Users/you/kokino/mcp/build/index.js"]  // ✅ Absolute path
}
```

### 3. Broker URL Must Use 127.0.0.1
**Wrong:**
```bash
BRIDGE_BROKER_URL=http://localhost:5050  # ❌ WebSocket issues on macOS
```

**Correct:**
```bash
BRIDGE_BROKER_URL=http://127.0.0.1:5050  # ✅ Stable
```

### 4. Always Include metadata.origin
**Best Practice:**
```typescript
await send_message({
  agentId: "Bob",
  payload: "Message",
  metadata: { origin: "Alice" }  // ✅ Recipients know who sent it
});
```

### 5. Handle Timeout Errors
**Problem:** Messages can timeout if recipient is slow

**Solution:**
```typescript
try {
  const reply = await send_message({
    agentId: "Bob",
    payload: "Complex task",
    timeoutMs: 120000  // ✅ Increase timeout for long tasks
  });
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout gracefully
    console.log('Bob is taking too long, continuing without reply');
  }
}
```

---

## CLI Scripts

### bridge-register.js
**Purpose:** Register agent from command line (useful for manual testing)

**Usage:**
```bash
node bin/bridge-register.js \
  --agent Alice \
  --type claude-code \
  --cwd /workspace/project \
  --session tmux-alice \
  --capabilities code,test,review
```

### bridge-reply.js
**Purpose:** Reply to a message from command line

**Usage:**
```bash
node bin/bridge-reply.js \
  --agent Bob \
  --ticket ticket-123 \
  --payload "Task completed successfully"
```

**Use Case:** Testing message flows without launching full agents

---

## Related Documentation

- **Root context:** `../CLAUDE.md` - Project-wide overview
- **Broker module:** `../broker/CLAUDE.md` - Backend context
- **API reference:** `../docs/reference/API.md` - Broker endpoints
- **MCP setup guide:** `../docs/guides/DEVELOPMENT.md#mcp-configuration`

---

**For questions about MCP tools or agent configuration, check the development guide or file an issue.**
