# 🏗️ Agent-Collab Technical Architecture

## System Overview

Agent-Collab is built as a multi-layered system that orchestrates AI agents through a centralized message broker, enabling them to collaborate as a cohesive software development team.

## System Layers

### Layer 1: Agent Runtime
```
┌─────────────────────────────────────────────┐
│           Agent Runtime Layer                │
├─────────────────────────────────────────────┤
│ • tmux sessions (persistent terminals)       │
│ • Claude Code, Droid, Codex, Cursor, Aider   │
│ • Message watchers (polling daemons)         │
│ • MCP servers (tool exposure)                │
└─────────────────────────────────────────────┘
```

**Components:**
- **tmux sessions**: Persistent terminal environments for each agent
- **AI Agents**: Any CLI-based AI (Claude Code, Droid, Codex, etc.)
- **Message Watchers**: Node.js daemons polling broker and injecting messages
- **MCP Servers**: Expose tools to agents for message sending/receiving

**Key Files:**
- `bin/launch-agent.sh` - Spawns tmux session and starts agent
- `agent-bridge-mcp/bin/message-watcher.js` - Polls broker, injects messages
- `agent-bridge-mcp/build/index.js` - MCP server implementation

### Layer 2: Message Broker
```
┌─────────────────────────────────────────────┐
│    Message Broker (Node.js) - OPTIMIZED     │
├─────────────────────────────────────────────┤
│ • HTTP/WebSocket API (10-20ms response)      │
│ • "Store and Forward" architecture           │
│ • Stateful Mailbox (accepts all messages)   │
│ • Zero tmux checks in request path           │
│ • Background workers for heavy operations    │
│ • Ticket correlation engine                  │
│ • Agent registry (eventual consistency)      │
│ • Thread management                          │
│ • SQLite persistence (planned)               │
│ • Loop detection                             │
│ • Escalation service                         │
└─────────────────────────────────────────────┘
```

**Core Services (Performance-Optimized):**
- **Message Routing**: Instant acknowledgment, background delivery
- **Stateful Mailbox**: Accepts messages even for offline/non-existent agents
- **Thread Management**: Group related messages into conversations
- **Agent Registry**: Track online agents, capabilities, and status (background updates)
- **Persistence**: SQLite for tickets, threads, agents, workflows (async writes)
- **Health Monitoring**: Detect stuck agents, loops, timeouts (background workers)

**API Endpoints:**

*HTTP REST API (Orchestration & Control):*
```
POST   /orchestrate                  - Launch agent team [IMPLEMENTED]
POST   /agents/register              - Register new agent
GET    /agents                       - List all agents [IMPLEMENTED]
POST   /agents/{id}/send            - Send message to agent
POST   /agents/{id}/stop            - Stop individual agent [IMPLEMENTED]
POST   /agents/kill-all             - Terminate all sessions [IMPLEMENTED]
GET    /agents/{id}/tickets/pending - Get pending messages (polling)
GET    /agents/{id}/tickets/stream  - SSE stream for pending tickets
POST   /replies                      - Post reply to ticket
GET    /replies/{ticketId}          - Get reply for ticket (with long-poll)
GET    /replies/{ticketId}/stream   - SSE stream for reply
GET    /threads/{id}                - Get thread history
```

*WebSocket API (Real-time Communication):*
```
WS     /ws                          - WebSocket for real-time updates
WS     /ws/terminal/{agentId}      - Terminal PTY session [IMPLEMENTED]
```

**Critical Implementation Notes:**
- **IPv4 Enforcement**: ALWAYS use `127.0.0.1` instead of `localhost` to prevent IPv6 resolution issues on macOS
- **Dual Protocol Strategy**: HTTP for orchestration, WebSocket for interactive sessions
- **Session Naming**: Tmux sessions follow pattern `dev-{agentName}` (e.g., dev-Alice, dev-Jerry, dev-Gemma)
- **Multi-Model Support**: System supports heterogeneous agents (Claude, Droid, Gemini, etc.)

### Layer 3: Orchestration Engine
```
┌─────────────────────────────────────────────┐
│         Orchestration Engine                 │
├─────────────────────────────────────────────┤
│ • Workflow executor                          │
│ • Phase management                           │
│ • Team templates                             │
│ • GitHub integration                         │
│ • Event stream processor                     │
└─────────────────────────────────────────────┘
```

**Workflow Components:**
- **Workflow DSL**: YAML/JSON workflow definitions
- **Phase Manager**: Sequential/parallel phase execution
- **Template Engine**: Spawn teams from templates
- **GitHub Client**: Issue tracking, PR automation
- **Event Bus**: Pub/sub for workflow events

### Layer 4: Observatory UI
```
┌─────────────────────────────────────────────┐
│      Observatory UI (React/Vue)              │
├─────────────────────────────────────────────┤
│ • Dashboard (team status, metrics)           │
│ • Workflow builder (visual editor)           │
│ • Terminal viewer (tmux streaming)           │
│ • Thread inspector (conversation history)    │
│ • Admin panel (agent management)             │
└─────────────────────────────────────────────┘
```

**UI Components:**
- **Real-time Dashboard**: WebSocket-powered live updates
- **Visual Workflow Builder**: Drag-drop agent connections
- **Terminal Streaming**: Live tmux output in browser
- **Chat Interface**: Direct agent communication
- **Analytics**: Performance metrics, bottleneck detection

## Push Notification System

### Server-Sent Events (SSE) Architecture

**Real-time Ticket Delivery:**
- `/agents/{id}/tickets/stream` - SSE endpoint for new tickets
- Persistent connection per agent watcher
- Automatic reconnection with exponential backoff
- Event types: `ticket`, `heartbeat`, `error`

**Implementation:**
```javascript
// Watcher connects via EventSource
const eventSource = new EventSource('/agents/Lucy/tickets/stream');
eventSource.onmessage = (event) => {
  const ticket = JSON.parse(event.data);
  injectIntoTmux(ticket);
};
```

### Long-Polling Optimization

**Reduced Overhead:**
- `GET /agents/{id}/tickets/pending?waitMs=25000`
- Blocks until ticket arrives or timeout
- 80% reduction in HTTP requests vs 5s polling
- Graceful fallback when SSE unavailable

### Tmux Session Management

**Health Monitoring:**
```javascript
// Before injection, verify session exists
if (!tmuxSessionExists(session, pane)) {
  deregisterAgent(agentId);
  return;
}
```

**Interaction State Detection:**
- Use `tmux capture-pane` to check prompt state
- Queue messages when terminal is busy
- Inject only when at clean prompt (`$ ` or `> `)
- Agents emit `##BRIDGE-READY##` markers

### Shared Watcher Supervisor

**Architecture:**
```
┌─────────────────────────┐
│   Watcher Supervisor    │
│  (Single SSE Consumer)  │
└───────────┬─────────────┘
            │ IPC/Unix Socket
    ┌───────┴───────┐
    │               │
┌───▼───┐      ┌───▼───┐
│Agent 1│      │Agent 2│
│Injector│     │Injector│
└────────┘     └────────┘
```

**Benefits:**
- Single connection to broker
- 90% reduction in HTTP connections
- Centralized health monitoring
- Efficient message distribution

### Connection Management

**Reconnection Strategy:**
1. Initial connection attempt
2. On failure: wait 1s, 2s, 4s, 8s... (max 30s)
3. On success: reset backoff timer
4. Heartbeat every 30s to detect stale connections

**Failover Chain:**
1. Primary: SSE streaming
2. Fallback 1: Long-polling (25s timeout)
3. Fallback 2: Traditional polling (5s interval)
4. Emergency: Manual message checking

## Data Models

### Agent Model
```typescript
interface Agent {
  agentId: string           // "frontend-mary"
  name: string              // "Mary"
  type: string              // "claude-code" | "droid" | "codex"
  role: string              // "frontend-engineer"
  domain: string            // "frontend"
  status: "online" | "busy" | "stuck" | "offline"
  capabilities: string[]    // ["react", "typescript", "css"]
  contextPaths: string[]    // ["/web-app", "/components"]
  startingPrompt: string    // Role-specific initialization
  tmuxSession: string       // "dev-mary"
  tmuxPane: number          // 0
  heartbeatInterval?: number
  lastHeartbeat?: Date
  metadata: Record<string, any>
}
```

### Message Model
```typescript
interface Message {
  messageId: string
  threadId?: string
  ticketId: string
  from: string              // agentId
  to: string                // agentId
  payload: string           // Message content
  metadata: {
    origin: string          // Sender identification
    purpose?: string        // "code-review" | "requirements" | etc
    priority?: number
    timestamp: Date
  }
  status: "pending" | "delivered" | "read" | "replied"
}
```

### Thread Model
```typescript
interface Thread {
  threadId: string
  title: string            // "Feature #45 - User Preferences"
  participants: string[]   // ["pm-alice", "eng-bob", "frontend-mary"]
  messages: Message[]
  status: "active" | "completed" | "escalated"
  workflowId?: string
  githubIssue?: number
  createdAt: Date
  completedAt?: Date
  metadata: {
    phase?: string
    decisions?: Decision[]
    blockers?: string[]
  }
}
```

### Ticket Model
```typescript
interface Ticket {
  ticketId: string          // UUID
  targetAgent: string       // Recipient agent ID
  payload: string           // Message content
  metadata: Record<string, any>
  status: "pending" | "responded" | "timeout" | "error"
  expectReply: boolean
  timeoutMs: number
  createdAt: Date
  response?: {
    payload: any
    metadata: Record<string, any>
    respondedAt: Date
  }
}
```

### Communication Graph
```typescript
interface CommunicationEdge {
  from: string            // "pm-alice"
  to: string              // "eng-manager-bob"
  purpose: string         // "requirements"
  allowedMessageTypes: string[]
  bidirectional: boolean
  rateLimit?: number      // messages per minute
  conditions?: {
    phase?: string        // Only during specific workflow phase
    priority?: number     // Minimum priority required
  }
}

interface CommunicationGraph {
  nodes: Agent[]
  edges: CommunicationEdge[]
  rules: {
    defaultPolicy: "allow" | "deny"
    escalationThreshold: number  // Max messages before escalation
    loopDetection: boolean
  }
}
```

### Workflow Definition
```yaml
workflow: feature-development
metadata:
  template: standard-feature
  estimatedDuration: 45m
  requiredAgents: [product-manager, tech-lead, frontend-dev, backend-dev]

phases:
  - name: planning
    agents: [product-manager, tech-lead]
    parallel: false
    timeout: 15m
    inputs:
      - githubIssue
      - projectContext
    outputs:
      - requirements
      - technicalSpec

  - name: design
    agents: [ux-designer, frontend-lead]
    parallel: true
    timeout: 20m
    inputs:
      - requirements
    outputs:
      - mockups
      - componentSpec

  - name: implementation
    agents: [frontend-*, backend-*, database-*]
    parallel: true
    timeout: 60m
    inputs:
      - technicalSpec
      - mockups
    outputs:
      - code
      - tests

  - name: review
    agents: [code-reviewer, security-auditor]
    parallel: true
    timeout: 30m
    inputs:
      - code
    outputs:
      - reviewComments
      - approval

transitions:
  - from: planning
    to: design
    condition: "approval == true"

  - from: design
    to: implementation
    condition: "mockups_complete == true"

  - from: implementation
    to: review
    condition: "tests_passing == true"

escalations:
  - condition: "loop_detected"
    action: notify_user

  - condition: "agent_stuck > 5m"
    action: reassign_task

  - condition: "phase_timeout"
    action: escalate_to_manager
```

## Communication Protocols

### 1. Agent-to-Broker (HTTP/REST)

**Registration**
```http
POST /agents/register
Content-Type: application/json

{
  "agentId": "frontend-mary",
  "type": "claude-code",
  "metadata": {
    "cwd": "/Users/dev/project",
    "capabilities": ["react", "typescript"],
    "paneId": "dev:0"
  }
}
```

**Send Message**
```http
POST /agents/backend-bob/send
Content-Type: application/json

{
  "ticketId": "uuid-here",
  "payload": "Please implement user preferences endpoint",
  "metadata": {
    "origin": "frontend-mary",
    "threadId": "feature-45",
    "priority": 1
  },
  "expectReply": true,
  "timeoutMs": 30000
}
```

**Poll for Messages**
```http
GET /agents/frontend-mary/tickets/pending

Response:
[
  {
    "ticketId": "uuid-123",
    "payload": "API endpoint ready at /api/preferences",
    "metadata": {
      "origin": "backend-bob",
      "threadId": "feature-45"
    }
  }
]
```

### 2. Broker-to-UI (WebSocket)

**Client → Server**
```javascript
// Subscribe to updates
{
  type: "subscribe",
  channels: ["agent-status", "thread-updates", "escalations"]
}

// Start workflow
{
  type: "workflow.start",
  template: "feature-team",
  params: {
    githubIssue: 123,
    agents: ["pm", "frontend", "backend"]
  }
}

// Direct message
{
  type: "message.send",
  from: "user",
  to: "frontend-mary",
  payload: "Please add loading state"
}
```

**Server → Client**
```javascript
// Agent status update
{
  type: "agent.status",
  agentId: "backend-bob",
  status: "busy",
  currentTask: "Implementing API"
}

// New message in thread
{
  type: "thread.message",
  threadId: "feature-45",
  message: {
    from: "frontend-mary",
    payload: "Component ready",
    timestamp: "2024-01-17T10:30:00Z"
  }
}

// Escalation alert
{
  type: "escalation",
  severity: "warning",
  reason: "loop-detected",
  agents: ["backend-bob", "frontend-mary"],
  messageCount: 8,
  duration: "2m"
}
```

### 3. MCP Tools (Agent-Bridge)

```javascript
// Send message to another agent
await mcp.send_message({
  agentId: "backend-bob",
  payload: "Please implement user preferences endpoint",
  metadata: {
    origin: "frontend-mary",
    threadId: "feature-45"
  },
  awaitResponse: true,
  timeoutMs: 30000
})

// Get thread history
await mcp.get_thread_history({
  threadId: "feature-45",
  limit: 50,
  includeMetadata: true
})

// List available agents
await mcp.co_workers()
// Returns: "Frontend: Mary (online), Backend: Bob (busy), ..."

// Post reply to existing ticket
await mcp.post_reply({
  ticketId: "uuid-123",
  payload: "Endpoint implemented at /api/preferences",
  metadata: { agent: "backend-bob" }
})
```

## Database Schema (SQLite)

```sql
-- Agents table
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  role TEXT,
  domain TEXT,
  status TEXT DEFAULT 'offline',
  capabilities JSON,
  context_paths JSON,
  starting_prompt TEXT,
  tmux_session TEXT,
  tmux_pane INTEGER,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat TIMESTAMP
);

-- Threads table
CREATE TABLE threads (
  thread_id TEXT PRIMARY KEY,
  title TEXT,
  participants JSON,
  status TEXT DEFAULT 'active',
  workflow_id TEXT,
  github_issue INTEGER,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT,
  ticket_id TEXT,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  payload TEXT NOT NULL,
  metadata JSON,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id),
  FOREIGN KEY (from_agent) REFERENCES agents(agent_id),
  FOREIGN KEY (to_agent) REFERENCES agents(agent_id)
);

-- Tickets table
CREATE TABLE tickets (
  ticket_id TEXT PRIMARY KEY,
  target_agent TEXT NOT NULL,
  payload TEXT NOT NULL,
  metadata JSON,
  status TEXT DEFAULT 'pending',
  expect_reply BOOLEAN DEFAULT true,
  timeout_ms INTEGER DEFAULT 30000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  response_payload TEXT,
  response_metadata JSON,
  responded_at TIMESTAMP,
  FOREIGN KEY (target_agent) REFERENCES agents(agent_id)
);

-- Workflows table
CREATE TABLE workflows (
  workflow_id TEXT PRIMARY KEY,
  template TEXT,
  github_issue INTEGER,
  current_phase TEXT,
  phases JSON,
  status TEXT DEFAULT 'running',
  metadata JSON,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Communication graph edges
CREATE TABLE communication_edges (
  edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  purpose TEXT,
  allowed_types JSON,
  bidirectional BOOLEAN DEFAULT true,
  rate_limit INTEGER,
  conditions JSON,
  FOREIGN KEY (from_agent) REFERENCES agents(agent_id),
  FOREIGN KEY (to_agent) REFERENCES agents(agent_id),
  UNIQUE(from_agent, to_agent, purpose)
);

-- Event log for analytics
CREATE TABLE events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  thread_id TEXT,
  workflow_id TEXT,
  payload JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Deployment Architecture

### Local Development Mode
```yaml
# docker-compose.yml
version: '3.8'

services:
  broker:
    build: ./agent-bridge-broker
    ports:
      - "5050:5050"  # HTTP API
      - "5051:5051"  # WebSocket
    volumes:
      - ./data:/app/data
    environment:
      - DATABASE_PATH=/app/data/agent-collab.db
      - NODE_ENV=development

  ui:
    build: ./observatory-ui
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_BROKER_URL=http://localhost:5050
      - REACT_APP_WS_URL=ws://localhost:5051

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  metrics:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

### Production Considerations

**Scaling Strategy:**
- Horizontal scaling of broker with Redis pub/sub
- Agent pooling to reuse tmux sessions
- Connection pooling for database
- CDN for UI static assets

**Security Hardening:**
- JWT authentication for all API calls
- TLS encryption for all communication
- Agent sandboxing with Docker/VMs
- Rate limiting per agent
- Audit logging of all operations

**Monitoring Stack:**
- Prometheus for metrics collection
- Grafana for visualization
- ELK stack for log aggregation
- Custom alerts for stuck agents/loops

## Performance Targets

- **Message Latency**: < 100ms broker processing
- **Agent Spawn Time**: < 5 seconds
- **Message Throughput**: 1000 msg/sec
- **Concurrent Agents**: 50+ per machine
- **UI Responsiveness**: < 200ms updates
- **Database Queries**: < 50ms p99
- **WebSocket Connections**: 1000+ concurrent

## Technology Stack

**Backend:**
- Node.js 20+ (broker, MCP server)
- Express.js (HTTP API)
- Socket.io (WebSocket)
- SQLite3 (persistence)
- Redis (caching, pub/sub)

**Frontend:**
- React 18+ or Vue 3+
- TypeScript
- React Flow (workflow builder)
- xterm.js (terminal viewer)
- TailwindCSS (styling)

**Infrastructure:**
- Docker & Docker Compose
- tmux (agent terminals)
- Bash (automation scripts)
- GitHub API (integration)

**AI Agents:**
- Claude Code (Anthropic)
- Droid (Factory)
- Codex (OpenAI) - planned
- Cursor - planned
- Aider - planned

## Architecture Principles

1. **Modularity**: Each component can be replaced/upgraded independently
2. **Extensibility**: Plugin architecture for new agent types
3. **Resilience**: Graceful degradation, automatic recovery
4. **Observability**: Comprehensive logging, metrics, tracing
5. **Security**: Defense in depth, least privilege
6. **Performance**: Async everything, minimal blocking
7. **Developer Experience**: Simple APIs, good documentation

---

*This architecture is designed to scale from a single developer on localhost to enterprise teams managing hundreds of agents.*