/**
 * Team Storage - LocalStorage persistence
 * Phase 4a: Service Layer Foundation
 */

const STORAGE_KEY = 'kokino_teams';
const AUTOSAVE_KEY = 'kokino_autosave';

class TeamStorage {
  /**
   * Save team to localStorage
   */
  save(teamData) {
    try {
      const teams = this.list();
      const existing = teams.findIndex(t => t.id === teamData.id);

      if (existing !== -1) {
        teams[existing] = {
          ...teamData,
          updatedAt: new Date().toISOString()
        };
      } else {
        teams.push({
          ...teamData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
      return teamData;
    } catch (error) {
      console.error('Failed to save team to localStorage:', error);
      throw new Error('Failed to save team locally');
    }
  }

  /**
   * Load team from localStorage
   */
  load(teamId) {
    const teams = this.list();
    const team = teams.find(t => t.id === teamId);

    if (!team) {
      throw new Error(`Team ${teamId} not found in localStorage`);
    }

    return team;
  }

  /**
   * List all teams from localStorage
   */
  list() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to parse teams from localStorage:', error);
      return [];
    }
  }

  /**
   * Delete team from localStorage
   */
  delete(teamId) {
    const teams = this.list().filter(t => t.id !== teamId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  }

  /**
   * Auto-save current canvas state
   */
  autosave(canvasState) {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        ...canvasState,
        savedAt: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Failed to autosave:', error);
    }
  }

  /**
   * Load auto-saved state
   */
  loadAutosave() {
    try {
      const data = localStorage.getItem(AUTOSAVE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load autosave:', error);
      return null;
    }
  }

  /**
   * Clear auto-save
   */
  clearAutosave() {
    localStorage.removeItem(AUTOSAVE_KEY);
  }

  /**
   * Clear all teams
   */
  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTOSAVE_KEY);
  }

  /**
   * Export all teams as JSON
   */
  exportAll() {
    const teams = this.list();
    return JSON.stringify(teams, null, 2);
  }

  /**
   * Import teams from JSON
   */
  importAll(jsonData) {
    try {
      const teams = typeof jsonData === 'string'
        ? JSON.parse(jsonData)
        : jsonData;

      if (!Array.isArray(teams)) {
        throw new Error('Invalid import data - expected array of teams');
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
      return teams.length;
    } catch (error) {
      console.error('Failed to import teams:', error);
      throw new Error('Failed to import teams');
    }
  }
}

export default new TeamStorage();
