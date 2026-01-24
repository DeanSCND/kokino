# Headless Agent Communication Specification

## Implementation Status

**Status:** ✅ **Implemented & Production Ready**
**Date:** 2025-01-24
**Implementation Phase:** Phase 1 & 2 Complete
**Reference Implementation:** [Network Chuck's claude-phone](https://github.com/theNetworkChuck/claude-phone)

### Completed Features

- ✅ AgentRunner service with CLI invocation (`broker/src/agents/AgentRunner.js`)
- ✅ Conversation/turns database tables (`broker/src/db/schema.js`)
- ✅ ConversationStore CRUD operations (`broker/src/db/ConversationStore.js`)
- ✅ Session Manager with locks & cancellation (`broker/src/agents/AgentSessionManager.js`)
- ✅ API endpoints (`/execute`, `/conversation`, `/end-session`)
- ✅ Message routing (dual-mode: tmux vs headless) (`broker/src/models/TicketStore.js`)
- ✅ Environment Doctor & self-checks (`broker/src/agents/EnvironmentDoctor.js`)
- ✅ Circuit breaker & resource limits (`broker/src/agents/CircuitBreaker.js`, `ProcessSupervisor.js`)
- ✅ JSONL parser with schema validation (`broker/src/utils/jsonlParser.js`)
- ✅ Shadow mode testing (`broker/src/agents/ShadowModeController.js`)
- ✅ Runtime fallback toggle (`broker/src/agents/FallbackController.js`)
- ✅ Telemetry & SLO tracking (`broker/src/telemetry/MetricsCollector.js`)

### Deviations from Original Spec

- **UI Components:** AgentChatPanel and related UI components not yet implemented (tmux terminal viewer still in use)
- **Dual-Mode Coexistence:** Both tmux and headless modes coexist (original spec assumed full replacement)
- **Store & Forward Integration:** Headless integrated with existing ticket system rather than replacing it

### Related Documentation

- [HEADLESS-ROADMAP.md](../HEADLESS-ROADMAP.md) - Migration roadmap & current status
- [SLO-TARGETS.md](../SLO-TARGETS.md) - Service level objectives
- [docs/ops/](../ops/) - Operational runbooks

---

## Overview

This document specifies a **second communication method** for Kokino that replaces the tmux-based terminal injection pattern with direct headless CLI invocation. This approach provides:

1. **Full conversation logging** - All turns captured as structured data
2. **Browser-native chat UI** - No terminal viewer required
3. **Simplified architecture** - No watchers, no buffer injection, no terminal state detection
4. **Multi-CLI support** - Claude Code, Factory Droid, Gemini CLI

**Original Status:** Design Proposal
**Original Date:** 2025-01-23
**Priority:** High

---

## Problem Statement

### Current Architecture (tmux-based)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Broker    │────▶│   Watcher   │────▶│    tmux     │────▶│  CLI Agent  │
│             │◀────│   (poll)    │     │  (inject)   │     │ (interactive)│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Pain Points:**
- Polling overhead (5s intervals per agent)
- Terminal readiness detection is heuristic-based
- Buffer injection is fragile with large payloads
- No structured capture of agent responses
- Requires XTerm.js streaming to view agent output
- One watcher daemon per agent
- Complex process management

### Proposed Architecture (headless-based)

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Broker    │────▶│  Agent Runner   │────▶│  CLI Agent  │
│             │◀────│  (subprocess)   │◀────│  (headless) │
└─────────────┘     └─────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌─────────────┐
                    │ Conversation│
                    │    Store    │
                    └─────────────┘
```

**Benefits:**
- Direct subprocess invocation - no polling
- Structured JSON responses captured
- Full conversation history stored
- Session continuity via `--resume`
- No terminal state management
- Single AgentRunner service handles all agents

---

## Supported CLIs

### Tier 1: Full Support

| CLI | Headless Flag | JSON Output | Session Resume | Status |
|-----|---------------|-------------|----------------|--------|
| **Claude Code** | `-p "prompt"` | `--output-format json` | `--resume <session>` | ✅ Production Ready |
| **Factory Droid** | `droid exec "task"` | Built-in JSON | `--session-id <id>` | ✅ Production Ready |
| **Gemini CLI** | `-p "prompt"` | `--output-format json` | Session state | ✅ Production Ready |

### Tier 2: Limited Support (Future)

| CLI | Headless | Notes |
|-----|----------|-------|
| Codex | `codex exec` | Single turn, no session |
| Aider | stdin/pipe | Text output only |
| Continue | `-p` | Stateless |

---

## Data Models

### Conversation Model

```typescript
interface Conversation {
  conversationId: string;       // UUID
  agentId: string;              // "frontend-mary"
  sessionId?: string;           // CLI session ID for resume
  cliType: "claude-code" | "factory-droid" | "gemini";
  status: "active" | "completed" | "error";
  createdAt: Date;
  updatedAt: Date;
  turns: Turn[];
}

interface Turn {
  turnId: string;               // UUID
  direction: "inbound" | "outbound";  // inbound = to agent, outbound = from agent
  ticketId?: string;            // Link to broker ticket if applicable
  content: string;              // Message content
  metadata: {
    tokensIn?: number;
    tokensOut?: number;
    durationMs?: number;
    toolsUsed?: string[];
    filesModified?: string[];
  };
  timestamp: Date;
  rawResponse?: object;         // Full JSON response from CLI
}
```

### Agent Registry Extension

```typescript
interface Agent {
  // Existing fields...
  agentId: string;
  type: string;
  status: string;

  // NEW: Communication mode
  commMode: "tmux" | "headless";

  // NEW: Headless-specific
  headlessConfig?: {
    cliType: "claude-code" | "factory-droid" | "gemini";
    sessionId?: string;         // For resume capability
    cwd: string;                // Working directory
    mcpConfigPath?: string;     // MCP config file path
    systemPrompt?: string;      // Appended system prompt
    flags?: string[];           // Additional CLI flags
  };

  // NEW: Conversation reference
  activeConversationId?: string;
}
```

---

## Environment Setup

### Building the CLI Environment

When spawning CLI processes, we must replicate the shell environment the CLI expects.
This is critical - without proper environment setup, the CLI may fail to authenticate or find dependencies.

**Reference:** Network Chuck's `buildClaudeEnvironment()` function.

```javascript
/**
 * Build the full environment that Claude Code expects.
 * This mimics what happens when you run `claude` in a terminal
 * with your shell profile fully loaded.
 */
function buildClaudeEnvironment() {
  const HOME = process.env.HOME;
  const CLAUDE_DIR = path.join(HOME, '.claude');

  // Load ~/.claude/.env if it exists (API keys, tokens)
  const claudeEnv = {};
  const envPath = path.join(CLAUDE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          claudeEnv[key] = valueParts.join('=');
        }
      }
    }
  }

  // Build PATH with all expected binary locations
  const fullPath = [
    '/opt/homebrew/bin',           // macOS Homebrew
    '/usr/local/bin',
    path.join(HOME, '.local/bin'), // pipx, etc.
    path.join(HOME, '.bun/bin'),   // Bun
    '/usr/bin',
    '/bin',
  ].join(':');

  const env = {
    ...process.env,
    ...claudeEnv,
    PATH: fullPath,
    HOME,

    // CRITICAL: Tell Claude Code it's running in CLI mode
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
  };

  // CRITICAL: Remove ANTHROPIC_API_KEY to force subscription auth
  // If set (even to placeholder), CLI tries API auth instead of subscription
  delete env.ANTHROPIC_API_KEY;

  return env;
}

// Pre-build once at startup
const claudeEnv = buildClaudeEnvironment();
```

### Environment Variables Reference

| Variable | Purpose | Required |
|----------|---------|----------|
| `CLAUDECODE` | Set to `'1'` to indicate CLI environment | Yes |
| `CLAUDE_CODE_ENTRYPOINT` | Set to `'cli'` | Yes |
| `PATH` | Must include paths to `claude`, `node`, etc. | Yes |
| `HOME` | User home directory | Yes |
| `ANTHROPIC_API_KEY` | **Must be DELETED** to use subscription auth | N/A |

---

## Agent Runner Service

### Class Design

```typescript
class AgentRunner {
  private conversations: Map<string, Conversation>;
  private activeCalls: Map<string, ChildProcess>;

  /**
   * Execute a single turn with an agent
   */
  async execute(agentId: string, prompt: string, options?: ExecuteOptions): Promise<TurnResult>;

  /**
   * Get or create conversation for agent
   */
  async getConversation(agentId: string): Promise<Conversation>;

  /**
   * Resume existing session
   */
  async resume(agentId: string, sessionId: string): Promise<void>;

  /**
   * Cancel running execution
   */
  async cancel(agentId: string): Promise<void>;

  /**
   * Get conversation history
   */
  async getHistory(agentId: string): Promise<Turn[]>;
}

interface ExecuteOptions {
  timeoutMs?: number;           // Default: 300000 (5 min)
  awaitResponse?: boolean;      // Default: true
  metadata?: Record<string, any>;
}

interface TurnResult {
  turnId: string;
  content: string;
  success: boolean;
  durationMs: number;
  metadata: Record<string, any>;
  sessionId?: string;           // For session continuity
}
```

### Core Execution Implementation

**Reference:** Network Chuck's `runClaudeOnce()` function.

```javascript
// Session storage: agentId -> { sessionId, hasSession }
const sessions = new Map();

/**
 * Execute a single prompt against Claude Code CLI
 */
function runClaudeOnce({ agentId, prompt, cwd }) {
  const startTime = Date.now();

  // Build CLI arguments
  const args = [
    '--dangerously-skip-permissions',  // REQUIRED for headless
    '-p', prompt,
    '--model', process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  ];

  // Session management: --session-id for NEW, --resume for EXISTING
  const sessionInfo = sessions.get(agentId);
  if (sessionInfo?.hasSession) {
    // Continue existing session
    args.push('--resume', agentId);
    console.log(`[AgentRunner] Resuming session: ${agentId}`);
  } else {
    // Create new named session
    args.push('--session-id', agentId);
    sessions.set(agentId, { hasSession: true });
    console.log(`[AgentRunner] Starting new session: ${agentId}`);
  }

  // Add MCP config if configured
  const mcpConfigPath = getMcpConfigPath(agentId);
  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
  }

  return new Promise((resolve, reject) => {
    const claude = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: claudeEnv,  // Pre-built environment
      cwd: cwd || process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    claude.stdin.end();  // Close stdin immediately

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('error', (error) => {
      reject(error);
    });

    claude.on('close', (code) => {
      const durationMs = Date.now() - startTime;

      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      const { response, sessionId } = parseClaudeStdout(stdout);

      resolve({
        code,
        response,
        sessionId,
        durationMs,
        stdout,
        stderr,
      });
    });
  });
}

/**
 * End a session when agent is stopped
 */
function endSession(agentId) {
  if (sessions.has(agentId)) {
    sessions.delete(agentId);
    console.log(`[AgentRunner] Session ended: ${agentId}`);
  }
}
```

### CLI Invocation Patterns

#### Claude Code

**Critical Flags:**
- `-p "prompt"` - **Required.** Enables headless/non-interactive mode
- `--dangerously-skip-permissions` - **Required.** Auto-approves tool use without prompts
- `--session-id <id>` - Create a NEW session with this name (first turn)
- `--resume <id>` - Continue an EXISTING session (subsequent turns)
- `--model <model>` - Model selection (default: claude-sonnet-4-20250514)
- `--mcp-config <path>` - Path to MCP server configuration
- `--append-system-prompt <text>` - Add to system prompt

**Important Distinction:**
- `--session-id` = **CREATE** a new named session
- `--resume` = **CONTINUE** an existing session
- These are mutually exclusive!

```bash
# First turn (create new session)
claude \
  --dangerously-skip-permissions \
  -p "You are agent 'frontend-mary'. Check the React components." \
  --model claude-sonnet-4-20250514 \
  --session-id frontend-mary-session \
  --mcp-config /path/to/agent-bridge.mcp.json

# Subsequent turns (resume existing session)
claude \
  --dangerously-skip-permissions \
  -p "Now add the loading state" \
  --model claude-sonnet-4-20250514 \
  --resume frontend-mary-session
```

**JSONL Response Parsing:**

Claude Code outputs newline-delimited JSON (JSONL). Each line is a separate JSON object.
The final result is in a message with `type: "result"`:

```javascript
function parseClaudeStdout(stdout) {
  let response = '';
  let sessionId = null;

  const lines = String(stdout || '').trim().split('\n');
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'result' && parsed.result) {
        response = parsed.result;
        sessionId = parsed.session_id;
      }
    } catch {
      // Not JSON, ignore
    }
  }

  // Fallback to raw stdout if no JSONL found
  if (!response) {
    response = String(stdout || '').trim();
  }

  return { response, sessionId };
}
```

**Response Types in JSONL Stream:**
```typescript
interface ClaudeCodeMessage {
  type: "result" | "error" | "tool_use" | "text" | "system";
  session_id?: string;
  result?: string;        // Final response text (when type === "result")
  content?: string;
  tool_name?: string;
  tool_input?: object;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}
```

### Prompt Layering for Agent Personas

When building the prompt for execution, layer context in this order:

```
1. Agent Identity Prompt (role, capabilities, name)
2. System Context (output format, Kokino-specific instructions)
3. User/Ticket Prompt (the actual message/task)
```

**Example:**

```javascript
function buildAgentPrompt({ agent, ticketPayload }) {
  let fullPrompt = '';

  // Layer 1: Agent Identity
  if (agent.headlessConfig?.systemPrompt) {
    fullPrompt += `[AGENT IDENTITY]\n`;
    fullPrompt += `You are agent '${agent.agentId}' with role: ${agent.role}.\n`;
    fullPrompt += agent.headlessConfig.systemPrompt;
    fullPrompt += `\n[END AGENT IDENTITY]\n\n`;
  }

  // Layer 2: Kokino System Context
  fullPrompt += `[KOKINO CONTEXT]\n`;
  fullPrompt += `You are part of a multi-agent team. Use co_workers() to see other agents.\n`;
  fullPrompt += `Use send_message() to communicate with other agents.\n`;
  fullPrompt += `Use post_reply() to respond to messages.\n`;
  fullPrompt += `[END KOKINO CONTEXT]\n\n`;

  // Layer 3: The actual message
  fullPrompt += ticketPayload;

  return fullPrompt;
}
```

**For Structured Output (JSON responses):**

When you need machine-parseable responses (e.g., for n8n integrations or status checks):

```javascript
const STRUCTURED_OUTPUT_CONTEXT = `
[OUTPUT FORMAT]
You MUST respond with valid JSON only. No markdown, no explanation.
Required fields: ${requiredFields.join(', ')}
Example: ${JSON.stringify(example)}
[END OUTPUT FORMAT]
`;
```

---

#### Factory Droid

```bash
# First turn
droid exec "Check the API endpoints" \
  --auto medium \
  --session-id frontend-mary-session

# Subsequent turns
droid exec "Add error handling" \
  --session-id frontend-mary-session
```

**Response Parsing:**
```typescript
interface DroidResponse {
  success: boolean;
  session_id: string;
  output: string;
  files_modified?: string[];
  error?: string;
}
```

#### Gemini CLI

```bash
# First turn
gemini -p "Analyze the database schema" \
  --output-format json

# Subsequent turns (session managed internally)
gemini -p "Add indexes for the user queries" \
  --output-format json
```

---

## Broker Integration

### New API Endpoints

```
# Execute prompt on agent (headless mode)
POST   /agents/{id}/execute
Body:  { prompt: string, metadata?: object }
Response: { turnId, content, sessionId, durationMs }

# Get conversation history
GET    /agents/{id}/conversation
Response: { conversationId, turns: [...], sessionId }

# Get specific turn
GET    /agents/{id}/conversation/turns/{turnId}
Response: Turn

# Stream execution output (SSE)
GET    /agents/{id}/execute/stream
Response: Server-Sent Events with incremental output

# Cancel running execution
POST   /agents/{id}/execute/cancel
Response: { cancelled: boolean }
```

### Modified Endpoints

```
# Agent registration - add commMode
POST   /agents/register
Body:  {
  agentId, type, metadata,
  commMode: "headless",        // NEW
  headlessConfig: { ... }      // NEW
}

# Spawn agent - support headless mode
POST   /agents/spawn
Body:  {
  agentId, type, role, cwd,
  commMode: "headless"         // NEW: Skip tmux creation
}
```

### Message Routing Changes

When a ticket arrives for a headless agent:

```typescript
async function deliverTicket(ticket: Ticket) {
  const agent = registry.get(ticket.targetAgent);

  if (agent.commMode === "headless") {
    // NEW: Direct execution
    const result = await agentRunner.execute(
      ticket.targetAgent,
      formatTicketAsPrompt(ticket),
      { metadata: ticket.metadata }
    );

    // Store turn in conversation
    await conversationStore.addTurn(agent.activeConversationId, {
      direction: "inbound",
      ticketId: ticket.ticketId,
      content: ticket.payload,
      timestamp: new Date()
    });

    await conversationStore.addTurn(agent.activeConversationId, {
      direction: "outbound",
      ticketId: ticket.ticketId,
      content: result.content,
      metadata: result.metadata,
      timestamp: new Date()
    });

    // Create reverse ticket for reply (existing bidirectional pattern)
    if (ticket.metadata?.origin) {
      await ticketStore.create({
        targetAgent: ticket.metadata.origin,
        payload: result.content,
        metadata: { isReply: true, replyTo: ticket.ticketId }
      });
    }

  } else {
    // Existing tmux injection path
    await watcherDelivery(ticket);
  }
}
```

---

## UI Changes

### New Chat Panel Component

Replace terminal viewer with native chat interface for headless agents:

```jsx
// components/AgentChatPanel.jsx
function AgentChatPanel({ agentId }) {
  const { conversation, loading } = useConversation(agentId);
  const [input, setInput] = useState('');
  const { execute, executing } = useAgentExecute(agentId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <AgentAvatar agentId={agentId} />
          <span className="font-medium">{agentId}</span>
          <StatusBadge status={executing ? 'processing' : 'idle'} />
        </div>
        <div className="text-sm text-gray-500">
          Session: {conversation?.sessionId?.slice(0, 8)}...
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversation?.turns.map(turn => (
          <ChatBubble
            key={turn.turnId}
            direction={turn.direction}
            content={turn.content}
            timestamp={turn.timestamp}
            metadata={turn.metadata}
          />
        ))}
        {executing && <ThinkingIndicator />}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 resize-none rounded-lg border p-2"
            rows={2}
          />
          <button
            onClick={() => execute(input).then(() => setInput(''))}
            disabled={executing || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Chat Bubble Component

```jsx
// components/ChatBubble.jsx
function ChatBubble({ direction, content, timestamp, metadata }) {
  const isInbound = direction === 'inbound';

  return (
    <div className={`flex ${isInbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${
        isInbound
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-900'
      }`}>
        {/* Content with markdown support */}
        <div className="prose prose-sm">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>

        {/* Metadata footer */}
        <div className={`text-xs mt-2 ${
          isInbound ? 'text-blue-200' : 'text-gray-500'
        }`}>
          <span>{formatTime(timestamp)}</span>
          {metadata?.durationMs && (
            <span className="ml-2">({metadata.durationMs}ms)</span>
          )}
          {metadata?.toolsUsed?.length > 0 && (
            <span className="ml-2">
              🔧 {metadata.toolsUsed.join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Context Menu Update

```jsx
// In AgentNode context menu
const contextMenuItems = useMemo(() => {
  const agent = getAgent(agentId);

  if (agent.commMode === 'headless') {
    return [
      { label: 'Open Chat', icon: <ChatIcon />, action: openChatPanel },
      { label: 'View History', icon: <HistoryIcon />, action: openHistory },
      { label: 'Stop Agent', icon: <StopIcon />, action: stopAgent },
      { label: 'Clear Conversation', icon: <TrashIcon />, action: clearConversation },
    ];
  } else {
    // Existing tmux menu
    return [
      { label: 'Connect Terminal', icon: <TerminalIcon />, action: openTerminal },
      { label: 'Stop Agent', icon: <StopIcon />, action: stopAgent },
    ];
  }
}, [agentId]);
```

### Visual Differentiation

Headless agents show chat bubble icon instead of terminal icon:

```jsx
function AgentNode({ agent }) {
  return (
    <div className="agent-node">
      <div className="agent-icon">
        {agent.commMode === 'headless'
          ? <ChatBubbleIcon />
          : <TerminalIcon />
        }
      </div>
      <span>{agent.name}</span>
      <StatusIndicator status={agent.status} />
    </div>
  );
}
```

---

## Database Schema Changes

### New Table: conversations

```sql
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  cli_type TEXT NOT NULL,
  session_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_conversations_session ON conversations(session_id);
```

### New Table: turns

```sql
CREATE TABLE turns (
  turn_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  ticket_id TEXT,
  direction TEXT NOT NULL,  -- 'inbound' or 'outbound'
  content TEXT NOT NULL,
  metadata TEXT,            -- JSON
  raw_response TEXT,        -- Full CLI JSON response
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
  FOREIGN KEY (ticket_id) REFERENCES tickets(ticket_id)
);

CREATE INDEX idx_turns_conversation ON turns(conversation_id);
CREATE INDEX idx_turns_ticket ON turns(ticket_id);
```

### Modified Table: agents

```sql
-- Add columns to existing agents table
ALTER TABLE agents ADD COLUMN comm_mode TEXT DEFAULT 'tmux';
ALTER TABLE agents ADD COLUMN headless_config TEXT;  -- JSON
ALTER TABLE agents ADD COLUMN active_conversation_id TEXT;
```

---

## Migration Strategy

### Phase 1: Parallel Implementation

1. Add `AgentRunner` service alongside `ProcessManager`
2. Add `commMode` flag to agent registration
3. Implement new API endpoints
4. Add database tables for conversations
5. Build `AgentChatPanel` component

**No breaking changes - both modes coexist.**

### Phase 2: Testing & Validation

1. Spawn test agents in headless mode
2. Verify message delivery works
3. Test session continuity across restarts
4. Validate conversation history storage
5. Performance benchmarking vs tmux

### Phase 3: Default Switch

1. Change default `commMode` to "headless" for supported CLIs
2. Add migration script to convert existing agents
3. Keep tmux as fallback for unsupported CLIs
4. Update documentation

### Phase 4: Deprecation (Future)

1. Mark tmux mode as deprecated
2. Remove watcher daemon code
3. Remove terminal WebSocket endpoint
4. Clean up ProcessManager

---

## Configuration

### Agent Bridge MCP Config (Headless Mode)

```json
{
  "mcpServers": {
    "agent-bridge": {
      "command": "node",
      "args": ["/path/to/kokino/mcp/build/index.js"],
      "env": {
        "BRIDGE_BROKER_URL": "http://127.0.0.1:5050",
        "AGENT_ID": "frontend-mary",
        "COMM_MODE": "headless"
      }
    }
  }
}
```

### Environment Variables

```bash
# Enable headless mode globally
KOKINO_DEFAULT_COMM_MODE=headless

# CLI-specific settings
CLAUDE_CODE_PATH=/usr/local/bin/claude
DROID_PATH=/usr/local/bin/droid
GEMINI_PATH=/usr/local/bin/gemini

# Timeouts
HEADLESS_EXECUTION_TIMEOUT_MS=300000
HEADLESS_STARTUP_TIMEOUT_MS=30000
```

---

## Error Handling

### Execution Errors

```typescript
class AgentExecutionError extends Error {
  constructor(
    public agentId: string,
    public cliType: string,
    public exitCode: number,
    public stderr: string,
    message: string
  ) {
    super(message);
  }
}

// In AgentRunner
async execute(agentId: string, prompt: string) {
  try {
    const result = await this.invokeCliHeadless(agentId, prompt);
    return result;
  } catch (error) {
    // Log error turn to conversation
    await this.conversationStore.addTurn(conversationId, {
      direction: 'outbound',
      content: `Error: ${error.message}`,
      metadata: { error: true, exitCode: error.exitCode }
    });

    // Update agent status
    await this.registry.updateStatus(agentId, 'error');

    throw error;
  }
}
```

### Timeout Handling

```typescript
async invokeCliHeadless(agentId: string, prompt: string, timeoutMs = 300000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await this.spawnCli(agentId, prompt, controller.signal);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AgentExecutionError(
        agentId,
        this.getCliType(agentId),
        -1,
        '',
        `Execution timed out after ${timeoutMs}ms`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## Performance Considerations

### Comparison: tmux vs Headless

| Metric | tmux Mode | Headless Mode |
|--------|-----------|---------------|
| Message Latency | 5s (polling) + injection | <100ms (direct call) |
| Memory per Agent | ~50MB (tmux + watcher) | ~10MB (no daemon) |
| Process Count | 3 per agent | 1 per execution |
| State Recovery | Manual session detection | SessionID in DB |
| Response Capture | Terminal scraping | Structured JSON |

### Scaling Considerations

1. **Concurrent Executions:** Limit via semaphore (default: 10 parallel)
2. **Memory:** Stream large responses instead of buffering
3. **Timeouts:** Configurable per-agent based on expected task duration
4. **Session Cleanup:** Prune stale sessions after 24h inactivity

---

## Testing Plan

### Unit Tests

```typescript
describe('AgentRunner', () => {
  it('executes Claude Code in headless mode', async () => {
    const runner = new AgentRunner();
    const result = await runner.execute('test-agent', 'Hello');
    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it('resumes existing session', async () => {
    const runner = new AgentRunner();
    const r1 = await runner.execute('test-agent', 'Remember X=42');
    const r2 = await runner.execute('test-agent', 'What is X?');
    expect(r2.content).toContain('42');
  });

  it('handles execution timeout', async () => {
    const runner = new AgentRunner();
    await expect(
      runner.execute('test-agent', 'Sleep forever', { timeoutMs: 100 })
    ).rejects.toThrow('timed out');
  });
});
```

### Integration Tests

```typescript
describe('Headless Agent Integration', () => {
  it('delivers broker message via headless execution', async () => {
    // Register headless agent
    await broker.register({
      agentId: 'alice',
      commMode: 'headless',
      headlessConfig: { cliType: 'claude-code', cwd: '/tmp' }
    });

    // Send message
    const ticket = await broker.send('alice', { payload: 'Hello Alice' });

    // Wait for processing
    await waitFor(() =>
      broker.getTicket(ticket.ticketId).status === 'responded'
    );

    // Verify conversation recorded
    const conv = await broker.getConversation('alice');
    expect(conv.turns).toHaveLength(2);
    expect(conv.turns[0].direction).toBe('inbound');
    expect(conv.turns[1].direction).toBe('outbound');
  });
});
```

---

## Open Questions

1. **Session Persistence:** Should sessions survive broker restart?
   - **Recommendation:** Yes, store sessionId in DB, pass `--resume` on startup

2. **Streaming Output:** Should we stream partial responses to UI?
   - **Recommendation:** Yes via SSE, improves perceived responsiveness

3. **Multi-turn Batching:** Can we batch multiple tickets into one execution?
   - **Recommendation:** No, maintain 1:1 ticket-to-turn for auditability

4. **MCP Tool Access:** How do agents call `post_reply` in headless mode?
   - **Recommendation:** Same MCP config, but broker also captures response directly

5. **Fallback Strategy:** What if headless execution fails repeatedly?
   - **Recommendation:** After 3 failures, mark agent as error, notify user

---

## Implementation Checklist

### Backend
- [ ] Create `AgentRunner` class in `broker/src/agents/`
- [ ] Add CLI invocation helpers for each supported CLI
- [ ] Add `conversations` and `turns` tables
- [ ] Create `ConversationStore` repository
- [ ] Add `/execute` API endpoint
- [ ] Modify message routing for headless agents
- [ ] Add session resume logic
- [ ] Implement execution timeout handling

### Frontend
- [ ] Create `AgentChatPanel` component
- [ ] Create `ChatBubble` component
- [ ] Add `useConversation` hook
- [ ] Add `useAgentExecute` hook
- [ ] Update context menu for headless agents
- [ ] Add visual differentiation for headless agents
- [ ] Implement conversation history view

### Testing
- [ ] Unit tests for AgentRunner
- [ ] Integration tests for message delivery
- [ ] E2E tests for chat UI
- [ ] Performance benchmarks

### Documentation
- [ ] Update API documentation
- [ ] Add headless mode configuration guide
- [ ] Document supported CLIs and their flags
- [ ] Migration guide from tmux mode

---

## References

- [Claude Code Headless Documentation](https://code.claude.com/docs/en/headless)
- [Factory Droid Exec Documentation](https://docs.factory.ai/cli/droid-exec/overview)
- [Gemini CLI Headless](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html)
- **[Network Chuck's claude-phone](https://github.com/theNetworkChuck/claude-phone)** - Reference implementation for headless Claude Code invocation
- [claude-code-api Project](https://github.com/cabinlab/claude-code-api)
- [call-me MCP Plugin](https://github.com/ZeframLou/call-me) - Phone callback integration

---

## Appendix: Network Chuck's Implementation Details

The `claude-phone` project demonstrates a production-ready headless Claude Code integration.

### Key Files

| File | Purpose |
|------|---------|
| `claude-api-server/server.js` | Express server wrapping Claude CLI |
| `claude-api-server/structured.js` | JSON schema validation & repair |
| `voice-app/` | SIP/FreeSWITCH voice interface |

### API Endpoints

```
POST /ask              - Send prompt, get response
POST /ask-structured   - Send prompt, get validated JSON
POST /end-session      - Clean up session
GET  /health           - Health check
```

### Session Flow

```
1. First call with callId="abc123"
   → spawn claude --session-id abc123 -p "..."
   → Store: sessions.set("abc123", true)

2. Subsequent calls with same callId
   → spawn claude --resume abc123 -p "..."
   → Session context preserved

3. Call ends
   → POST /end-session { callId: "abc123" }
   → sessions.delete("abc123")
```

### Lessons Learned

1. **Delete ANTHROPIC_API_KEY** - Forces subscription auth instead of API auth
2. **Build full PATH** - CLI needs access to node, npm, etc.
3. **Set CLAUDECODE=1** - Tells CLI it's running in proper environment
4. **Parse JSONL line-by-line** - Look for `type: "result"` message
5. **Session IDs are persistent** - Can resume across process restarts

---

*This specification enables Kokino to move beyond terminal injection toward a cleaner, more maintainable architecture while preserving full conversation history for debugging and analysis.*
