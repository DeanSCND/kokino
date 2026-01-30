# Broker Tests

## Test Structure

```
tests/
├── unit/                 # Unit tests (mocked dependencies)
├── integration/          # Integration tests (other features)
├── manual/               # Manual test scripts
└── fixtures/             # Test data
```

## Running Tests

```bash
# Unit tests only (fast, no broker required)
npm test

# Integration tests (requires specific setup)
npm run test:integration

# All tests
npm run test:all

# Watch mode
npm run test:watch
```

## WebSocket Monitoring Stream Tests

### Unit Tests (`unit/MonitoringStream.test.js`)
- **Purpose**: Fast, isolated tests of MonitoringStream class
- **Coverage**: Client management, filtering, heartbeats, shutdown
- **Dependencies**: Mocked WebSocket objects
- **Run**: `npm test`

✅ **Always run** as part of CI/local testing

### Manual Test Script (`manual/test-websocket-stream.js`)
- **Purpose**: End-to-end verification with running broker
- **Coverage**: Real WebSocket connections, message flow, filtering
- **Dependencies**: Requires `npm start` in separate terminal
- **Run**: `node tests/manual/test-websocket-stream.js`

✅ **Run before committing** WebSocket changes

**Why Manual?**
Integration tests that spin up an in-process broker are complex and prone to timing issues. The manual script provides:
- Visual verification of event flow
- Easy debugging of WebSocket behavior
- Real-world testing against running broker
- No test framework complexity

The combination of **unit tests** (automated, fast) + **manual script** (visual, thorough) provides better coverage than flaky integration tests.

## Writing New Tests

### Unit Tests
- Mock dependencies (WebSocket, database, HTTP)
- Test individual classes in isolation
- Use Vitest + mocking utilities

Example:
```javascript
import { describe, it, expect, vi } from 'vitest';

describe('MyClass', () => {
  it('should do something', () => {
    const mock = vi.fn();
    // test code
  });
});
```

### Integration Tests
- Test full HTTP/WebSocket endpoints
- Use real database (test instance)
- Clean up after tests

Example:
```javascript
beforeEach(async () => {
  // Setup test database
});

afterEach(async () => {
  // Clean up
});
```

### Manual Tests
- Document prerequisites clearly
- Provide visual output for verification
- Include usage examples

## Test Coverage

Run coverage report:
```bash
npm test -- --coverage
```

## Debugging Tests

```bash
# Run specific test file
npm test -- MonitoringStream.test.js

# Run with verbose output
npm test -- --reporter=verbose

# Debug with node inspector
node --inspect-brk node_modules/.bin/vitest run
```
