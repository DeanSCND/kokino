/**
 * Team Slice - Team metadata and dirty tracking
 * Phase 4: Canvas Rewrite
 */

export const createTeamSlice = (set, get) => ({
  // State
  teamData: {
    id: null,
    name: 'Untitled Team',
    description: '',
    projectId: 'default',
    createdAt: null,
    updatedAt: null
  },
  isDirty: false,

  // Actions
  setTeamData: (teamData) => set({ teamData, isDirty: false }),

  updateTeamData: (updates) => set((state) => {
    Object.assign(state.teamData, updates);
    state.isDirty = true;
  }),

  markDirty: () => set({ isDirty: true }),

  markSaved: () => set({ isDirty: false }),

  clearTeam: () => set({
    teamData: {
      id: null,
      name: 'Untitled Team',
      description: '',
      projectId: 'default',
      createdAt: null,
      updatedAt: null
    },
    isDirty: false
  })
});
