/**
 * UI State Store
 * Phase 4.2: Basic State Management
 *
 * Manages UI-related state (panel visibility, modals, views)
 * Reduces prop drilling for UI toggles
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useUIStore = create(
  devtools(
    (set) => ({
      // Panel visibility
      showChatPanel: false,
      showTeamPanel: false,
      showAgentLibrary: false,
      showTemplateLibrary: false,
      showTimeline: false,
      showGitHubIssues: false,
      showBranchManager: false,
      showCommitQueue: false,

      // Modal state
      showCreatePR: false,
      showStageCommit: false,
      prAgentName: null,
      stageCommitAgent: null,
      terminalAgent: null,
      chatAgent: null,

      // View state
      activeView: 'chat', // 'chat' or 'dashboard'
      contextMenu: null,

      // Actions
      toggleChatPanel: () => set((state) => ({ showChatPanel: !state.showChatPanel })),
      toggleTeamPanel: () => set((state) => ({ showTeamPanel: !state.showTeamPanel })),
      toggleAgentLibrary: () => set((state) => ({ showAgentLibrary: !state.showAgentLibrary })),
      toggleTemplateLibrary: () => set((state) => ({ showTemplateLibrary: !state.showTemplateLibrary })),
      toggleTimeline: () => set((state) => ({ showTimeline: !state.showTimeline })),
      toggleGitHubIssues: () => set((state) => ({ showGitHubIssues: !state.showGitHubIssues })),
      toggleBranchManager: () => set((state) => ({ showBranchManager: !state.showBranchManager })),
      toggleCommitQueue: () => set((state) => ({ showCommitQueue: !state.showCommitQueue })),

      setShowChatPanel: (show) => set({ showChatPanel: show }),
      setShowTeamPanel: (show) => set({ showTeamPanel: show }),
      setShowAgentLibrary: (show) => set({ showAgentLibrary: show }),
      setShowTemplateLibrary: (show) => set({ showTemplateLibrary: show }),
      setShowTimeline: (show) => set({ showTimeline: show }),
      setShowGitHubIssues: (show) => set({ showGitHubIssues: show }),
      setShowBranchManager: (show) => set({ showBranchManager: show }),
      setShowCommitQueue: (show) => set({ showCommitQueue: show }),

      setShowCreatePR: (show, agentName = null) => set({ showCreatePR: show, prAgentName: agentName }),
      setShowStageCommit: (show, agent = null) => set({ showStageCommit: show, stageCommitAgent: agent }),
      setTerminalAgent: (agent) => set({ terminalAgent: agent }),
      setChatAgent: (agent) => set({ chatAgent: agent }),

      setActiveView: (view) => set({ activeView: view }),
      setContextMenu: (menu) => set({ contextMenu: menu }),
      closeContextMenu: () => set({ contextMenu: null }),
    }),
    { name: 'UIStore' }
  )
);
