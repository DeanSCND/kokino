# Kokino Documentation Index

> **Complete Documentation Navigation**
>
> Last Updated: 2026-01-26

Welcome to the Kokino documentation! This index helps you find exactly what you need, whether you're a new contributor, experienced developer, or production operator.

---

## 🚀 Quick Start (New to Kokino?)

**Start here if you're new:**

1. **[Root CLAUDE.md](../CLAUDE.md)** - 5 min read for full project overview
2. **[Quick Start Guide](guides/QUICK_START.md)** - 30 min to get productive
3. **[Architecture Overview](reference/ARCHITECTURE.md)** - Understanding the system

**Module-specific onboarding:**
- [Broker Module](../broker/CLAUDE.md) - Backend message routing
- [UI Module](../ui/CLAUDE.md) - React frontend
- [MCP Module](../mcp/CLAUDE.md) - Agent-bridge tools

---

## 📚 Reference Documentation (Current Implementation)

> **"What is built RIGHT NOW?"**

These docs describe the **current state** of Kokino as implemented.

### System Design
- **[ARCHITECTURE.md](reference/ARCHITECTURE.md)** - System design, components, data flow
- **[TECH_STACK.md](reference/TECH_STACK.md)** - Dependencies, versions, technology choices

### API & Database
- **[API.md](reference/API.md)** - Complete REST + WebSocket API reference
- **[DATABASE.md](reference/DATABASE.md)** - SQLite schema, tables, migrations, queries

### Development Standards
- **[CONVENTIONS.md](reference/CONVENTIONS.md)** - Code style, Git workflow, testing patterns

---

## 🛠️ Guides (How-To)

> **"How do I actually DO things?"**

Practical step-by-step guides for common tasks.

### Getting Started
- **[QUICK_START.md](guides/QUICK_START.md)** - Get productive in 30 minutes
- **[DEVELOPMENT.md](guides/DEVELOPMENT.md)** - Local environment, debugging, tools
- **[TESTING.md](guides/TESTING.md)** - Test patterns, running tests, coverage

### Advanced
- **[DEPLOYMENT.md](guides/DEPLOYMENT.md)** - Production deployment steps
- **[CONTRIBUTING.md](guides/CONTRIBUTING.md)** - PR workflow, code review, merge process

---

## 🚨 Operations (Production)

> **"Something's broken! Help!"**

Operational runbooks for troubleshooting production issues.

### Troubleshooting Guides
- **[ALERT-PLAYBOOKS.md](ops/ALERT-PLAYBOOKS.md)** - Incident response procedures
- **[ENVIRONMENT-TROUBLESHOOTING.md](ops/ENVIRONMENT-TROUBLESHOOTING.md)** - Common environment issues & fixes
- **[SESSION-MANAGEMENT.md](ops/SESSION-MANAGEMENT.md)** - Reset stuck sessions, handle locks
- **[SHADOW-MODE-ANALYSIS.md](ops/SHADOW-MODE-ANALYSIS.md)** - Debug tmux vs headless divergence

### Monitoring
- **[SLO-TARGETS.md](SLO-TARGETS.md)** - Service level objectives and targets
- **[ops/README.md](ops/README.md)** - Operations overview and quick reference

---

## 🗺️ Planning (Future Work & History)

> **"What's next? What happened before?"**

Future features, roadmaps, and historical design documents.

### Active Planning
- **[ROADMAP.md](planning/ROADMAP.md)** - Feature roadmap and timeline
- **[HEADLESS_MIGRATION.md](planning/HEADLESS_MIGRATION.md)** - Tmux→headless transition plan

### Feature Specifications
- **[specs/README.md](specs/README.md)** - Index of all feature specifications
- **[specs/](specs/)** - Detailed specs (marked [IMPLEMENTED] or [PLANNED])

### Historical Context
- **[planning/archive/](planning/archive/)** - Completed phase docs, brainstorms, POC summaries

---

## 🎨 Design (Architecture Decisions)

> **"Why was it built this way?"**

Architecture Decision Records (ADRs) and design patterns.

### Decision Records
- **[ADR-001: Dual-Mode Agents](design/ADR-001-dual-mode.md)** - Why tmux + headless coexist
- **[ADR-002: Zustand State Management](design/ADR-002-zustand.md)** - Why Zustand over Redux
- **[ADR-003: SQLite Database](design/ADR-003-sqlite.md)** - Why SQLite over Postgres

### Design Patterns
- **[UI_PATTERNS.md](design/UI_PATTERNS.md)** - React component patterns, canvas architecture

---

## 📖 Documentation by Role

### I'm a New Contributor
1. [Quick Start Guide](guides/QUICK_START.md)
2. [Architecture Overview](reference/ARCHITECTURE.md)
3. [Development Guide](guides/DEVELOPMENT.md)
4. [Conventions](reference/CONVENTIONS.md)
5. [Contributing Guide](guides/CONTRIBUTING.md)

### I'm Building a Feature
1. [API Reference](reference/API.md)
2. [Database Schema](reference/DATABASE.md)
3. [Architecture](reference/ARCHITECTURE.md)
4. [Testing Guide](guides/TESTING.md)
5. Check [Feature Specs](specs/) for your feature

### I'm Debugging Production
1. [Alert Playbooks](ops/ALERT-PLAYBOOKS.md)
2. [Environment Troubleshooting](ops/ENVIRONMENT-TROUBLESHOOTING.md)
3. [Session Management](ops/SESSION-MANAGEMENT.md)
4. [API Reference](reference/API.md) (diagnostic endpoints)
5. [SLO Targets](SLO-TARGETS.md)

### I'm an AI Agent Spinning Up
1. [Root CLAUDE.md](../CLAUDE.md) - Project overview
2. Module-specific CLAUDE.md:
   - [broker/CLAUDE.md](../broker/CLAUDE.md)
   - [ui/CLAUDE.md](../ui/CLAUDE.md)
   - [mcp/CLAUDE.md](../mcp/CLAUDE.md)
3. [API Reference](reference/API.md)
4. [Database Schema](reference/DATABASE.md)

---

## 📂 Documentation Structure

```
docs/
├── README.md                    # ← You are here (navigation index)
│
├── reference/                   # Current implementation
│   ├── ARCHITECTURE.md         # System design
│   ├── API.md                  # REST + WebSocket API
│   ├── DATABASE.md             # SQLite schema
│   ├── TECH_STACK.md           # Dependencies & versions
│   └── CONVENTIONS.md          # Code style & Git workflow
│
├── guides/                      # How-to guides
│   ├── QUICK_START.md          # Get productive fast
│   ├── DEVELOPMENT.md          # Local dev environment
│   ├── TESTING.md              # Test patterns
│   ├── DEPLOYMENT.md           # Production deployment
│   └── CONTRIBUTING.md         # PR workflow
│
├── ops/                         # Operational runbooks
│   ├── README.md               # Ops quick reference
│   ├── ALERT-PLAYBOOKS.md      # Incident response
│   ├── ENVIRONMENT-TROUBLESHOOTING.md
│   ├── SESSION-MANAGEMENT.md
│   └── SHADOW-MODE-ANALYSIS.md
│
├── planning/                    # Future work & history
│   ├── README.md               # Planning docs index
│   ├── ROADMAP.md              # Feature roadmap
│   ├── HEADLESS_MIGRATION.md   # Migration plan
│   ├── specs/                  # Feature specifications
│   │   ├── README.md           # Spec index
│   │   └── *.md                # Individual specs
│   └── archive/                # Historical docs
│       ├── POC_SUMMARY.md
│       ├── BRAINSTORM.md
│       ├── phase*.md
│       └── implementation/
│
├── design/                      # Architecture decisions
│   ├── README.md               # ADR index
│   ├── ADR-001-dual-mode.md
│   ├── ADR-002-zustand.md
│   ├── ADR-003-sqlite.md
│   └── UI_PATTERNS.md
│
└── SLO-TARGETS.md               # Service level objectives
```

---

## 🔍 Finding Documentation

### By Topic

**Agent Communication:**
- [Architecture → Message Broker](reference/ARCHITECTURE.md#message-broker)
- [API → Messaging Endpoints](reference/API.md#messaging)
- [MCP Module](../mcp/CLAUDE.md)

**Team Management:**
- [API → Team Endpoints](reference/API.md#team-management)
- [Broker → TeamRunner](../broker/CLAUDE.md#team-orchestration)
- [Spec → Team Lifecycle](specs/TEAM_LIFECYCLE_SPECIFICATION.md) [IMPLEMENTED]

**Bootstrap System:**
- [Broker → Bootstrap](../broker/CLAUDE.md#bootstrap-system)
- [Spec → Bootstrap](specs/BOOTSTRAP_SPECIFICATION.md) [IMPLEMENTED]

**Monitoring:**
- [Ops → Alert Playbooks](ops/ALERT-PLAYBOOKS.md)
- [SLO Targets](SLO-TARGETS.md)
- [API → Monitoring Endpoints](reference/API.md#monitoring-health)

**Database:**
- [Database Schema](reference/DATABASE.md)
- [Broker → Database](../broker/CLAUDE.md#database-schema)
- [Migrations](../broker/src/db/migrations/)

**Testing:**
- [Testing Guide](guides/TESTING.md)
- [Broker Tests](../broker/tests/)
- [UI Tests](../ui/src/)

---

## 🆘 Getting Help

### Documentation Issues
- **Missing information?** Check this index, then file an issue
- **Outdated docs?** Update directly (docs are code!) or file an issue
- **Can't find something?** Search this file (Cmd+F) or check module CLAUDE.md files

### Technical Questions
1. Check relevant guide or reference doc
2. Search closed GitHub issues
3. Review operational runbooks (ops/)
4. Check Architecture Decision Records (design/)
5. File an issue if still stuck

### Contributing to Docs
- See [Contributing Guide](guides/CONTRIBUTING.md)
- Docs follow same PR process as code
- Keep docs current with implementation
- Add examples and diagrams where helpful

---

## 📝 Documentation Principles

1. **Modular Hierarchy** - Root → Workspace → Modules (like code imports)
2. **Separation of Concerns** - Reference ≠ Planning ≠ Operations ≠ Design
3. **Progressive Disclosure** - Quick start → Deep dive → Historical context
4. **Single Source of Truth** - One canonical doc per topic (no duplicates)
5. **AI Agent Optimized** - Agents and humans use the same docs
6. **Maintenance First** - Easy to keep current, clear ownership

---

## 🎯 Documentation Standards

### File Naming
- `UPPER_CASE.md` for top-level docs (README, API, DATABASE)
- `kebab-case.md` for guides and specifications
- `ADR-NNN-description.md` for Architecture Decision Records

### Content Structure
All major docs should include:
1. **Overview** - What is this document about?
2. **Quick Reference** - TL;DR for experienced users
3. **Detailed Content** - Complete information
4. **Related Docs** - Links to related documentation
5. **Last Updated** - Date of last major update

### Cross-References
- Use relative links: `[API Reference](../reference/API.md)`
- Link to specific sections: `[Message Broker](reference/ARCHITECTURE.md#message-broker)`
- Always link to single source of truth (not duplicates)

---

## 🗂️ Documentation History

**2026-01-26:** Major reorganization
- Created modular structure (reference/guides/ops/planning/design)
- Added root and module-level CLAUDE.md files
- Consolidated duplicate documentation
- Separated planning from reference docs
- Created this navigation index

**Previous:** Documentation scattered across 50+ files with drift from implementation

---

**Questions? File an issue or update this index directly!**
