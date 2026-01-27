# Database Schema Reference

> **SQLite Database Documentation**
>
> **Database File:** `broker/src/db/kokino.db`
>
> Last Updated: 2026-01-26

---

## Overview

Kokino uses **SQLite** for all persistence with better-sqlite3 providing synchronous API.

**Why SQLite?**
- Localhost-first (zero-config, single file)
- Synchronous API (no async/await needed)
- Sufficient for single-machine orchestration
- ACID guarantees with WAL mode

**See Also:** [ADR-003: SQLite over Postgres](../design/ADR-003-sqlite.md)

---

## Core Tables

### agents
**Purpose:** Runtime agent instances (registered agents)

```sql
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  cwd TEXT,
  capabilities TEXT,          -- JSON array
  registered_at TEXT,
  last_seen TEXT,
  bootstrap_context TEXT,     -- Loaded context
  bootstrap_status TEXT DEFAULT 'pending'
);
```

**Indexes:**
```sql
CREATE INDEX idx_agents_last_seen ON agents(last_seen);
```

**Sample Row:**
```json
{
  "agent_id": "Alice",
  "cwd": "/workspace/frontend",
  "capabilities": "[\"code\",\"test\"]",
  "registered_at": "2026-01-26T12:00:00Z",
  "last_seen": "2026-01-26T12:05:00Z",
  "bootstrap_status": "completed"
}
```

---

### agent_configs
**Purpose:** Agent templates/configurations

```sql
CREATE TABLE agent_configs (
  id TEXT PRIMARY KEY,
  project_id TEXT,            -- 'global' or project ID
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
```

**Indexes:**
```sql
CREATE INDEX idx_agent_configs_project ON agent_configs(project_id);
CREATE INDEX idx_agent_configs_cli_type ON agent_configs(cli_type);
```

---

### tickets
**Purpose:** Message routing (store & forward)

```sql
CREATE TABLE tickets (
  ticket_id TEXT PRIMARY KEY,
  from_agent_id TEXT,
  to_agent_id TEXT,
  payload TEXT,
  metadata TEXT,              -- JSON
  status TEXT,                -- 'pending','delivered','responded','timeout'
  created_at TEXT,
  delivered_at TEXT,
  responded_at TEXT
);
```

**Indexes:**
```sql
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_to_agent ON tickets(to_agent_id, status);
```

---

### conversations
**Purpose:** Headless agent conversation history

```sql
CREATE TABLE conversations (
  conversation_id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(agent_id),
  status TEXT,                -- 'active','completed','error'
  started_at TEXT,
  ended_at TEXT,
  error_message TEXT
);
```

**Indexes:**
```sql
CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_conversations_status ON conversations(status);
```

---

### turns
**Purpose:** Individual messages within conversations

```sql
CREATE TABLE turns (
  turn_id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(conversation_id),
  role TEXT,                  -- 'user','assistant'
  content TEXT,
  turn_number INTEGER,
  created_at TEXT
);
```

**Indexes:**
```sql
CREATE INDEX idx_turns_conversation ON turns(conversation_id);
```

---

### teams
**Purpose:** Team configurations

```sql
CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  agent_configs TEXT,         -- JSON array of {agentId, configId}
  created_at TEXT,
  updated_at TEXT
);
```

---

### team_sessions
**Purpose:** Team execution tracking

```sql
CREATE TABLE team_sessions (
  session_id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams(team_id),
  status TEXT,                -- 'starting','running','stopped','error'
  started_at TEXT,
  stopped_at TEXT,
  agent_sessions TEXT         -- JSON: {agentId: sessionDetails}
);
```

---

### bootstrap_history
**Purpose:** Bootstrap execution log

```sql
CREATE TABLE bootstrap_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(agent_id),
  mode TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  success BOOLEAN,
  files_loaded TEXT,          -- JSON array
  context_size INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TEXT
);
```

---

### compaction_metrics
**Purpose:** Claude Code context compaction monitoring

```sql
CREATE TABLE compaction_metrics (
  agent_id TEXT REFERENCES agents(agent_id),
  conversation_turns INTEGER,
  total_tokens INTEGER,
  error_count INTEGER,
  detected_at TEXT
);
```

---

## Common Queries

### Get Active Agents
```sql
SELECT * FROM agents
WHERE datetime(last_seen) > datetime('now', '-5 minutes')
ORDER BY last_seen DESC;
```

### Get Pending Tickets for Agent
```sql
SELECT * FROM tickets
WHERE to_agent_id = 'Alice'
  AND status = 'pending'
ORDER BY created_at ASC;
```

### Get Agent Conversations
```sql
SELECT c.*, COUNT(t.turn_id) as turn_count
FROM conversations c
LEFT JOIN turns t ON c.conversation_id = t.conversation_id
WHERE c.agent_id = 'Alice'
GROUP BY c.conversation_id
ORDER BY c.started_at DESC;
```

### Check Compaction Status
```sql
SELECT agent_id, conversation_turns, total_tokens
FROM compaction_metrics
WHERE conversation_turns > 50
  OR total_tokens > 100000
ORDER BY detected_at DESC;
```

---

## Migrations

**Location:** `broker/src/db/migrations/`

**Naming:** `NNN_description.sql` (e.g., `001_initial_schema.sql`)

**Execution:** Auto-run on broker startup

### Creating a Migration
1. Create file: `broker/src/db/migrations/011_add_new_table.sql`
2. Write SQL:
```sql
CREATE TABLE my_new_table (
  id TEXT PRIMARY KEY,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```
3. Restart broker (auto-applies)
4. Update this doc with new table

---

## Maintenance

### Vacuum Database
```bash
sqlite3 broker/src/db/kokino.db "VACUUM;"
```

### Check Database Size
```bash
ls -lh broker/src/db/kokino.db
```

### Backup Database
```bash
cp broker/src/db/kokino.db broker/src/db/kokino-backup-$(date +%Y%m%d).db
```

### Inspect Tables
```bash
sqlite3 broker/src/db/kokino.db
> .tables
> .schema agents
> SELECT * FROM agents;
```

---

## Performance Considerations

### WAL Mode
SQLite runs in WAL (Write-Ahead Logging) mode for better concurrency.

### Indexes
All frequently queried columns have indexes (see table definitions above).

### JSON Columns
JSON stored as TEXT. Query with `json_extract()`:
```sql
SELECT agent_id, json_extract(capabilities, '$[0]') as first_cap
FROM agents;
```

### Connection Pooling
Not needed - single SQLite file, synchronous API.

---

## Troubleshooting

### Database Locked
**Cause:** Another process has exclusive lock

**Fix:** Close other connections or wait

### Integrity Check
```bash
sqlite3 broker/src/db/kokino.db "PRAGMA integrity_check;"
```

### Orphaned Data
Use integrity check endpoint:
```bash
curl http://127.0.0.1:5050/api/integrity/check | jq
```

---

## Related Documentation

- [API Reference](API.md) - Database-backed endpoints
- [Broker Module](../../broker/CLAUDE.md) - Implementation details
- [Operations](../ops/SESSION-MANAGEMENT.md) - Production troubleshooting
