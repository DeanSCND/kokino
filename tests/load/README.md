# Load Testing Suite

Comprehensive load testing for Kokino's dual-mode agent communication (tmux + headless).

## Quick Start

```bash
# Make sure broker is running
cd broker && npm start

# In another terminal, run tests
node tests/load/headless-load-test.js
```

## Test Modes

### Full Suite (default)
Tests all scenarios in sequence:
```bash
node tests/load/headless-load-test.js
```

### Individual Tests
```bash
# Burst test only (headless mode)
node tests/load/headless-load-test.js --burst-only

# Fallback scenario only
node tests/load/headless-load-test.js --fallback-only

# Concurrency test only
node tests/load/headless-load-test.js --concurrency-only
```

## What Gets Tested

### 1. Headless Burst Test
- **Purpose:** Verify headless mode handles high throughput
- **Test:** 10 agents × 10 messages = 100 total messages
- **Success Criteria:** >95% success rate
- **Metrics:** Throughput (msg/sec), latency (P50/P95/P99)

### 2. Fallback Scenario Test
- **Purpose:** Verify graceful degradation when headless fails
- **Test:** Send 50 messages, disable headless mid-flight
- **Success Criteria:** <1% message loss during fallback
- **Validates:** Runtime fallback toggle works correctly

### 3. Concurrency Test
- **Purpose:** Verify session locking serializes concurrent requests
- **Test:** 5 concurrent requests to same agent
- **Success Criteria:** Requests execute serially (100% success)
- **Validates:** No race conditions or data corruption

## Tests Not Yet Implemented

These require manual tmux agent setup and are documented but skipped:

- **Tmux Burst Test:** Requires tmux agents spawned manually
- **Mixed-Mode Test:** Requires both tmux and headless agents
- **Soak Test:** 1-hour sustained load test
- **Resource Monitoring:** Memory/CPU tracking over time

## Exit Criteria (Phase 2)

From `docs/HEADLESS-ROADMAP.md`, load testing must achieve:

- ✅ **>95% success rate** under burst load (100 messages)
- ✅ **100% serialization** for concurrent requests
- ⏳ **>80% recovery rate** from failures (needs failure injection)
- ⏳ **<5% memory growth** over 1 hour (needs soak test)
- ⏳ **<10 orphaned processes** (needs process monitoring)
- ✅ **<1% message loss** during runtime fallback

**Status:** 3/6 criteria automated, 3/6 require additional tooling

## Troubleshooting

### Broker Not Reachable
```
❌ Broker not reachable at http://127.0.0.1:5050
```
**Fix:** Start the broker:
```bash
cd broker && npm start
```

### Test Timeouts
If tests hang, check:
1. Broker logs: `tail -f broker/logs/*.log`
2. Session status: `curl http://127.0.0.1:5050/agents/sessions/status | jq`
3. Environment health: `curl http://127.0.0.1:5050/api/health/environment | jq`

### Message Failures
If success rate is low:
1. Check environment doctor: `bash scripts/diagnose-headless.sh`
2. Verify CLI authentication: `claude auth login`
3. Check API quota/subscription status

## CI Integration

Add to GitHub Actions workflow:

```yaml
- name: Run Load Tests
  run: |
    cd broker && npm start &
    sleep 5
    node tests/load/headless-load-test.js --burst-only
  timeout-minutes: 10
```

## Future Enhancements

- [ ] Resource monitoring (memory/CPU tracking)
- [ ] Soak test (1-hour sustained load)
- [ ] Failure injection (kill processes mid-flight)
- [ ] Shadow mode comparison (tmux vs headless outputs)
- [ ] Mixed-mode testing automation
- [ ] Prometheus metrics export
- [ ] Load test dashboard (Grafana)

## Related Documentation

- [Issue #97](https://github.com/DeanSCND/kokino/issues/97) - Load testing spec
- [HEADLESS-ROADMAP.md](../../docs/HEADLESS-ROADMAP.md) - Phase 2 exit criteria
- [SLO-TARGETS.md](../../docs/SLO-TARGETS.md) - Production SLI/SLO targets
- [ops/](../../docs/ops/) - Operational runbooks
