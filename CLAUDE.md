# Kokino - Multi-Agent Orchestration Platform

> **Root-Level Context for AI Agents**
>
> Last Updated: 2026-01-26

## What Is Kokino?

Kokino is a **localhost-first platform for orchestrating teams of AI coding agents** (Claude Code, Codex, Gemini) that work together on software development tasks. Think of it as a visual IDE for managing AI agent teams.

**Core Value Prop:** Instead of manually copy/pasting between terminal windows to coordinate multiple AI agents, Kokino provides a message broker, visual canvas, and team orchestration system.

---

## Quick Orientation (30 seconds)

```
kokino/
├── broker/       # Node.js message broker (SQLite + WebSocket)
├── ui/           # React frontend (React Flow canvas + Zustand state)
├── mcp/          # MCP server for agent-to-agent messaging
├── scripts/      # Diagnostic & automation scripts
└── docs/         # Documentation (you are here)
```

**Tech Stack:** Node.js 20+, React 19, SQLite3, React Flow, Zustand, Vite

**Current Status:** Phase 6 (Monitoring) in progress. Core features complete and working.

---

## What's Implemented RIGHT NOW

✅ **Agent Communication**
- Message broker with store-and-forward routing
- Dual-mode: Tmux (legacy) + Headless (modern) CLI execution
- MCP server (`agent-bridge`) for inter-agent messaging
- SQLite persistence for tickets, conversations, agents

✅ **Agent Management**
- Agent configuration CRUD (global + project-specific)
- Bootstrap system (auto-load CLAUDE.md, context files)
- Team lifecycle (start/stop agents as units)
- Session management with locks & cancellation

✅ **UI**
- React Flow canvas for visual team building
- Real-time agent status monitoring
- Zustand state management (83% reduction in Canvas.jsx size!)
- GitHub OAuth integration

✅ **Operations**
- Telemetry & SLO tracking
- Circuit breakers for reliability
- Shadow mode testing (tmux vs headless validation)
- Comprehensive operational runbooks

---

## Project Structure Deep Dive

### broker/ - Message Broker Service
**Purpose:** Central hub for agent-to-agent communication

**Key Files:**
- `src/index.js` - Main server (HTTP + WebSocket)
- `src/models/` - AgentRegistry, TicketStore, Team
- `src/agents/AgentRunner.js` - Headless CLI execution
- `src/services/TeamRunner.js` - Team orchestration
- `src/services/MonitoringService.js` - Metrics collection
- `src/bootstrap/BootstrapManager.js` - Context loading
- `src/db/schema.js` - SQLite schema & migrations

**API:** REST + WebSocket on `http://127.0.0.1:5050`

**See:** `broker/CLAUDE.md` for module-specific details

### ui/ - React Frontend
**Purpose:** Visual interface for agent orchestration

**Key Files:**
- `src/pages/Canvas.jsx` - Main orchestration UI (262 lines, down from 1547!)
- `src/stores/useAgentStore.js` - Agent state (Zustand)
- `src/stores/useUIStore.js` - UI state (Zustand)
- `src/services/api/` - API client services
- `src/components/agents/` - Agent management components

**Dev Server:** `npm run dev` → `http://localhost:5173`

**See:** `ui/CLAUDE.md` for module-specific details

### mcp/ - Model Context Protocol Server
**Purpose:** Expose agent-bridge tools for inter-agent messaging

**Key Tools:**
- `send_message(agentId, payload, metadata)` - Send message to agent
- `co_workers()` - List online agents
- `await_reply(ticketId)` - Wait for response

**See:** `mcp/CLAUDE.md` for module-specific details

---

## Database Schema Overview

**Core Tables:**
- `agents` - Runtime agent instances (registrations, heartbeats)
- `agent_configs` - Agent templates (name, role, systemPrompt, bootstrapMode)
- `tickets` - Message routing (store-and-forward)
- `conversations` - Headless agent conversation history
- `turns` - Individual messages within conversations
- `teams` - Team configurations
- `team_sessions` - Team execution tracking
- `bootstrap_history` - Bootstrap execution log
- `compaction_metrics` - Context compaction monitoring

**See:** `docs/reference/DATABASE.md` for full schema

---

## Common Development Tasks

### Start the System
```bash
# Terminal 1: Start broker
cd broker
npm install
npm start  # → http://127.0.0.1:5050

# Terminal 2: Start UI
cd ui
npm install
npm run dev  # → http://localhost:5173
```

### Run Tests
```bash
# Broker tests
cd broker
npm test

# UI tests
cd ui
npm test

# Integration tests
cd broker
npm run test:integration
```

### Add a New Agent Configuration
1. Use UI: Canvas → "Create Agent" dialog
2. Or via API: `POST /api/agents` (see docs/reference/API.md)
3. Configure bootstrap mode: `none`, `auto`, `manual`, or `custom`

### Debug Agent Communication
1. Check broker logs: `broker/broker.log`
2. Inspect database: `broker/src/db/kokino.db` (use sqlite3 CLI)
3. Use MCP tools: `co_workers()` to see online agents
4. Check tickets: `GET /agents/:id/tickets/pending`

### Add a Database Migration
1. Create file: `broker/src/db/migrations/NNN_description.sql`
2. Write SQL: `CREATE TABLE ...` or `ALTER TABLE ...`
3. Run migrations: Broker auto-runs on startup
4. Update `docs/reference/DATABASE.md`

---

## Architecture Decisions

### Why Dual-Mode (Tmux + Headless)?
**Decision:** Support both tmux terminal injection AND headless CLI subprocesses

**Rationale:**
- Gradual migration path from tmux → headless
- Production fallback during headless degradation
- Shadow mode testing validates reliability before tmux deprecation

**See:** `docs/design/ADR-001-dual-mode.md`

### Why Zustand Over Redux?
**Decision:** Use Zustand for React state management

**Rationale:**
- Simpler API (less boilerplate)
- Better TypeScript support
- Redux DevTools integration still available
- Canvas.jsx reduced from 1547 → 262 lines

**See:** `docs/design/ADR-002-zustand.md`

### Why SQLite Over Postgres?
**Decision:** Use SQLite for persistence

**Rationale:**
- Localhost-first philosophy (no server required)
- Simpler deployment (single file database)
- Better-sqlite3 provides synchronous API
- Sufficient for single-machine orchestration

**See:** `docs/design/ADR-003-sqlite.md`

---

## Documentation Navigation

### Quick Start (New Contributors)
📖 **Start here:** `docs/guides/QUICK_START.md` - Get productive in 30 minutes

### Reference Documentation (Current Implementation)
- 📚 `docs/reference/ARCHITECTURE.md` - System design & component interaction
- 📚 `docs/reference/API.md` - REST API reference (consolidated)
- 📚 `docs/reference/DATABASE.md` - Schema, tables, migrations
- 📚 `docs/reference/TECH_STACK.md` - Dependencies, versions, rationale
- 📚 `docs/reference/CONVENTIONS.md` - Code style, Git workflow, testing

### Guides (How-To)
- 🛠️ `docs/guides/DEVELOPMENT.md` - Local dev environment, debugging
- 🛠️ `docs/guides/TESTING.md` - Test patterns, fixtures, running tests
- 🛠️ `docs/guides/DEPLOYMENT.md` - Production deployment
- 🛠️ `docs/guides/CONTRIBUTING.md` - PR process, code review

### Operations (Production)
- 🚨 `docs/ops/ALERT-PLAYBOOKS.md` - Production incident response
- 🚨 `docs/ops/ENVIRONMENT-TROUBLESHOOTING.md` - Common issues & fixes
- 🚨 `docs/ops/SESSION-MANAGEMENT.md` - Reset stuck sessions
- 🚨 `docs/ops/SHADOW-MODE-ANALYSIS.md` - Debug tmux vs headless divergence

### Planning (Future Work & History)
- 🗺️ `docs/planning/ROADMAP.md` - Future features & timeline
- 🗺️ `docs/planning/HEADLESS_MIGRATION.md` - Tmux deprecation plan
- 🗺️ `docs/planning/specs/` - Feature specifications ([IMPLEMENTED] or [PLANNED])
- 🗺️ `docs/planning/archive/` - Historical design docs, brainstorms, completed phases

### Design (Decisions & Patterns)
- 🎨 `docs/design/` - Architecture Decision Records (ADRs)
- 🎨 `docs/design/UI_PATTERNS.md` - React component patterns

---

## Git Workflow (Graphite)

Kokino uses **Graphite** for stacked pull requests.

**Common Commands:**
```bash
# Create new feature branch
gt create feature-name

# Submit PR
gt submit

# Submit entire stack
gt submit --stack

# Sync with remote after merges
gt sync

# View branch stack
gt log

# Restack after conflicts
gt restack
```

**IMPORTANT:** Never use "Squash and merge" on stacked PRs! Use "Rebase and merge" or merge via Graphite UI.

**See:** Workspace-level `../CLAUDE.md` for full Graphite workflow

---

## Testing Conventions

### Broker Tests
- **Unit tests:** `broker/tests/unit/`
- **Integration tests:** `broker/tests/integration/`
- **Fixtures:** `broker/tests/fixtures/`
- **Run:** `npm test` or `npm run test:integration`

### UI Tests
- **Component tests:** Vitest + Testing Library
- **Run:** `npm test`
- **Coverage:** `npm run test:coverage`

### Manual Testing
- **MCP tools:** See `docs/ops/MCP_TESTING.md`
- **End-to-end:** Start broker + UI, create agent, send message

---

## Common Gotchas

### 1. Always Use 127.0.0.1 (Not localhost)
**Why:** WebSocket stability on macOS. IPv4 enforcement is critical.

**Fix:** All URLs use `127.0.0.1:5050`, not `localhost:5050`

### 2. Broker Must Start Before UI
**Why:** UI expects broker at `http://127.0.0.1:5050` on load

**Fix:** Always start broker first, wait 2 seconds, then start UI

### 3. Agent-Bridge MCP Configuration
**Why:** Agents need MCP server configured in `.claude/mcp.json`

**Fix:** See `mcp/CLAUDE.md` for correct configuration

### 4. Compaction Monitoring Alerts
**Why:** Claude Code compacts context after many turns, causing confusion

**Fix:** Agents auto-bootstrap on spawn with fresh context. Monitor `compaction_metrics` table.

### 5. Shadow Mode Requires Separate Tmux Agents
**Why:** Shadow mode runs tmux + headless in parallel for comparison

**Fix:** Use `commMode: 'shadow'` only for testing, not production

---

## Key Files to Read First

**Understanding Kokino (15 min):**
1. This file (`CLAUDE.md`) ✅ You are here
2. `docs/guides/QUICK_START.md` - Practical walkthrough
3. `docs/reference/ARCHITECTURE.md` - System design
4. Module-specific `CLAUDE.md` files (broker/, ui/, mcp/)

**Before Contributing (30 min):**
1. `docs/reference/CONVENTIONS.md` - Code style & Git workflow
2. `docs/guides/DEVELOPMENT.md` - Local setup
3. `docs/guides/TESTING.md` - Test patterns
4. `docs/guides/CONTRIBUTING.md` - PR process

**Before Debugging Production (20 min):**
1. `docs/ops/ALERT-PLAYBOOKS.md` - Incident response
2. `docs/ops/ENVIRONMENT-TROUBLESHOOTING.md` - Common fixes
3. `docs/reference/API.md` - Diagnostic endpoints

---

## Getting Help

### Documentation Issues
- Missing info? Check `docs/README.md` for navigation
- Outdated docs? File an issue or update directly (docs are code!)

### Technical Questions
- Check GitHub Issues (search closed issues too)
- Consult operational runbooks in `docs/ops/`
- Review Architecture Decision Records in `docs/design/`

### Contributing
- See `docs/guides/CONTRIBUTING.md` for PR workflow
- Check `docs/planning/ROADMAP.md` for upcoming work
- Prefer small, focused PRs over large rewrites

---

## Module-Specific Context

For deeper module-specific information, see:
- **Broker:** `broker/CLAUDE.md` - API endpoints, database, agents
- **UI:** `ui/CLAUDE.md` - Components, state management, styling
- **MCP:** `mcp/CLAUDE.md` - Tools, configuration, building

---

## Philosophy

**"Mock it before you plumb it"** - UI-first validation of orchestration models before building complex infrastructure.

**Localhost-first** - Privacy, no cloud dependencies, no rate limits, full control.

**AI agents building Kokino** - Our documentation is optimized for both humans and AI agents. If agents can't understand it, neither can we.

---

**Welcome to Kokino! 🎨**

*For questions about this file or documentation structure, see `docs/README.md` or file an issue.*
