# ADR-003: SQLite over PostgreSQL

**Status:** Active  
**Date:** 2026-01-26  
**Deciders:** Core team  
**Context:** Database selection for Kokino

---

## Context and Problem Statement

Kokino needs persistent storage for agents, messages, teams, conversations, and monitoring data. We need a database that:
- Works localhost-first (zero external dependencies)
- Provides ACID guarantees
- Supports the scale we need (1-100 agents)
- Is easy to deploy and manage

---

## Decision Drivers

- **Localhost-first philosophy:** Should work without external services
- **Zero configuration:** No database server to install/configure
- **Single-machine scope:** Kokino orchestrates agents on one machine
- **Simplicity:** Easy backup, migration, debugging
- **Developer experience:** Fast setup for new contributors

---

## Considered Options

### Option 1: PostgreSQL
**Pros:**
- Industry standard
- Powerful features (JSON, full-text search, extensions)
- Excellent performance at scale
- Great tooling

**Cons:**
- **Requires server:** Must install and configure Postgres
- **Complexity:** Connection pooling, migrations, backups more complex
- **Overkill:** Kokino doesn't need distributed database features
- **Barrier to entry:** New contributors must install Postgres

### Option 2: MongoDB
**Pros:**
- Schema-less (flexible documents)
- JSON-native

**Cons:**
- **Requires server:** mongod must be running
- **Not ACID by default:** Eventual consistency issues
- **Inappropriate:** We have relational data (agents ← → tickets ← → replies)

### Option 3: SQLite (CHOSEN)
**Pros:**
- **Zero configuration:** Single file database
- **Localhost-first:** No server required
- **Simple backups:** `cp kokino.db backup.db`
- **Fast:** Sufficient for 1-100 agents
- **ACID guarantees:** Full transaction support
- **Synchronous API:** No async/await needed (with better-sqlite3)
- **Easy debugging:** `sqlite3 kokino.db` to inspect

**Cons:**
- **Single machine only:** Can't distribute across servers (acceptable - Kokino is localhost-first)
- **Single writer:** WAL mode mitigates this
- **Fewer features:** No advanced Postgres features (we don't need them)

---

## Decision Outcome

**Chosen option:** SQLite with better-sqlite3

### Implementation

**Database Setup:**
```javascript
import Database from 'better-sqlite3';

const db = new Database('kokino.db', { verbose: console.log });
db.pragma('journal_mode = WAL');  // Enable Write-Ahead Logging
```

**Migrations:** Auto-run on startup from `src/db/migrations/`

**Schema:**
- `agents` - Runtime agent instances
- `agent_configs` - Agent templates
- `tickets` - Message routing
- `conversations` - Headless agent conversations
- `turns` - Individual messages within conversations
- `teams` - Team configurations
- `bootstrap_history` - Bootstrap execution log
- `compaction_metrics` - Context compaction monitoring

**See:** `docs/reference/DATABASE.md` for complete schema

---

## Consequences

### Positive

- **Fast setup:** `npm install` → done (no DB server)
- **Simple backups:** Copy single file
- **Easy debugging:** `sqlite3 kokino.db; SELECT * FROM agents;`
- **Synchronous API:** Simpler code, no async/await for DB operations
- **Portability:** Move entire database by copying one file
- **No network issues:** All local, no connection errors

### Negative

- **Single machine limit:** Can't scale to distributed deployment (acceptable - not our use case)
- **Concurrent writes:** Only one writer at a time (WAL mode reduces contention)
- **Migration from SQLite hard:** If we ever need Postgres, migration required (unlikely)

### Neutral

- **Performance:** Sufficient for 1-100 agents, might need reevaluation at 1000+ (not current requirement)

---

## Performance Characteristics

**Benchmarks:**
- Message acknowledgment: <5ms
- Agent lookup: <1ms
- Pending tickets query: <10ms (with index)
- Bootstrap history: <20ms

**Optimizations:**
- WAL mode for better concurrency
- Indexes on frequently queried columns
- Prepared statements (better-sqlite3)

**Indexes:**
```sql
CREATE INDEX idx_agents_last_seen ON agents(last_seen);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_to_agent ON tickets(to_agent_id, status);
```

---

## Validation

### Success Metrics

**Performance:** All queries <20ms (Target: <10ms for critical paths)  
**Reliability:** Zero database corruption issues  
**Developer Experience:** 100% of contributors set up in <5 minutes

**Current Status:**
- 0 reported database issues
- 100% test coverage on database layer
- Average query time: 3ms

---

## When to Reevaluate

**Consider Postgres if:**
- Kokino needs to orchestrate agents across multiple machines
- Agent count exceeds 1000 regularly
- Need advanced features (full-text search, geospatial, extensions)
- Team wants distributed deployment

**Current stance:** SQLite is perfect for localhost-first use case

---

## Related

- **Implementation:** `broker/src/db/schema.js`
- **Documentation:** `docs/reference/DATABASE.md`
- **Migrations:** `broker/src/db/migrations/`

---

## Notes

**Backup Strategy:**
```bash
# Manual backup
cp broker/src/db/kokino.db kokino-backup-$(date +%Y%m%d).db

# Automated backup (cron)
0 2 * * * cp /path/to/kokino.db /backups/kokino-$(date +\%Y\%m\%d).db
```

**Inspect Database:**
```bash
sqlite3 broker/src/db/kokino.db
> .tables
> .schema agents
> SELECT * FROM agents WHERE status = 'ready';
```

**Database Maintenance:**
```bash
# Vacuum (reclaim space)
sqlite3 kokino.db "VACUUM;"

# Integrity check
sqlite3 kokino.db "PRAGMA integrity_check;"
```
