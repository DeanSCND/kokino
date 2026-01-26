/**
 * Agent Slice - Agent state management
 * Phase 4: Canvas Rewrite
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

  addNode: (node) => set((state) => {
    state.nodes.push(node);
  }),

  removeNode: (nodeId) => set((state) => {
    state.nodes = state.nodes.filter(n => n.id !== nodeId);
    state.edges = state.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
  }),

  deleteNode: (nodeId) => set((state) => {
    state.nodes = state.nodes.filter(n => n.id !== nodeId);
    state.edges = state.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
  }),

  updateNode: (nodeId, updates) => set((state) => {
    const node = state.nodes.find(n => n.id === nodeId);
    if (node) {
      Object.assign(node, updates);
    }
  }),

  addEdge: (edge) => set((state) => {
    state.edges.push(edge);
  }),

  removeEdge: (edgeId) => set((state) => {
    state.edges = state.edges.filter(e => e.id !== edgeId);
  }),

  deleteEdge: (edgeId) => set((state) => {
    state.edges = state.edges.filter(e => e.id !== edgeId);
  }),

  selectAgent: (agentId) => set({ selectedAgent: agentId }),

  updateAgentStatus: (agentId, status) => set((state) => {
    state.agentStatuses[agentId] = status;
  }),

  clearAgents: () => set({
    nodes: [],
    edges: [],
    selectedAgent: null,
    agentStatuses: {}
  })
});
