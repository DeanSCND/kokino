/**
 * UI Slice - UI state and panel visibility
 * Phase 4b: State Management
 */

export const createUISlice = (set, get) => ({
  // State
  showChatPanel: false,
  showTerminalPanel: false,
  showAgentLibrary: false,
  showTemplateLibrary: false,
  showTimeline: false,
  showGitHubIssues: false,
  showBranchManager: false,
  showCommitQueue: false,
  showDashboard: false,
  activeView: 'chat', // 'chat' or 'dashboard'
  contextMenu: null,
  selectedTerminalAgent: null,
  selectedChatAgent: null,

  // Actions
  toggleChatPanel: () => set((state) => ({
    showChatPanel: !state.showChatPanel
  })),

  toggleTerminalPanel: () => set((state) => ({
    showTerminalPanel: !state.showTerminalPanel
  })),

  toggleAgentLibrary: () => set((state) => ({
    showAgentLibrary: !state.showAgentLibrary
  })),

  toggleTemplateLibrary: () => set((state) => ({
    showTemplateLibrary: !state.showTemplateLibrary
  })),

  toggleTimeline: () => set((state) => ({
    showTimeline: !state.showTimeline
  })),

  toggleGitHubIssues: () => set((state) => ({
    showGitHubIssues: !state.showGitHubIssues
  })),

  toggleBranchManager: () => set((state) => ({
    showBranchManager: !state.showBranchManager
  })),

  toggleCommitQueue: () => set((state) => ({
    showCommitQueue: !state.showCommitQueue
  })),

  toggleDashboard: () => set((state) => ({
    showDashboard: !state.showDashboard
  })),

  setActiveView: (view) => set({ activeView: view }),

  setContextMenu: (menu) => set({ contextMenu: menu }),

  closeContextMenu: () => set({ contextMenu: null }),

  setTerminalAgent: (agentId) => set({
    selectedTerminalAgent: agentId,
    showTerminalPanel: true
  }),

  setChatAgent: (agentId) => set({
    selectedChatAgent: agentId,
    showChatPanel: true
  }),

  closeAllPanels: () => set({
    showChatPanel: false,
    showTerminalPanel: false,
    showAgentLibrary: false,
    showTemplateLibrary: false,
    showTimeline: false,
    showGitHubIssues: false,
    showBranchManager: false,
    showCommitQueue: false,
    showDashboard: false,
    contextMenu: null
  })
});
