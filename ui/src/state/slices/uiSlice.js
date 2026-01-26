/**
 * UI Slice - Panel visibility and UI state
 * Phase 4: Canvas Rewrite
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
  activeView: 'chat',
  contextMenu: null,
  selectedTerminalAgent: null,
  selectedChatAgent: null,

  // Actions
  toggleChatPanel: () => set((state) => {
    state.showChatPanel = !state.showChatPanel;
  }),

  toggleTerminalPanel: () => set((state) => {
    state.showTerminalPanel = !state.showTerminalPanel;
  }),

  toggleAgentLibrary: () => set((state) => {
    state.showAgentLibrary = !state.showAgentLibrary;
  }),

  toggleTemplateLibrary: () => set((state) => {
    state.showTemplateLibrary = !state.showTemplateLibrary;
  }),

  toggleTimeline: () => set((state) => {
    state.showTimeline = !state.showTimeline;
  }),

  toggleGitHubIssues: () => set((state) => {
    state.showGitHubIssues = !state.showGitHubIssues;
  }),

  toggleBranchManager: () => set((state) => {
    state.showBranchManager = !state.showBranchManager;
  }),

  toggleCommitQueue: () => set((state) => {
    state.showCommitQueue = !state.showCommitQueue;
  }),

  toggleDashboard: () => set((state) => {
    state.showDashboard = !state.showDashboard;
  }),

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
