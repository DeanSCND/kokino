/**
 * Agent State Store
 * Phase 4.2: Basic State Management
 *
 * Manages agent-related state (orchestration, loading, errors)
 * Provides centralized agent state management
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useAgentStore = create(
  devtools(
    (set) => ({
      // Orchestration state
      isOrchestrating: false,
      isPaused: false,
      stepMode: false,
      chatMessages: [],
      detectedLoops: [],

      // Loading states
      isAddingAgent: false,
      isLoadingAgents: false,
      operationError: null,

      // Actions
      setIsOrchestrating: (value) => set({ isOrchestrating: value }),
      setIsPaused: (value) => set({ isPaused: value }),
      setStepMode: (value) => set({ stepMode: value }),

      setChatMessages: (messages) => set({ chatMessages: messages }),
      addChatMessage: (message) => set((state) => ({
        chatMessages: [...state.chatMessages, message]
      })),
      clearChatMessages: () => set({ chatMessages: [] }),

      setDetectedLoops: (loops) => set({ detectedLoops: loops }),
      addDetectedLoop: (loop) => set((state) => ({
        detectedLoops: [...state.detectedLoops, loop]
      })),
      removeDetectedLoop: (index) => set((state) => ({
        detectedLoops: state.detectedLoops.filter((_, i) => i !== index)
      })),

      setIsAddingAgent: (value) => set({ isAddingAgent: value }),
      setIsLoadingAgents: (value) => set({ isLoadingAgents: value }),
      setOperationError: (error) => set({ operationError: error }),
      clearOperationError: () => set({ operationError: null }),
    }),
    { name: 'AgentStore' }
  )
);
