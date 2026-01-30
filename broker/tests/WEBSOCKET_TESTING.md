# WebSocket Monitoring Stream - Testing Strategy

## Overview

The WebSocket monitoring stream (`ws://.../api/monitoring/stream`) is tested using a **two-tier approach**:

1. **Unit Tests** (automated, fast) - Test MonitoringStream class in isolation
2. **Manual Script** (visual, thorough) - Test full WebSocket flow with running broker

## Why Not Integration Tests?

**Question:** Why no automated end-to-end tests that spin up a broker?

**Answer:** Integration tests for WebSocket endpoints are complex and prone to timing issues:

- Spinning up in-process broker adds test complexity
- WebSocket timing issues cause flaky tests
- Event timing is non-deterministic across environments
- Debugging failures is harder than with manual scripts

**Better approach:** Comprehensive unit tests + visual manual verification

## Test Coverage

### ✅ Unit Tests (`tests/unit/MonitoringStream.test.js`)

**Coverage:**
- Client management (add, remove, multiple clients)
- Event broadcasting (all clients, closed connections)
- Filtering (by agent ID, by event type, combined filters)
- Filter matching (base types, targeted events)
- Heartbeat mechanism (start, stop, dead connection removal)
- Graceful shutdown (close all clients, send shutdown message)
- Event emission (client-connected, client-disconnected, broadcast)

**Runtime:** <300ms
**Dependencies:** None (mocked WebSocket objects)
**CI-safe:** ✅ Yes

**Run:**
```bash
npm test
```

### ✅ Manual Test Script (`tests/manual/test-websocket-stream.js`)

**Coverage:**
- Real WebSocket connection establishment
- Connection confirmation message
- `message.sent` events (full ticket flow)
- Agent filtering (filter by specific agents)
- Event type filtering (filter by event types)
- Filter clearing (null filters)
- Live event streaming

**Runtime:** ~10 seconds
**Dependencies:** Running broker on 127.0.0.1:5050
**CI-safe:** ❌ No (requires manual broker)

**Run:**
```bash
# Terminal 1: Start broker
npm start

# Terminal 2: Run test script
node tests/manual/test-websocket-stream.js
```

## Prerequisites for Manual Testing

**IMPORTANT:** You must start the broker before running manual tests!

```bash
# Start broker (required)
cd broker
npm start

# Verify broker is running
curl http://127.0.0.1:5050/health

# Run manual WebSocket test
node tests/manual/test-websocket-stream.js
```

**Why this matters:**
- The WebSocket endpoint requires a running HTTP server
- Tests connect to `ws://127.0.0.1:5050/api/monitoring/stream`
- Broker must be started first, or tests will fail with `ECONNREFUSED`

## Testing Workflow

### During Development
```bash
# Fast feedback loop - run unit tests on save
npm run test:watch

# After changes - verify manual flow
npm start  # separate terminal
node tests/manual/test-websocket-stream.js
```

### Before Committing
```bash
# 1. Run all unit tests
npm test

# 2. Verify manual WebSocket flow
npm start  # separate terminal
node tests/manual/test-websocket-stream.js

# 3. Check for visual confirmation of all events
```

### In CI/CD
```bash
# Only run unit tests (fast, no dependencies)
npm test
```

## What Each Test Type Validates

| Test Type | Client Management | Event Broadcasting | Filtering | Real Network | Speed |
|-----------|------------------|-------------------|-----------|-------------|-------|
| **Unit** | ✅ | ✅ | ✅ | ❌ | Fast (<300ms) |
| **Manual** | ✅ | ✅ | ✅ | ✅ | Slow (~10s) |

**Conclusion:** Combination provides full coverage without CI complexity.

## Debugging WebSocket Issues

### Check if broker is running
```bash
lsof -i :5050
curl http://127.0.0.1:5050/health
```

### View WebSocket events in browser
```javascript
// Open browser console at http://localhost:5173
const ws = new WebSocket('ws://127.0.0.1:5050/api/monitoring/stream');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
```

### Check broker logs
```bash
tail -f broker/broker.log
```

### Enable debug logging
```bash
DEBUG=kokino:* npm start
```

## Future Improvements

If automated integration tests become necessary:

1. Create test harness that spins up broker in-process
2. Use `vitest` fixtures to manage broker lifecycle
3. Add retry logic for WebSocket connection timing
4. Use longer timeouts (15s+) for event waiting
5. Add explicit cleanup between tests

**But:** Current approach (unit + manual) is simpler and more reliable.
