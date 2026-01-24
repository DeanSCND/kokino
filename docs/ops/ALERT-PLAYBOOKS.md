# Alert Response Playbooks

**Incident response procedures for SLO-based alerts**

---

## Overview

This document provides step-by-step response procedures for each alert type defined in [SLO-TARGETS.md](../SLO-TARGETS.md).

**Alert Severity Levels:**
- **P1 (Critical)** - Immediate response required, page on-call
- **P2 (High)** - Respond within 1 hour during business hours
- **P3 (Medium)** - Investigate during next work session

---

## Alert Definitions

| Alert | Trigger | Severity | Owner |
|-------|---------|----------|-------|
| [Availability SLO Breach](#availability-slo-breach-p1) | <99% for 1h | P1 | @backend-team |
| [Latency SLO Breach](#latency-slo-breach-p2) | P95 >60s for 5min | P2 | @backend-team |
| [Correctness SLO Breach](#correctness-slo-breach-p2) | Match rate <90% for 24h | P2 | @qa-team |
| [Data Integrity Failure](#data-integrity-failure-p1) | Any integrity event | P1 | @data-team |
| [Resource Efficiency Alert](#resource-efficiency-alert-p2) | Avg memory >1GB for 1h | P2 | @ops-team |
| [Environment Degraded](#environment-degraded-p2) | CLI env check failed | P2 | @ops-team |
| [Circuit Breaker Opened](#circuit-breaker-opened-p2) | 5 consecutive failures | P2 | @backend-team |
| [Lock Timeout](#lock-timeout-p3) | Agent locked >5min | P3 | @backend-team |

---

## Availability SLO Breach (P1)

### Trigger

```
Availability < 99% for 1 hour
Error budget >10% consumed in 1 hour (fast burn)
```

### Severity

P1 (Critical) - Immediate response

### Owner

@backend-team

### Alert Message

```
=¨ P1: Availability SLO breach detected
Current: 98.2% (target: 99.5%)
Error budget: 45% consumed (220min ’ 99min remaining)
Dashboard: http://grafana/headless-availability
Runbook: docs/ops/ALERT-PLAYBOOKS.md#availability-slo-breach-p1
```

### Investigation Steps

#### 1. Confirm Alert (1 min)

```bash
# Check current availability
curl http://127.0.0.1:5050/api/slo/status | jq '.availability'

# Expected response:
# {
#   "current": 0.982,
#   "target": 0.995,
#   "breached": true,
#   "errorBudgetRemaining": 0.55
# }
```

#### 2. Identify Failure Pattern (3 min)

```bash
# View recent failures
curl http://127.0.0.1:5050/api/metrics/events?type=EXECUTION_FAILED&limit=50 | jq

# Analyze by CLI type
curl http://127.0.0.1:5050/api/metrics/failures/by-cli | jq

# Analyze by agent
curl http://127.0.0.1:5050/api/metrics/failures/by-agent | jq
```

**Common Patterns:**

| Pattern | Cause | Solution |
|---------|-------|----------|
| All CLIs failing | Network/API outage | Wait for external recovery |
| Single CLI failing | CLI bug/quota | Disable CLI via fallback |
| Single agent failing | Agent env issue | Reset agent session |
| Random failures | Transient issues | Monitor, may self-heal |

#### 3. Check Root Cause (5 min)

```bash
# Check environment health
curl http://127.0.0.1:5050/api/health/environment | jq

# Check circuit breaker status
curl http://127.0.0.1:5050/agents/circuits/status | jq

# Check broker logs
tail -100 broker/logs/broker.log | grep ERROR
```

### Mitigation Actions

#### Action 1: Enable Fallback Mode (if headless failing)

```bash
# Disable headless for specific CLI
curl -X POST http://127.0.0.1:5050/api/fallback/cli/disable \
  -H 'Content-Type: application/json' \
  -d '{"cliType":"claude-code","reason":"P1: Availability SLO breach"}'

# Verify fallback enabled
curl http://127.0.0.1:5050/api/fallback/status | jq

# Monitor if availability improves
watch -n 5 'curl -s http://127.0.0.1:5050/api/slo/status | jq .availability.current'
```

#### Action 2: Restart Affected Agents

```bash
# Identify affected agents
curl http://127.0.0.1:5050/api/metrics/failures/by-agent | jq

# Reset agent sessions
for agent in $(jq -r '.[]
.agentId' failures.json); do
  curl -X POST http://127.0.0.1:5050/agents/$agent/end-session
done
```

#### Action 3: Escalate to Platform Lead

If not resolved in 15 minutes:

```bash
# Send page
curl -X POST https://pagerduty.com/api/v1/incidents \
  -H 'Authorization: Token token=YOUR_TOKEN' \
  -d '{"incident":{"type":"incident","title":"P1: Kokino Availability SLO Breach"}}'

# Or via Slack
slack send @platform-lead "P1 Availability breach - need help"
```

### Resolution

```bash
# Verify availability back above 99%
curl http://127.0.0.1:5050/api/slo/status | jq '.availability.current'

# Document incident
echo "Availability breach resolved at $(date)" >> incidents/availability-$(date +%Y%m%d).md

# Re-enable headless if fallback was used
curl -X POST http://127.0.0.1:5050/api/fallback/cli/enable \
  -H 'Content-Type: application/json' \
  -d '{"cliType":"claude-code"}'
```

---

## Latency SLO Breach (P2)

### Trigger

```
P95 latency > 60s for 5 minutes
```

### Severity

P2 (High) - Respond within 1 hour

### Owner

@backend-team

### Investigation Steps

```bash
# 1. Check current P95 latency
curl http://127.0.0.1:5050/metrics | grep headless_latency_p95_ms

# 2. Identify slow agents
curl http://127.0.0.1:5050/api/metrics/latency/by-agent | jq

# 3. Check lock contention
curl http://127.0.0.1:5050/agents/sessions/status | jq '.[] | select(.locked == true)'

# 4. Check Claude API status
curl https://status.anthropic.com/api/v2/status.json
```

### Mitigation

```bash
# If lock contention: cancel hung executions
curl -X POST http://127.0.0.1:5050/agents/{slowAgent}/execute/cancel

# If Claude API slow: wait for recovery (nothing we can do)

# If specific agent slow: investigate agent environment
curl http://127.0.0.1:5050/api/health/environment?cli={agentType}
```

---

## Correctness SLO Breach (P2)

### Trigger

```
Shadow mode output match rate < 90% for 24 hours
```

### Severity

P2 (High)

### Owner

@qa-team

### Investigation Steps

```bash
# 1. View shadow metrics
curl http://127.0.0.1:5050/api/shadow-mode/metrics?days=1 | jq

# 2. Get recent mismatches
curl http://127.0.0.1:5050/api/shadow-mode/mismatches?limit=20 | jq

# 3. Analyze mismatch patterns
# - Timestamps in output?
# - Tool call order differences?
# - Genuine output divergence?
```

### Mitigation

```bash
# If benign differences (timestamps, whitespace):
# Update fuzzy matching logic in ShadowModeController.js

# If genuine divergence:
# Investigate prompt layering, environment variables
curl http://127.0.0.1:5050/api/health/environment | jq
```

See [SHADOW-MODE-ANALYSIS.md](./SHADOW-MODE-ANALYSIS.md) for detailed debugging.

---

## Data Integrity Failure (P1)

### Trigger

```
Any CONVERSATION_INTEGRITY_FAIL or ORPHAN_DETECTED event
```

### Severity

P1 (Critical) - Immediate response

### Owner

@data-team

### Investigation Steps

```bash
# 1. Get integrity check results
curl http://127.0.0.1:5050/api/integrity/check | jq

# 2. Identify affected conversations
curl http://127.0.0.1:5050/api/integrity/stats | jq

# 3. View orphaned turns
sqlite3 broker/data/kokino.db <<SQL
SELECT turn_id, conversation_id, content
FROM turns
WHERE conversation_id NOT IN (SELECT conversation_id FROM conversations);
SQL
```

### Mitigation

```bash
# Run automated cleanup (if safe)
curl -X POST http://127.0.0.1:5050/api/integrity/cleanup | jq

# If corruption detected: escalate to data lead immediately
```

See [ENVIRONMENT-TROUBLESHOOTING.md](./ENVIRONMENT-TROUBLESHOOTING.md#database-corruption) for recovery procedures.

---

## Resource Efficiency Alert (P2)

### Trigger

```
Average memory > 1GB for 1 hour
```

### Severity

P2 (High)

### Owner

@ops-team

### Investigation Steps

```bash
# 1. Check current memory usage
curl http://127.0.0.1:5050/agents/processes/status | jq

# 2. Identify memory hogs
ps aux | grep "claude\|droid\|gemini" | sort -k4 -rn | head -10

# 3. Check for memory leaks
# Monitor over time - is memory growing continuously?
watch -n 10 'curl -s http://127.0.0.1:5050/agents/processes/status | jq ".[] | {agent: .agentId, memoryMB}"'
```

### Mitigation

```bash
# If leak detected: restart broker
pkill -f "node.*broker"
npm run dev --workspace=broker

# If large conversations: cleanup old data
node scripts/cleanup-sessions.js --max-age 7d
```

---

## Environment Degraded (P2)

### Trigger

```
Environment doctor check failed for any CLI
```

### Severity

P2 (High)

### Owner

@ops-team

### Investigation Steps

```bash
# Run environment diagnostics
./scripts/diagnose-headless.sh

# Check specific CLI
curl http://127.0.0.1:5050/api/health/environment?cli=claude-code | jq
```

### Mitigation

Follow [ENVIRONMENT-TROUBLESHOOTING.md](./ENVIRONMENT-TROUBLESHOOTING.md) for specific failure types:

- Binary not found ’ Install CLI
- Auth failed ’ Re-login
- Disk space low ’ Clean up
- Dry-run failed ’ Check logs

---

## Circuit Breaker Opened (P2)

### Trigger

```
Circuit breaker opened for agent after 5 consecutive failures
```

### Severity

P2 (High)

### Owner

@backend-team

### Investigation Steps

```bash
# 1. Check circuit status
curl http://127.0.0.1:5050/agents/circuits/status | jq

# 2. View recent failures for agent
curl http://127.0.0.1:5050/agents/{agentId}/logs?lines=200 | jq

# 3. Identify root cause
# - Auth issue?
# - Quota exceeded?
# - CLI bug?
```

### Mitigation

```bash
# Fix root cause (auth, quota, etc.)

# Wait for auto-reset (60s) or manual reset:
curl -X POST http://127.0.0.1:5050/agents/{agentId}/circuit/reset
```

---

## Lock Timeout (P3)

### Trigger

```
Agent lock timeout after 5 minutes
```

### Severity

P3 (Medium)

### Owner

@backend-team

### Investigation Steps

```bash
# 1. Check session status
curl http://127.0.0.1:5050/agents/sessions/status | jq '.[] | select(.agentId == "{agentId}")'

# 2. View agent logs
curl http://127.0.0.1:5050/agents/{agentId}/logs?lines=100 | jq

# 3. Check if execution hung
ps aux | grep "claude.*{agentId}"
```

### Mitigation

```bash
# Cancel execution
curl -X POST http://127.0.0.1:5050/agents/{agentId}/execute/cancel

# If still stuck, end session
curl -X POST http://127.0.0.1:5050/agents/{agentId}/end-session
```

See [SESSION-MANAGEMENT.md](./SESSION-MANAGEMENT.md#scenario-1-agent-stuck-in-executing-state) for detailed procedures.

---

## Escalation Matrix

| Alert Type | Primary Owner | Escalation (15 min) | Escalation (1 hour) | Channel |
|------------|---------------|---------------------|---------------------|---------|
| Availability SLO | @backend-team | @platform-lead | @eng-director | #headless-alerts |
| Latency SLO | @backend-team | @platform-lead | N/A | #headless-alerts |
| Correctness SLO | @qa-team | @qa-lead | N/A | #shadow-mode-alerts |
| Data Integrity | @data-team | @data-lead | @eng-director | #critical-alerts |
| Resource Efficiency | @ops-team | @ops-lead | N/A | #ops-alerts |
| Environment Degraded | @ops-team | @backend-team | N/A | #ops-alerts |
| Circuit Breaker | @backend-team | @platform-lead | N/A | #headless-alerts |
| Lock Timeout | @backend-team | N/A | N/A | #headless-alerts |

---

## Post-Incident Review

After resolving P1/P2 incidents:

1. **Document Timeline**
   ```bash
   # Create incident report
   cat > incidents/incident-$(date +%Y%m%d-%H%M).md <<EOF
   # Incident: Availability SLO Breach

   **Date:** $(date)
   **Duration:** 23 minutes
   **Severity:** P1
   **Owner:** @backend-team

   ## Timeline
   - 12:00 - Alert triggered (98.2% availability)
   - 12:03 - On-call responded, identified claude-code failures
   - 12:05 - Enabled fallback to tmux
   - 12:10 - Availability improved to 99.1%
   - 12:23 - Resolved - root cause: auth token expired

   ## Root Cause
   Claude Code auth token expired. Environment doctor didn't catch it because dry-run check was skipped.

   ## Action Items
   - [ ] Add token expiry check to environment doctor
   - [ ] Enable auto-refresh of auth tokens
   - [ ] Improve alert message to include likely causes
   EOF
   ```

2. **Schedule Retrospective**
   - Within 48 hours for P1
   - Within 1 week for P2

3. **Update Runbook**
   - Add new failure patterns discovered
   - Improve mitigation steps

---

## Reference

- **SLO Definitions:** [../SLO-TARGETS.md](../SLO-TARGETS.md)
- **Environment Troubleshooting:** [ENVIRONMENT-TROUBLESHOOTING.md](./ENVIRONMENT-TROUBLESHOOTING.md)
- **Session Management:** [SESSION-MANAGEMENT.md](./SESSION-MANAGEMENT.md)
- **Shadow Mode Analysis:** [SHADOW-MODE-ANALYSIS.md](./SHADOW-MODE-ANALYSIS.md)
- **Metrics API:** `GET /api/metrics/slo`
- **Grafana Dashboards:** `monitoring/grafana/`

---

*Last Updated: 2025-01-24*
