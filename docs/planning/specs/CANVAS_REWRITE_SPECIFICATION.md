# Canvas Rewrite Specification

## Phase 4: Clean Architecture & API-Driven UI

### Overview

The Canvas component has grown to 1567 lines with mixed concerns including UI, business logic, API calls, state management, and orchestration. This specification defines how to refactor it into a clean, maintainable architecture under 500 lines.

### Current Problems

#### Code Smells in Current Canvas.jsx
1. **Size:** 1567 lines in a single file
2. **Mixed Concerns:**
   - UI rendering
   - Business logic
   - Direct API calls
   - State management
   - Event handling
   - Local storage
   - WebSocket management
   - Orchestration logic
3. **Prop Drilling:** Deep component trees passing props
4. **Duplicate State:** Same data in multiple state variables
5. **Hard-coded Values:** Agent roles, colors, positions
6. **No Tests:** Too complex to unit test effectively

#### Specific Problem Areas

```javascript
// PROBLEM 1: Mixed API calls and UI logic
const handleDelete = async () => {
  setNodes((nds) => nds.filter(...));  // UI update
  await broker.deleteAgent(agentName);  // API call
  localStorage.setItem(...);            // Storage
  setChatMessages(...);                  // More UI
};

// PROBLEM 2: Massive useEffect chains
useEffect(() => { /* poll status */ }, []);
useEffect(() => { /* poll tickets */ }, []);
useEffect(() => { /* save to localStorage */ }, [nodes, edges]);
useEffect(() => { /* update graph */ }, [nodes, edges]);

// PROBLEM 3: Business logic in components
if (isOrchestrating && nodes.length > 0) {
  const orchestrateTeam = async () => {
    // 100+ lines of orchestration logic
  };
}
```

### Target Architecture

#### Component Structure

```
src/
├── components/
│   ├── Canvas/
│   │   ├── Canvas.jsx               (< 300 lines - main container)
│   │   ├── CanvasControls.jsx       (< 150 lines - toolbar)
│   │   ├── CanvasContextMenu.jsx    (< 150 lines - right-click menu)
│   │   └── index.js
│   ├── Agent/
│   │   ├── AgentNode.jsx            (existing)
│   │   ├── AgentLibraryPanel.jsx    (from Phase 2)
│   │   ├── AgentConfigDialog.jsx    (from Phase 2)
│   │   └── index.js
│   ├── Team/
│   │   ├── TeamComposition.jsx      (< 200 lines)
│   │   ├── TeamTemplates.jsx        (< 200 lines)
│   │   └── TeamSaveDialog.jsx       (< 150 lines)
│   ├── Communication/
│   │   ├── ChatPanel.jsx            (existing, refactored)
│   │   ├── TerminalPanel.jsx        (extracted from Canvas)
│   │   └── MessageFlow.jsx          (< 150 lines)
│   └── Workflow/
│       ├── WorkflowControls.jsx     (< 200 lines)
│       ├── OrchestrationStatus.jsx  (< 100 lines)
│       └── PhaseIndicator.jsx       (< 100 lines)
│
├── services/
│   ├── api/
│   │   ├── client.js                (base HTTP client)
│   │   ├── agentService.js          (agent CRUD operations)
│   │   ├── teamService.js           (team operations)
│   │   ├── projectService.js        (project management)
│   │   └── orchestrationService.js  (workflow execution)
│   ├── websocket/
│   │   ├── connection.js            (WebSocket manager)
│   │   ├── messageHandler.js        (message processing)
│   │   └── eventEmitter.js          (event distribution)
│   └── storage/
│       ├── localStorage.js          (browser storage)
│       └── teamStorage.js           (team save/load)
│
├── hooks/
│   ├── useAgents.js                 (agent state management)
│   ├── useTeam.js                   (team composition)
│   ├── useOrchestration.js          (workflow execution)
│   ├── useWebSocket.js              (real-time updates)
│   └── useLocalStorage.js           (persistence)
│
├── state/
│   ├── store.js                     (Zustand store setup)
│   ├── slices/
│   │   ├── agentSlice.js            (agent state)
│   │   ├── teamSlice.js             (team state)
│   │   ├── workflowSlice.js         (workflow state)
│   │   └── uiSlice.js               (UI state)
│   └── selectors/
│       ├── agentSelectors.js        (derived agent state)
│       └── teamSelectors.js         (derived team state)
│
└── utils/
    ├── constants.js                 (shared constants)
    ├── validators.js                (input validation)
    └── formatters.js                (data formatting)
```

### Detailed Component Specifications

#### 1. Canvas.jsx (Main Container)

**Responsibility:** Container component that composes child components

**Max Lines:** 300

**Structure:**
```jsx
function Canvas() {
  // Hooks (5-10 lines)
  const { nodes, edges, onConnect, onNodesChange } = useTeam();
  const { isOrchestrating, startOrchestration } = useOrchestration();
  const { showAgentLibrary, setShowAgentLibrary } = useUIState();

  // No business logic, only composition
  return (
    <div className="canvas-container">
      <CanvasControls onStart={startOrchestration} />
      <ReactFlow nodes={nodes} edges={edges}>
        {/* React Flow children */}
      </ReactFlow>
      {showAgentLibrary && <AgentLibraryPanel />}
      <ChatPanel />
      <TerminalPanel />
    </div>
  );
}
```

**Patterns:**
- Container/Presenter pattern
- Composition over inheritance
- No direct API calls
- No business logic

#### 2. Service Layer

**agentService.js:**
```javascript
class AgentService {
  constructor(apiClient) {
    this.client = apiClient;
  }

  async listAgents(filters = {}) {
    return this.client.get('/api/agents', { params: filters });
  }

  async getAgent(id) {
    return this.client.get(`/api/agents/${id}`);
  }

  async createAgent(data) {
    return this.client.post('/api/agents', data);
  }

  async updateAgent(id, data) {
    return this.client.put(`/api/agents/${id}`, data);
  }

  async deleteAgent(id) {
    return this.client.delete(`/api/agents/${id}`);
  }

  async startAgent(id) {
    return this.client.post(`/api/agents/${id}/start`);
  }

  async stopAgent(id) {
    return this.client.post(`/api/agents/${id}/stop`);
  }

  async getAgentStatus(id) {
    return this.client.get(`/api/agents/${id}/status`);
  }
}

export default new AgentService(apiClient);
```

**teamService.js:**
```javascript
class TeamService {
  async saveTeam(teamData) {
    const { nodes, edges, metadata } = teamData;
    return this.client.post('/api/teams', {
      name: metadata.name,
      description: metadata.description,
      configuration: { nodes, edges },
      projectId: metadata.projectId
    });
  }

  async loadTeam(teamId) {
    const team = await this.client.get(`/api/teams/${teamId}`);
    return {
      nodes: team.configuration.nodes,
      edges: team.configuration.edges,
      metadata: team
    };
  }

  async listTeams(projectId) {
    return this.client.get('/api/teams', {
      params: { projectId }
    });
  }

  async startTeam(teamId) {
    return this.client.post(`/api/teams/${teamId}/start`);
  }

  async stopTeam(teamId) {
    return this.client.post(`/api/teams/${teamId}/stop`);
  }
}
```

#### 3. State Management (Zustand)

**store.js:**
```javascript
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { agentSlice } from './slices/agentSlice';
import { teamSlice } from './slices/teamSlice';
import { workflowSlice } from './slices/workflowSlice';
import { uiSlice } from './slices/uiSlice';

const useStore = create(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...agentSlice(set, get),
      ...teamSlice(set, get),
      ...workflowSlice(set, get),
      ...uiSlice(set, get),
    }))
  )
);

export default useStore;
```

**agentSlice.js:**
```javascript
export const agentSlice = (set, get) => ({
  agents: [],
  selectedAgent: null,
  agentStatus: {},

  setAgents: (agents) => set({ agents }),

  addAgent: (agent) => set((state) => ({
    agents: [...state.agents, agent]
  })),

  updateAgent: (id, updates) => set((state) => ({
    agents: state.agents.map(a =>
      a.id === id ? { ...a, ...updates } : a
    )
  })),

  removeAgent: (id) => set((state) => ({
    agents: state.agents.filter(a => a.id !== id)
  })),

  selectAgent: (id) => set({ selectedAgent: id }),

  updateAgentStatus: (id, status) => set((state) => ({
    agentStatus: { ...state.agentStatus, [id]: status }
  }))
});
```

#### 4. Custom Hooks

**useTeam.js:**
```javascript
function useTeam() {
  const { nodes, edges, addNode, removeNode, updateNode } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadTeam = useCallback(async (teamId) => {
    setIsLoading(true);
    try {
      const team = await teamService.loadTeam(teamId);
      useStore.setState({
        nodes: team.nodes,
        edges: team.edges
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveTeam = useCallback(async (metadata) => {
    setIsLoading(true);
    try {
      const teamData = { nodes, edges, metadata };
      const saved = await teamService.saveTeam(teamData);
      return saved;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [nodes, edges]);

  return {
    nodes,
    edges,
    loadTeam,
    saveTeam,
    isLoading,
    error,
    addNode,
    removeNode,
    updateNode
  };
}
```

**useOrchestration.js:**
```javascript
function useOrchestration() {
  const { nodes, edges } = useStore();
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [phase, setPhase] = useState(null);
  const [messages, setMessages] = useState([]);

  const startOrchestration = useCallback(async () => {
    setIsOrchestrating(true);

    const workflow = buildWorkflow(nodes, edges);

    try {
      const result = await orchestrationService.execute(workflow);
      setMessages(result.messages);
    } catch (err) {
      console.error('Orchestration failed:', err);
    } finally {
      setIsOrchestrating(false);
    }
  }, [nodes, edges]);

  const stopOrchestration = useCallback(async () => {
    await orchestrationService.stop();
    setIsOrchestrating(false);
  }, []);

  return {
    isOrchestrating,
    phase,
    messages,
    startOrchestration,
    stopOrchestration
  };
}
```

### Migration Strategy

#### Phase 1: Extract Services (Week 1, Day 1-2)

1. Create services/ directory structure
2. Extract all API calls from Canvas.jsx
3. Create service classes for each domain
4. Update Canvas to use services
5. Test all API integrations

**Acceptance Criteria:**
- No direct fetch() or broker calls in Canvas.jsx
- All API calls go through service layer
- Services have error handling

#### Phase 2: Implement State Management (Week 1, Day 3-4)

1. Install and configure Zustand
2. Create store with slices
3. Migrate component state to store
4. Remove prop drilling
5. Add dev tools support

**Acceptance Criteria:**
- No useState for shared state in Canvas
- All components can access state via hooks
- State updates trigger proper re-renders

#### Phase 3: Extract Components (Week 1, Day 5 - Week 2, Day 2)

1. Create component directories
2. Extract TeamComposition panel
3. Extract ChatPanel (refactor existing)
4. Extract TerminalPanel
5. Extract CanvasControls toolbar
6. Extract context menu components

**Acceptance Criteria:**
- Each component < 300 lines
- Clear single responsibility
- Props interface documented

#### Phase 4: Create Custom Hooks (Week 2, Day 3-4)

1. Create hooks/ directory
2. Implement useTeam hook
3. Implement useOrchestration hook
4. Implement useWebSocket hook
5. Implement useLocalStorage hook

**Acceptance Criteria:**
- Business logic moved to hooks
- Components only handle presentation
- Hooks are testable

#### Phase 5: Final Cleanup (Week 2, Day 5)

1. Remove all unused code
2. Update imports and exports
3. Add JSDoc comments
4. Create unit tests
5. Update documentation

**Acceptance Criteria:**
- Canvas.jsx < 500 lines
- 80% test coverage
- All components documented

### Testing Strategy

#### Unit Tests

**Service Tests:**
```javascript
describe('AgentService', () => {
  it('should fetch agents', async () => {
    const agents = await agentService.listAgents();
    expect(agents).toBeArray();
  });

  it('should handle errors gracefully', async () => {
    mockClient.get.mockRejectedValue(new Error('Network error'));
    await expect(agentService.listAgents()).rejects.toThrow();
  });
});
```

**Hook Tests:**
```javascript
describe('useTeam', () => {
  it('should load team from API', async () => {
    const { result } = renderHook(() => useTeam());

    act(() => {
      result.current.loadTeam('team-123');
    });

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(3);
    });
  });
});
```

**Component Tests:**
```javascript
describe('Canvas', () => {
  it('should render without crashing', () => {
    render(<Canvas />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should show agent library on button click', () => {
    render(<Canvas />);
    fireEvent.click(screen.getByText('Agent Library'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

#### Integration Tests

1. Full team creation flow
2. Agent addition and configuration
3. Orchestration execution
4. Save/load team configurations
5. Real-time updates via WebSocket

#### E2E Tests

```javascript
describe('Canvas E2E', () => {
  it('should create and save a team', () => {
    cy.visit('/canvas');
    cy.get('[data-cy=add-agent]').click();
    cy.get('[data-cy=agent-name]').type('Alice');
    cy.get('[data-cy=save-team]').click();
    cy.get('[data-cy=team-saved]').should('be.visible');
  });
});
```

### Performance Optimizations

#### React Optimizations

1. **Memoization:**
   ```javascript
   const AgentNode = React.memo(({ data }) => {
     // Component only re-renders if data changes
   }, (prevProps, nextProps) => {
     return prevProps.data.id === nextProps.data.id &&
            prevProps.data.status === nextProps.data.status;
   });
   ```

2. **useMemo for expensive computations:**
   ```javascript
   const visibleAgents = useMemo(() => {
     return agents.filter(a => a.status === 'online');
   }, [agents]);
   ```

3. **useCallback for event handlers:**
   ```javascript
   const handleNodeClick = useCallback((event, node) => {
     selectAgent(node.id);
   }, [selectAgent]);
   ```

#### State Management Optimizations

1. **Selective subscriptions:**
   ```javascript
   const agentStatus = useStore(
     useShallow(state => state.agentStatus)
   );
   ```

2. **Atomic updates:**
   ```javascript
   const updateMultipleAgents = useStore(state => state.updateMultipleAgents);
   // Single state update instead of multiple
   ```

### File Size Requirements

| Component | Max Lines | Current | Reduction |
|-----------|-----------|---------|-----------|
| Canvas.jsx | 300 | 1567 | 80% |
| CanvasControls.jsx | 150 | N/A | New |
| TeamComposition.jsx | 200 | ~300 | 33% |
| ChatPanel.jsx | 250 | ~400 | 38% |
| Any service file | 200 | N/A | New |
| Any hook file | 150 | N/A | New |

### Success Criteria

- [ ] Canvas.jsx reduced to < 500 lines (target: 300)
- [ ] All API calls moved to service layer
- [ ] State management via Zustand
- [ ] No prop drilling
- [ ] 80% test coverage
- [ ] Performance: Initial render < 100ms
- [ ] Performance: Re-render on state change < 50ms
- [ ] Bundle size increase < 50KB
- [ ] All components properly typed (TypeScript/PropTypes)
- [ ] Documentation for all public APIs
- [ ] Storybook stories for all components
- [ ] No console errors or warnings
- [ ] Accessibility: WCAG 2.1 AA compliant

### Rollback Plan

If the refactor causes issues:

1. **Feature flag:** Add `USE_NEW_CANVAS` environment variable
2. **Parallel development:** Keep old Canvas.jsx as Canvas.legacy.jsx
3. **Gradual rollout:** Test with subset of users
4. **Quick revert:** Single git revert if needed
5. **Monitoring:** Track errors and performance metrics

### Documentation Updates

After refactor, update:
1. Component API documentation
2. State management guide
3. Service layer documentation
4. Testing guide
5. Contributing guidelines
6. Architecture diagram