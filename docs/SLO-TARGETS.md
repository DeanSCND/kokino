# SLO Targets & Error Budgets

This document defines Service Level Indicators (SLIs), Service Level Objectives (SLOs), and error budgets for Kokino's headless agent execution system.

## Service Level Indicators (SLIs)

### 1. Availability

**Definition:** Percentage of executions that complete successfully without errors.

**Measurement:**
```sql
SELECT
  COUNT(CASE WHEN success = 1 THEN 1 END) / COUNT(*) as availability
FROM metrics
WHERE event IN ('EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_TIMEOUT')
  AND timestamp >= datetime('now', '-30 days')
```

**Target:** ≥99.5% (30-day rolling window)

**Error Budget:** 0.5% = ~220 minutes of failed executions per month

**Alert Threshold:** <99.0% for 1 hour

**Owner:** Backend Team (@backend-team)

**Runbook:** [Availability SLO Breach](#availability-slo-breach-runbook)

---

### 2. Latency

**Definition:** P95 execution time (time from EXECUTION_STARTED to EXECUTION_COMPLETED).

**Measurement:**
```sql
SELECT duration_ms
FROM metrics
WHERE event = 'EXECUTION_COMPLETED'
  AND timestamp >= datetime('now', '-24 hours')
ORDER BY duration_ms
LIMIT 1 OFFSET (SELECT COUNT(*) * 0.95 FROM metrics WHERE event = 'EXECUTION_COMPLETED')
```

**Target:** P95 <30 seconds (24-hour window)

**Error Budget:** 10% of executions may exceed 30s

**Alert Threshold:** P95 >60s for 5 minutes

**Owner:** Backend Team (@backend-team)

**Runbook:** [Latency SLO Breach](#latency-slo-breach-runbook)

---

### 3. Correctness (Shadow Mode Only)

**Definition:** Percentage of executions where headless output matches tmux output.

**Measurement:** During shadow mode testing (#93), compare headless vs tmux responses.

**Target:** ≥95% match rate

**Error Budget:** 5% mismatch allowed

**Alert Threshold:** <90% for 24 hours

**Owner:** QA Team (@qa-team)

**Runbook:** [Correctness SLO Breach](#correctness-slo-breach-runbook)

---

### 4. Data Integrity

**Definition:** Percentage of conversations with consistent state (no orphaned turns, valid foreign keys).

**Measurement:**
```sql
SELECT
  (SELECT COUNT(*) FROM conversations) -
  (SELECT COUNT(*) FROM metrics WHERE event = 'CONVERSATION_INTEGRITY_FAIL')
  / (SELECT COUNT(*) FROM conversations) as integrity_rate
```

**Target:** 100% (zero tolerance)

**Error Budget:** 0% = no failures allowed

**Alert Threshold:** Any failure (immediate P1 incident)

**Owner:** Data Team (@data-team)

**Runbook:** [Data Integrity Failure](#data-integrity-failure-runbook)

---

### 5. Resource Efficiency

**Definition:** Average memory consumption per execution.

**Measurement:** Track process RSS memory via `process.memoryUsage().rss` during execution.

**Target:** <500MB average per execution

**Error Budget:** 20% of executions may exceed 500MB

**Alert Threshold:** >1GB average for 1 hour

**Owner:** Ops Team (@ops-team)

**Runbook:** [Resource Efficiency Alert](#resource-efficiency-alert-runbook)

---

## Error Budget Policy

### Monthly Error Budget

| SLI | SLO Target | Error Budget | Downtime Allowed |
|-----|------------|--------------|------------------|
| Availability | 99.5% | 0.5% | 220 min/month |
| Latency (P95) | <30s | 10% over budget | Variable |
| Correctness | 95% | 5% | N/A (shadow mode) |
| Data Integrity | 100% | 0% | Zero tolerance |
| Resource Efficiency | <500MB | 20% over budget | N/A |

### Budget Consumption Alerts

- **Fast Burn:** >10% budget consumed in 1 hour → P1 incident
- **Slow Burn:** >50% budget consumed in 7 days → P2 warning
- **Budget Exhausted:** 100% consumed → Freeze deployments, investigate

### Response to Budget Exhaustion

1. **Stop non-critical changes** - Only hotfixes allowed
2. **Root cause analysis** - Identify source of failures/slowness
3. **Remediation plan** - Document fix and timeline
4. **Retrospective** - Review after budget replenished

---

## Alert Runbooks

### Availability SLO Breach Runbook

**Trigger:** Availability <99.0% for 1 hour

**Severity:** P1 (Critical)

**Investigation Steps:**

1. Check `/api/slo/status` for current availability
2. Query recent failures:
   ```bash
   curl http://localhost:5050/api/slo/status | jq '.availability'
   ```
3. Check broker logs for EXECUTION_FAILED events:
   ```bash
   grep EXECUTION_FAILED broker/broker.log | tail -50
   ```
4. Identify failure pattern:
   - Specific agent failing?
   - Specific CLI type (claude-code, gemini, etc.)?
   - Environment issue (API keys, disk space)?

**Mitigation:**

- If API key issue: Refresh credentials in `~/.claude/.env`
- If disk space: Clean up old metrics/conversations
- If CLI bug: Roll back to previous version
- If systemic: Enable fallback mode (#96) to switch to tmux

**Escalation:** If not resolved in 30 minutes → Page @platform-lead

---

### Latency SLO Breach Runbook

**Trigger:** P95 latency >60s for 5 minutes

**Severity:** P2 (High)

**Investigation Steps:**

1. Check current P95 latency:
   ```bash
   curl http://localhost:5050/metrics | grep headless_latency_p95_ms
   ```
2. Identify slow agents:
   ```sql
   SELECT agent_id, AVG(duration_ms) as avg_latency
   FROM metrics
   WHERE event = 'EXECUTION_COMPLETED'
     AND timestamp >= datetime('now', '-1 hour')
   GROUP BY agent_id
   ORDER BY avg_latency DESC
   LIMIT 10
   ```
3. Check for lock contention (agents waiting for locks)
4. Review Claude API status (external dependency)

**Mitigation:**

- If lock contention: Increase timeout or cancel hung executions
- If Claude API slow: Nothing we can do, wait for recovery
- If specific agent slow: Investigate agent's cwd/environment

**Escalation:** If sustained >1 hour → Notify @backend-team lead

---

### Correctness SLO Breach Runbook

**Trigger:** Shadow mode match rate <90% for 24 hours

**Severity:** P2 (High)

**Investigation Steps:**

1. Review SHADOW_MISMATCH events:
   ```sql
   SELECT metadata FROM metrics WHERE event = 'SHADOW_MISMATCH' ORDER BY timestamp DESC LIMIT 20
   ```
2. Compare tmux vs headless outputs manually
3. Identify pattern:
   - Different response content?
   - Different tool calls?
   - Timeout discrepancies?

**Mitigation:**

- If content differences: Review prompt layering (buildAgentPrompt)
- If tool call differences: Check environment variables (PATH, etc.)
- If timeout differences: Adjust timeout settings

**Escalation:** If >50 mismatches in 24h → QA lead review

---

### Data Integrity Failure Runbook

**Trigger:** Any CONVERSATION_INTEGRITY_FAIL or ORPHAN_DETECTED event

**Severity:** P1 (Critical)

**Investigation Steps:**

1. Identify affected conversation:
   ```sql
   SELECT metadata FROM metrics WHERE event = 'CONVERSATION_INTEGRITY_FAIL' ORDER BY timestamp DESC LIMIT 1
   ```
2. Run integrity check:
   ```bash
   # (This will be implemented in #92)
   npm run integrity-check --conversation <id>
   ```
3. Check for race conditions (concurrent writes to same conversation)
4. Review transaction logs if database corruption

**Mitigation:**

- If orphaned turns: Run repair script to reassign
- If foreign key violation: Manually fix database
- If corruption: Restore from backup (if available)

**Escalation:** Immediate page to @data-team lead

---

### Resource Efficiency Alert Runbook

**Trigger:** Average memory >1GB for 1 hour

**Severity:** P2 (High)

**Investigation Steps:**

1. Check memory usage per agent:
   ```sql
   SELECT agent_id, AVG(CAST(metadata->>'memoryMB' AS REAL)) as avg_memory
   FROM metrics
   WHERE event = 'EXECUTION_COMPLETED'
     AND timestamp >= datetime('now', '-1 hour')
   GROUP BY agent_id
   ORDER BY avg_memory DESC
   ```
2. Identify memory leak pattern (increasing over time?)
3. Check for large conversation histories (too many turns)

**Mitigation:**

- If leak: Restart broker to clear state
- If large conversations: Implement conversation pruning
- If specific agent: Investigate agent's workload

**Escalation:** If memory continues growing → Ops team investigate

---

## Monitoring Endpoints

- **Prometheus Metrics:** `GET http://localhost:5050/metrics`
- **SLI Status:** `GET http://localhost:5050/api/slo/status`
- **Grafana Dashboard:** `monitoring/grafana/headless-dashboard.json`

## Ownership Matrix

| Alert Type | Primary Owner | Escalation Path | Notification Channel |
|------------|---------------|-----------------|----------------------|
| Availability SLO | @backend-team | @platform-lead | #headless-alerts |
| Latency SLO | @backend-team | @platform-lead | #headless-alerts |
| Correctness SLO | @qa-team | @qa-lead | #shadow-mode-alerts |
| Data Integrity | @data-team | @data-lead | #critical-alerts (P1) |
| Resource Efficiency | @ops-team | @ops-lead | #ops-alerts |

---

## Historical SLO Performance

*(To be updated monthly)*

| Month | Availability | Latency P95 | Budget Consumed |
|-------|--------------|-------------|-----------------|
| Jan 2026 | TBD | TBD | TBD |

---

## References

- [Issue #98 - Telemetry & Monitoring](https://github.com/DeanSCND/kokino/issues/98)
- [HEADLESS-ROADMAP.md](./HEADLESS-ROADMAP.md)
- [Prometheus Exposition Format](https://prometheus.io/docs/instrumenting/exposition_formats/)
