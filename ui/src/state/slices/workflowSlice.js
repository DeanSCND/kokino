/**
 * Workflow Slice - Orchestration state
 * Phase 4: Canvas Rewrite
 */

export const createWorkflowSlice = (set, get) => ({
  // State
  isOrchestrating: false,
  isPaused: false,
  executionId: null,
  currentPhase: null,
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
    executionId: null,
    currentPhase: null
  }),

  pauseOrchestration: () => set({ isPaused: true }),

  resumeOrchestration: () => set({ isPaused: false }),

  setCurrentPhase: (phase) => set({ currentPhase: phase }),

  addMessage: (message) => set((state) => {
    state.messages.push(message);
  }),

  clearMessages: () => set({ messages: [] }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null })
});
