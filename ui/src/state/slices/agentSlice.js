/**
 * Agent Slice - Agent state management
 * Phase 4b: State Management
 */

export const createAgentSlice = (set, get) => ({
  // State
  nodes: [],
  edges: [],
  selectedAgent: null,
  agentStatuses: {},

  // Actions
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node]
  })),

  removeNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter(n => n.id !== nodeId),
    edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
  })),

  deleteNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter(n => n.id !== nodeId),
    edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId)
  })),

  updateNode: (nodeId, updates) => set((state) => ({
    nodes: state.nodes.map(n =>
      n.id === nodeId ? { ...n, ...updates } : n
    )
  })),

  addEdge: (edge) => set((state) => ({
    edges: [...state.edges, edge]
  })),

  removeEdge: (edgeId) => set((state) => ({
    edges: state.edges.filter(e => e.id !== edgeId)
  })),

  deleteEdge: (edgeId) => set((state) => ({
    edges: state.edges.filter(e => e.id !== edgeId)
  })),

  selectAgent: (agentId) => set({ selectedAgent: agentId }),

  updateAgentStatus: (agentId, status) => set((state) => ({
    agentStatuses: {
      ...state.agentStatuses,
      [agentId]: status
    }
  })),

  clearAgents: () => set({
    nodes: [],
    edges: [],
    selectedAgent: null,
    agentStatuses: {}
  })
});
