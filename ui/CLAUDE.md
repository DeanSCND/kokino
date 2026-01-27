# UI Module - React Frontend

> **Module-Specific Context for AI Agents Working in ui/**
>
> Last Updated: 2026-01-26

## What This Module Does

The **ui** is a React frontend that provides a visual interface for orchestrating agent teams using an interactive canvas powered by React Flow.

**Core Responsibilities:**
- Visual agent team builder (drag-and-drop canvas)
- Real-time agent status monitoring
- Team management and configuration
- GitHub integration (OAuth, issues, PRs)
- Agent terminal access (XTerm.js)
- Monitoring dashboards
- Toast notifications and loading states

---

## Architecture Overview

```
ui/
├── src/
│   ├── main.jsx              # Application entry point
│   ├── App.jsx               # Root component with routing
│   ├── index.css             # Global styles (Tailwind)
│   │
│   ├── pages/                # Page components
│   │   └── Canvas.jsx        # Main orchestration UI (262 lines!)
│   │
│   ├── layouts/              # Layout components
│   │   └── DashboardLayout.jsx
│   │
│   ├── components/           # Reusable components
│   │   ├── agents/           # Agent management
│   │   │   ├── CreateAgentDialog.jsx
│   │   │   ├── EditAgentDialog.jsx
│   │   │   ├── AgentLibraryPanel.jsx
│   │   │   ├── AgentFormFields.jsx
│   │   │   └── AgentCard.jsx
│   │   ├── teams/            # Team management
│   │   │   └── TeamManager.jsx
│   │   ├── monitoring/       # Monitoring dashboards
│   │   ├── AgentNode.jsx     # Canvas node component
│   │   ├── Toast.jsx         # Toast notifications
│   │   └── LoadingSpinner.jsx
│   │
│   ├── stores/               # Zustand state management
│   │   ├── index.js          # Store exports
│   │   ├── useAgentStore.js  # Agent state
│   │   └── useUIStore.js     # UI state (modals, loading)
│   │
│   ├── services/             # API clients
│   │   ├── api/              # Service layer (Phase 4 refactor)
│   │   │   ├── client.js     # Base HTTP client
│   │   │   ├── agentService.js
│   │   │   ├── messageService.js
│   │   │   ├── teamService.js
│   │   │   ├── orchestrationService.js
│   │   │   └── configService.js
│   │   ├── broker.js         # Broker API client (legacy)
│   │   └── github.js         # GitHub API client
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useConversation.js
│   │   ├── useAgentExecute.js
│   │   └── useWebSocket.js
│   │
│   ├── contexts/             # React contexts
│   │   └── ToastContext.jsx
│   │
│   └── utils/                # Utility functions
│       ├── commitAggregator.js
│       ├── statusSync.js
│       └── teamSpawner.js
│
├── public/                   # Static assets
├── dist/                     # Build output
├── package.json
└── vite.config.js            # Vite configuration
```

---

## Key Concepts

### 1. State Management (Zustand)
**Why Zustand:** Simple, minimal boilerplate, Redux DevTools support

**Agent Store** (`stores/useAgentStore.js`):
```javascript
const useAgentStore = create(
  devtools((set, get) => ({
    agents: [],
    teams: [],

    // Actions
    addAgent: (agent) => set((state) => ({
      agents: [...state.agents, agent]
    })),

    updateAgentStatus: (agentId, status) => set((state) => ({
      agents: state.agents.map(a =>
        a.id === agentId ? { ...a, status } : a
      )
    }))
  }))
);
```

**UI Store** (`stores/useUIStore.js`):
```javascript
const useUIStore = create((set) => ({
  isCreateAgentDialogOpen: false,
  isLoading: false,

  openCreateAgentDialog: () => set({ isCreateAgentDialogOpen: true }),
  closeCreateAgentDialog: () => set({ isCreateAgentDialogOpen: false }),

  setLoading: (loading) => set({ isLoading: loading })
}));
```

### 2. Service Layer Pattern
**Phase 4 Refactor:** Extracted all API calls from components into services

**Example Service** (`services/api/agentService.js`):
```javascript
export const agentService = {
  async createAgent(config) {
    const response = await client.post('/api/agents', config);
    return response.data;
  },

  async listAgents(filters = {}) {
    const response = await client.get('/api/agents', { params: filters });
    return response.data;
  },

  async executeAgent(agentId, prompt) {
    const response = await client.post(`/agents/${agentId}/execute`, { prompt });
    return response.data;
  }
};
```

**Usage in Components:**
```javascript
import { agentService } from '@/services/api/agentService';

const handleCreateAgent = async (config) => {
  setLoading(true);
  try {
    const agent = await agentService.createAgent(config);
    addAgent(agent);  // Zustand action
    toast.success('Agent created!');
  } catch (error) {
    toast.error(`Failed to create agent: ${error.message}`);
  } finally {
    setLoading(false);
  }
};
```

### 3. Canvas Architecture (React Flow)
**Main Component:** `pages/Canvas.jsx` (262 lines, down from 1547!)

**Key Features:**
- Drag-and-drop agent nodes
- Real-time status updates via WebSocket
- Edge connections for agent communication flows
- Custom node rendering (AgentNode.jsx)

**Node Structure:**
```javascript
{
  id: 'agent-123',
  type: 'agent',  // Custom node type
  position: { x: 100, y: 100 },
  data: {
    agentId: 'Alice',
    role: 'Frontend Developer',
    status: 'ready',  // idle, ready, executing, error
    bootstrapStatus: 'completed'
  }
}
```

### 4. Toast Notification System
**Context-based:** `contexts/ToastContext.jsx`

**Usage:**
```javascript
import { useToast } from '@/contexts/ToastContext';

const MyComponent = () => {
  const toast = useToast();

  const handleAction = async () => {
    try {
      await someAction();
      toast.success('Action completed!');
    } catch (error) {
      toast.error(`Failed: ${error.message}`);
    }
  };
};
```

---

## Development Workflow

### Starting the Dev Server
```bash
cd ui
npm install
npm run dev  # → http://localhost:5173
```

**Hot Reload:** Enabled by Vite (instant updates on file save)

### Building for Production
```bash
npm run build  # → dist/

# Preview production build
npm run preview
```

### Running Tests
```bash
# Run tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

---

## Component Development

### Creating a New Component

**File:** `src/components/MyComponent.jsx`
```javascript
import React from 'react';

export const MyComponent = ({ title, onAction }) => {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold">{title}</h3>
      <button
        onClick={onAction}
        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Action
      </button>
    </div>
  );
};
```

### Styling with Tailwind CSS
**Approach:** Utility-first CSS with Tailwind classes

**Common Patterns:**
```jsx
// Layout
<div className="flex flex-col gap-4 p-6">

// Card
<div className="bg-white rounded-lg shadow-md p-4">

// Button Primary
<button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded">

// Button Secondary
<button className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded">

// Input
<input className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500">

// Grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

**Custom CSS:** Only when Tailwind is insufficient (e.g., animations, complex selectors)

### Managing Component State

**Local State (useState):**
```javascript
const [isOpen, setIsOpen] = useState(false);
```

**Global State (Zustand):**
```javascript
const { agents, addAgent } = useAgentStore();
```

**Derived State (useMemo):**
```javascript
const activeAgents = useMemo(
  () => agents.filter(a => a.status === 'active'),
  [agents]
);
```

---

## Common Tasks

### Add a New Page
1. Create component in `src/pages/NewPage.jsx`
2. Add route in `src/App.jsx`:
```javascript
<Route path="/new-page" element={<NewPage />} />
```
3. Add navigation link in layout

### Add API Call
1. Add method to appropriate service in `src/services/api/`
2. Use service in component:
```javascript
import { agentService } from '@/services/api/agentService';

const data = await agentService.someMethod();
```

### Update Global State
1. Add state to Zustand store (`src/stores/useAgentStore.js` or `useUIStore.js`)
2. Add action to modify state
3. Use in component:
```javascript
const { someState, someAction } = useAgentStore();
```

### Add a Modal/Dialog
1. Add state to `useUIStore`:
```javascript
isMyDialogOpen: false,
openMyDialog: () => set({ isMyDialogOpen: true }),
closeMyDialog: () => set({ isMyDialogOpen: false })
```
2. Create dialog component
3. Use state to control visibility:
```javascript
const { isMyDialogOpen, closeMyDialog } = useUIStore();

return isMyDialogOpen && <MyDialog onClose={closeMyDialog} />;
```

### Add WebSocket Listener
**Use custom hook:** `src/hooks/useWebSocket.js`
```javascript
import { useWebSocket } from '@/hooks/useWebSocket';

const MyComponent = () => {
  useWebSocket('agent-status', (data) => {
    // Handle incoming WebSocket message
    updateAgentStatus(data.agentId, data.status);
  });
};
```

---

## Testing Strategy

### Component Tests (Vitest + Testing Library)
**File:** `src/components/MyComponent.test.jsx`
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test Title" onAction={() => {}} />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('calls onAction when button clicked', () => {
    const handleAction = vi.fn();
    render(<MyComponent title="Test" onAction={handleAction} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleAction).toHaveBeenCalledOnce();
  });
});
```

### Store Tests
```javascript
import { renderHook, act } from '@testing-library/react';
import { useAgentStore } from '@/stores/useAgentStore';

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

## Key Files Reference

### Entry Points
- **`src/main.jsx`** - React app initialization, root render
- **`src/App.jsx`** - Router configuration, layout wrapper

### Pages
- **`src/pages/Canvas.jsx`** - Main orchestration UI (React Flow canvas)

### Core Components
- **`src/components/agents/CreateAgentDialog.jsx`** - Agent creation form
- **`src/components/agents/AgentLibraryPanel.jsx`** - Browse agent configs
- **`src/components/AgentNode.jsx`** - Canvas node component
- **`src/components/teams/TeamManager.jsx`** - Team CRUD interface

### State Management
- **`src/stores/useAgentStore.js`** - Agent state (agents, teams, configs)
- **`src/stores/useUIStore.js`** - UI state (modals, loading, notifications)

### Services (API Layer)
- **`src/services/api/client.js`** - Base HTTP client (axios wrapper)
- **`src/services/api/agentService.js`** - Agent CRUD & execution
- **`src/services/api/teamService.js`** - Team management
- **`src/services/api/messageService.js`** - Agent messaging

### Utilities
- **`src/utils/commitAggregator.js`** - Multi-agent commit coordination
- **`src/utils/teamSpawner.js`** - Spawn teams from GitHub issues
- **`src/utils/statusSync.js`** - Agent status synchronization

---

## Common Gotchas

### 1. Broker URL Must Use 127.0.0.1
**Why:** WebSocket stability on macOS

**Configuration:** `.env` or `.env.local`
```bash
VITE_BROKER_URL=http://127.0.0.1:5050  # ✅ Correct
VITE_BROKER_URL=http://localhost:5050  # ❌ Wrong
```

**Usage:**
```javascript
const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';
```

### 2. Zustand DevTools Must Be Explicitly Enabled
**Correct:**
```javascript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const useStore = create(
  devtools((set) => ({ /* state */ }), { name: 'MyStore' })
);
```

**Access DevTools:** Browser extension → Redux tab

### 3. React Flow Node Updates Require New Reference
**Wrong:**
```javascript
node.data.status = 'ready';  // Mutates existing object
setNodes([...nodes]);  // React Flow won't re-render
```

**Correct:**
```javascript
setNodes(nodes =>
  nodes.map(node =>
    node.id === agentId
      ? { ...node, data: { ...node.data, status: 'ready' } }
      : node
  )
);
```

### 4. Vite Environment Variables Must Start with VITE_
**Wrong:**
```bash
BROKER_URL=http://127.0.0.1:5050  # Won't be exposed to client
```

**Correct:**
```bash
VITE_BROKER_URL=http://127.0.0.1:5050  # Accessible via import.meta.env
```

### 5. Toast Context Must Wrap App
**Wrong:**
```javascript
// App.jsx
export const App = () => (
  <Router>
    <Routes>...</Routes>
  </Router>
);

// Toast not available in components!
```

**Correct:**
```javascript
// main.jsx
import { ToastProvider } from '@/contexts/ToastContext';

root.render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
```

---

## Performance Optimization

### Memoization
**Expensive Calculations:**
```javascript
const filteredAgents = useMemo(
  () => agents.filter(a => a.status === 'active'),
  [agents]
);
```

**Callback Functions:**
```javascript
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

### Code Splitting (Lazy Loading)
```javascript
const MonitoringDashboard = lazy(() => import('./components/monitoring/Dashboard'));

// In component:
<Suspense fallback={<LoadingSpinner />}>
  <MonitoringDashboard />
</Suspense>
```

### React Flow Performance
**Limit Rerenders:**
```javascript
// Use nodesDraggable, nodesConnectable props to disable when not needed
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodesDraggable={!isLocked}
  fitView
  minZoom={0.5}
  maxZoom={1.5}
/>
```

---

## Styling Guidelines

### Tailwind Utility Classes
**Preferred approach:** Use Tailwind utilities directly in JSX

**Spacing Scale:**
- `p-4` = 1rem padding
- `m-2` = 0.5rem margin
- `gap-4` = 1rem gap (flexbox/grid)

**Responsive Design:**
```jsx
<div className="w-full md:w-1/2 lg:w-1/3">
  {/* Full width on mobile, half on tablet, third on desktop */}
</div>
```

**Dark Mode (if implemented):**
```jsx
<div className="bg-white dark:bg-gray-800 text-black dark:text-white">
```

### When to Use Custom CSS
**Only for:**
- Complex animations (`@keyframes`)
- CSS Grid with custom template areas
- Pseudo-selectors not supported by Tailwind
- Third-party library style overrides

**File:** `src/index.css`
```css
@layer components {
  .agent-node-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
}
```

---

## Related Documentation

- **Root context:** `../CLAUDE.md` - Project-wide overview
- **API reference:** `../docs/reference/API.md` - Broker endpoints
- **Architecture:** `../docs/reference/ARCHITECTURE.md` - System design
- **Broker module:** `../broker/CLAUDE.md` - Backend context

---

**For questions about UI implementation or component patterns, check the architecture docs or file an issue.**
