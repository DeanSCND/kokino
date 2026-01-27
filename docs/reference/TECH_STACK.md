# Technology Stack Reference

> **Complete Technology Stack Documentation**
>
> **Last Updated:** 2026-01-26

---

## Overview

Kokino uses a modern JavaScript/TypeScript stack optimized for localhost-first orchestration, real-time collaboration, and rapid development.

**Philosophy:**
- **Simplicity over complexity** - Choose tools that reduce boilerplate
- **Localhost-first** - Zero external dependencies for core functionality
- **Type safety where it matters** - TypeScript for MCP, vanilla JS elsewhere
- **Developer experience** - Fast builds, hot reload, minimal configuration

---

## Backend Stack

### Runtime: Node.js 20+
**Version:** ≥20.9.0  
**Why:**
- Native ES modules support
- Stable fetch API (no node-fetch needed in most cases)
- Performance improvements over Node 18
- LTS support until April 2026

**Installation:**
```bash
# macOS
brew install node@20

# Verify
node --version  # Should be 20.x.x
```

---

### Database: SQLite 3
**Library:** `better-sqlite3@^12.6.2`  
**Why:**
- **Localhost-first**: Single file database, zero configuration
- **Synchronous API**: No async/await needed, simpler error handling
- **ACID guarantees**: WAL mode for better concurrency
- **Sufficient performance**: Handles single-machine orchestration easily
- **Easy backup**: Just copy the .db file

**Tradeoffs:**
- ❌ No built-in replication (acceptable for localhost use)
- ❌ Single writer at a time (WAL mode mitigates this)
- ✅ Perfect for 1-100 agents on single machine

**Configuration:**
```javascript
import Database from 'better-sqlite3';

const db = new Database('kokino.db', { verbose: console.log });
db.pragma('journal_mode = WAL');  // Enable WAL mode
```

**See:** [ADR-003: SQLite over Postgres](../design/ADR-003-sqlite.md)

---

### HTTP Server: Native Node.js http/https
**Why:**
- No framework overhead (Express, Fastify, etc.)
- Simple REST API (no need for advanced routing)
- Direct WebSocket integration

**Request Handling:**
```javascript
import http from 'http';

const server = http.createServer((req, res) => {
  // Manual routing
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
  }
});
```

---

### WebSocket: ws@^8.18.0
**Why:**
- Lightweight, battle-tested WebSocket library
- Low overhead for real-time agent status updates
- Simple API, no framework lock-in

**Usage:**
```javascript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected' }));
});
```

---

### Schema Validation: Zod@^3.24.1
**Why:**
- TypeScript-first validation library
- Infer types from schemas (single source of truth)
- Excellent error messages
- No decorators (simpler than class-validator)

**Usage:**
```typescript
import { z } from 'zod';

const agentSchema = z.object({
  agentId: z.string().min(1),
  cwd: z.string(),
  capabilities: z.array(z.string()).default([])
});

type Agent = z.infer<typeof agentSchema>;  // TypeScript type derived from schema
```

---

### ID Generation: nanoid@^5.0.9
**Why:**
- Small bundle size (130 bytes)
- URL-safe IDs
- Collision-resistant (21 char default)
- Faster than UUID

**Usage:**
```javascript
import { nanoid } from 'nanoid';

const ticketId = nanoid();  // → "V1StGXR8_Z5jdHi6B-myT"
```

---

### Testing: Vitest@^2.0.0
**Why:**
- Vite-native (same config, instant start)
- Jest-compatible API (easy migration)
- Fast execution (parallel tests, ESM native)
- Built-in coverage

**Configuration:** `vitest.config.js`
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: { provider: 'v8' }
  }
});
```

---

## Frontend Stack

### Framework: React 19
**Library:** `react@^19.2.0`, `react-dom@^19.2.0`  
**Why:**
- Stable, mature ecosystem
- Excellent developer tools (React DevTools)
- Large community, easy to hire for
- New features: automatic batching, transitions

**Upgrade Considerations:**
- React 19 drops IE11 support (not relevant for localhost tool)
- New concurrent features improve performance

---

### Build Tool: Vite@^5.4.11
**Why:**
- **Instant dev server start**: ESM-based, no bundling in dev
- **Fast HMR**: Hot module replacement <50ms
- **Optimized builds**: Rollup-based production builds
- **Simple config**: Sensible defaults, minimal setup

**Configuration:** `vite.config.js`
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5050'  // Proxy to broker
    }
  }
});
```

---

### State Management: Zustand@^4.5.7
**Why:**
- **Minimal boilerplate**: No providers, actions, reducers
- **Small bundle**: 1.4kb (vs Redux 3kb + React-Redux 5kb)
- **DevTools support**: Works with Redux DevTools
- **Performance**: Prevents unnecessary rerenders

**Comparison:**
```javascript
// Redux: ~50 lines for simple counter
// Zustand: ~10 lines

import { create } from 'zustand';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}));
```

**Impact:** Canvas component reduced from 1547 lines → 262 lines

**See:** [ADR-002: Zustand over Redux](../design/ADR-002-zustand.md)

---

### Canvas Library: React Flow@^12.10.0
**Package:** `@xyflow/react@^12.10.0`  
**Why:**
- Purpose-built for node-edge diagrams
- High performance (virtualized rendering)
- Drag-and-drop, zoom, pan built-in
- Custom node rendering

**Usage:**
```javascript
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}
  onEdgesChange={onEdgesChange}
  fitView
>
  <Background />
  <Controls />
</ReactFlow>
```

---

### Styling: Tailwind CSS@^3.4.17
**Why:**
- **Utility-first**: Compose styles directly in JSX
- **No CSS file bloat**: Only used utilities included in build
- **Responsive design**: Built-in breakpoint system
- **Consistent design**: Pre-defined spacing, colors

**Configuration:** `tailwind.config.js`
```javascript
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {}
  },
  plugins: []
};
```

**Example:**
```jsx
<button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded">
  Click me
</button>
```

---

### Icons: Lucide React@^0.562.0
**Why:**
- Modern, clean icon set
- Tree-shakeable (only import icons you use)
- Consistent 24x24 grid
- Active maintenance

**Usage:**
```javascript
import { Play, Pause, Trash } from 'lucide-react';

<button>
  <Play size={16} className="mr-2" />
  Start
</button>
```

---

### Terminal Emulator: XTerm.js@^6.0.0
**Package:** `@xterm/xterm@^6.0.0`, `@xterm/addon-fit@^0.11.0`  
**Why:**
- Full-featured terminal in browser
- VT100/xterm compatibility
- WebGL renderer for performance
- Addon ecosystem (fit, search, links)

**Usage:**
```javascript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const term = new Terminal();
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();
```

---

### Markdown Rendering: react-markdown@^9.0.1
**Why:**
- Render markdown in React
- CommonMark compliant
- Extensible with plugins
- Safe HTML rendering

**Usage:**
```javascript
import ReactMarkdown from 'react-markdown';

<ReactMarkdown>{markdownContent}</ReactMarkdown>
```

---

### Router: React Router@^7.12.0
**Package:** `react-router-dom@^7.12.0`  
**Why:**
- Industry standard for React routing
- Nested routes, layouts
- Data loading API
- Type-safe with TypeScript

**Usage:**
```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

<BrowserRouter>
  <Routes>
    <Route path="/" element={<Canvas />} />
    <Route path="/agents" element={<AgentLibrary />} />
  </Routes>
</BrowserRouter>
```

---

### Immutability: Immer@^11.1.3
**Why:**
- Simplify immutable updates
- Write "mutable" code, get immutable result
- Used internally by Zustand

**Usage:**
```javascript
import { produce } from 'immer';

const nextState = produce(state, draft => {
  draft.agents[0].status = 'ready';  // Looks mutable, but isn't
});
```

---

## MCP Stack (TypeScript)

### Language: TypeScript@^5.3.3
**Why:**
- Type safety for MCP tool definitions
- Catch errors at compile time
- IntelliSense in IDE
- Required by MCP SDK

**Configuration:** `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./build"
  }
}
```

---

### MCP SDK: @modelcontextprotocol/sdk@^1.0.2
**Why:**
- Official Model Context Protocol implementation
- Standard tool/resource interfaces
- STDIO/HTTP transport support

**Usage:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'agent-bridge',
  version: '0.1.0'
}, { capabilities: { tools: {} } });
```

---

### Validation: Zod@^3.22.4
**Why:** Same as backend (schema validation)

---

## Development Tools

### Package Manager: npm (bundled with Node.js)
**Why:**
- Built-in with Node.js
- Workspaces support (monorepo)
- Reliable, stable

**Workspace Configuration:** Root `package.json`
```json
{
  "workspaces": ["broker", "ui", "mcp"]
}
```

**Commands:**
```bash
npm install              # Install all workspaces
npm run dev -w broker    # Run dev in broker workspace
npm test -w ui           # Run tests in ui workspace
```

---

### Version Control: Git + Graphite
**Git:** Standard version control  
**Graphite:** Stacked pull requests

**Why Graphite:**
- Stack dependent PRs
- Rebase automation
- Better code review flow

**See:** Workspace CLAUDE.md for Graphite workflow

---

### Code Quality

#### Linting (Planned)
**Tool:** ESLint (not yet configured)  
**Plan:** Add in future for code consistency

#### Formatting (Planned)
**Tool:** Prettier (not yet configured)  
**Plan:** Add for automatic code formatting

---

## Runtime Requirements

### Node.js
**Minimum:** 20.9.0  
**Recommended:** 20.x LTS (latest)

**Check:**
```bash
node --version
# Should output: v20.x.x
```

---

### SQLite
**Bundled with better-sqlite3** (no separate install needed)

**Verify:**
```bash
cd broker
npm install
node -e "const db = require('better-sqlite3')('./test.db'); console.log('SQLite works!');"
```

---

### Claude Code CLI (for agents)
**Required for:** Claude Code agents in headless mode

**Check:**
```bash
claude --version
# Should output version info
```

**Installation:** [https://claude.ai/download](https://claude.ai/download)

---

## Browser Requirements (UI)

### Supported Browsers
- **Chrome/Edge:** 90+
- **Firefox:** 88+
- **Safari:** 14+

**Features Required:**
- ES2022 support
- WebSocket API
- Fetch API
- CSS Grid

**Not Supported:**
- Internet Explorer (any version)

---

## Optional Dependencies

### GitHub CLI (gh)
**For:** GitHub integration features

**Installation:**
```bash
brew install gh
gh auth login
```

---

### tmux (legacy mode)
**For:** Tmux-based agent execution (being phased out)

**Installation:**
```bash
brew install tmux
```

---

## Dependency Management

### Version Pinning Strategy
**Caret (^):** Allow patch and minor updates (default)
```json
{
  "zustand": "^4.5.7"  // Allows 4.5.x and 4.6.x, not 5.x
}
```

**Tilde (~):** Allow only patch updates
```json
{
  "ws": "~8.18.0"  // Allows 8.18.x only
}
```

**Exact:** Pin to exact version
```json
{
  "react": "19.2.0"  // Exact version
}
```

### Update Strategy
1. Review changelogs before updating
2. Test in development before merging
3. Update one major dependency at a time
4. Run full test suite after updates

---

## Build Output

### Broker
**No build step** - Runs directly with Node.js

### UI
**Output:** `ui/dist/`  
**Build command:** `npm run build`  
**Build tool:** Vite → Rollup

**Optimizations:**
- Tree shaking (remove unused code)
- Code splitting (separate vendor bundles)
- Minification (Terser)
- CSS extraction and minification

### MCP
**Output:** `mcp/build/`  
**Build command:** `npm run build`  
**Build tool:** TypeScript compiler (tsc)

---

## Technology Decisions (ADRs)

### Why SQLite over PostgreSQL?
**See:** [ADR-003: SQLite over Postgres](../design/ADR-003-sqlite.md)

**Summary:**
- Localhost-first design philosophy
- Zero configuration (no database server)
- Synchronous API (simpler code)
- Sufficient for single-machine orchestration

---

### Why Zustand over Redux?
**See:** [ADR-002: Zustand State Management](../design/ADR-002-zustand.md)

**Summary:**
- Minimal boilerplate (10 lines vs 50+)
- Smaller bundle (1.4kb vs 8kb+)
- DevTools support maintained
- Canvas reduced from 1547 → 262 lines

---

### Why Dual-Mode Agents?
**See:** [ADR-001: Dual-Mode Agents](../design/ADR-001-dual-mode.md)

**Summary:**
- Shadow mode validates headless reliability
- Tmux fallback for production safety
- Gradual migration path

---

## Upgrade Considerations

### Node.js
**When:** Node 20 reaches EOL (April 2026)  
**Target:** Node 22 LTS (April 2025 - April 2028)  
**Risk:** Low (Node maintains backward compatibility)

### React
**Current:** 19.x  
**Next:** 20.x (when released)  
**Risk:** Medium (breaking changes expected for server components)

### React Flow
**Current:** 12.10.0  
**Next:** 13.x (when released)  
**Risk:** Medium (check migration guide)

### SQLite (better-sqlite3)
**Current:** 12.6.2  
**Next:** 13.x (when released)  
**Risk:** Low (stable API)

---

## Performance Characteristics

### Broker
- **Message acknowledgment:** <20ms
- **Agent execution start:** <5s (headless mode)
- **WebSocket latency:** <10ms
- **Database queries:** <5ms (with indexes)

### UI
- **Dev server start:** <500ms (Vite)
- **HMR updates:** <50ms
- **Production build:** ~10s
- **Bundle size:** ~200kb gzipped

### MCP
- **Build time:** <3s (TypeScript compilation)
- **Tool execution:** <100ms (excluding broker API latency)

---

## Security Considerations

### Dependencies
- **Automated scanning:** Planned (npm audit, Dependabot)
- **Update frequency:** Monthly for security patches
- **Vulnerability response:** Patch critical within 24h

### Runtime
- **No external network calls** (except GitHub OAuth)
- **Localhost-only** by default (127.0.0.1)
- **No authentication yet** (planned for Phase 7)

---

## Related Documentation

- **Architecture Overview:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **API Reference:** [API.md](API.md)
- **Database Schema:** [DATABASE.md](DATABASE.md)
- **Development Guide:** [../guides/DEVELOPMENT.md](../guides/DEVELOPMENT.md)
- **ADRs:** [../design/](../design/)

---

**Questions about technology choices? Check the ADRs or file an issue.**
