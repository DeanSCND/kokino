# Agent-to-Agent Communication Bridge — Technical Specification

## 1. Background & Goals

We routinely orchestrate multiple coding agents (Claude Code, Codex, others) that live in separate tmux panes. The current workflow relies on tmux MCP helpers (`send-keys`, `capture-pane`) which:

- Force Claude to issue many low-level commands (session discovery, sends, polling).
- Produce noisy responses (menus, prompts) that require heuristics to clean.
- Are synchronous and token-expensive for the orchestrating agent.
- Do not offer a clean way for downstream agents to “push” replies back.

The objective is to build a deterministic bridge that lets any agent send a structured message to another agent and receive the reply without screen scraping or manual copy/paste. The solution should enable both blocking (wait for reply) and non-blocking workflows, minimize token usage, and be extensible to additional agents.

## 2. Scope & Non-Goals

### In Scope
- Design of a local broker service that coordinates message delivery between agents.
- Definition of MCP tools that Claude can call to interact with the broker.
- Expectations for minimal agent wrappers/helper scripts to emit replies back to the broker.
- Transport considerations (HTTP/SSE/WebSocket, tmux interaction boundaries).
- Error handling, retry/back-pressure, and timeout strategies.
- Logging, configuration, and security assumptions for a local developer environment.

### Out of Scope (for this first phase)
- Remote/network deployment (we assume localhost).
- Deep process orchestration (debuggers, TUI integration) beyond request/response messages.
- Multi-tenant authentication/authorization (plaintext local traffic is acceptable initially).
- UI dashboards or long-term persistence (only transient state is required now).

## 3. Target Architecture Overview

```
Claude MCP Tool  ──▶  Agent Bridge MCP (Node.js) ──▶ Local Broker (HTTP/Event Server)
                                            ▲                 │
                                            │                 ▼
                                     Agent Wrapper (stdin/stdout proxy)
                                       └─ operates Codex CLI (tmux pane)
```

**Key principles**
1. **Single source of truth**: the broker tracks outstanding requests and responses using correlation IDs (“tickets”).
2. **Push-style replies**: downstream agents post replies via a helper command rather than relying on tmux pane polling.
3. **Extensible interface**: MCP tools expose a simple contract (`send_message`, `await_reply`, etc.) independent of tmux internals.
4. **Deterministic transport**: large payloads are transferred over sockets/HTTP as structured JSON, avoiding token churn or shell escape issues.

## 4. Component Specifications

### 4.1 Agent Bridge MCP (existing TypeScript project)
- Acts as Claude’s interface.
- Provides synchronous and asynchronous tools (see §6).
- Proxies requests to the broker via HTTP.
- Optionally streams responses back via Server-Sent Events (SSE) or long-poll endpoints.
- Provides fallback access to raw tmux helpers only if broker is unavailable (for backwards compatibility).

### 4.2 Local Broker Service
- Lightweight web server (Node/Express/Fastify or similar) listening on localhost (configurable port).
- Maintains in-memory store of pending tickets:
  - `ticketId`: string (UUID)
  - `targetAgent`: string (logical agent name)
  - `payload`: string or structured JSON body
  - `status`: `pending`, `delivered`, `responded`, `timed_out`
  - `response`: optional string/JSON
  - `createdAt`/`updatedAt` timestamps for cleanup.
- Maintains registry of named agents. Each agent registers with a self-selected handle (e.g., “Jerry”) and metadata (type, pane/session if applicable). Handles are unique; re-registering updates the existing record.
- HTTP API (see §5) to:
  - Accept outbound messages from Claude.
  - Push replies from agent wrappers.
  - Expose streaming or long-poll handlers for replies.
  - Provide “agent directory” information (available agents, last heartbeat).
- Optional plugin to capture tmux metadata (session/pane, if still using tmux for launching agents).

### 4.3 Agent Wrapper / Reply Helper
- Lightweight scripts/binaries available in each agent’s environment (e.g., `bridge-register`, `bridge-reply`).
- Receives `ticketId` and `message` (and optional metadata) from the agent’s prompt or instruction.
- POSTs to broker endpoint `/replies`.
- For interactive CLIs (e.g., Codex) we can:
  - Launch the CLI under a PTY wrapper that intercepts stdout and forwards to the broker (advanced), or
  - Add instructions telling the agent to run the helper command with its response (simpler). Tuning of instructions can be iterated with Claude’s system hints.
- For future automation, the wrapper could also monitor the agent process and emit heartbeats/logs.

### 4.4 Agent Launch & TMUX Integration
- Agents can remain in tmux panes for familiarity, but tmux becomes optional.
- If tmux is used, the launch scripts should set environment variables (e.g., `BRIDGE_TICKET=...`) or mount the helper binary in PATH.
- The broker may expose convenience scripts to spawn agents with the wrapper attached.

## 5. Broker API (Proposed)

### 5.0 `POST /agents/register`
Agents call this on startup (and whenever reconnecting) to announce their handle.

Request body:
```json
{
  "agentId": "Jerry",
  "type": "codex",
  "metadata": {
    "paneId": "%0",
    "session": "Session",
    "cwd": "/home/user/project-a",
    "capabilities": ["review", "tests"]
  },
  "heartbeatIntervalMs": 30000
}
```

Response:
```json
{
  "agentId": "Jerry",
  "status": "registered",
  "expiresAt": "2025-10-20T08:00:00Z"
}
```

If the same handle registers again, the broker treats it as a reconnect and replaces the previous record.

### 5.1 `POST /agents/{agentId}/send`
Send a message to a target agent.

Request body:
```json
{
  "ticketId": "uuid-123",
  "payload": "Please review diff X",
  "metadata": {
    "origin": "claude",
    "context": {...}
  },
  "expectReply": true,
  "timeoutMs": 30000
}
```

Response:
```json
{
  "ticketId": "uuid-123",
  "status": "pending",
  "waitEndpoint": "/replies/uuid-123/stream"
}
```

### 5.2 `POST /replies`
Agents call this to deliver a response.

Request body:
```json
{
  "ticketId": "uuid-123",
  "payload": "Here is the joke ...",
  "metadata": {
    "agent": "codex",
    "status": "completed"
  }
}
```

Response: `204 No Content`

Broker updates ticket status to `responded`, stores payload, and notifies any awaiting clients.

### 5.3 `GET /replies/{ticketId}`
Blocking fetch (long poll).
- Query parameter `waitMs` defines server-side timeout (default 25s).
- Response when reply exists:
```json
{
  "ticketId": "uuid-123",
  "payload": "...",
  "status": "responded",
  "latencyMs": 4523
}
```
- If timeout with no reply: `204 No Content`.

### 5.4 `GET /replies/{ticketId}/stream`
SSE endpoint that pushes a single event when reply arrives (or a timeout event). Useful for the MCP tool to keep a single connection until completion.

### 5.5 `GET /agents`
Enumerate registered agents, their current status, and metadata. Supports optional filters (`?type=codex`, `?status=online`).

Example response:
```json
[
  {
    "agentId": "Jerry",
    "type": "codex",
    "status": "online",
    "lastHeartbeat": "2025-10-20T07:59:12Z",
    "metadata": {
      "paneId": "%0",
      "session": "Session",
      "cwd": "/home/user/project-a",
      "capabilities": ["review", "tests"]
    }
  },
  {
    "agentId": "Spock",
    "type": "claude-code",
    "status": "offline",
    "lastHeartbeat": "2025-10-19T18:04:33Z",
    "metadata": {}
  }
]
```

### 5.6 (Optional) `POST /agents/{agentId}/heartbeat`
Wrapper can periodically inform the broker that the agent is alive, enabling health checks in UI or logs.

## 6. MCP Tool Contracts

### 6.1 `send_message`
- **Arguments**:
  - `agentId` (string) — registered agent handle (e.g., “Jerry”).
  - `payload` (string) — message body to inject.
  - `timeoutMs` (int, optional) — expectation for reply deadline (broker-level).
  - `awaitResponse` (bool, default `true`) — whether to block until reply arrives.
  - `metadata` (object, optional) — any additional context.
- **Behavior**:
  1. Generate `ticketId`.
  2. POST to broker `/agents/{agentId}/send`.
  3. If `awaitResponse` is true, immediately call `GET /replies/{ticketId}/stream` (or long poll) and return the first reply event.
  4. If `awaitResponse` is false, return `ticketId` and let user/Claude call `await_reply`.
- **Response**:
  - If blocked: `{ ticketId, status: "responded", payload, latencyMs }`
  - If not awaiting: `{ ticketId, status: "pending" }`

### 6.2 `await_reply`
- **Arguments**: `ticketId`, optional `timeoutMs`.
- **Behavior**: call broker `GET /replies/{ticketId}` or SSE stream.
- **Response**: same payload as above; if no reply and timeout, return structured message with `status: "timeout"`.

### 6.3 `list_agents` / `co_workers`
- Proxy `GET /agents` so Claude can discover active handles (names) and their metadata without caring about tmux sessions.
- Consider exposing both a verbose `list_agents` tool (full metadata) and a succinct `co_workers` tool that summarizes handles, types, and working directories for quick status checks.

### 6.4 `register_agent` (optional)
- Arguments mirror `/agents/register`. Typically invoked by the agent wrapper, but exposing it via MCP allows Claude to confirm registration or bootstrap agents directly.

### 6.5 `post_reply`
- Allows agents to post replies through MCP (proxying `POST /replies`). Useful when an agent also has access to the bridge MCP server instead of invoking the CLI helper. Arguments mirror the HTTP endpoint: `ticketId` (required), `payload` (string or JSON), optional `metadata` (`agent`, `status`, etc.).

### 6.6 Future Tools
- `cancel_ticket` (request cancellation).
- `broadcast_message` (fan-out to multiple agents).
- `subscribe_updates` (resource stream for logging or metrics).

## 7. Agent Wrapper Expectations

### 7.1 Minimal CLI Helpers
- `bridge-register` — announces the agent handle and optional metadata.
  - Usage: `bridge-register --agent Jerry --type codex --pane %0`.
  - Reads broker host/port from env (defaults to localhost).
  - Returns non-zero on failure so agents can take corrective action.
- `bridge-reply` — posts replies back to the broker.
  - Accepts `ticketId` and `payload`.
  - Supports flag form (`bridge-reply --ticket abc --message "..."`) or STDIN piping (`... | bridge-reply --ticket abc`).
  - Returns non-zero on failure.

### 7.2 Optional PTY Wrapper (Advanced)
- Use `node-pty`, `python-pexpect`, or similar to launch agent processes.
- Intercepts stdout lines, can automatically post to broker when it detects end-of-response markers (reducing reliance on agent instructions).
- Maintains context (which ticket a response corresponds to) by reading prompts or environment variables inserted before each request.
- Useful for long-term automation but not required for initial implementation.

### 7.3 Instruction Template for Agents
- Claude should mention in prompts (and in `CLAUDE.md`) that downstream agents must:
  - Choose a handle and register (`bridge-register --agent <name>`).
  - Reply via `bridge-reply <ticketId> "<message>"`.
- Provide convenience aliases in agent shells (e.g., `alias reply='bridge-reply'`, `alias register='bridge-register --agent Jerry --type codex'`).
- Ensure helper scripts are available in PATH for Codex, etc.

## 8. State Management & Cleanup
- Tickets expire after configurable TTL (default 30 minutes). Broker should garbage-collect old entries.
- Broker should differentiate between:
  - `pending` (awaiting agent).
  - `responded` (reply posted).
  - `timeout` (agent missed deadline).
  - `cancelled` (explicit user action).
- `send_message` should surface these states clearly to Claude to avoid infinite waiting.

## 9. Error Handling & Retry Strategy
- **Network issues**: MCP tool should retry POST to broker on transient errors (with backoff).
- **Agent offline**: broker returns `404 agent not registered`; MCP tool surfaces actionable error to Claude.
- **Timeout**: `await_reply` returns `status: "timeout"`; Claude can decide to re-prompt agent or notify user.
- **Broker downtime**: MCP tools should detect connection failure and optionally fall back to tmux path, but report reduced functionality.
- **Multiple replies**: if agents send more than one reply per ticket, broker should either queue them (list) or take the first and log the rest—define behavior in spec and instructions.

## 10. Configuration
- `.mcp.json` (root) will point to `agent-bridge` MCP server. Provide environment variables for:
  - `BRIDGE_BROKER_URL` (default `http://127.0.0.1:5050`).
  - `BRIDGE_DEFAULT_TIMEOUT_MS`.
  - Optional agent registry file path.
- Broker config file (`broker.config.json` or env-based) to list default agents, tmux pane hints, port, TLS flags.
- Agent launch scripts should export `BRIDGE_AGENT_ID`, `BRIDGE_BROKER_URL`, etc., so wrappers know their identity.

## 11. Observability & Logging
- Broker should log:
  - Incoming requests (send, reply, heartbeat).
  - Ticket lifecycle transitions with timestamps.
  - Errors/timeouts with agent IDs.
- Optionally emit JSON logs for easy parsing.
- MCP server can expose a `subscribe` resource for recent transactions.
- Add basic CLI tooling (`bridgectl list tickets`, `bridgectl tail logs`) for debugging.

## 12. Security Considerations
- Broker runs on localhost only; restrict binding to `127.0.0.1` by default.
- No authentication initially; note that future multi-user setups will need tokens/ACLs.
- Ensure helper scripts validate `ticketId` length/format to avoid injection.
- Avoid writing sensitive payloads to disk unless logging is enabled deliberately.

## 13. Rollout Plan
1. **Phase 1 — Broker Prototype**
   - Implement broker HTTP API with in-memory store.
   - Add `send_message` + `await_reply` MCP tools hitting `/send` + `/replies`.
   - Build `bridge-reply` CLI helper for agents.
   - Update `CLAUDE.md` with new instructions and test manually (Codex handshake).
   - Implement the agent registration flow (broker endpoint + `bridge-register`) and expose a `co_workers`/`list_agents` MCP tool so Claude can enumerate active handles.

2. **Phase 2 — Async Enhancements**
   - Introduce SSE endpoint and client handling to reduce polling.
   - Add `awaitResponse=false` path for fire-and-forget flows.
   - Implement TTL cleanup, improved error codes.

3. **Phase 3 — Wrapper Automation**
   - Optionally develop PTY wrapper that automatically posts replies, reducing reliance on agent instructions.
   - Add health endpoints, metrics, CLI tools.
   - Explore multi-agent broadcast and task assignment features.

## 14. Open Questions
- How to detect when agents should auto-reply without instructions? (May require protocol or sentinel markers.)
- Should we support binary payloads (e.g., zipped diffs) or stick to UTF-8 text? (UTF-8 only for now.)
- How to coordinate multi-step conversations (thread context) — keep per-ticket only, or support conversation IDs?
- Do we standardize message schemas (JSON) or allow plain text? (Start with plain text + optional metadata envelope.)
- Any need for persistence across restarts? (Out of scope now, but design broker state so persistence can be plugged in later.)

## 15. Success Criteria
- Claude can send a message to Codex (and other agents) via `send_message` and receive the reply without tmux polling.
- Token usage drops significantly (single tool invocation per request).
- Agents can respond using the helper command and their replies are routed correctly through the broker back to Claude.
- Timeout and error states are surfaced cleanly, enabling Claude to re-issue or escalate.
- Adding new agents requires only wrapper configuration, not changes to Claude’s instructions.
- Agents successfully register unique handles so senders can address them without session/pane knowledge.

Once this design is approved, implementation can start with the Phase 1 items, keeping the spec up-to-date as we iterate.
