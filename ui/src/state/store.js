/**
 * Zustand Store - Centralized state management
 * Phase 4b: State Management
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createAgentSlice } from './slices/agentSlice.js';
import { createTeamSlice } from './slices/teamSlice.js';
import { createWorkflowSlice } from './slices/workflowSlice.js';
import { createUISlice } from './slices/uiSlice.js';

/**
 * Main Zustand store combining all slices
 */
const useStore = create(
  devtools(
    immer((set, get) => ({
      // Combine all slices
      ...createAgentSlice(set, get),
      ...createTeamSlice(set, get),
      ...createWorkflowSlice(set, get),
      ...createUISlice(set, get)
    })),
    {
      name: 'Kokino Store',
      enabled: import.meta.env.DEV // Only enable devtools in development
    }
  )
);

export default useStore;
