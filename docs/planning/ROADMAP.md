# Kokino Roadmap 2026

## Current Status (January 2026)

### Completed
- ✅ **Phase 0**: API Foundation (Week 1) - Complete
- ✅ **Phase 1**: Telemetry & Metrics (Week 2) - Complete
- ✅ **Phase 2**: Configurable Agents - Backend complete, UI pending

### In Progress
- 🚧 **Phase 2**: Agent Configuration UI (Issue #121)
  - Backend API complete
  - UI components needed (see `docs/specs/AGENT_UI_SPECIFICATION.md`)

### Upcoming
- **Phase 3**: Bootstrap System (Week 4)
- **Phase 4**: Canvas Rewrite (Weeks 5-6)
- **Phase 5**: Team Lifecycle (Week 7)
- **Phase 6**: Monitoring & Boundaries (Week 8)

---

## Phase Timeline

### Phase 0: API Foundation ✅
**Status:** Complete
**Timeline:** Week 1
**Description:** REST API wrapper around existing broker

**Deliverables:**
- ✅ Adapter pattern implementation
- ✅ REST endpoints for all broker operations
- ✅ Maintained backward compatibility

---

### Phase 1: Telemetry & Metrics ✅
**Status:** Complete
**Timeline:** Week 2
**Description:** Performance monitoring and metrics collection

**Deliverables:**
- ✅ MetricsCollector implementation
- ✅ Performance CI tests
- ✅ Bootstrap performance monitoring

---

### Phase 2: Configurable Agents 🚧
**Status:** Backend complete, UI pending
**Timeline:** Week 3
**Issue:** #121
**Specification:** `docs/specs/AGENT_UI_SPECIFICATION.md`

**Completed:**
- ✅ Agent configuration schema
- ✅ CRUD API endpoints
- ✅ Database migrations
- ✅ Agent instantiation from configs

**Remaining:**
- ⏳ CreateAgentDialog component
- ⏳ AgentLibraryPanel component
- ⏳ Edit functionality in UI
- ⏳ Integration with Canvas

---

### Phase 3: Bootstrap System
**Status:** Not started
**Timeline:** Week 4
**Issue:** #122
**Specification:** `docs/specs/BOOTSTRAP_SPECIFICATION.md`

**Goals:**
- Implement 4 bootstrap modes (none/auto/manual/custom)
- Auto-load CLAUDE.md and context files
- Compaction detection and monitoring
- Performance < 10s for bootstrap

**Key Features:**
- Context loading on agent startup
- Custom bootstrap scripts
- Compaction monitoring
- Bootstrap API endpoints

---

### Phase 4: Canvas Rewrite
**Status:** Not started
**Timeline:** Weeks 5-6
**Issue:** #123
**Specification:** `docs/specs/CANVAS_REWRITE_SPECIFICATION.md`

**Goals:**
- Reduce Canvas.jsx from 1567 to < 500 lines
- Extract business logic to services
- Implement proper state management (Zustand)
- Clean component architecture

**Migration Strategy:**
1. Extract API calls to service layer
2. Implement Zustand store
3. Break into smaller components
4. Create custom hooks
5. Add comprehensive tests

---

### Phase 5: Team Lifecycle
**Status:** Not started
**Timeline:** Week 7
**Issue:** #124
**Specification:** `docs/specs/TEAM_LIFECYCLE_SPECIFICATION.md`

**Goals:**
- Teams as first-class entities
- Start/stop all agents as a unit
- Root agent coordination
- Save/load team configurations

**Key Features:**
- Team configuration schema
- Workspace assignment per agent
- Team templates
- Phase-based workflows

---

### Phase 6: Monitoring & Boundaries
**Status:** Not started
**Timeline:** Week 8
**Issue:** #125
**Specification:** `docs/specs/MONITORING_SPECIFICATION.md`

**Goals:**
- Track all file operations
- Detect workspace boundary violations
- Performance monitoring
- Alert system

**Key Features:**
- File operation interception
- Boundary violation detection
- Performance metrics collection
- Real-time dashboard
- Alert rules engine

---

## Future Phases (Post-MVP)

### Phase 7: Authentication & Authorization
**Timeline:** TBD
**Description:** Add user authentication and role-based access control

### Phase 8: Hard Isolation
**Timeline:** TBD
**Description:** Docker/VM isolation for agents based on Phase 6 data

### Phase 9: Distributed Execution
**Timeline:** TBD
**Description:** Run agents across multiple machines

### Phase 10: Production Polish
**Timeline:** TBD
**Description:** Production hardening, monitoring, and deployment

---

## Success Metrics

### Technical Metrics
- API response time < 200ms (p95)
- Agent bootstrap < 10s
- Canvas render < 100ms
- Team startup < 30s
- Zero data loss

### Quality Metrics
- 80% test coverage
- Zero critical bugs
- All features documented
- All APIs specified

### User Experience
- Time to first team: < 2 minutes
- Agent configuration: < 1 minute
- Team save/load: < 5 seconds

---

## Risk Mitigation

### Technical Risks
1. **Canvas rewrite complexity**
   - Mitigation: Incremental refactoring with feature flags

2. **Performance impact of monitoring**
   - Mitigation: Sampling and async collection

3. **Bootstrap timing issues**
   - Mitigation: Timeout and retry logic

### Schedule Risks
1. **UI development falling behind**
   - Mitigation: Parallel development tracks

2. **Integration issues**
   - Mitigation: Continuous integration testing

---

## Dependencies

### External Dependencies
- Node.js 18+
- SQLite 3
- React 18
- Zustand (state management)
- React Flow (canvas)
- Chokidar (file watching)

### Internal Dependencies
- Phase 3 depends on Phase 2 (agent configs)
- Phase 5 depends on Phase 3 (bootstrap)
- Phase 6 can run in parallel

---

## Documentation

All specifications are in `docs/specs/`:
- `AGENT_UI_SPECIFICATION.md` - Phase 2 UI components
- `BOOTSTRAP_SPECIFICATION.md` - Phase 3 bootstrap system
- `CANVAS_REWRITE_SPECIFICATION.md` - Phase 4 refactoring
- `TEAM_LIFECYCLE_SPECIFICATION.md` - Phase 5 team management
- `MONITORING_SPECIFICATION.md` - Phase 6 monitoring

API documentation: `docs/API_V2.md`

---

## Team Resources

### Required Skills
- **Frontend**: React, Zustand, React Flow
- **Backend**: Node.js, SQLite, REST APIs
- **DevOps**: Monitoring, metrics, CI/CD

### Estimated Effort
- Phase 2 UI: 3-5 days
- Phase 3: 1 week
- Phase 4: 2 weeks
- Phase 5: 1 week
- Phase 6: 1 week

Total to MVP: 6-7 weeks

---

## Decision Log

### Key Decisions
1. **API-first architecture** - All features via REST API
2. **Bootstrap over persistence** - Fresh context each session
3. **Soft boundaries initially** - Monitor before isolating
4. **Zustand for state** - Simple, performant state management
5. **Incremental refactoring** - Feature flags for Canvas rewrite

---

## Review Checkpoints

- **Week 3**: Phase 2 complete review
- **Week 4**: Bootstrap system review
- **Week 6**: Canvas rewrite review
- **Week 8**: MVP feature complete
- **Week 9**: Production readiness review

---

*Last updated: January 2026*
*Next review: End of Week 3*