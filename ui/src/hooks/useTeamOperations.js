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
   * NOTE: Uses localStorage directly (backend not implemented)
   */
  const exportTeam = useCallback(async (teamId) => {
    try {
      const team = teamStorage.load(teamId);
      return JSON.stringify(team, null, 2);
    } catch (error) {
      console.error('Failed to export team:', error);
      throw error;
    }
  }, []);

  /**
   * Import team from JSON
   * NOTE: Uses localStorage directly (backend not implemented)
   */
  const importTeam = useCallback(async (jsonData) => {
    try {
      const teamData = typeof jsonData === 'string'
        ? JSON.parse(jsonData)
        : jsonData;

      // Validate before importing
      const validation = teamService.validate(teamData);
      if (!validation.valid) {
        throw new Error(`Invalid team: ${validation.errors.join(', ')}`);
      }

      // Save to localStorage
      const imported = teamStorage.save(teamData);

      // Update store
      setTeamData(imported);
      setNodes(imported.nodes || []);
      setEdges(imported.edges || []);

      return imported;
    } catch (error) {
      console.error('Failed to import team:', error);
      throw error;
    }
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
