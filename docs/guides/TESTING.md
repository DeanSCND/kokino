# Testing Guide

> **Testing Patterns, Running Tests, and Coverage**
>
> **Last Updated:** 2026-01-26

---

## Overview

Kokino uses **Vitest** for testing across all workspaces. This guide covers test organization, writing tests, running tests, and maintaining high quality through comprehensive testing.

**Testing Philosophy:**
- **Test behavior, not implementation** - Focus on what code does, not how
- **Fast feedback** - Tests should run in seconds, not minutes
- **Reliable** - Tests should pass consistently
- **Maintainable** - Tests should be easy to understand and update

---

## Test Organization

### Directory Structure

```
broker/
├── tests/
│   ├── unit/                  # Unit tests (isolated)
│   │   ├── AgentRegistry.test.js
│   │   ├── TicketStore.test.js
│   │   └── CircuitBreaker.test.js
│   ├── integration/           # Integration tests (real HTTP)
│   │   ├── agents.test.js
│   │   ├── messaging.test.js
│   │   └── teams.test.js
│   └── fixtures/              # Test data
│       ├── agent-config.json
│       └── conversation.jsonl

ui/
├── src/
│   ├── components/
│   │   ├── AgentCard.jsx
│   │   └── AgentCard.test.jsx  # Co-located with component
│   ├── stores/
│   │   ├── useAgentStore.js
│   │   └── useAgentStore.test.js
│   └── services/
│       ├── agentService.js
│       └── agentService.test.js

mcp/
├── src/
│   └── tools/
│       ├── send_message.ts
│       └── send_message.test.ts
```

---

## Running Tests

### All Workspaces
```bash
# Run all tests in all workspaces
npm test -ws

# Run tests with coverage
npm test -ws -- --coverage
```

### Specific Workspace
```bash
# Broker tests
npm test -w broker

# UI tests
npm test -w ui

# MCP tests (not yet implemented)
npm test -w mcp
```

### Watch Mode
```bash
# Re-run tests on file changes
npm test -w broker -- --watch

# Watch specific file
npm test -w broker -- --watch AgentRegistry.test.js
```

### Run Specific Test
```bash
# Run single test file
npm test -w broker -- AgentRegistry.test.js

# Run tests matching pattern
npm test -w broker -- --grep "should register agent"
```

### Coverage Report
```bash
npm test -w broker -- --coverage

# Coverage thresholds (configured in vitest.config.js)
# branches: 80%
# functions: 80%
# lines: 80%
# statements: 80%
```

---

## Writing Unit Tests

### Basic Structure

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MyClass } from '../src/MyClass.js';

describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    // Setup before each test
    instance = new MyClass();
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something when condition is met', () => {
      const result = instance.methodName('input');

      expect(result).toBe('expected');
    });

    it('should throw error when input is invalid', () => {
      expect(() => {
        instance.methodName(null);
      }).toThrow('Input is required');
    });
  });
});
```

### Assertions (expect)

```javascript
// Equality
expect(value).toBe(5);              // Strict equality (===)
expect(value).toEqual({ a: 1 });    // Deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeNull();
expect(value).toBeUndefined();
expect(value).toBeDefined();

// Numbers
expect(value).toBeGreaterThan(3);
expect(value).toBeLessThan(5);
expect(value).toBeCloseTo(0.3);     // Floating point

// Strings
expect(string).toMatch(/pattern/);
expect(string).toContain('substring');

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain(item);
expect(array).toEqual(expect.arrayContaining([1, 2]));

// Objects
expect(obj).toHaveProperty('key');
expect(obj).toHaveProperty('key', 'value');
expect(obj).toMatchObject({ a: 1 });

// Functions
expect(fn).toHaveBeenCalled();
expect(fn).toHaveBeenCalledTimes(2);
expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
expect(() => fn()).toThrow();
```

---

## Mocking

### Mock Functions

```javascript
import { vi } from 'vitest';

// Create mock function
const mockFn = vi.fn();

// Mock with return value
const mockFn = vi.fn(() => 'result');

// Mock with implementation
const mockFn = vi.fn((x) => x * 2);

// Assertions
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg');
expect(mockFn).toHaveReturnedWith('result');

// Get mock data
mockFn.mock.calls;       // All calls: [[arg1, arg2], [arg3]]
mockFn.mock.results;     // All results
mockFn.mock.instances;   // All instances (for constructors)
```

### Mock Modules

```javascript
// Mock entire module
vi.mock('../utils/broker-client', () => ({
  brokerClient: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

// Use mocked module
import { brokerClient } from '../utils/broker-client';

it('should call broker API', async () => {
  vi.mocked(brokerClient.post).mockResolvedValue({ data: { success: true } });

  await myFunction();

  expect(brokerClient.post).toHaveBeenCalledWith('/endpoint', { param: 'value' });
});
```

### Mock Partial Module

```javascript
// Mock only specific exports
vi.mock('../utils/helpers', async () => {
  const actual = await vi.importActual('../utils/helpers');
  return {
    ...actual,
    someFunction: vi.fn(() => 'mocked')
  };
});
```

### Mock Timers

```javascript
import { vi } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should call function after timeout', () => {
  const callback = vi.fn();

  setTimeout(callback, 1000);

  vi.advanceTimersByTime(1000);  // Fast-forward time

  expect(callback).toHaveBeenCalled();
});
```

---

## React Component Tests

### Setup

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MyComponent } from './MyComponent';
```

### Rendering

```javascript
it('renders component', () => {
  render(<MyComponent title="Test" />);

  expect(screen.getByText('Test')).toBeInTheDocument();
});
```

### Querying Elements

```javascript
// By text
screen.getByText('Hello');
screen.getByText(/hello/i);  // Case insensitive

// By role (preferred)
screen.getByRole('button');
screen.getByRole('button', { name: /submit/i });

// By label
screen.getByLabelText('Email');

// By placeholder
screen.getByPlaceholderText('Enter email');

// By test ID (use sparingly)
screen.getByTestId('custom-element');

// Query variants:
// getBy*    - Throws if not found (use for assertions)
// queryBy*  - Returns null if not found (use for negative assertions)
// findBy*   - Async, waits for element (use for async rendering)
```

### User Interactions

```javascript
import { fireEvent } from '@testing-library/react';

// Click
fireEvent.click(screen.getByRole('button'));

// Type
const input = screen.getByLabelText('Email');
fireEvent.change(input, { target: { value: 'test@example.com' } });

// Submit form
fireEvent.submit(screen.getByRole('form'));
```

### Async Testing

```javascript
import { waitFor } from '@testing-library/react';

it('loads data asynchronously', async () => {
  render(<MyComponent />);

  // Wait for element to appear
  const element = await screen.findByText('Loaded data');
  expect(element).toBeInTheDocument();

  // OR use waitFor
  await waitFor(() => {
    expect(screen.getByText('Loaded data')).toBeInTheDocument();
  });
});
```

### Testing Hooks (Zustand)

```javascript
import { renderHook, act } from '@testing-library/react';
import { useAgentStore } from './useAgentStore';

describe('useAgentStore', () => {
  it('adds agent', () => {
    const { result } = renderHook(() => useAgentStore());

    act(() => {
      result.current.addAgent({ id: '1', name: 'Alice' });
    });

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].name).toBe('Alice');
  });
});
```

---

## Integration Tests

### HTTP Endpoint Tests

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('POST /agents/register', () => {
  let baseUrl;
  let server;

  beforeAll(async () => {
    // Start test server
    server = await startTestServer();
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    // Stop test server
    await server.close();
  });

  it('should register agent and return 200', async () => {
    const response = await fetch(`${baseUrl}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'Alice',
        cwd: '/workspace',
        capabilities: ['code']
      })
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.agentId).toBe('Alice');
  });

  it('should reject duplicate agent ID', async () => {
    // Register once
    await fetch(`${baseUrl}/agents/register`, {
      method: 'POST',
      body: JSON.stringify({ agentId: 'Bob', cwd: '/workspace' })
    });

    // Try to register again
    const response = await fetch(`${baseUrl}/agents/register`, {
      method: 'POST',
      body: JSON.stringify({ agentId: 'Bob', cwd: '/workspace' })
    });

    expect(response.status).toBe(409);  // Conflict
  });
});
```

### Database Tests

```javascript
import Database from 'better-sqlite3';

describe('Agent database operations', () => {
  let db;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new Database(':memory:');

    // Run migrations
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should insert agent', () => {
    const stmt = db.prepare('INSERT INTO agents (agent_id, cwd) VALUES (?, ?)');
    const result = stmt.run('Alice', '/workspace');

    expect(result.changes).toBe(1);

    const agent = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get('Alice');
    expect(agent.cwd).toBe('/workspace');
  });
});
```

---

## Test Fixtures

### Creating Fixtures

```javascript
// tests/fixtures/agents.json
[
  {
    "id": "agent-123",
    "name": "Alice",
    "role": "Frontend Developer",
    "status": "ready"
  },
  {
    "id": "agent-456",
    "name": "Bob",
    "role": "Backend Developer",
    "status": "idle"
  }
]
```

### Using Fixtures

```javascript
import agents from '../fixtures/agents.json';

describe('Agent operations', () => {
  it('should process agents from fixture', () => {
    const result = processAgents(agents);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
  });
});
```

---

## Test Coverage

### Generate Coverage Report

```bash
npm test -w broker -- --coverage
```

**Output:**
```
File                | % Stmts | % Branch | % Funcs | % Lines
--------------------|---------|----------|---------|--------
src/models/Agent.js |   95.23 |    88.88 |  100.00 |   95.00
src/services/Team.js|   87.50 |    75.00 |   90.00 |   87.50
```

### Coverage Thresholds

**`vitest.config.js`:**
```javascript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  }
});
```

### View HTML Report

```bash
npm test -- --coverage
open coverage/index.html  # macOS
```

---

## Best Practices

### Test Naming

```javascript
// ✅ Good: Descriptive, behavior-focused
it('should return error when agentId is missing', () => { });
it('should update agent status to ready after bootstrap', () => { });

// ❌ Bad: Vague, implementation-focused
it('works', () => { });
it('test agent function', () => { });
```

### Test Independence

```javascript
// ✅ Good: Tests are independent
describe('AgentRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new AgentRegistry();  // Fresh instance each time
  });

  it('test 1', () => { });
  it('test 2', () => { });
});

// ❌ Bad: Tests depend on execution order
describe('AgentRegistry', () => {
  const registry = new AgentRegistry();  // Shared instance

  it('test 1', () => {
    registry.register('Alice');
  });

  it('test 2', () => {
    expect(registry.get('Alice')).toBeDefined();  // Depends on test 1!
  });
});
```

### Don't Test Implementation Details

```javascript
// ✅ Good: Test public API
it('should update agent status', () => {
  const agent = { id: '1', status: 'idle' };
  const updated = updateAgentStatus(agent, 'ready');

  expect(updated.status).toBe('ready');
});

// ❌ Bad: Test internal implementation
it('should call _validateStatus', () => {
  const spy = vi.spyOn(AgentService.prototype, '_validateStatus');

  AgentService.updateStatus('1', 'ready');

  expect(spy).toHaveBeenCalled();  // Brittle!
});
```

### Use Meaningful Assertions

```javascript
// ✅ Good: Specific assertions
expect(response.status).toBe(200);
expect(response.data.agentId).toBe('Alice');
expect(response.data.status).toBe('ready');

// ❌ Bad: Vague assertions
expect(response).toBeTruthy();
expect(response.data).toBeDefined();
```

---

## Continuous Integration

### GitHub Actions (Planned)

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm test -ws
      - run: npm test -ws -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## Troubleshooting

### Tests Fail Intermittently

**Cause:** Race conditions, async timing issues

**Fix:**
- Use `waitFor` for async assertions
- Avoid hardcoded timeouts (use `vi.useFakeTimers()`)
- Ensure tests clean up after themselves

### Mock Not Working

**Cause:** Mock defined after import

**Fix:**
```javascript
// ✅ Correct: Mock before import
vi.mock('../module');
import { myFunction } from '../module';

// ❌ Wrong: Import before mock
import { myFunction } from '../module';
vi.mock('../module');  // Too late!
```

### Coverage Not Reflecting Changes

**Cause:** Cache issues

**Fix:**
```bash
# Clear Vitest cache
rm -rf node_modules/.vitest

# Re-run tests
npm test -- --coverage
```

---

## Related Documentation

- **[Development Guide](DEVELOPMENT.md)** - Local setup and workflow
- **[Conventions](../reference/CONVENTIONS.md)** - Code style and standards
- **[Contributing](CONTRIBUTING.md)** - PR workflow and review process

---

**Write tests, sleep better! 😴**
