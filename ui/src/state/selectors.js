/**
 * Zustand Selectors - Derived state and memoized queries
 * Phase 4b: State Management
 */

/**
 * Get root agent from nodes
 */
export const selectRootAgent = (state) => {
  return state.nodes.find(node => node.data?.isRoot);
};

/**
 * Get all online agents
 */
export const selectOnlineAgents = (state) => {
  return state.nodes.filter(node => {
    const status = state.agentStatuses[node.id];
    return status?.status === 'online';
  });
};

/**
 * Check if team is valid for orchestration
 */
export const selectIsTeamValid = (state) => {
  if (state.nodes.length === 0) return false;
  const rootAgent = selectRootAgent(state);
  return Boolean(rootAgent);
};

/**
 * Get team size
 */
export const selectTeamSize = (state) => {
  return state.nodes.length;
};

/**
 * Get edges count
 */
export const selectConnectionsCount = (state) => {
  return state.edges.length;
};

/**
 * Check if team has unsaved changes
 */
export const selectHasUnsavedChanges = (state) => {
  return state.isDirty;
};

/**
 * Get full team configuration for saving
 */
export const selectTeamConfig = (state) => ({
  ...state.teamData,
  nodes: state.nodes,
  edges: state.edges,
  updatedAt: new Date().toISOString()
});

/**
 * Get orchestration status summary
 */
export const selectOrchestrationStatus = (state) => ({
  isRunning: state.isOrchestrating,
  isPaused: state.isPaused,
  phase: state.currentPhase,
  messageCount: state.messages.length,
  hasError: Boolean(state.error)
});

/**
 * Get UI panel visibility
 */
export const selectPanelVisibility = (state) => ({
  chat: state.showChatPanel,
  terminal: state.showTerminalPanel,
  library: state.showAgentLibrary,
  templates: state.showTemplateLibrary,
  timeline: state.showTimeline,
  github: state.showGitHubIssues,
  branches: state.showBranchManager,
  commits: state.showCommitQueue,
  dashboard: state.showDashboard
});

/**
 * Count visible panels
 */
export const selectVisiblePanelCount = (state) => {
  const panels = selectPanelVisibility(state);
  return Object.values(panels).filter(Boolean).length;
};
