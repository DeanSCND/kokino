# Development Guide

> **Local Environment Setup and Development Workflow**
>
> **Last Updated:** 2026-01-26

---

## Overview

This guide covers everything you need to know for daily development on Kokino, including local environment setup, running services, debugging, and common development tasks.

**Target Audience:** Contributors, maintainers, and developers extending Kokino

---

## Prerequisites

### Required
- **Node.js 20.9.0+** (`node --version`)
- **npm 10+** (bundled with Node.js)
- **Git** (`git --version`)
- **macOS or Linux** (Windows not tested)

### Optional but Recommended
- **Claude Code CLI** (for testing agents)
- **Graphite CLI** (`gt`) for stacked PRs
- **VS Code** with recommended extensions

---

## Initial Setup

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/kokino.git
cd kokino
```

### 2. Install Dependencies
```bash
# Install all workspaces (broker, ui, mcp)
npm install

# Verify workspaces
npm run -ws --if-present test
```

### 3. Environment Configuration

**Create `.env` files:**

**`broker/.env`:**
```bash
PORT=5050
NODE_ENV=development
DEBUG=kokino:*

# Database
DATABASE_PATH=./src/db/kokino.db

# Optional
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_secret
```

**`ui/.env.local`:**
```bash
VITE_BROKER_URL=http://127.0.0.1:5050
```

**Don't commit `.env.local`** - it's in `.gitignore`

---

## Running Services

### Broker (Backend)

```bash
cd broker
npm start       # Production mode
npm run dev     # Watch mode (restarts on file changes)
```

**Watch mode uses `node --watch`** (Node 20+ feature)

**Verify broker:**
```bash
curl http://127.0.0.1:5050/health
```

### UI (Frontend)

```bash
cd ui
npm run dev     # Vite dev server with HMR
```

**Open browser:** http://localhost:5173

**Hot Module Replacement (HMR):** Changes appear instantly without full reload

### MCP Server

```bash
cd mcp
npm install
npm run build   # Compile TypeScript → build/index.js
npm run dev     # Watch mode (recompiles on changes)
```

**Test MCP server:**
```bash
npx @modelcontextprotocol/inspector node build/index.js
```

---

## Development Workflow

### Daily Workflow

1. **Pull latest changes:**
```bash
git checkout main
gt sync  # If using Graphite
# OR
git pull origin main
```

2. **Create feature branch:**
```bash
gt create feature/my-feature
# OR
git checkout -b feature/my-feature
```

3. **Start services:**
```bash
# Terminal 1: Broker
cd broker && npm run dev

# Terminal 2: UI
cd ui && npm run dev

# Terminal 3: Development work
```

4. **Make changes, test, commit:**
```bash
# Run tests
npm test -w broker
npm test -w ui

# Commit
git add .
git commit -m "feat(broker): add new endpoint"
```

5. **Push and create PR:**
```bash
gt submit  # Graphite
# OR
git push origin feature/my-feature
gh pr create --title "..." --body "..."
```

---

## Project Structure

```
kokino/
├── broker/                 # Backend (Node.js)
│   ├── src/
│   │   ├── index.js       # Entry point
│   │   ├── models/        # Data models
│   │   ├── services/      # Business logic
│   │   ├── agents/        # Agent execution
│   │   ├── db/            # Database layer
│   │   └── api/           # HTTP routes
│   ├── tests/
│   └── package.json
│
├── ui/                     # Frontend (React + Vite)
│   ├── src/
│   │   ├── main.jsx       # Entry point
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── stores/        # Zustand state
│   │   ├── services/      # API clients
│   │   └── hooks/         # Custom hooks
│   ├── public/
│   └── package.json
│
├── mcp/                    # MCP Server (TypeScript)
│   ├── src/
│   │   ├── index.ts       # MCP server entry
│   │   ├── tools/         # MCP tool definitions
│   │   └── schemas/       # Zod schemas
│   ├── bin/               # CLI scripts
│   └── package.json
│
└── docs/                   # Documentation
    ├── reference/          # API, database, tech stack
    ├── guides/             # How-to guides
    ├── planning/           # Roadmaps, specs
    ├── design/             # ADRs
    └── ops/                # Runbooks
```

---

## Common Development Tasks

### Add New API Endpoint (Broker)

**1. Define route handler:**

**`broker/src/routes/my-feature.js`:**
```javascript
export async function handleMyFeature(req, res) {
  try {
    const { param } = JSON.parse(req.body);

    // Business logic
    const result = await myService.doSomething(param);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, result }));
  } catch (error) {
    console.error('Error in handleMyFeature:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}
```

**2. Register route in `broker/src/index.js`:**
```javascript
import { handleMyFeature } from './routes/my-feature.js';

// In request handler
if (req.method === 'POST' && pathname === '/api/my-feature') {
  return handleMyFeature(req, res);
}
```

**3. Update API documentation:**
```bash
# docs/reference/API.md
## My Feature
POST /api/my-feature
...
```

**4. Write tests:**
```javascript
// broker/tests/integration/my-feature.test.js
describe('POST /api/my-feature', () => {
  it('should do something', async () => {
    const response = await fetch('http://127.0.0.1:5050/api/my-feature', {
      method: 'POST',
      body: JSON.stringify({ param: 'value' })
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});
```

---

### Add New UI Component

**1. Create component:**

**`ui/src/components/MyComponent.jsx`:**
```javascript
import React, { useState } from 'react';
import { useAgentStore } from '@/stores/useAgentStore';

export const MyComponent = ({ title }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { agents } = useAgentStore();

  const handleClick = async () => {
    setIsLoading(true);
    try {
      // Do something
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold">{title}</h3>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {isLoading ? 'Loading...' : 'Click me'}
      </button>
    </div>
  );
};
```

**2. Use component:**
```javascript
import { MyComponent } from '@/components/MyComponent';

<MyComponent title="My Feature" />
```

**3. Write tests:**
```javascript
// ui/src/components/MyComponent.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});
```

---

### Add Database Migration

**1. Create migration file:**
```bash
cd broker/src/db/migrations
touch 011_add_my_table.sql
```

**2. Write SQL:**
```sql
-- 011_add_my_table.sql
CREATE TABLE my_new_table (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_my_table_name ON my_new_table(name);
```

**3. Restart broker** - migrations auto-run on startup

**4. Update DATABASE.md:**
```markdown
## my_new_table
**Purpose:** Description of table

```sql
CREATE TABLE my_new_table (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```
```

---

### Add MCP Tool

**1. Define tool:**

**`mcp/src/tools/my_tool.ts`:**
```typescript
import { z } from 'zod';
import { brokerClient } from '../utils/broker-client';

export const myToolSchema = z.object({
  param: z.string()
});

export const myTool = {
  name: 'my_tool',
  description: 'Does something useful',
  inputSchema: myToolSchema,

  async execute(params: unknown) {
    const validated = myToolSchema.parse(params);

    const response = await brokerClient.post('/api/endpoint', {
      param: validated.param
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response.data, null, 2)
      }]
    };
  }
};
```

**2. Register tool in `mcp/src/index.ts`:**
```typescript
import { myTool } from './tools/my_tool';

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    sendMessage,
    coWorkers,
    myTool  // Add here
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'my_tool':
      return await myTool.execute(args);
    // ...
  }
});
```

**3. Rebuild:**
```bash
npm run build
```

---

## Debugging

### Broker Debugging

**Enable verbose logging:**
```bash
DEBUG=kokino:* npm start
```

**Inspect database:**
```bash
sqlite3 broker/src/db/kokino.db
> .tables
> .schema agents
> SELECT * FROM agents;
```

**Check logs:**
```bash
tail -f broker/broker.log
```

**Node.js debugger:**
```bash
node --inspect src/index.js
# Open chrome://inspect in Chrome
```

---

### UI Debugging

**React DevTools:**
- Install React DevTools extension
- Open DevTools → React tab

**Zustand DevTools:**
- Install Redux DevTools extension
- Open DevTools → Redux tab
- Inspect Zustand stores

**Network tab:**
- Open DevTools → Network tab
- Filter by XHR to see API calls

**Console debugging:**
```javascript
console.log('Agent:', agent);
console.table(agents);  // Pretty table format
```

---

### MCP Debugging

**MCP Inspector:**
```bash
npx @modelcontextprotocol/inspector node build/index.js
```

**Check broker connection:**
```bash
curl http://127.0.0.1:5050/health
```

**Test tools manually:**
```bash
# Using inspector UI
# OR write test script
```

---

## IDE Setup (VS Code)

### Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Workspace Settings

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "javascript.preferences.importModuleSpecifier": "relative",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### Launch Configurations (Debugging)

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Broker",
      "program": "${workspaceFolder}/broker/src/index.js",
      "cwd": "${workspaceFolder}/broker",
      "env": {
        "DEBUG": "kokino:*"
      }
    }
  ]
}
```

---

## Testing

**Run all tests:**
```bash
npm test -ws
```

**Run specific workspace:**
```bash
npm test -w broker
npm test -w ui
```

**Watch mode:**
```bash
npm test -w broker -- --watch
```

**Coverage:**
```bash
npm test -w broker -- --coverage
```

**See:** [TESTING.md](TESTING.md) for detailed testing guide

---

## Building for Production

### Broker
```bash
cd broker
# No build step - runs directly with Node.js
```

### UI
```bash
cd ui
npm run build  # → dist/

# Preview production build
npm run preview
```

### MCP
```bash
cd mcp
npm run build  # → build/
```

---

## Environment Variables

### Broker
- `PORT` - HTTP server port (default: 5050)
- `NODE_ENV` - development | production | test
- `DEBUG` - Debug namespaces (e.g., `kokino:*`)
- `DATABASE_PATH` - SQLite database path
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth secret

### UI
- `VITE_BROKER_URL` - Broker URL (default: http://127.0.0.1:5050)

### MCP
- `BRIDGE_BROKER_URL` - Broker URL (set in .claude/mcp.json)

---

## Common Issues

### "Port already in use"
```bash
# Find process using port 5050
lsof -i :5050

# Kill process
kill -9 <PID>

# OR change port in .env
PORT=5051
```

### "Database locked"
```bash
# Find processes using database
lsof broker/src/db/kokino.db

# Close broker properly (Ctrl+C, not kill -9)
```

### "Module not found"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Reinstall specific workspace
npm install -w broker
```

### "Cannot find MCP tools"
```bash
# Rebuild MCP server
cd mcp
npm run build

# Check absolute path in .claude/mcp.json
```

---

## Performance Tips

### Broker
- Use SQLite indexes for frequent queries
- Enable WAL mode (automatic)
- Use prepared statements (better-sqlite3)

### UI
- Use `useMemo` for expensive calculations
- Use `useCallback` for stable function references
- Lazy load routes with `React.lazy()`

### MCP
- Keep tool execution fast (<100ms)
- Cache broker responses when appropriate

---

## Related Documentation

- **[Quick Start](QUICK_START.md)** - Getting started guide
- **[Testing](TESTING.md)** - Testing patterns and practices
- **[Conventions](../reference/CONVENTIONS.md)** - Code style and Git workflow
- **[API Reference](../reference/API.md)** - Complete API documentation

---

**Happy coding! 🚀**
