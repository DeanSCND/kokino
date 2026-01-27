# Kokino Specifications Index

## Overview

This directory contains detailed specifications for all Kokino features from Phase 2-6. Each specification provides comprehensive implementation details, API contracts, database schemas, and acceptance criteria.

## Specifications by Phase

### Phase 2: Configurable Agents
**File:** [`AGENT_UI_SPECIFICATION.md`](./AGENT_UI_SPECIFICATION.md)
**Status:** Backend complete, UI pending
**Issue:** [#121](https://github.com/DeanSCND/kokino/issues/121)

Detailed specifications for:
- CreateAgentDialog component
- AgentLibraryPanel component
- EditAgentDialog component
- UI field specifications and validation
- Integration with Canvas

---

### Phase 3: Bootstrap System
**File:** [`BOOTSTRAP_SPECIFICATION.md`](./BOOTSTRAP_SPECIFICATION.md)
**Status:** Not started
**Issue:** [#122](https://github.com/DeanSCND/kokino/issues/122)

Covers:
- Four bootstrap modes (none/auto/manual/custom)
- Context loading mechanisms
- Compaction detection and monitoring
- Performance requirements
- API endpoints and database schema

---

### Phase 4: Canvas Rewrite
**File:** [`CANVAS_REWRITE_SPECIFICATION.md`](./CANVAS_REWRITE_SPECIFICATION.md)
**Status:** Not started
**Issue:** [#123](https://github.com/DeanSCND/kokino/issues/123)

Includes:
- Current architecture problems
- Target component structure
- Service layer design
- State management with Zustand
- Migration strategy
- Performance requirements

---

### Phase 5: Team Lifecycle
**File:** [`TEAM_LIFECYCLE_SPECIFICATION.md`](./TEAM_LIFECYCLE_SPECIFICATION.md)
**Status:** Not started
**Issue:** [#124](https://github.com/DeanSCND/kokino/issues/124)

Details:
- Team configuration schema (JSON/YAML)
- Root agent concept
- Workspace assignment
- Team lifecycle states
- API endpoints for team operations
- Team templates

---

### Phase 6: Monitoring & Boundaries
**File:** [`MONITORING_SPECIFICATION.md`](./MONITORING_SPECIFICATION.md)
**Status:** Not started
**Issue:** [#125](https://github.com/DeanSCND/kokino/issues/125)

Specifies:
- File operation tracking
- Boundary violation detection
- Performance metrics collection
- Alert system and rules
- Dashboard design
- Data retention policies

---

## Quick Reference

### Component Specifications

| Component | Phase | File | Lines of Code |
|-----------|-------|------|---------------|
| CreateAgentDialog | 2 | AGENT_UI_SPECIFICATION.md | < 400 |
| AgentLibraryPanel | 2 | AGENT_UI_SPECIFICATION.md | < 350 |
| Canvas (refactored) | 4 | CANVAS_REWRITE_SPECIFICATION.md | < 300 |
| BootstrapManager | 3 | BOOTSTRAP_SPECIFICATION.md | < 300 |
| TeamManager | 5 | TEAM_LIFECYCLE_SPECIFICATION.md | < 400 |
| MonitoringService | 6 | MONITORING_SPECIFICATION.md | < 500 |

### API Endpoints Summary

| Phase | Endpoints | Specification |
|-------|-----------|---------------|
| 2 | `/api/agents/*` | AGENT_UI_SPECIFICATION.md |
| 3 | `/api/agents/:id/bootstrap/*` | BOOTSTRAP_SPECIFICATION.md |
| 5 | `/api/teams/*` | TEAM_LIFECYCLE_SPECIFICATION.md |
| 6 | `/api/monitoring/*` | MONITORING_SPECIFICATION.md |

Complete API documentation: [`../API_V2.md`](../API_V2.md)

### Database Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `agent_configs` | 2 | Agent configuration storage |
| `bootstrap_history` | 3 | Bootstrap execution log |
| `compaction_metrics` | 3 | Compaction monitoring |
| `teams` | 5 | Team configurations |
| `team_sessions` | 5 | Active team sessions |
| `file_operations` | 6 | File access log |
| `boundary_violations` | 6 | Security violations |
| `performance_metrics` | 6 | Agent performance data |

---

## How to Use These Specs

### For Developers

1. **Before starting work**: Read the relevant specification completely
2. **Check acceptance criteria**: Found at the end of each spec
3. **Follow API contracts**: Use exact request/response formats
4. **Implement tests**: Test requirements are included
5. **Update if needed**: Specs are living documents

### For Reviewers

1. **Verify against spec**: Ensure implementation matches specification
2. **Check completeness**: All acceptance criteria must be met
3. **Test coverage**: Verify tests match requirements
4. **API compliance**: Endpoints must match documentation

### For Project Managers

1. **Track progress**: Each spec has clear deliverables
2. **Estimate effort**: Implementation phases are defined
3. **Identify dependencies**: Specs note inter-phase dependencies
4. **Risk assessment**: Common errors and mitigations listed

---

## Specification Standards

Each specification follows this structure:

1. **Overview** - Problem and solution summary
2. **Problem Statement** - What we're solving
3. **Detailed Design** - How it works
4. **API Endpoints** - REST API contracts
5. **Database Schema** - Tables and relationships
6. **Implementation Classes** - Key code structure
7. **Testing Requirements** - What to test
8. **Error Handling** - Error scenarios
9. **Performance Requirements** - Targets and metrics
10. **Success Criteria** - Definition of done

---

## Contributing

### Adding a New Spec

1. Use existing specs as templates
2. Include all sections listed above
3. Provide code examples
4. Define clear acceptance criteria
5. Link to GitHub issue
6. Update this README index

### Updating Existing Specs

1. Mark changes with `[UPDATED]` tag
2. Note date of update
3. Update related documentation
4. Notify team of breaking changes

---

## Related Documentation

- **Roadmap**: [`../ROADMAP_2026.md`](../ROADMAP_2026.md)
- **API Documentation**: [`../API_V2.md`](../API_V2.md)
- **Architecture**: [`../design-research/ARCHITECTURE.md`](../design-research/ARCHITECTURE.md)

---

## Questions?

For clarification on any specification:
1. Check the GitHub issue linked in each spec
2. Review the acceptance criteria
3. Consult the API documentation
4. Ask in team chat

---

*Last updated: January 2026*