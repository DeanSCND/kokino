# Documentation Reorganization Plan

> **Status:** Phase 1 Complete ✅ | Phase 2-5 Ready for Implementation
>
> **Branch:** `docs-reorganization`
>
> **Created:** 2026-01-26

## Executive Summary

Comprehensive documentation reorganization to support "Kokino building Kokino" - making documentation AI agent-optimized, modular, maintainable, and aligned with actual implementation.

**Problem:** 50+ markdown files scattered across directories, critical drift between specs and implementation, no clear entry points for agents or humans.

**Solution:** Modular hierarchy (Root → Workspace → Modules), separation of concerns (reference vs planning vs operations), progressive disclosure, single source of truth.

---

## ✅ Phase 1: COMPLETE (Committed)

### What Was Built
- ✅ Root `CLAUDE.md` - Project-wide context (30-second orientation)
- ✅ `broker/CLAUDE.md` - Broker module context (API, database, execution)
- ✅ `ui/CLAUDE.md` - UI module context (React, Zustand, Canvas)
- ✅ `mcp/CLAUDE.md` - MCP module context (tools, configuration)
- ✅ `docs/README.md` - Complete navigation index (role-based, topic-based)
- ✅ New directory structure (`reference/`, `guides/`, `planning/`, `design/`)

### Files Created
1. `/CLAUDE.md` (382 lines)
2. `/broker/CLAUDE.md` (726 lines)
3. `/ui/CLAUDE.md` (567 lines)
4. `/mcp/CLAUDE.md` (519 lines)
5. `/docs/README.md` (305 lines)

**Total:** 2,499 lines of high-quality, structured documentation

---

## 📋 Phase 2: Reference Documentation (TODO)

### Files to Create

#### 1. docs/reference/API.md
**Action:** Consolidate `docs/API.md` + `docs/API_V2.md`
**Size:** ~500 lines
**Content:**
- All REST endpoints (agent management, messaging, teams, bootstrap, monitoring)
- WebSocket endpoints
- Request/response schemas
- Error codes
- Authentication (when implemented)

#### 2. docs/reference/DATABASE.md
**Action:** Create comprehensive database documentation
**Size:** ~400 lines
**Content:**
- Complete schema (all tables with columns and types)
- Relationships and foreign keys
- Indexes for performance
- Migration history and process
- Common queries
- Database maintenance

**Sources:**
- `broker/src/db/schema.js`
- `broker/src/db/migrations/*.sql`
- Existing specs

#### 3. docs/reference/TECH_STACK.md
**Action:** Create new (document current stack)
**Size:** ~300 lines
**Content:**
- Backend: Node.js, SQLite, WebSocket, better-sqlite3
- Frontend: React 19, Vite, Zustand, React Flow, Tailwind, XTerm.js
- MCP: TypeScript, Hono, Zod
- Testing: Vitest, Testing Library
- Version requirements and compatibility
- Why each technology was chosen
- Upgrade considerations

#### 4. docs/reference/TECH_STACK.md
**Action:** Create new (migrate workspace CLAUDE.md Graphite section)
**Size:** ~400 lines
**Content:**
- Code style (ESLint, Prettier)
- Git workflow (Graphite commands, merge strategy)
- Testing patterns (unit, integration, fixtures)
- PR process (review, approval, merge)
- Branch naming conventions
- Commit message format

#### 5. docs/reference/ARCHITECTURE.md
**Action:** Move and update `docs/design-research/ARCHITECTURE.md`
**Size:** ~600 lines (existing + updates)
**Updates needed:**
- Mark what's implemented vs planned
- Add sections on bootstrap, teams, monitoring
- Update diagrams if any
- Remove outdated content

---

## 📖 Phase 3: Guide Documentation (TODO)

### Files to Create

#### 1. docs/guides/QUICK_START.md
**Action:** Create new
**Size:** ~400 lines
**Content:**
- Prerequisites check
- Installation (broker + UI + MCP)
- Start the system
- Create first agent
- Send first message between agents
- Troubleshooting first run
- Next steps

**Target:** New contributor productive in 30 minutes

#### 2. docs/guides/DEVELOPMENT.md
**Action:** Create new
**Size:** ~500 lines
**Content:**
- Local environment setup
- Running broker, UI, MCP in dev mode
- Hot reload / live reload
- Debugging techniques (logs, breakpoints, database inspection)
- Common development tasks
- Environment variables
- IDE setup (VS Code recommended extensions)

#### 3. docs/guides/TESTING.md
**Action:** Create new
**Size:** ~400 lines
**Content:**
- Test organization (unit, integration, fixtures)
- Running tests (broker, UI, MCP)
- Writing new tests (patterns and examples)
- Test coverage
- Mocking strategies
- CI/CD integration

#### 4. docs/guides/DEPLOYMENT.md
**Action:** Create new
**Size:** ~300 lines
**Content:**
- Production deployment steps
- Environment configuration
- Building for production (broker, UI)
- Process management (systemd, PM2)
- Monitoring setup
- Backup strategies
- Security considerations

#### 5. docs/guides/CONTRIBUTING.md
**Action:** Create new
**Size:** ~400 lines
**Content:**
- How to contribute
- PR workflow (Graphite)
- Code review process
- Documentation updates
- Issue triage
- Release process

---

## 🗺️ Phase 4: Planning & Archive (TODO)

### Consolidation Tasks

#### 1. Consolidate Roadmaps
**Action:** Merge `docs/ROADMAP_2026.md` + `docs/design-research/ROADMAP.md` → `docs/planning/ROADMAP.md`
**Effort:** 2 hours
**Content:** Single authoritative roadmap

#### 2. Move HEADLESS-ROADMAP
**Action:** `docs/HEADLESS-ROADMAP.md` → `docs/planning/HEADLESS_MIGRATION.md`
**Effort:** 30 min
**Updates:** Mark completed items

#### 3. Move Feature Specs
**Action:** `docs/specs/*` → `docs/planning/specs/*`
**Effort:** 1 hour
**Updates:** Add `[IMPLEMENTED]` or `[PLANNED]` tags to each spec
- BOOTSTRAP_SPECIFICATION.md → [IMPLEMENTED]
- TEAM_LIFECYCLE_SPECIFICATION.md → [IMPLEMENTED]
- MONITORING_SPECIFICATION.md → [IN_PROGRESS]
- CANVAS_REWRITE_SPECIFICATION.md → [IMPLEMENTED]
- AGENT_UI_SPECIFICATION.md → [PARTIAL]

#### 4. Archive Historical Docs
**Action:** Move to `docs/planning/archive/`
**Files:**
- `docs/design-research/POC_SUMMARY.md`
- `docs/design-research/BRAINSTORM.md`
- `docs/design-research/MARKET-ANALYSIS.md`
- `docs/design-research/LIMITATIONS.md`
- `docs/design-research/META-COLLABORATION.md`
- `docs/design-research/IMPLEMENTATION-INSIGHTS.md`
- `docs/design-research/BUG-DISCOVERIES.md`
- `docs/phase*.md` (all completed phase docs)
- `docs/implementation/` directory
- `docs/MANUAL-MCP-TEST.md`
- `docs/BIDIRECTIONAL-ASYNC-DESIGN.md`
- `docs/TEST-RESULTS.md`

#### 5. Delete Duplicates
**Action:** Remove after consolidation
**Files:**
- `docs/API.md` (after merging into reference/API.md)
- `docs/API_V2.md` (after merging into reference/API.md)
- `docs/design-research/` folder (empty after moves)
- `docs/mcp-setup.md` (consolidate into mcp/README.md)
- `docs/mcp-configuration.md` (consolidate into mcp/README.md)

---

## 🎨 Phase 5: Design Documentation (TODO)

### ADRs to Create

#### 1. docs/design/ADR-001-dual-mode.md
**Size:** ~300 lines
**Content:**
- **Context:** Why support both tmux and headless?
- **Decision:** Dual-mode with shadow testing
- **Rationale:** Gradual migration, production fallback, reliability validation
- **Consequences:** Additional complexity, but safer transition
- **Status:** Active (tmux deprecation pending)

#### 2. docs/design/ADR-002-zustand.md
**Size:** ~250 lines
**Content:**
- **Context:** Need state management for React
- **Decision:** Zustand over Redux
- **Rationale:** Simpler API, less boilerplate, Redux DevTools still available
- **Consequences:** Canvas reduced from 1547 to 262 lines
- **Status:** Active

#### 3. docs/design/ADR-003-sqlite.md
**Size:** ~250 lines
**Content:**
- **Context:** Need persistent storage
- **Decision:** SQLite over Postgres/MySQL
- **Rationale:** Localhost-first, zero-config, synchronous API, single file
- **Consequences:** Single-machine orchestration only (acceptable tradeoff)
- **Status:** Active

#### 4. docs/design/UI_PATTERNS.md
**Action:** Move `docs/design-research/UI-DESIGN.md` → `docs/design/UI_PATTERNS.md`
**Effort:** 1 hour
**Updates:** Focus on current patterns, remove outdated content

#### 5. docs/design/README.md
**Action:** Create ADR index
**Size:** ~150 lines
**Content:** Index of all ADRs with status and quick reference

---

## 📊 Summary of Work

### Phase 1 (DONE)
- **Files Created:** 5
- **Lines Written:** 2,499
- **Directories Created:** 4
- **Time:** Completed

### Phase 2 (TODO)
- **Files to Create:** 5
- **Estimated Lines:** ~2,200
- **Estimated Time:** 1-2 days

### Phase 3 (TODO)
- **Files to Create:** 5
- **Estimated Lines:** ~2,000
- **Estimated Time:** 1-2 days

### Phase 4 (TODO)
- **Files to Move:** 30+
- **Files to Delete:** 15+
- **Estimated Time:** 1 day

### Phase 5 (TODO)
- **Files to Create:** 5 (3 ADRs + README + UI_PATTERNS move)
- **Estimated Lines:** ~1,150
- **Estimated Time:** 0.5 day

**Total Effort:** 3-5 days for complete reorganization

---

## ✅ Success Criteria

### For AI Agents
- [ ] Agent can bootstrap in <30 seconds by reading root CLAUDE.md
- [ ] Agent knows what's implemented vs planned
- [ ] Agent can find API docs, database schema instantly
- [ ] Module-specific agents get focused context

### For Humans
- [ ] New contributor finds QUICK_START.md in <1 minute
- [ ] Developer finds API reference without searching
- [ ] Ops team finds playbooks for production issues
- [ ] Historical context is preserved but separated

### For Maintenance
- [ ] Single source of truth per topic (no duplicates)
- [ ] Clear update triggers (e.g., "Add migration → update DATABASE.md")
- [ ] Documentation stays current with code

---

## 🚀 Implementation Strategy

### Approach 1: Complete Now (3-5 days)
**Pros:** Everything done at once, single PR
**Cons:** Large PR, harder to review, blocks other work

**Steps:**
1. ✅ Phase 1 (committed)
2. Create all reference docs (Phase 2)
3. Create all guide docs (Phase 3)
4. Move and archive (Phase 4)
5. Create ADRs (Phase 5)
6. Single large PR for review

### Approach 2: Incremental (Recommended) (1 week total)
**Pros:** Smaller PRs, easier review, can parallelize
**Cons:** Multiple PRs to track

**Steps:**
1. ✅ **PR #1:** Phase 1 (structure + CLAUDE.md files) ← Submit this now!
2. **PR #2:** Phase 2 (reference docs) - 1-2 days
3. **PR #3:** Phase 3 (guide docs) - 1-2 days
4. **PR #4:** Phase 4 + 5 (planning/archive + ADRs) - 1 day

### Recommended: Approach 2
- Submit PR #1 immediately (Phase 1 is solid and valuable on its own)
- Get feedback while working on Phase 2
- Iterate based on team input
- Each PR is independently valuable

---

## 📝 PR #1 Description (Phase 1)

### Title
```
docs: Create modular documentation structure with CLAUDE.md files
```

### Description
```markdown
## Summary
Major documentation reorganization Phase 1: Create modular structure and AI agent-optimized CLAUDE.md files.

## Problem
- 50+ markdown files scattered across directories
- Critical drift: specs claim "not started" but code is implemented
- No clear entry points for AI agents or humans
- Multiple conflicting sources (3+ roadmaps, 2 API docs)

## Solution
- Root CLAUDE.md - Project-wide 30-second orientation
- Module CLAUDE.md files (broker, ui, mcp) - Focused context
- docs/README.md - Complete navigation index
- New structure: reference/, guides/, planning/, design/

## What's Changed
- NEW: CLAUDE.md (root)
- NEW: broker/CLAUDE.md
- NEW: ui/CLAUDE.md
- NEW: mcp/CLAUDE.md
- UPDATED: docs/README.md (full navigation index)
- NEW: docs directory structure

## Benefits
**For AI Agents:**
- Bootstrap in <30 seconds
- Know what's implemented vs planned
- Module-specific focused context

**For Humans:**
- Clear documentation hierarchy
- Role-based navigation
- Single source of truth (coming in Phase 2-5)

## Next Steps
Phase 2-5 will add:
- Reference docs (API consolidation, DATABASE, TECH_STACK, CONVENTIONS)
- Guide docs (QUICK_START, DEVELOPMENT, TESTING)
- ADRs (dual-mode, Zustand, SQLite)
- Archive historical planning docs

See DOCS_REORGANIZATION_PLAN.md for complete plan.

## Testing
- [x] All CLAUDE.md files are accurate and comprehensive
- [x] docs/README.md provides clear navigation
- [x] Directory structure created
- [x] No broken links in new files

## Reviewers
Please review:
1. Accuracy of technical content in CLAUDE.md files
2. Usefulness of navigation structure
3. Any critical missing information
```

---

## 🎯 Next Actions

### Immediate (Now)
1. ✅ Commit Phase 1
2. ✅ Create this planning document
3. 🔄 Create PR for Phase 1
4. Share with team for feedback

### Short-term (Next 1-2 days)
1. Address PR feedback on Phase 1
2. Begin Phase 2 (reference docs)
3. Create API.md (consolidate existing)
4. Create DATABASE.md

### Medium-term (Next week)
1. Phase 3 (guides)
2. Phase 4 (planning/archive)
3. Phase 5 (ADRs)
4. Final PR reviews and merges

---

**Questions? See this document or the team chat.**
