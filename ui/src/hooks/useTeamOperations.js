/**
 * useTeamOperations - Custom hook for team CRUD operations
 * Phase 4: Canvas Rewrite
 */

import { useCallback } from 'react';
import useStore from '../state/store.js';
import { teamService, teamStorage } from '../services/index.js';
import { selectTeamConfig } from '../state/selectors.js';

export default function useTeamOperations() {
  const setTeamData = useStore(state => state.setTeamData);
  const setNodes = useStore(state => state.setNodes);
  const setEdges = useStore(state => state.setEdges);
  const markSaved = useStore(state => state.markSaved);
  const markDirty = useStore(state => state.markDirty);
  const clearTeam = useStore(state => state.clearTeam);
  const clearAgents = useStore(state => state.clearAgents);

  /**
   * Save team to localStorage
   * NOTE: Backend /api/teams not implemented yet, using localStorage only
   */
  const saveTeam = useCallback(async () => {
    const config = useStore.getState();
    const teamConfig = selectTeamConfig(config);

    try {
      // Validate before saving
      const validation = teamService.validate(teamConfig);
      if (!validation.valid) {
        throw new Error(`Invalid team: ${validation.errors.join(', ')}`);
      }

      // Save to localStorage (backend not available)
      const saved = teamStorage.save(teamConfig);

      // Update store
      setTeamData(saved);
      markSaved();

      return saved;
    } catch (error) {
      console.error('Failed to save team:', error);
      throw error;
    }
  }, [setTeamData, markSaved]);

  /**
   * Load team from localStorage
   * NOTE: Backend /api/teams not implemented yet, using localStorage only
   */
  const loadTeam = useCallback(async (teamId) => {
    try {
      const team = teamStorage.load(teamId);

      setTeamData(team);
      setNodes(team.nodes || []);
      setEdges(team.edges || []);
      markSaved();

      return team;
    } catch (error) {
      console.error('Failed to load team:', error);
      throw error;
    }
  }, [setTeamData, setNodes, setEdges, markSaved]);

  /**
   * Delete team from localStorage
   * NOTE: Backend /api/teams not implemented yet, using localStorage only
   */
  const deleteTeam = useCallback(async (teamId) => {
    try {
      teamStorage.delete(teamId);
    } catch (error) {
      console.error('Failed to delete team:', error);
      throw error;
    }
  }, []);

  /**
   * Clear current team
   */
  const clear = useCallback(() => {
    clearTeam();
    clearAgents();
  }, [clearTeam, clearAgents]);

  /**
   * Export team as JSON
   */
  const exportTeam = useCallback(async (teamId) => {
    return teamService.export(teamId);
  }, []);

  /**
   * Import team from JSON
   */
  const importTeam = useCallback(async (jsonData) => {
    const team = await teamService.import(jsonData);

    setTeamData(team);
    setNodes(team.nodes || []);
    setEdges(team.edges || []);

    return team;
  }, [setTeamData, setNodes, setEdges]);

  return {
    saveTeam,
    loadTeam,
    deleteTeam,
    clearTeam: clear,
    exportTeam,
    importTeam
  };
}
