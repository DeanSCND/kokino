/**
 * Team Slice - Team composition and metadata
 * Phase 4b: State Management
 */

export const createTeamSlice = (set, get) => ({
  // State
  teamData: {
    id: null,
    name: '',
    description: '',
    createdAt: null,
    updatedAt: null
  },
  isSaved: false,
  isDirty: false,

  // Actions
  setTeamData: (data) => set({
    teamData: data,
    isDirty: false
  }),

  updateTeamMetadata: (updates) => set((state) => ({
    teamData: {
      ...state.teamData,
      ...updates,
      updatedAt: new Date().toISOString()
    },
    isDirty: true
  })),

  markSaved: () => set({ isSaved: true, isDirty: false }),

  markDirty: () => set({ isDirty: true }),

  clearTeam: () => set({
    teamData: {
      id: null,
      name: '',
      description: '',
      createdAt: null,
      updatedAt: null
    },
    isSaved: false,
    isDirty: false
  }),

  // Derived getters
  getTeamConfig: () => {
    const state = get();
    return {
      ...state.teamData,
      nodes: state.nodes,
      edges: state.edges
    };
  }
});
