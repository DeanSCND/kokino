# Operations Guide - Kokino Headless Execution

**Quick Reference for Production Operations**

This directory contains operational runbooks, troubleshooting guides, and diagnostic tools for managing Kokino's headless agent execution system.

---

## 📚 Documentation Index

### Troubleshooting Guides

1. **[ENVIRONMENT-TROUBLESHOOTING.md](ENVIRONMENT-TROUBLESHOOTING.md)**
   - Environment doctor check failures
   - Missing binaries or PATH issues
   - Authentication and credential problems
   - Dry-run execution failures
   - Common fixes with step-by-step instructions

2. **[SESSION-MANAGEMENT.md](SESSION-MANAGEMENT.md)**
   - Reset stuck sessions
   - Clear all sessions after crash
   - View active sessions
   - Handle lock timeouts
   - Session state recovery

3. **[SHADOW-MODE-ANALYSIS.md](SHADOW-MODE-ANALYSIS.md)**
   - Interpret shadow mode metrics
   - Debug success rate divergence
   - Analyze output mismatches
   - Investigate latency regressions
   - Example debugging workflows

4. **[ALERT-PLAYBOOKS.md](ALERT-PLAYBOOKS.md)**
   - Environment degraded alerts
   - Circuit breaker opened alerts
   - Shadow mode threshold alerts
   - Immediate actions and escalation paths

---

## 🛠️ Diagnostic Scripts

Located in `../../scripts/`:

- **`diagnose-headless.sh`** - Comprehensive environment diagnostic (run first!)
- **`cleanup-sessions.js`** - Remove stale sessions and conversations
- **`rotate-logs.sh`** - Manual log rotation trigger
- **`check-shadow-mode.js`** - Analyze shadow mode results

**Quick diagnostic workflow:**
```bash
# 1. Check environment health
bash scripts/diagnose-headless.sh

# 2. If issues found, check specific areas:
curl http://localhost:5050/api/health/environment?cli=claude-code | jq

# 3. View active sessions
curl http://localhost:5050/agents/sessions/status | jq

# 4. Check fallback status
curl http://localhost:5050/api/fallback/status | jq

# 5. Review integrity
curl http://localhost:5050/api/integrity/check | jq
```

---

## 🚨 Common Production Scenarios

### Scenario 1: Agent Stuck in "Executing" State

**Symptom:** Agent shows executing for >5 minutes

**Actions:**
1. Check session status: `curl http://localhost:5050/agents/sessions/status | jq`
2. Cancel execution: `curl -X POST http://localhost:5050/agents/{agentId}/execute/cancel`
3. If still stuck, end session: `curl -X POST http://localhost:5050/agents/{agentId}/end-session`
4. See: [SESSION-MANAGEMENT.md](SESSION-MANAGEMENT.md#reset-stuck-session)

### Scenario 2: Headless Execution Failing

**Symptom:** `503 Service Unavailable` or execution errors

**Actions:**
1. Run environment doctor: `curl http://localhost:5050/api/health/environment?cli=claude-code | jq`
2. Check failed checks: Review `checks[]` array for failures
3. Fix identified issues per [ENVIRONMENT-TROUBLESHOOTING.md](ENVIRONMENT-TROUBLESHOOTING.md)
4. If unfixable, enable fallback: `curl -X POST http://localhost:5050/api/fallback/cli/disable -d '{"cliType":"claude-code","reason":"auth issue"}'`

### Scenario 3: Shadow Mode Mismatch Rate High

**Symptom:** Shadow mode metrics show <95% output match rate

**Actions:**
1. Get mismatches: `curl http://localhost:5050/api/shadow-mode/mismatches?limit=10 | jq`
2. Analyze patterns (whitespace, timestamps, nondeterminism)
3. See: [SHADOW-MODE-ANALYSIS.md](SHADOW-MODE-ANALYSIS.md#output-mismatch)

### Scenario 4: Circuit Breaker Opened

**Symptom:** Alert: "Circuit breaker opened for {agentId}"

**Actions:**
1. Check recent failures: `curl http://localhost:5050/api/shadow-mode/failures?mode=headless | jq`
2. Identify root cause (auth, quota, timeout)
3. Fix underlying issue
4. Wait for auto-reset (60s) or manual: `curl -X POST http://localhost:5050/agents/{agentId}/circuit/reset`
5. See: [ALERT-PLAYBOOKS.md](ALERT-PLAYBOOKS.md#circuit-breaker-opened)

---

## 📊 Monitoring Dashboards

### Key Endpoints

| Endpoint | Purpose | Expected Status |
|----------|---------|-----------------|
| `/health` | Broker health | 200 OK |
| `/metrics` | Prometheus metrics | 200 OK |
| `/api/slo/status` | SLI/SLO tracking | 200 OK |
| `/api/health/environment` | Environment doctor | 200 or 503 |
| `/api/integrity/check` | Data consistency | 200 or 503 |
| `/api/fallback/status` | Fallback overrides | 200 OK |
| `/api/shadow-mode/metrics` | Shadow testing | 200 OK |

### Grafana Dashboards

- **Headless Execution Overview** - Availability, latency, error budget
- **Shadow Mode Validation** - Match rates, divergence, latency delta
- **Resource Usage** - Memory, CPU, process counts
- **Circuit Breaker Status** - Per-CLI and per-agent states

---

## 🔧 Maintenance Tasks

### Daily
- [ ] Check SLO dashboard for breaches
- [ ] Review shadow mode metrics (during testing phase)
- [ ] Monitor fallback status (should be empty in steady state)

### Weekly
- [ ] Review environment health across all CLI types
- [ ] Analyze shadow mode failures and mismatches
- [ ] Check for stale sessions: `curl http://localhost:5050/agents/sessions/status | jq '.[] | select(.locked == true)'`

### Monthly
- [ ] Run full integrity check: `curl http://localhost:5050/api/integrity/check`
- [ ] Cleanup old metrics: `POST /api/metrics/cleanup?days=90`
- [ ] Review and update alert thresholds based on actual SLO performance

---

## 📖 Reference Documentation

- **Technical Spec:** [../design-research/HEADLESS-AGENT-SPEC.md](../design-research/HEADLESS-AGENT-SPEC.md)
- **Roadmap:** [../HEADLESS-ROADMAP.md](../HEADLESS-ROADMAP.md)
- **SLO Targets:** [../SLO-TARGETS.md](../SLO-TARGETS.md)
- **API Documentation:** [../API.md](../API.md)

---

## 🆘 Escalation Paths

| Issue Type | Primary Owner | Escalation | Channel |
|------------|---------------|------------|---------|
| Availability SLO breach | @backend-team | @platform-lead | #headless-alerts |
| Shadow mode failures | @qa-team | @qa-lead | #shadow-mode-alerts |
| Data integrity issues | @data-team | @data-lead | #critical-alerts |
| Environment degradation | @ops-team | @ops-lead | #ops-alerts |

---

## 🚀 Quick Start for New Operators

1. **First time setup:**
   ```bash
   # Run comprehensive diagnostic
   bash scripts/diagnose-headless.sh

   # Check all systems
   curl http://localhost:5050/health | jq
   curl http://localhost:5050/api/slo/status | jq
   ```

2. **Familiarize with key concepts:**
   - Read [ENVIRONMENT-TROUBLESHOOTING.md](ENVIRONMENT-TROUBLESHOOTING.md) (15 min)
   - Skim [SESSION-MANAGEMENT.md](SESSION-MANAGEMENT.md) (10 min)
   - Review [ALERT-PLAYBOOKS.md](ALERT-PLAYBOOKS.md) (10 min)

3. **Set up monitoring:**
   - Add Grafana dashboards
   - Configure alert channels
   - Test alert routing

4. **Practice common scenarios:**
   - Disable/enable CLI fallback
   - Force agent to tmux mode
   - Cancel a stuck execution
   - Run integrity check

---

*Last updated: 2025-01-24*
