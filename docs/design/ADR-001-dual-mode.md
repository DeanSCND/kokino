# ADR-001: Dual-Mode Agent Execution

**Status:** Active  
**Date:** 2026-01-26  
**Deciders:** Core team  
**Context:** Phase 4 migration from tmux to headless CLI agents

---

## Context and Problem Statement

Kokino needs to execute AI agents (Claude Code, Gemini, Codex) reliably. We initially used tmux terminal injection but encountered limitations. We need to migrate to headless CLI execution while maintaining production stability.

**Key Requirements:**
- Execute agents programmatically
- Stream real-time output
- Support cancellation
- Handle errors gracefully
- Maintain backward compatibility during migration

---

## Decision Drivers

- **Reliability:** Tmux injection is fragile (timing issues, escape sequences)
- **Performance:** Headless CLI is faster to start and more responsive
- **Features:** Headless supports structured output (JSONL), better error handling
- **Risk:** Can't migrate all at once - need gradual rollout
- **Production safety:** Need fallback if headless fails

---

## Considered Options

### Option 1: Immediate Migration to Headless Only
**Pros:**
- Simpler codebase (one execution path)
- Faster delivery

**Cons:**
- High risk (no fallback)
- Can't validate reliability before full rollout
- Difficult rollback if issues found

### Option 2: Tmux Forever
**Pros:**
- Known limitations
- No migration risk

**Cons:**
- Fragile (timing, escape sequences)
- Limited features
- Poor error handling

### Option 3: Dual-Mode with Shadow Testing (CHOSEN)
**Pros:**
- Gradual migration path
- Shadow mode validates headless reliability
- Tmux fallback for production safety
- Can compare outputs side-by-side

**Cons:**
- More complex codebase temporarily
- Higher resource usage during shadow period

---

## Decision Outcome

**Chosen option:** Dual-Mode with Shadow Testing

### Implementation

**Three execution modes:**

1. **tmux mode** (legacy):
   - Inject commands via tmux buffer
   - Poll output with `capture-pane`
   - Used as fallback

2. **headless mode** (modern):
   - Spawn CLI as subprocess
   - Parse JSONL output stream
   - Primary execution path

3. **shadow mode** (validation):
   - Run both tmux AND headless in parallel
   - Compare outputs
   - Collect reliability metrics
   - Don't block on headless failures

**Configuration:** Per-agent via `commMode` setting
```javascript
{
  "commMode": "headless",  // or "tmux" or "shadow"
  "cliType": "claude-code"
}
```

**Fallback Strategy:**
```javascript
// Runtime fallback if headless unavailable
GET /api/fallback/status
POST /api/fallback/cli/disable  // Force tmux mode
POST /api/fallback/cli/enable   // Re-enable headless
```

### Migration Path

**Phase 1:** Build headless execution (DONE)
**Phase 2:** Add shadow mode (DONE)
**Phase 3:** Collect metrics, fix bugs (IN PROGRESS)
**Phase 4:** Default to headless (PLANNED)
**Phase 5:** Deprecate tmux (PLANNED)
**Phase 6:** Remove tmux code (FUTURE)

---

## Consequences

### Positive

- **Risk mitigation:** Tmux fallback prevents complete failure
- **Data-driven:** Shadow mode provides reliability metrics before full rollout
- **Flexibility:** Can switch modes per-agent or globally
- **Confidence:** Parallel validation catches edge cases early

### Negative

- **Complexity:** Two execution paths to maintain temporarily
- **Resource usage:** Shadow mode uses ~2x resources
- **Code debt:** Must eventually remove tmux code
- **Testing burden:** Must test both modes

### Neutral

- **Timeline:** Slower migration but safer
- **Documentation:** Must document both modes during transition

---

## Validation

### Success Metrics

**Headless reliability:** >99% success rate in shadow mode  
**Performance:** <5s to first output (vs ~10s tmux)  
**Error recovery:** Circuit breaker prevents cascading failures  

**Shadow mode metrics endpoint:**
```bash
GET /api/shadow-mode/metrics
```

**Current status (Phase 3):**
- Headless: 97% success rate (improving)
- Tmux: 95% success rate (baseline)
- Bugs found and fixed: 12
- Remaining blockers: 2 (authentication edge case, long-running task handling)

---

## Related

- **Implementation:** `broker/src/agents/AgentRunner.js` (headless)
- **Implementation:** `broker/src/utils/spawn-agent.js` (tmux)
- **Specification:** `docs/planning/HEADLESS_MIGRATION.md`
- **Metrics:** `GET /api/shadow-mode/metrics`

---

## Notes

**When to use tmux mode:**
- Headless CLI not available (not installed, auth expired)
- Debugging specific tmux integration issues
- Explicit user preference

**When headless becomes default:**
- After 2 weeks of >99% success rate in shadow mode
- All known bugs fixed
- Team consensus on readiness
