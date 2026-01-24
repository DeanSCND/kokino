# Headless Agent Execution - Complete Roadmap

## Overview

Transition from tmux-based terminal injection to headless subprocess execution for Claude Code, Factory Droid, and Gemini. This provides structured conversation history, native chat UI, and eliminates polling/injection fragility.

**Goal:** Fully migrate to headless mode with proven reliability.

**Current State:** Both tmux and headless modes coexist in production. Agents can be configured with `commMode: 'tmux'`, `commMode: 'headless'`, or `commMode: 'shadow'` (runs both in parallel for testing). Runtime fallback allows operators to quickly disable headless for degraded CLIs.

---

## Phase 1: Core Implementation (3-5 days)

**Primary Issue:** #86 - Implement Headless Agent Execution with Dual-Mode Support

### Deliverables
- AgentRunner service with CLI invocation
- Conversation/turns database tables
- ConversationStore CRUD operations
- API endpoints (/execute, /conversation, /end-session)
- Message routing (dual-mode: tmux vs headless)
- AgentChatPanel UI component
- ChatBubble with markdown rendering
- React hooks (useConversation, useAgentExecute)

### Status
- Database schema: ✅ Complete
- API endpoints: ✅ Complete
- AgentRunner: ✅ Basic implementation
- UI components: ⏳ In progress

---

## Phase 2: Hardening & Validation (2-3 weeks)

Build reliability guardrails before deprecating tmux.

### Infrastructure Issues

**#88 - Environment Doctor & Self-Check System** (1-2 days)
- Automated environment validation
- Pre-flight checks on spawn
- Periodic self-checks (hourly)
- Health dashboard UI
- Diagnostic scripts

**#89 - Session Manager with Locks & Cancellation** (2-3 days) ⚠️ CRITICAL
- Lock serialization per agent
- Cancel/timeout enforcement
- Stale session cleanup
- Session state persistence

**#90 - Subprocess Sandboxing & Resource Limits** (2-3 days)
- Memory/CPU limits
- Circuit breaker for failures
- Rotating log capture
- Zombie process cleanup

**#91 - JSONL Parser Hardening & Schema Validation** (1-2 days)
- Schema validation (zod)
- CLI version tracking
- Test fixtures with recorded samples
- Unknown event handling

**#92 - Conversation Store Integrity Checks** (1-2 days)
- Referential integrity constraints
- Turn sequence validation
- Nightly consistency checks
- Orphan detection & cleanup
- **Data migration scripts** for tmux transcripts (if any)

### Operations & Testing Issues

**#98 - Headless Telemetry & Monitoring Infrastructure** (2-3 days) ⚠️ FOUNDATIONAL
- Unified telemetry event schema
- SLI/SLO tracking (availability, latency, correctness, integrity, resources)
- Error budget monitoring
- Prometheus exporter (optional)
- Grafana dashboard
- Alert rules with ownership

**#95 - Headless Operations Runbooks** (2-3 days)
- Environment troubleshooting guide
- Session management runbook
- Shadow mode analysis guide
- Diagnostic automation scripts
- Alert playbooks

**#96 - Runtime Fallback Toggle** (1 day)
- API to disable/enable CLI types
- Force specific agents to tmux
- Auto-fallback on degradation
- UI fallback controls

**#97 - Headless Load Testing** (2-3 days)
- Burst test (100 messages) - **tmux agents**
- Burst test (100 messages) - **headless agents**
- Concurrency test - **mixed mode** (tmux + headless agents)
- Failure injection test
- **Fallback scenario** - disable CLI mid-test, verify tmux takeover
- **Shadow mode under load** - verify both branches execute
- Soak test (1 hour sustained load)
- Resource monitoring - **compare tmux vs headless** memory/CPU
- CI integration

**#93 - Shadow Mode Testing** (30 days) ⏱️ LONG-RUNNING
- Run tmux + headless in parallel
- Compare outputs & latency
- Log discrepancies
- Metrics dashboard
- Success criteria validation

---

## Phase 3: Tmux Deprecation (2-3 days)

**#94 - Deprecate and Remove Tmux Infrastructure**

⚠️ **BLOCKED UNTIL Shadow Mode Succeeds**

### Prerequisites (from #93)
- ✅ Shadow mode ran for 30 days
- ✅ Headless success rate ≥99.5%
- ✅ Output match rate ≥95%
- ✅ Latency improvement confirmed
- ✅ No data corruption detected

### Tasks
- Remove tmux code (ProcessManager, watchers, spawn-agent)
- Database migration (drop tmux-only fields)
- Update documentation
- Final testing
- 🎉 **Celebration: Headless is production-ready!**

---

## Dependencies Graph

```
Phase 1: #86 (Core Implementation)
           ↓
Phase 2:   #98 (Telemetry/Monitoring) ⚠️ Foundational - Do First!
           ↓
           ├─→ #89 (Session Manager) ⚠️ Critical Path
           ├─→ #88 (Environment Doctor)
           ├─→ #90 (Subprocess Sandbox)
           ├─→ #91 (JSONL Parser)
           ├─→ #92 (Conversation Integrity + Data Migration)
           ├─→ #95 (Ops Runbooks)
           ├─→ #96 (Fallback Toggle)
           ├─→ #97 (Load Testing)
           └─→ #93 (Shadow Mode - 30 days)
                 ↓
Phase 3:   #94 (Tmux Deprecation)
```

---

## Success Metrics

### Phase 2 Exit Criteria (Before Phase 3)

**From Load Testing (#97):**
- >95% success rate under burst load
- 100% serialization for concurrent requests
- >80% recovery rate from failures
- <5% memory growth over 1 hour
- <10 orphaned processes

**From Shadow Mode (#93):**
- ≥99.5% headless success rate (30 days)
- ≥95% output match rate
- <5s average latency improvement
- <0.1% data corruption rate

---

## Risk Mitigation

| Risk | Mitigation | Issue |
|------|------------|-------|
| Environment parity failures | Environment doctor with auto-checks | #88 |
| Concurrent execution corruption | Session lock manager | #89 |
| Resource exhaustion | Sandboxing + circuit breaker | #90 |
| CLI output format changes | Schema validation + versioning | #91 |
| Data inconsistency | Integrity checks + nightly jobs + migration scripts | #92 |
| Production degradation | Runtime fallback toggle | #96 |
| Unproven reliability | Shadow mode + load testing | #93, #97 |
| Observability gaps | Unified telemetry + SLI/SLO tracking | #98 |

---

## Implementation Order

**Week 1-2: Phase 1**
1. Complete AgentRunner implementation (#86)
2. Finish UI components (#86)
3. Integration testing

**Week 3-4: Phase 2 Infrastructure**
4. Telemetry & Monitoring (#98) ⚠️ FOUNDATIONAL - Do this first!
5. Session Manager (#89) ⚠️ CRITICAL PATH
6. Environment Doctor (#88)
7. Subprocess Sandbox (#90)
8. JSONL Parser (#91)
9. Conversation Integrity (#92)

**Week 5-6: Phase 2 Operations**
10. Ops Runbooks (#95)
11. Fallback Toggle (#96)
12. Load Testing (#97)
13. Start Shadow Mode (#93)

**Week 7-10: Shadow Mode Running**
13. Monitor metrics daily
14. Fix issues as discovered
15. Validate success criteria

**Week 11: Phase 3 (If metrics pass)**
16. Tmux Deprecation (#94)

---

## Current Status

- **Phase 1:** ✅ Complete (merged in PR #100)
- **Phase 2:** 90% complete (9/10 issues done)
  - ✅ #98 - Telemetry & Monitoring (merged PR #100)
  - ✅ #89 - Session Manager (merged PR #101)
  - ✅ #88 - Environment Doctor (merged PR #102)
  - ✅ #90 - Subprocess Sandboxing (merged PR #103)
  - ✅ #91 - JSONL Parser (merged PR #104)
  - ✅ #92 - Conversation Integrity (merged PR #105)
  - ✅ #93 - Shadow Mode Testing (merged PR #106)
  - ✅ #96 - Runtime Fallback (merged PR #107)
  - ✅ #95 - Operations Runbooks (merged PR #108)
  - ⏳ #97 - Load Testing (ready to start)
- **Phase 3:** 0% complete (blocked on shadow mode validation)

**Next Actions:**
1. Execute #97 (Load Testing with dual-mode scenarios)
2. Run shadow mode for 30 days
3. Validate Phase 2 exit criteria before Phase 3

---

## Timeline Estimate

- **Phase 1:** 1-2 weeks (wrapping up)
- **Phase 2:** 2-3 weeks (infrastructure + ops)
- **Shadow Mode:** 30 days (parallel with other work)
- **Phase 3:** 2-3 days (cleanup)

**Total:** ~8-10 weeks from now to production-ready headless mode

---

## References

- **Technical Spec:** [HEADLESS-AGENT-SPEC.md](design-research/HEADLESS-AGENT-SPEC.md)
- **Reference Implementation:** [Network Chuck's claude-phone](https://github.com/theNetworkChuck/claude-phone)
- **Issues:** #86, #88-#98

## Addressed Watchpoints

✅ **Ownership & SLIs** - Issue #98 defines clear SLIs/SLOs with ownership per team
✅ **Shared Telemetry Stack** - Issue #98 creates unified metrics pipeline with Prometheus/Grafana
✅ **App-layer UX** - Tracked in #86 (AgentChatPanel, cancel controls)
✅ **Data Migration** - Added to #92 (tmux transcript migration scripts)

---

*Last updated: 2025-01-24*
