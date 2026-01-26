/**
 * useTeamOperations - Custom hook for team CRUD operations
 * Phase 4c: Component Extraction
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
   * Save team to backend and localStorage
   */
  const saveTeam = useCallback(async () => {
    const config = useStore.getState();
    const teamConfig = selectTeamConfig(config);

    try {
      // Save to backend
      const saved = await teamService.save(teamConfig);

      // Save to localStorage as backup
      teamStorage.save(saved);

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
   * Load team from backend
   */
  const loadTeam = useCallback(async (teamId) => {
    try {
      const team = await teamService.load(teamId);

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
   * Load team from localStorage
   */
  const loadTeamLocal = useCallback(async (teamId) => {
    try {
      const team = teamStorage.load(teamId);

      setTeamData(team);
      setNodes(team.nodes || []);
      setEdges(team.edges || []);
      markDirty(); // Local load = not synced with backend

      return team;
    } catch (error) {
      console.error('Failed to load team from localStorage:', error);
      throw error;
    }
  }, [setTeamData, setNodes, setEdges, markDirty]);

  /**
   * Delete team
   */
  const deleteTeam = useCallback(async (teamId) => {
    try {
      await teamService.delete(teamId);
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
    loadTeamLocal,
    deleteTeam,
    clearTeam: clear,
    exportTeam,
    importTeam
  };
}
