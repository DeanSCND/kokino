# Phase 4: Canvas Rewrite Implementation Guide

## ⚠️ Critical Context

The Canvas component is the heart of the UI - 1567 lines of tangled code that somehow works. This refactor is **high risk** and needs careful planning. We're not just cleaning code - we're restructuring the entire frontend architecture while keeping everything functional.

## Prerequisites

### Must Be Complete
- [ ] Phase 2: Agent Configuration UI components (CreateAgentDialog, AgentLibraryPanel)
- [ ] Phase 3: Bootstrap system (agents need context)
- [ ] Stable API endpoints (no changing contracts during refactor)

### Team Readiness
- [ ] All developers understand Zustand (not Redux!)
- [ ] React 18+ features knowledge (Suspense, transitions)
- [ ] TypeScript configured (or PropTypes as fallback)

## Current State Analysis

### What Canvas.jsx Currently Does (1567 lines)

```javascript
// Current mess includes:
- 47 useState hooks
- 23 useEffect hooks
- 12+ inline API calls
- 8 localStorage operations
- 300+ lines of orchestration logic
- 200+ lines of graph manipulation
- 150+ lines of message handling
- WebSocket management inline
- No error boundaries
- No loading states
- Mixed business/presentation logic
```

### Critical Functionality to Preserve

1. **Agent Management**
   - Add/remove agents from canvas
   - Start/stop/restart agents
   - View agent status (colored borders)
   - Agent selection and details

2. **Graph Visualization**
   - React Flow node/edge rendering
   - Drag and drop positioning
   - Connection creation
   - Auto-layout capability

3. **Communication**
   - Chat panel with agent messages
   - Terminal output viewing
   - Message routing visualization
   - Ticket tracking

4. **Orchestration**
   - Team workflow execution
   - Phase tracking
   - Error handling
   - Stop/pause capability

5. **Persistence**
   - Save team configurations
   - Load saved teams
   - Auto-save to localStorage
   - Export/import teams

## Implementation Plan

### Day 1-2: Service Layer Extraction

#### Step 1.1: Create Service Structure

```bash
mkdir -p ui/src/services/{api,websocket,storage}
mkdir -p ui/src/services/api/{agents,teams,orchestration}
```

#### Step 1.2: Create Base API Client

`ui/src/services/api/client.js`:
```javascript
class APIClient {
  constructor(baseURL = import.meta.env.VITE_BROKER_URL) {
    this.baseURL = baseURL;
    this.timeout = 30000;
    this.retryCount = 3;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let lastError;
    for (let i = 0; i < this.retryCount; i++) {
      try {
        const response = await fetch(`${this.baseURL}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          throw new APIError(error.error || `HTTP ${response.status}`, response.status);
        }

        return response.status === 204 ? null : response.json();
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') break;
        if (i < this.retryCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
      }
    }

    throw lastError;
  }

  get(path, options) {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path, data, options) {
    return this.request(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  put(path, data, options) {
    return this.request(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  delete(path, options) {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

class APIError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'APIError';
  }
}

export default new APIClient();
```

#### Step 1.3: Agent Service

`ui/src/services/api/agents/agentService.js`:
```javascript
import client from '../client';

class AgentService {
  // Configuration Management
  async listConfigs(filters = {}) {
    return client.get('/api/agents', { params: filters });
  }

  async getConfig(id) {
    return client.get(`/api/agents/${id}`);
  }

  async createConfig(config) {
    return client.post('/api/agents', config);
  }

  async updateConfig(id, updates) {
    return client.put(`/api/agents/${id}`, updates);
  }

  async deleteConfig(id) {
    return client.delete(`/api/agents/${id}`);
  }

  // Runtime Management
  async registerAgent(agentId, config) {
    return client.post('/agents/register', {
      agentId,
      type: config.cliType,
      metadata: config
    });
  }

  async startAgent(agentId) {
    return client.post(`/agents/${agentId}/start`);
  }

  async stopAgent(agentId) {
    return client.post(`/agents/${agentId}/stop`);
  }

  async restartAgent(agentId) {
    return client.post(`/agents/${agentId}/restart`);
  }

  async getStatus(agentId) {
    return client.get(`/agents/${agentId}/status`);
  }

  async sendMessage(agentId, message) {
    return client.post(`/agents/${agentId}/send`, {
      payload: message,
      expectReply: true,
      timeoutMs: 30000
    });
  }

  // Bootstrap Management
  async bootstrap(agentId, config) {
    return client.post(`/api/agents/${agentId}/bootstrap`, config);
  }

  async getBootstrapStatus(agentId) {
    return client.get(`/api/agents/${agentId}/bootstrap/status`);
  }
}

export default new AgentService();
```

#### Step 1.4: Team Service

`ui/src/services/api/teams/teamService.js`:
```javascript
import client from '../client';

class TeamService {
  async list(projectId) {
    return client.get('/api/teams', { params: { projectId } });
  }

  async get(teamId) {
    return client.get(`/api/teams/${teamId}`);
  }

  async create(teamData) {
    const { nodes, edges, metadata } = teamData;

    // Validate team structure
    if (!nodes || nodes.length === 0) {
      throw new Error('Team must have at least one agent');
    }

    const rootAgents = nodes.filter(n => n.data?.isRoot);
    if (rootAgents.length !== 1) {
      throw new Error('Team must have exactly one root agent');
    }

    return client.post('/api/teams', {
      name: metadata.name,
      description: metadata.description,
      projectId: metadata.projectId,
      configuration: {
        nodes: nodes.map(this.sanitizeNode),
        edges: edges.map(this.sanitizeEdge)
      },
      metadata
    });
  }

  async update(teamId, updates) {
    return client.put(`/api/teams/${teamId}`, updates);
  }

  async delete(teamId) {
    return client.delete(`/api/teams/${teamId}`);
  }

  async start(teamId) {
    return client.post(`/api/teams/${teamId}/start`);
  }

  async stop(teamId) {
    return client.post(`/api/teams/${teamId}/stop`);
  }

  // Helper methods
  sanitizeNode(node) {
    return {
      id: node.id,
      type: node.type || 'agentNode',
      position: node.position,
      data: {
        ...node.data,
        // Remove UI-only properties
        selected: undefined,
        dragging: undefined
      }
    };
  }

  sanitizeEdge(edge) {
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type || 'default',
      data: edge.data
    };
  }

  // Templates
  async getTemplates() {
    return client.get('/api/teams/templates');
  }

  async createFromTemplate(templateId, overrides) {
    return client.post('/api/teams/from-template', {
      templateId,
      ...overrides
    });
  }
}

export default new TeamService();
```

#### Step 1.5: Orchestration Service

`ui/src/services/api/orchestration/orchestrationService.js`:
```javascript
import client from '../client';

class OrchestrationService {
  constructor() {
    this.currentExecution = null;
    this.abortController = null;
  }

  async execute(workflow) {
    // Cancel any existing execution
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      this.currentExecution = await client.post(
        '/api/orchestration/execute',
        workflow,
        { signal: this.abortController.signal }
      );

      return this.currentExecution;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Orchestration cancelled');
        return null;
      }
      throw error;
    }
  }

  async stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.currentExecution?.id) {
      await client.post(`/api/orchestration/${this.currentExecution.id}/stop`);
      this.currentExecution = null;
    }
  }

  async getStatus(executionId) {
    return client.get(`/api/orchestration/${executionId}/status`);
  }

  buildWorkflow(nodes, edges) {
    // Find root agent
    const rootNode = nodes.find(n => n.data?.isRoot);
    if (!rootNode) {
      throw new Error('No root agent found');
    }

    // Build dependency graph
    const graph = new Map();
    nodes.forEach(node => {
      graph.set(node.id, {
        node,
        dependencies: [],
        dependents: []
      });
    });

    edges.forEach(edge => {
      const source = graph.get(edge.source);
      const target = graph.get(edge.target);
      if (source && target) {
        source.dependents.push(target.node.id);
        target.dependencies.push(source.node.id);
      }
    });

    // Create execution phases
    const phases = this.topologicalSort(graph, rootNode.id);

    return {
      rootAgent: rootNode.id,
      agents: nodes.map(n => ({
        id: n.id,
        configId: n.data?.configId,
        role: n.data?.role
      })),
      phases,
      edges: edges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.data?.type || 'communication'
      }))
    };
  }

  topologicalSort(graph, rootId) {
    const visited = new Set();
    const phases = [];
    const queue = [rootId];

    while (queue.length > 0) {
      const phase = [];
      const nextQueue = [];

      for (const nodeId of queue) {
        if (visited.has(nodeId)) continue;

        const entry = graph.get(nodeId);
        const allDepsVisited = entry.dependencies.every(dep => visited.has(dep));

        if (allDepsVisited) {
          phase.push(nodeId);
          visited.add(nodeId);
          nextQueue.push(...entry.dependents);
        }
      }

      if (phase.length > 0) {
        phases.push(phase);
      }

      queue.length = 0;
      queue.push(...new Set(nextQueue));
    }

    return phases;
  }
}

export default new OrchestrationService();
```

### Day 3-4: State Management (Zustand)

#### Step 2.1: Install Dependencies

```bash
cd ui
npm install zustand immer
npm install --save-dev @redux-devtools/extension
```

#### Step 2.2: Create Store Structure

`ui/src/state/store.js`:
```javascript
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createAgentSlice } from './slices/agentSlice';
import { createTeamSlice } from './slices/teamSlice';
import { createWorkflowSlice } from './slices/workflowSlice';
import { createUISlice } from './slices/uiSlice';

const useStore = create(
  devtools(
    subscribeWithSelector(
      immer((...args) => ({
        ...createAgentSlice(...args),
        ...createTeamSlice(...args),
        ...createWorkflowSlice(...args),
        ...createUISlice(...args),
      }))
    ),
    {
      name: 'kokino-store',
      serialize: {
        options: {
          map: true,
          set: true,
          date: true,
          error: true,
        },
      },
    }
  )
);

// Persist certain slices to localStorage
if (typeof window !== 'undefined') {
  const persistedState = localStorage.getItem('kokino-canvas-state');
  if (persistedState) {
    try {
      const parsed = JSON.parse(persistedState);
      useStore.setState({
        nodes: parsed.nodes || [],
        edges: parsed.edges || [],
        uiPreferences: parsed.uiPreferences || {}
      });
    } catch (error) {
      console.error('Failed to load persisted state:', error);
    }
  }

  // Auto-save on changes
  useStore.subscribe(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      uiPreferences: state.uiPreferences
    }),
    (state) => {
      localStorage.setItem('kokino-canvas-state', JSON.stringify(state));
    }
  );
}

export default useStore;
```

#### Step 2.3: Agent Slice

`ui/src/state/slices/agentSlice.js`:
```javascript
export const createAgentSlice = (set, get) => ({
  // State
  agents: [],
  agentConfigs: [],
  agentStatus: {},
  selectedAgentId: null,

  // Actions
  setAgents: (agents) => set((state) => {
    state.agents = agents;
  }),

  addAgent: (agent) => set((state) => {
    state.agents.push(agent);
  }),

  updateAgent: (agentId, updates) => set((state) => {
    const agent = state.agents.find(a => a.id === agentId);
    if (agent) {
      Object.assign(agent, updates);
    }
  }),

  removeAgent: (agentId) => set((state) => {
    state.agents = state.agents.filter(a => a.id !== agentId);
    delete state.agentStatus[agentId];
    if (state.selectedAgentId === agentId) {
      state.selectedAgentId = null;
    }
  }),

  selectAgent: (agentId) => set((state) => {
    state.selectedAgentId = agentId;
  }),

  updateAgentStatus: (agentId, status) => set((state) => {
    state.agentStatus[agentId] = {
      ...state.agentStatus[agentId],
      ...status,
      lastUpdated: Date.now()
    };
  }),

  // Batch operations
  updateMultipleAgentStatuses: (updates) => set((state) => {
    Object.entries(updates).forEach(([agentId, status]) => {
      state.agentStatus[agentId] = {
        ...state.agentStatus[agentId],
        ...status,
        lastUpdated: Date.now()
      };
    });
  }),

  // Selectors (derived state)
  getAgentById: (agentId) => {
    return get().agents.find(a => a.id === agentId);
  },

  getOnlineAgents: () => {
    const status = get().agentStatus;
    return get().agents.filter(a => status[a.id]?.status === 'online');
  },

  getRootAgent: () => {
    return get().agents.find(a => a.isRoot);
  }
});
```

#### Step 2.4: Team Slice

`ui/src/state/slices/teamSlice.js`:
```javascript
export const createTeamSlice = (set, get) => ({
  // React Flow state
  nodes: [],
  edges: [],

  // Team metadata
  teamId: null,
  teamName: '',
  teamDescription: '',
  projectId: null,

  // Actions
  setNodes: (nodes) => set((state) => {
    state.nodes = nodes;
  }),

  setEdges: (edges) => set((state) => {
    state.edges = edges;
  }),

  onNodesChange: (changes) => set((state) => {
    // React Flow node changes (position, selection, etc)
    changes.forEach(change => {
      if (change.type === 'position') {
        const node = state.nodes.find(n => n.id === change.id);
        if (node && change.position) {
          node.position = change.position;
        }
      } else if (change.type === 'select') {
        const node = state.nodes.find(n => n.id === change.id);
        if (node) {
          node.selected = change.selected;
        }
      }
    });
  }),

  onEdgesChange: (changes) => set((state) => {
    // React Flow edge changes
    changes.forEach(change => {
      if (change.type === 'remove') {
        state.edges = state.edges.filter(e => e.id !== change.id);
      }
    });
  }),

  onConnect: (connection) => set((state) => {
    const newEdge = {
      id: `${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
      type: 'default'
    };
    state.edges.push(newEdge);
  }),

  addNodeToCanvas: (agentConfig, position) => set((state) => {
    const newNode = {
      id: `${agentConfig.name}-${Date.now()}`,
      type: 'agentNode',
      position: position || { x: 250, y: 250 },
      data: {
        ...agentConfig,
        label: agentConfig.name,
        configId: agentConfig.id,
        status: 'offline'
      }
    };
    state.nodes.push(newNode);
  }),

  removeNodeFromCanvas: (nodeId) => set((state) => {
    state.nodes = state.nodes.filter(n => n.id !== nodeId);
    state.edges = state.edges.filter(e =>
      e.source !== nodeId && e.target !== nodeId
    );
  }),

  loadTeam: (team) => set((state) => {
    state.teamId = team.id;
    state.teamName = team.name;
    state.teamDescription = team.description;
    state.projectId = team.projectId;
    state.nodes = team.configuration.nodes;
    state.edges = team.configuration.edges;
  }),

  clearTeam: () => set((state) => {
    state.teamId = null;
    state.teamName = '';
    state.teamDescription = '';
    state.nodes = [];
    state.edges = [];
  }),

  // Selectors
  getTeamData: () => {
    const state = get();
    return {
      id: state.teamId,
      name: state.teamName,
      description: state.teamDescription,
      projectId: state.projectId,
      configuration: {
        nodes: state.nodes,
        edges: state.edges
      }
    };
  }
});
```

### Day 5-7: Component Extraction

#### Step 3.1: New Canvas Component

`ui/src/components/Canvas/Canvas.jsx`:
```javascript
import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';

import useStore from '../../state/store';
import useTeam from '../../hooks/useTeam';
import useOrchestration from '../../hooks/useOrchestration';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

import CanvasControls from './CanvasControls';
import CanvasContextMenu from './CanvasContextMenu';
import AgentNode from '../Agent/AgentNode';
import AgentLibraryPanel from '../Agent/AgentLibraryPanel';
import ChatPanel from '../Communication/ChatPanel';
import TerminalPanel from '../Communication/TerminalPanel';
import TeamComposition from '../Team/TeamComposition';
import OrchestrationStatus from '../Workflow/OrchestrationStatus';

// Define node types for React Flow
const nodeTypes = {
  agentNode: AgentNode
};

function Canvas() {
  // Store hooks
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const onNodesChange = useStore(state => state.onNodesChange);
  const onEdgesChange = useStore(state => state.onEdgesChange);
  const onConnect = useStore(state => state.onConnect);

  // UI state
  const showAgentLibrary = useStore(state => state.showAgentLibrary);
  const showChat = useStore(state => state.showChat);
  const showTerminal = useStore(state => state.showTerminal);
  const selectedAgentId = useStore(state => state.selectedAgentId);

  // Custom hooks
  const { saveTeam, loadTeam, isLoading: teamLoading } = useTeam();
  const {
    isOrchestrating,
    startOrchestration,
    stopOrchestration
  } = useOrchestration();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'cmd+s': saveTeam,
    'cmd+o': () => document.getElementById('load-team-input').click(),
    'cmd+a': () => useStore.setState({ showAgentLibrary: true }),
    'escape': () => useStore.setState({
      showAgentLibrary: false,
      selectedAgentId: null
    })
  });

  // Event handlers
  const onNodeClick = useCallback((event, node) => {
    useStore.setState({ selectedAgentId: node.id });
  }, []);

  const onPaneClick = useCallback(() => {
    useStore.setState({ selectedAgentId: null });
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const agentData = event.dataTransfer.getData('application/agent');
    if (agentData) {
      const agent = JSON.parse(agentData);
      const position = {
        x: event.clientX - 250,
        y: event.clientY - 50
      };
      useStore.getState().addNodeToCanvas(agent, position);
    }
  }, []);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Memoized values
  const reactFlowInstance = useMemo(() => ({
    fitView: { padding: 0.2 },
    minZoom: 0.1,
    maxZoom: 2,
    snapToGrid: true,
    snapGrid: [15, 15]
  }), []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top toolbar */}
      <CanvasControls
        onSave={saveTeam}
        onLoad={loadTeam}
        onStart={startOrchestration}
        onStop={stopOrchestration}
        isOrchestrating={isOrchestrating}
        canStart={nodes.length > 0}
      />

      {/* Main canvas area */}
      <div className="flex-1 flex">
        {/* Left sidebar - Team Composition */}
        <TeamComposition />

        {/* Center - React Flow canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            {...reactFlowInstance}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={12}
              size={1}
            />
            <Controls />
            <MiniMap />

            {/* Status panel */}
            {isOrchestrating && (
              <Panel position="top-right">
                <OrchestrationStatus />
              </Panel>
            )}
          </ReactFlow>

          {/* Context menu */}
          {selectedAgentId && (
            <CanvasContextMenu
              agentId={selectedAgentId}
              position={{ x: 100, y: 100 }}
            />
          )}
        </div>

        {/* Right sidebar - Communication */}
        <div className="w-96 flex flex-col">
          {showChat && <ChatPanel />}
          {showTerminal && <TerminalPanel />}
        </div>
      </div>

      {/* Floating panels */}
      {showAgentLibrary && <AgentLibraryPanel />}

      {/* Hidden file input for loading teams */}
      <input
        id="load-team-input"
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const team = JSON.parse(e.target.result);
              loadTeam(team);
            };
            reader.readAsText(file);
          }
        }}
      />
    </div>
  );
}

export default Canvas;
```

### Day 8-9: Custom Hooks

#### Step 4.1: useTeam Hook

`ui/src/hooks/useTeam.js`:
```javascript
import { useState, useCallback } from 'react';
import useStore from '../state/store';
import teamService from '../services/api/teams/teamService';
import { toast } from 'react-hot-toast';

export default function useTeam() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const teamData = useStore(state => state.getTeamData());
  const loadTeamToStore = useStore(state => state.loadTeam);
  const clearTeam = useStore(state => state.clearTeam);

  const saveTeam = useCallback(async (metadata) => {
    setIsLoading(true);
    setError(null);

    try {
      const teamToSave = {
        ...teamData,
        ...metadata,
        configuration: { nodes, edges }
      };

      const saved = teamData.id
        ? await teamService.update(teamData.id, teamToSave)
        : await teamService.create(teamToSave);

      useStore.setState({ teamId: saved.id });
      toast.success('Team saved successfully');
      return saved;
    } catch (err) {
      setError(err.message);
      toast.error(`Failed to save team: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [nodes, edges, teamData]);

  const loadTeam = useCallback(async (teamIdOrData) => {
    setIsLoading(true);
    setError(null);

    try {
      const team = typeof teamIdOrData === 'string'
        ? await teamService.get(teamIdOrData)
        : teamIdOrData;

      loadTeamToStore(team);
      toast.success('Team loaded successfully');
      return team;
    } catch (err) {
      setError(err.message);
      toast.error(`Failed to load team: ${err.message}`);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [loadTeamToStore]);

  const startTeam = useCallback(async () => {
    if (!teamData.id) {
      toast.error('Save team before starting');
      return;
    }

    setIsLoading(true);
    try {
      await teamService.start(teamData.id);
      toast.success('Team started');
    } catch (err) {
      toast.error(`Failed to start team: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [teamData.id]);

  const stopTeam = useCallback(async () => {
    if (!teamData.id) return;

    setIsLoading(true);
    try {
      await teamService.stop(teamData.id);
      toast.success('Team stopped');
    } catch (err) {
      toast.error(`Failed to stop team: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [teamData.id]);

  return {
    nodes,
    edges,
    teamData,
    saveTeam,
    loadTeam,
    startTeam,
    stopTeam,
    clearTeam,
    isLoading,
    error
  };
}
```

#### Step 4.2: useOrchestration Hook

`ui/src/hooks/useOrchestration.js`:
```javascript
import { useState, useCallback, useEffect } from 'react';
import useStore from '../state/store';
import orchestrationService from '../services/api/orchestration/orchestrationService';
import { toast } from 'react-hot-toast';

export default function useOrchestration() {
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [executionId, setExecutionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);

  // Poll for status updates during orchestration
  useEffect(() => {
    if (!isOrchestrating || !executionId) return;

    const interval = setInterval(async () => {
      try {
        const status = await orchestrationService.getStatus(executionId);
        setCurrentPhase(status.currentPhase);
        setMessages(prev => [...prev, ...status.newMessages]);

        if (status.completed) {
          setIsOrchestrating(false);
          toast.success('Orchestration completed');
        }
      } catch (err) {
        console.error('Failed to get orchestration status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOrchestrating, executionId]);

  const startOrchestration = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error('Add agents before starting orchestration');
      return;
    }

    const rootAgent = nodes.find(n => n.data?.isRoot);
    if (!rootAgent) {
      toast.error('Select a root agent before starting');
      return;
    }

    setIsOrchestrating(true);
    setMessages([]);
    setError(null);

    try {
      const workflow = orchestrationService.buildWorkflow(nodes, edges);
      const execution = await orchestrationService.execute(workflow);

      setExecutionId(execution.id);
      toast.success('Orchestration started');
    } catch (err) {
      setError(err.message);
      setIsOrchestrating(false);
      toast.error(`Orchestration failed: ${err.message}`);
    }
  }, [nodes, edges]);

  const stopOrchestration = useCallback(async () => {
    try {
      await orchestrationService.stop();
      setIsOrchestrating(false);
      setExecutionId(null);
      toast.info('Orchestration stopped');
    } catch (err) {
      toast.error(`Failed to stop: ${err.message}`);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    isOrchestrating,
    currentPhase,
    messages,
    error,
    startOrchestration,
    stopOrchestration,
    clearMessages
  };
}
```

### Day 10: Testing & Cleanup

#### Step 5.1: Component Tests

`ui/src/components/Canvas/Canvas.test.jsx`:
```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import Canvas from './Canvas';
import useStore from '../../state/store';

// Mock React Flow
vi.mock('reactflow', () => ({
  default: ({ children }) => <div data-testid="react-flow">{children}</div>,
  MiniMap: () => <div data-testid="minimap" />,
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  Panel: ({ children }) => <div data-testid="panel">{children}</div>,
  BackgroundVariant: { Dots: 'dots' }
}));

describe('Canvas', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStore.setState({
      nodes: [],
      edges: [],
      showAgentLibrary: false,
      selectedAgentId: null
    });
  });

  it('should render without crashing', () => {
    render(<Canvas />);
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('should show agent library when button clicked', () => {
    render(<Canvas />);

    const button = screen.getByText('Add Agent');
    fireEvent.click(button);

    expect(useStore.getState().showAgentLibrary).toBe(true);
  });

  it('should start orchestration with valid team', async () => {
    // Add a root agent to store
    useStore.setState({
      nodes: [{
        id: 'agent-1',
        type: 'agentNode',
        position: { x: 100, y: 100 },
        data: { name: 'Alice', isRoot: true }
      }]
    });

    render(<Canvas />);

    const startButton = screen.getByText('Start Orchestration');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByTestId('panel')).toBeInTheDocument();
    });
  });

  it('should handle drag and drop of agents', () => {
    render(<Canvas />);

    const canvas = screen.getByTestId('react-flow');

    const dragEvent = new DragEvent('drop', {
      dataTransfer: {
        getData: () => JSON.stringify({
          name: 'Bob',
          role: 'Developer'
        })
      }
    });

    fireEvent.drop(canvas, dragEvent);

    expect(useStore.getState().nodes).toHaveLength(1);
    expect(useStore.getState().nodes[0].data.name).toBe('Bob');
  });
});
```

## Critical Risks & Mitigations

### Risk 1: Breaking Existing Functionality
**Mitigation:**
- Keep old Canvas.jsx as Canvas.legacy.jsx
- Feature flag: `VITE_USE_NEW_CANVAS=true`
- Parallel testing period
- Incremental rollout

### Risk 2: Performance Regression
**Mitigation:**
- Performance benchmarks before/after
- React DevTools Profiler monitoring
- Lighthouse CI in pipeline
- Bundle size monitoring

### Risk 3: State Management Complexity
**Mitigation:**
- Zustand is simpler than Redux
- DevTools for debugging
- Comprehensive logging
- State snapshots for debugging

### Risk 4: Team Confusion During Transition
**Mitigation:**
- Daily standup updates
- Documentation first approach
- Pair programming sessions
- Code review requirements

## Success Metrics

### Quantitative
- [ ] Canvas.jsx < 300 lines (from 1567)
- [ ] Initial render < 100ms
- [ ] Re-render < 50ms
- [ ] Bundle size increase < 50KB
- [ ] 80% test coverage
- [ ] 0 console errors/warnings

### Qualitative
- [ ] Easier to understand code
- [ ] Faster feature development
- [ ] Easier debugging
- [ ] Better separation of concerns
- [ ] Improved developer experience

## Rollback Plan

If things go wrong:

```bash
# Quick revert to legacy
git checkout main
git revert --no-commit HEAD~5..HEAD
git commit -m "Revert Canvas refactor"

# Or use feature flag
echo "VITE_USE_NEW_CANVAS=false" >> .env.local
npm run build
```

## Post-Implementation Checklist

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Team trained on new architecture
- [ ] Legacy code removed (after 2 weeks stable)
- [ ] Lessons learned documented

## Common Pitfalls to Avoid

1. **Don't refactor everything at once** - Incremental changes
2. **Don't skip tests** - Write tests for each extracted component
3. **Don't ignore TypeScript** - Add types progressively
4. **Don't forget error boundaries** - Add them to contain failures
5. **Don't lose functionality** - Maintain feature parity
6. **Don't ignore performance** - Monitor metrics continuously
7. **Don't work in isolation** - Coordinate with team

---

*This implementation guide provides a realistic, detailed plan for the Canvas rewrite. The 2-week timeline is aggressive but achievable with dedicated effort and no scope creep.*