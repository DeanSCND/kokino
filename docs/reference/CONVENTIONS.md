# Development Conventions

> **Code Style, Git Workflow, Testing Patterns, and PR Process**
>
> **Last Updated:** 2026-01-26

---

## Overview

This document defines the development conventions for Kokino. Following these conventions ensures consistency, maintainability, and smooth collaboration.

**Principles:**
- **Consistency over cleverness** - Predictable code is maintainable code
- **Convention over configuration** - Sensible defaults reduce decisions
- **Automate where possible** - Linters, formatters, tests catch errors early

---

## Code Style

### JavaScript/Node.js (Broker)

#### General Style
```javascript
// ✅ Use ES modules (not CommonJS)
import { nanoid } from 'nanoid';
// ❌ const { nanoid } = require('nanoid');

// ✅ Use const/let (not var)
const MAX_RETRIES = 3;
let retryCount = 0;

// ✅ Use template literals for strings
const message = `Agent ${agentId} is ready`;
// ❌ const message = 'Agent ' + agentId + ' is ready';

// ✅ Use async/await (not raw promises)
async function fetchAgent(id) {
  try {
    const agent = await agentService.get(id);
    return agent;
  } catch (error) {
    console.error('Failed:', error);
    throw error;
  }
}
```

#### Naming Conventions
```javascript
// Variables: camelCase
const agentId = 'alice-123';
const isReady = true;

// Functions: camelCase
function registerAgent(id, config) { }

// Classes: PascalCase
class AgentRegistry { }

// Constants: UPPER_SNAKE_CASE
const DEFAULT_TIMEOUT = 30000;
const MAX_AGENTS = 100;

// Private methods: underscore prefix
_validateConfig(config) { }

// File names: kebab-case.js
// agent-registry.js
// ticket-store.js
```

#### Function Style
```javascript
// ✅ Prefer named functions for clarity
function startAgent(agentId) {
  // ...
}

// ✅ Arrow functions for callbacks
agents.map(a => a.id);

// ✅ Destructure parameters when >3 args
function createAgent({ name, role, cwd, capabilities }) {
  // ...
}

// ✅ Default parameters
function executeAgent(agentId, prompt = 'Hello', timeout = 30000) {
  // ...
}
```

#### Error Handling
```javascript
// ✅ Always handle errors in async functions
async function executeAgent(agentId, prompt) {
  try {
    const result = await runner.execute(agentId, prompt);
    return result;
  } catch (error) {
    console.error(`Execution failed for ${agentId}:`, error);
    throw error;  // Re-throw or return error response
  }
}

// ✅ Use Error subclasses for domain errors
class AgentNotFoundError extends Error {
  constructor(agentId) {
    super(`Agent not found: ${agentId}`);
    this.name = 'AgentNotFoundError';
    this.agentId = agentId;
  }
}
```

---

### React/JSX (UI)

#### Component Style
```javascript
// ✅ Named exports for components
export const AgentCard = ({ agent, onStart, onStop }) => {
  // Use destructuring for props
  const { id, name, status } = agent;

  // Hooks at top of component
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  // Event handlers with handle* prefix
  const handleStart = async () => {
    setIsLoading(true);
    try {
      await onStart(id);
      toast.success('Agent started!');
    } catch (error) {
      toast.error(`Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Early returns for conditional rendering
  if (!agent) return null;

  return (
    <div className="agent-card">
      <h3>{name}</h3>
      <button onClick={handleStart} disabled={isLoading}>
        Start
      </button>
    </div>
  );
};
```

#### File Organization
```
components/
├── agents/               # Feature-based grouping
│   ├── AgentCard.jsx
│   ├── CreateAgentDialog.jsx
│   └── AgentLibraryPanel.jsx
└── monitoring/
    └── Dashboard.jsx
```

#### Prop Types (Optional)
```javascript
// Use JSDoc for prop documentation
/**
 * Agent card component
 * @param {Object} props
 * @param {Agent} props.agent - Agent object
 * @param {Function} props.onStart - Start handler
 */
export const AgentCard = ({ agent, onStart }) => {
  // ...
};
```

---

### TypeScript (MCP)

#### Type Definitions
```typescript
// ✅ Use interfaces for objects
interface Agent {
  agentId: string;
  cwd: string;
  capabilities: string[];
}

// ✅ Use type aliases for unions/intersections
type AgentStatus = 'idle' | 'ready' | 'executing' | 'error';

// ✅ Use enums sparingly (prefer string literals)
type BootstrapMode = 'none' | 'auto' | 'manual' | 'custom';

// ✅ Use Zod schemas for runtime validation
import { z } from 'zod';

const agentSchema = z.object({
  agentId: z.string().min(1),
  cwd: z.string(),
  capabilities: z.array(z.string()).default([])
});

// Infer TypeScript type from schema
type Agent = z.infer<typeof agentSchema>;
```

#### Async Functions
```typescript
// ✅ Always specify return types
async function createAgent(config: AgentConfig): Promise<Agent> {
  // ...
}

// ✅ Use type guards
function isAgent(obj: unknown): obj is Agent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'agentId' in obj &&
    typeof obj.agentId === 'string'
  );
}
```

---

## Git Workflow (Graphite)

### Branch Naming
```bash
# Feature branches
feature/agent-monitoring
feature/github-integration

# Bug fixes
fix/websocket-reconnect
fix/session-lock-race

# Documentation
docs/api-reference
docs/architecture-update

# Refactoring
refactor/extract-service-layer
refactor/zustand-migration
```

### Commit Messages
**Format:** Conventional Commits (https://www.conventionalcommits.org/)

```bash
# Structure
<type>(<scope>): <subject>

<body>

<footer>

# Types
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Code style (formatting, no logic change)
refactor: Code refactoring (no functionality change)
test:     Add or update tests
chore:    Maintenance (deps, build config)

# Examples
feat(broker): add agent execution cancellation

Implement POST /agents/:id/execute/cancel endpoint.
Adds session lock management to prevent concurrent executions.

Closes #42

---

fix(ui): prevent duplicate WebSocket connections

WebSocket was reconnecting on every state change.
Now uses useEffect with proper cleanup.

---

docs: update API reference with bootstrap endpoints

Added documentation for:
- POST /api/agents/:id/bootstrap
- GET /api/agents/:id/bootstrap/history
```

### Graphite Commands
```bash
# Create new branch
gt create feature/my-feature

# Create stacked branch
gt create feature/my-sub-feature  # Depends on my-feature

# Submit for review
gt submit                  # Current branch only
gt submit --stack          # Entire stack

# Sync with main
gt sync                    # Pull, rebase, clean up merged branches
gt sync --force            # Skip prompts

# Navigate stack
gt up                      # Move to parent branch
gt down                    # Move to child branch
gt log                     # Visualize stack

# Rebase stack
gt restack                 # Rebase all branches in stack

# Merge via GitHub
# 1. Use Graphite UI's "Merge (N) PRs" button
# 2. Or use "Rebase and merge" (NOT squash!)
# 3. Run: gt sync
```

**IMPORTANT:** See workspace CLAUDE.md for complete Graphite merge strategy

---

## Testing Patterns

### Unit Tests (Vitest)

#### Test File Organization
```
tests/
├── unit/                    # Unit tests (isolated)
│   ├── AgentRegistry.test.js
│   ├── TicketStore.test.js
│   └── CircuitBreaker.test.js
├── integration/             # Integration tests (real HTTP)
│   ├── agents.test.js
│   ├── messaging.test.js
│   └── teams.test.js
└── fixtures/                # Test data
    ├── agent-config.json
    └── conversation-log.jsonl
```

#### Test Structure
```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('AgentRegistry', () => {
  let registry;
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDatabase();
    registry = new AgentRegistry(mockDb);
  });

  afterEach(() => {
    mockDb.close();
  });

  describe('register', () => {
    it('should register new agent', () => {
      const result = registry.register('Alice', '/workspace', ['code']);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('Alice');
    });

    it('should reject duplicate agent ID', () => {
      registry.register('Alice', '/workspace', []);

      expect(() => {
        registry.register('Alice', '/other', []);
      }).toThrow('Agent already registered');
    });
  });

  describe('heartbeat', () => {
    it('should update last_seen timestamp', () => {
      registry.register('Alice', '/workspace', []);

      const before = Date.now();
      registry.heartbeat('Alice');
      const after = Date.now();

      const agent = registry.get('Alice');
      const lastSeen = new Date(agent.lastSeen).getTime();

      expect(lastSeen).toBeGreaterThanOrEqual(before);
      expect(lastSeen).toBeLessThanOrEqual(after);
    });
  });
});
```

#### Mocking
```javascript
// Mock external dependencies
vi.mock('../utils/broker-client', () => ({
  brokerClient: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

// Use mocks in tests
import { brokerClient } from '../utils/broker-client';

it('should call broker API', async () => {
  vi.mocked(brokerClient.post).mockResolvedValue({ data: { success: true } });

  await myFunction();

  expect(brokerClient.post).toHaveBeenCalledWith('/endpoint', { param: 'value' });
});
```

---

### React Component Tests

#### Component Test Structure
```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentCard } from './AgentCard';

describe('AgentCard', () => {
  const mockAgent = {
    id: 'agent-123',
    name: 'Alice',
    status: 'ready'
  };

  it('renders agent name', () => {
    render(<AgentCard agent={mockAgent} onStart={() => {}} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('calls onStart when button clicked', async () => {
    const handleStart = vi.fn().mockResolvedValue(undefined);

    render(<AgentCard agent={mockAgent} onStart={handleStart} />);

    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    await waitFor(() => {
      expect(handleStart).toHaveBeenCalledWith('agent-123');
    });
  });

  it('shows loading state during start', async () => {
    const handleStart = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<AgentCard agent={mockAgent} onStart={handleStart} />);

    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

---

### Integration Tests

#### API Integration Test
```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('POST /agents/register', () => {
  let baseUrl;
  let server;

  beforeAll(async () => {
    server = await startTestServer();
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('should register agent and return 200', async () => {
    const response = await fetch(`${baseUrl}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'Alice',
        cwd: '/workspace',
        capabilities: ['code', 'test']
      })
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.agentId).toBe('Alice');
  });
});
```

---

## Pull Request Process

### PR Title Format
```
<type>(<scope>): <description>

Examples:
feat(broker): add agent execution cancellation
fix(ui): prevent duplicate WebSocket connections
docs: update API reference
refactor(ui): extract service layer from components
```

### PR Description Template
```markdown
## Summary
Brief description of what this PR does

## Changes
- Bullet list of specific changes
- Keep it concise but informative

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Related
Closes #123
Related to #456

## Screenshots (if UI changes)
[Add screenshots if applicable]
```

### PR Review Checklist

**Before Requesting Review:**
- [ ] Tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No linting errors (when linter is configured)
- [ ] Documentation updated (if API/behavior changed)
- [ ] Commit messages follow convention
- [ ] PR description is clear and complete

**Reviewer Checklist:**
- [ ] Code follows conventions in this document
- [ ] Tests are adequate and passing
- [ ] No obvious bugs or security issues
- [ ] Documentation is updated
- [ ] Commit history is clean

### Merge Strategy
**For Stacked PRs:** Use Graphite UI's "Merge (N) PRs" or "Rebase and merge"  
**For Single PRs:** Any method acceptable  
**AVOID:** Squash and merge on stacked PRs (breaks stack)

**See:** Workspace CLAUDE.md for complete merge instructions

---

## Code Review Guidelines

### What to Look For
1. **Correctness**: Does it work as intended?
2. **Test Coverage**: Are edge cases tested?
3. **Readability**: Can you understand it easily?
4. **Performance**: Any obvious bottlenecks?
5. **Security**: Any vulnerabilities?
6. **Documentation**: Is it documented?

### How to Give Feedback
```markdown
# ✅ Good feedback (specific, actionable)
This function could throw if `agent` is undefined. Add a null check:

if (!agent) {
  throw new Error('Agent not found');
}

# ❌ Poor feedback (vague, not actionable)
This doesn't look right.
```

### Approval Process
- **1 approval required** for most PRs
- **2 approvals** for critical changes (database migrations, auth, security)
- **Self-merge allowed** for docs-only PRs

---

## File Organization

### Directory Structure
```
project/
├── src/
│   ├── index.js          # Entry point
│   ├── models/           # Data models
│   ├── services/         # Business logic
│   ├── api/              # API routes
│   ├── db/               # Database layer
│   └── utils/            # Utilities
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── reference/        # API, database, tech stack
│   ├── guides/           # How-to guides
│   ├── planning/         # Roadmaps, specs
│   ├── design/           # ADRs
│   └── ops/              # Runbooks
├── package.json
└── README.md
```

### Import Order
```javascript
// 1. Node.js built-ins
import fs from 'fs';
import path from 'path';

// 2. External dependencies
import { nanoid } from 'nanoid';
import Database from 'better-sqlite3';

// 3. Internal modules (absolute paths)
import { AgentRegistry } from './models/AgentRegistry.js';
import { logger } from './utils/logger.js';

// 4. Relative imports
import { validateConfig } from '../utils/validation.js';
```

---

## Documentation Standards

### File Naming
```
UPPER_CASE.md      # Top-level docs (README, API, DATABASE)
kebab-case.md      # Guides and specs
ADR-NNN-title.md   # Architecture Decision Records
```

### Markdown Style
```markdown
# Title (H1 - one per document)

## Section (H2)

### Subsection (H3)

- Use bullet lists for multiple items
- Start with capital letter
- No period at end (unless multi-sentence)

**Bold** for emphasis
`code` for inline code
```

### Code Examples
````markdown
```javascript
// Include language for syntax highlighting
// Add comments to explain non-obvious code
const agent = registry.get(agentId);
```
````

---

## Environment Variables

### Naming Convention
```bash
# UPPER_SNAKE_CASE
BROKER_URL=http://127.0.0.1:5050
MAX_RETRIES=3

# Prefix with module name for clarity
BROKER_PORT=5050
UI_PORT=5173
```

### .env Files
```bash
# .env - Default values (committed)
BROKER_PORT=5050

# .env.local - Local overrides (gitignored)
BROKER_PORT=5051
DEBUG=kokino:*

# .env.test - Test environment (committed)
NODE_ENV=test
BROKER_PORT=5099
```

---

## Performance Guidelines

### Database Queries
```javascript
// ✅ Use indexes for frequent queries
CREATE INDEX idx_agents_last_seen ON agents(last_seen);

// ✅ Use prepared statements (better-sqlite3)
const stmt = db.prepare('SELECT * FROM agents WHERE agent_id = ?');
const agent = stmt.get(agentId);

// ❌ Don't use string concatenation (SQL injection risk)
const agent = db.prepare(`SELECT * FROM agents WHERE agent_id = '${agentId}'`).get();
```

### React Performance
```javascript
// ✅ Memoize expensive calculations
const filteredAgents = useMemo(
  () => agents.filter(a => a.status === 'active'),
  [agents]
);

// ✅ Use useCallback for stable function references
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// ❌ Don't create new objects/functions in render
// This causes unnecessary rerenders
<Component data={{ id: agent.id }} />  // New object every render
```

---

## Security Best Practices

### Input Validation
```javascript
// ✅ Validate all external input
import { z } from 'zod';

const schema = z.object({
  agentId: z.string().min(1).max(100),
  cwd: z.string()
});

try {
  const validated = schema.parse(input);
} catch (error) {
  return res.status(400).json({ error: 'Invalid input' });
}
```

### SQL Injection Prevention
```javascript
// ✅ Use parameterized queries
const agent = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);

// ❌ NEVER concatenate user input
const agent = db.prepare(`SELECT * FROM agents WHERE agent_id = '${agentId}'`).get();
```

### Secrets Management
```javascript
// ✅ Use environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ✅ Never commit secrets
// Add to .gitignore:
// .env.local
// *.key
// *.pem

// ❌ Don't hardcode secrets
const GITHUB_TOKEN = 'ghp_abc123...';  // NEVER DO THIS
```

---

## Continuous Integration (Future)

### CI Pipeline (Planned)
```yaml
# .github/workflows/ci.yml
name: CI

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
      - run: npm test
      - run: npm run build
```

---

## Related Documentation

- **Technology Stack:** [TECH_STACK.md](TECH_STACK.md)
- **API Reference:** [API.md](API.md)
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Development Guide:** [../guides/DEVELOPMENT.md](../guides/DEVELOPMENT.md)
- **Workspace CLAUDE.md:** Complete Graphite workflow

---

**Questions about conventions? File an issue or propose changes via PR.**
