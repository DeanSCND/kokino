# Architecture Decision Records (ADRs)

> **Why We Built It This Way**
>
> **Last Updated:** 2026-01-26

---

## What are ADRs?

Architecture Decision Records (ADRs) document significant technical decisions made during Kokino's development. Each ADR explains:

- **Context:** What problem we were solving
- **Options:** What alternatives we considered
- **Decision:** What we chose and why
- **Consequences:** Trade-offs and outcomes

---

## Active ADRs

### [ADR-001: Dual-Mode Agent Execution](ADR-001-dual-mode.md)
**Status:** Active  
**Decision:** Support both tmux and headless CLI execution with shadow mode validation  
**Why:** Gradual migration path from tmux → headless with safety fallback  
**Impact:** Safer rollout, data-driven migration decisions

### [ADR-002: Zustand State Management](ADR-002-zustand.md)
**Status:** Active  
**Decision:** Use Zustand instead of Redux for React state management  
**Why:** Minimal boilerplate, small bundle size, DevTools support  
**Impact:** Canvas reduced from 1547 → 262 lines, 6.6kb bundle savings

### [ADR-003: SQLite Database](ADR-003-sqlite.md)
**Status:** Active  
**Decision:** Use SQLite with better-sqlite3 instead of PostgreSQL  
**Why:** Localhost-first philosophy, zero configuration, synchronous API  
**Impact:** Simple setup, easy backups, perfect for single-machine orchestration

---

## ADR Template

When creating new ADRs, use this structure:

```markdown
# ADR-NNN: Title

**Status:** Proposed | Active | Deprecated | Superseded  
**Date:** YYYY-MM-DD  
**Deciders:** Who made this decision  
**Context:** What problem or situation prompted this

---

## Context and Problem Statement
Clear description of the problem...

## Decision Drivers
- Key factor 1
- Key factor 2

## Considered Options
### Option 1
Pros/Cons

### Option 2 (CHOSEN)
Pros/Cons

## Decision Outcome
What we chose and how we implemented it...

## Consequences
### Positive
- Benefit 1

### Negative
- Tradeoff 1

## Validation
Success metrics and current status...

## Related
Links to code, specs, related ADRs...
```

---

## When to Write an ADR

Write an ADR when you make a decision that:
- Affects system architecture significantly
- Introduces a new technology or framework
- Has trade-offs that should be documented
- Might be questioned or revisited later
- Sets a precedent for future decisions

**Examples:**
- Choosing a database (ADR-003)
- Choosing a state management library (ADR-002)
- Choosing an execution strategy (ADR-001)

**Not ADRs:**
- Routine bug fixes
- Code refactoring without architecture changes
- Configuration tweaks

---

## ADR Lifecycle

1. **Proposed:** Decision being evaluated, not yet implemented
2. **Active:** Decision made, currently in use
3. **Deprecated:** Decision outdated but still in code (migration planned)
4. **Superseded:** Replaced by newer ADR (link to successor)

---

## Finding ADRs

### By Topic

**State Management:**
- [ADR-002: Zustand](ADR-002-zustand.md)

**Database:**
- [ADR-003: SQLite](ADR-003-sqlite.md)

**Agent Execution:**
- [ADR-001: Dual-Mode](ADR-001-dual-mode.md)

---

## Related Documentation

- **[Architecture Overview](../reference/ARCHITECTURE.md)** - System design
- **[Technology Stack](../reference/TECH_STACK.md)** - Technologies and versions
- **[Conventions](../reference/CONVENTIONS.md)** - Coding standards

---

**Questions about a decision? Check the relevant ADR or open a GitHub discussion.**
