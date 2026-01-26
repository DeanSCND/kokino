/**
 * Workflow Slice - Orchestration state
 * Phase 4b: State Management
 */

export const createWorkflowSlice = (set, get) => ({
  // State
  isOrchestrating: false,
  isPaused: false,
  currentPhase: null,
  executionId: null,
  messages: [],
  error: null,

  // Actions
  startOrchestration: (executionId) => set({
    isOrchestrating: true,
    isPaused: false,
    executionId,
    currentPhase: null,
    messages: [],
    error: null
  }),

  stopOrchestration: () => set({
    isOrchestrating: false,
    isPaused: false,
    currentPhase: null,
    executionId: null
  }),

  pauseOrchestration: () => set({ isPaused: true }),

  resumeOrchestration: () => set({ isPaused: false }),

  setCurrentPhase: (phase) => set({ currentPhase: phase }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, {
      ...message,
      timestamp: new Date().toISOString()
    }]
  })),

  setError: (error) => set({ error }),

  clearMessages: () => set({ messages: [] }),

  clearWorkflow: () => set({
    isOrchestrating: false,
    isPaused: false,
    currentPhase: null,
    executionId: null,
    messages: [],
    error: null
  })
});
