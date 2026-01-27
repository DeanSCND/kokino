# Broker Module - Message Routing Service

> **Module-Specific Context for AI Agents Working in broker/**
>
> Last Updated: 2026-01-26

## What This Module Does

The **broker** is a Node.js service that provides centralized message routing for agent-to-agent communication with dual-mode execution (tmux + headless).

**Core Responsibilities:**
- Store-and-forward message routing between agents
- Agent registration and heartbeat tracking
- Dual-mode agent execution (tmux terminal injection + headless CLI subprocesses)
- Team orchestration (start/stop multiple agents as units)
- Context bootstrap (auto-load CLAUDE.md and project files)
- Performance telemetry and circuit breakers
- SQLite persistence for all state

---

## Architecture Overview

```
broker/
├── src/
│   ├── index.js              # Main entry point (HTTP + WebSocket server)
│   ├── models/               # Data models
│   │   ├── AgentRegistry.js  # Agent registration & lifecycle
│   │   ├── TicketStore.js    # Message routing & correlation
│   │   ├── Team.js           # Team configuration model
│   │   └── AgentConfig.js    # Agent template model
│   ├── agents/               # Agent execution
│   │   ├── AgentRunner.js    # Headless CLI execution
│   │   ├── ProcessManager.js # Tmux terminal injection (legacy)
│   │   ├── AgentSessionManager.js # Session locks & cancellation
│   │   ├── CircuitBreaker.js # Failure protection
│   │   ├── ShadowModeController.js # Dual-mode testing
│   │   └── EnvironmentDoctor.js # Pre-flight environment checks
│   ├── services/             # Business logic
│   │   ├── TeamRunner.js     # Team orchestration
│   │   ├── MonitoringService.js # Metrics collection
│   │   └── ConversationLogReader.js # Read agent conversations
│   ├── bootstrap/            # Context loading
│   │   ├── BootstrapManager.js # Orchestrates bootstrap process
│   │   ├── FileLoader.js     # Load files from disk
│   │   ├── CompactionMonitor.js # Detect context compaction
│   │   └── BootstrapModes.js # Bootstrap mode definitions
│   ├── db/                   # Database layer
│   │   ├── schema.js         # SQLite schema definition
│   │   ├── migrations/       # SQL migration files
│   │   ├── AgentRepository.js
│   │   ├── TicketRepository.js
│   │   ├── ConversationStore.js
│   │   └── MessageRepository.js
│   ├── api/                  # API layer
│   │   └── routes/           # HTTP route handlers
│   ├── routes/               # Additional route handlers
│   ├── telemetry/            # Monitoring & metrics
│   └── utils/                # Utilities
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test data
└── package.json
```

---

## Key Concepts

### 1. Store-and-Forward Messaging
**Pattern:** Messages are immediately acknowledged (<20ms) and delivered in background

**Flow:**
1. Agent A calls `POST /agents/B/send` with message
2. Broker creates ticket, returns ticketId instantly
3. Broker stores ticket in SQLite
4. Agent B polls `GET /agents/B/tickets/pending`
5. Agent B responds via `POST /replies`
6. Broker correlates response to original ticket

**Why:** Allows offline agents to receive messages when they come online

### 2. Dual-Mode Agent Execution
**Modes:**
- **tmux** (legacy): Inject commands via tmux buffer, poll for output
- **headless** (modern): Spawn CLI as subprocess, stream JSONL output
- **shadow**: Run both in parallel for reliability validation

**Configuration:**
```json
{
  "commMode": "headless",  // or "tmux" or "shadow"
  "cliType": "claude-code"
}
```

**See:** `src/agents/AgentRunner.js` (headless) and `src/utils/spawn-agent.js` (tmux)

### 3. Bootstrap System
**Purpose:** Load project context on agent startup to avoid Claude Code compaction issues

**Modes:**
- `none` - No context loading
- `auto` - Auto-load CLAUDE.md, .kokino/context.md
- `manual` - Wait for explicit bootstrap API call
- `custom` - Run custom bootstrap script

**Implementation:** `src/bootstrap/BootstrapManager.js`

### 4. Team Orchestration
**Concept:** Start/stop multiple agents as a coordinated unit

**Example:**
```json
{
  "teamId": "feature-team-1",
  "name": "Feature Implementation Team",
  "agents": [
    {"agentId": "architect", "configId": "config-123"},
    {"agentId": "developer", "configId": "config-456"},
    {"agentId": "reviewer", "configId": "config-789"}
  ]
}
```

**Implementation:** `src/services/TeamRunner.js`

---

## API Endpoints

### Agent Management
```http
GET /agents                          # List all agents
POST /agents/register                # Register new agent
DELETE /agents/:agentId              # Unregister agent
POST /agents/:agentId/heartbeat      # Send heartbeat
```

### Messaging
```http
POST /agents/:agentId/send           # Send message to agent
GET /agents/:agentId/tickets/pending # Poll for pending messages
POST /replies                        # Reply to ticket
GET /tickets/:ticketId               # Get ticket status
```

### Agent Execution (Headless)
```http
POST /agents/:agentId/execute        # Execute agent with prompt
POST /agents/:agentId/execute/cancel # Cancel execution
POST /agents/:agentId/end-session    # End agent session
GET /agents/sessions/status          # View all sessions
```

### Bootstrap
```http
POST /api/agents/:agentId/bootstrap  # Manually bootstrap agent
GET /api/agents/:agentId/bootstrap/history # Bootstrap history
```

### Team Management
```http
GET /api/teams                       # List teams
POST /api/teams                      # Create team
GET /api/teams/:teamId               # Get team details
PUT /api/teams/:teamId               # Update team
DELETE /api/teams/:teamId            # Delete team
POST /api/teams/:teamId/start        # Start all agents in team
POST /api/teams/:teamId/stop         # Stop all agents in team
GET /api/teams/:teamId/status        # Get team status
```

### Monitoring & Health
```http
GET /health                          # Broker health check
GET /metrics                         # Prometheus metrics
GET /api/slo/status                  # SLI/SLO tracking
GET /api/health/environment          # Environment doctor checks
GET /api/integrity/check             # Data consistency check
GET /api/shadow-mode/metrics         # Shadow mode validation metrics
```

### Fallback Control
```http
GET /api/fallback/status             # View fallback overrides
POST /api/fallback/cli/disable       # Force CLI to tmux mode
POST /api/fallback/cli/enable        # Re-enable headless mode
```

**Full API documentation:** `../docs/reference/API.md`

---

## Database Schema

### Core Tables
```sql
-- Runtime agent instances
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  cwd TEXT,
  capabilities TEXT,  -- JSON array
  registered_at TEXT,
  last_seen TEXT,
  bootstrap_context TEXT,
  bootstrap_status TEXT DEFAULT 'pending'
);

-- Agent configuration templates
CREATE TABLE agent_configs (
  id TEXT PRIMARY KEY,
  project_id TEXT,  -- 'global' or project ID
  name TEXT NOT NULL,
  role TEXT,
  system_prompt TEXT,
  cli_type TEXT DEFAULT 'claude-code',
  comm_mode TEXT DEFAULT 'headless',
  bootstrap_mode TEXT DEFAULT 'auto',
  working_directory TEXT,
  last_bootstrap TEXT,
  bootstrap_count INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- Message routing
CREATE TABLE tickets (
  ticket_id TEXT PRIMARY KEY,
  from_agent_id TEXT,
  to_agent_id TEXT,
  payload TEXT,
  metadata TEXT,  -- JSON
  status TEXT,  -- 'pending', 'delivered', 'responded', 'timeout'
  created_at TEXT,
  delivered_at TEXT,
  responded_at TEXT
);

-- Headless agent conversations
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(agent_id),
  status TEXT,  -- 'active', 'completed', 'error'
  started_at TEXT,
  ended_at TEXT,
  error_message TEXT
);

CREATE TABLE turns (
  turn_id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(conversation_id),
  role TEXT,  -- 'user', 'assistant'
  content TEXT,
  turn_number INTEGER,
  created_at TEXT
);

-- Team management
CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  agent_configs TEXT,  -- JSON array of {agentId, configId}
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE team_sessions (
  session_id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams(team_id),
  status TEXT,  -- 'starting', 'running', 'stopped', 'error'
  started_at TEXT,
  stopped_at TEXT,
  agent_sessions TEXT  -- JSON: {agentId: sessionDetails}
);

-- Bootstrap tracking
CREATE TABLE bootstrap_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(agent_id),
  mode TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  success BOOLEAN,
  files_loaded TEXT,  -- JSON array
  context_size INTEGER,
  duration_ms INTEGER,
  error_message TEXT
);

-- Monitoring
CREATE TABLE compaction_metrics (
  agent_id TEXT REFERENCES agents(agent_id),
  conversation_turns INTEGER,
  total_tokens INTEGER,
  error_count INTEGER,
  detected_at TEXT
);
```

**Full schema:** `src/db/schema.js` and `src/db/migrations/`

**See:** `../docs/reference/DATABASE.md` for complete documentation

---

## Development Workflow

### Starting the Broker
```bash
cd broker
npm install
npm start  # → http://127.0.0.1:5050
```

### Running Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Debugging
```bash
# Enable debug logging
DEBUG=kokino:* npm start

# Check logs
tail -f broker.log

# Inspect database
sqlite3 src/db/kokino.db
> SELECT * FROM agents;
> SELECT * FROM tickets WHERE status = 'pending';
```

### Common Tasks

#### Add a New API Endpoint
1. Create route handler in `src/routes/` or `src/api/routes/`
2. Import and register in `src/index.js`
3. Update `../docs/reference/API.md`
4. Write tests in `tests/integration/`

#### Add a Database Migration
1. Create `src/db/migrations/NNN_description.sql`
2. Write SQL (CREATE, ALTER, etc.)
3. Migrations auto-run on broker startup
4. Update `../docs/reference/DATABASE.md`

#### Add a New Agent Execution Mode
1. Implement executor class in `src/agents/`
2. Add mode to `src/agents/AgentSessionManager.js`
3. Update agent config schema in `src/models/AgentConfig.js`
4. Write tests with shadow mode validation

---

## Key Files Reference

### Entry Points
- **`src/index.js`** - Main server initialization, routes, WebSocket

### Data Models
- **`src/models/AgentRegistry.js`** - Agent registration, heartbeats, status
- **`src/models/TicketStore.js`** - Message routing and correlation
- **`src/models/Team.js`** - Team configuration CRUD
- **`src/models/AgentConfig.js`** - Agent template CRUD

### Agent Execution
- **`src/agents/AgentRunner.js`** - Headless CLI execution (spawn subprocess, parse JSONL)
- **`src/utils/spawn-agent.js`** - Tmux terminal injection (legacy)
- **`src/agents/AgentSessionManager.js`** - Session locks, concurrency control, cancellation
- **`src/agents/CircuitBreaker.js`** - Failure detection and auto-recovery
- **`src/agents/ShadowModeController.js`** - Dual-mode testing coordinator
- **`src/agents/EnvironmentDoctor.js`** - Pre-flight checks (binaries, auth, disk)

### Services
- **`src/services/TeamRunner.js`** - Start/stop teams, session management
- **`src/services/MonitoringService.js`** - Metrics collection, SLI/SLO tracking
- **`src/services/ConversationLogReader.js`** - Read agent conversation history

### Bootstrap
- **`src/bootstrap/BootstrapManager.js`** - Orchestrate context loading
- **`src/bootstrap/FileLoader.js`** - Load files from disk with error handling
- **`src/bootstrap/CompactionMonitor.js`** - Detect Claude Code context compaction
- **`src/bootstrap/BootstrapModes.js`** - Mode definitions (none/auto/manual/custom)

### Database
- **`src/db/schema.js`** - Complete SQLite schema
- **`src/db/migrations/`** - SQL migration files (auto-run on startup)
- **`src/db/*Repository.js`** - Database access layer

---

## Testing Strategy

### Unit Tests (`tests/unit/`)
- Test individual classes in isolation
- Mock dependencies (database, HTTP)
- Fast execution (<1s total)

**Example:**
```javascript
// tests/unit/AgentRegistry.test.js
describe('AgentRegistry', () => {
  it('should register agent', () => {
    const registry = new AgentRegistry(mockDb);
    const result = registry.register('Alice', '/workspace', ['code']);
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests (`tests/integration/`)
- Test real HTTP endpoints
- Use test database (`kokino.test.db`)
- Validate full request/response flow

**Example:**
```javascript
// tests/integration/agents.test.js
describe('POST /agents/register', () => {
  it('should register agent and return 200', async () => {
    const response = await fetch('http://127.0.0.1:5050/agents/register', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'Alice', cwd: '/workspace' })
    });
    expect(response.status).toBe(200);
  });
});
```

### Fixtures (`tests/fixtures/`)
- Sample JSONL outputs from CLI tools
- Mock agent configurations
- Sample conversation history

---

## Common Gotchas

### 1. Always Use 127.0.0.1 (Not localhost)
**Why:** WebSocket stability on macOS

**Code:**
```javascript
// ✅ Correct
const BROKER_URL = 'http://127.0.0.1:5050';

// ❌ Wrong
const BROKER_URL = 'http://localhost:5050';
```

### 2. Synchronous SQLite Operations
**Why:** better-sqlite3 provides sync API, avoid async/await

**Code:**
```javascript
// ✅ Correct
const agent = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);

// ❌ Wrong (no await needed)
const agent = await db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);
```

### 3. JSON Stringification for SQLite
**Why:** SQLite doesn't have native JSON type, store as TEXT

**Code:**
```javascript
// ✅ Correct
db.prepare('INSERT INTO agents (agent_id, capabilities) VALUES (?, ?)')
  .run(agentId, JSON.stringify(['code', 'test']));

// ❌ Wrong
db.prepare('INSERT INTO agents (agent_id, capabilities) VALUES (?, ?)')
  .run(agentId, ['code', 'test']); // Will stringify to "[object Object]"
```

### 4. Agent Session Locking
**Why:** Prevent concurrent executions from corrupting agent state

**Code:**
```javascript
// ✅ Correct - Check lock before executing
const session = sessionManager.getSession(agentId);
if (session && session.locked) {
  return res.status(409).json({ error: 'Agent is already executing' });
}

// ❌ Wrong - No lock check
await agentRunner.execute(agentId, prompt); // May conflict
```

### 5. Circuit Breaker States
**Why:** Prevent cascading failures when agent execution fails repeatedly

**States:**
- `closed` - Normal operation
- `open` - Blocking all requests (too many failures)
- `half-open` - Testing if recovery is possible

**Code:**
```javascript
// Check circuit breaker before execution
if (circuitBreaker.isOpen(agentId)) {
  return res.status(503).json({ error: 'Circuit breaker open' });
}
```

---

## Performance Considerations

### Message Acknowledgment
**Target:** <20ms to acknowledge message receipt

**Achieved by:**
- Immediate ticket creation (no I/O)
- Background delivery (don't wait for recipient)
- SQLite WAL mode for concurrent reads

### Agent Execution
**Target:** First response in <5s for headless mode

**Optimizations:**
- Pre-flight environment checks cached
- Subprocess reuse where possible
- JSONL streaming (no buffering)

### Database Queries
**Indexes:**
```sql
CREATE INDEX idx_agents_last_seen ON agents(last_seen);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_to_agent ON tickets(to_agent_id, status);
```

**Connection pooling:** Not needed (single SQLite file, synchronous)

---

## Operational Monitoring

### Health Checks
```bash
# Broker alive?
curl http://127.0.0.1:5050/health

# SLI/SLO status
curl http://127.0.0.1:5050/api/slo/status | jq

# Environment health
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq
```

### Metrics
```bash
# Prometheus format
curl http://127.0.0.1:5050/metrics

# Shadow mode validation
curl http://127.0.0.1:5050/api/shadow-mode/metrics | jq
```

### Troubleshooting
**See operational runbooks:**
- `../docs/ops/ALERT-PLAYBOOKS.md`
- `../docs/ops/ENVIRONMENT-TROUBLESHOOTING.md`
- `../docs/ops/SESSION-MANAGEMENT.md`
- `../docs/ops/SHADOW-MODE-ANALYSIS.md`

---

## Related Documentation

- **Root context:** `../CLAUDE.md` - Project-wide overview
- **API reference:** `../docs/reference/API.md` - Complete HTTP/WebSocket API
- **Database schema:** `../docs/reference/DATABASE.md` - Tables, migrations, queries
- **Operations:** `../docs/ops/` - Production troubleshooting guides
- **Architecture:** `../docs/reference/ARCHITECTURE.md` - System design

---

**For questions about broker implementation, check the runbooks or file an issue.**
