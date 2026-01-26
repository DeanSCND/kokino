/**
 * Team Service - Team composition and management
 * Phase 4a: Service Layer Foundation
 *
 * ⚠️ CRITICAL: Backend /api/teams/* endpoints do NOT exist yet.
 * All save/load/delete methods are DISABLED and throw errors.
 * Use teamStorage (localStorage) directly until backend routes are implemented.
 *
 * TODO Phase 5: Implement /api/teams routes in broker:
 *   - POST /api/teams (save)
 *   - GET /api/teams/:id (load)
 *   - PUT /api/teams/:id (update)
 *   - DELETE /api/teams/:id (delete)
 *   - GET /api/teams (list)
 */

import client from './client.js';

class TeamService {
  /**
   * Save team configuration
   * ⚠️ DISABLED: Backend endpoint does not exist
   * Use teamStorage.save() directly
   */
  async save(teamData) {
    const validated = this.validate(teamData);
    if (!validated.valid) {
      throw new Error(`Invalid team: ${validated.errors.join(', ')}`);
    }

    // Backend route not implemented yet
    throw new Error('Backend /api/teams not implemented. Use teamStorage.save() instead.');
    // return client.post('/api/teams', teamData);
  }

  /**
   * Load team configuration
   * ⚠️ DISABLED: Backend endpoint does not exist
   * Use teamStorage.load() directly
   */
  async load(teamId) {
    // Backend route not implemented yet
    throw new Error('Backend /api/teams/:id not implemented. Use teamStorage.load() instead.');
    // return client.get(`/api/teams/${teamId}`);
  }

  /**
   * List all teams
   * ⚠️ DISABLED: Backend endpoint does not exist
   * Use teamStorage.list() directly
   */
  async list(filters = {}) {
    // Backend route not implemented yet
    throw new Error('Backend /api/teams not implemented. Use teamStorage.list() instead.');
    // return client.get('/api/teams', { params: filters });
  }

  /**
   * Update team
   * ⚠️ DISABLED: Backend endpoint does not exist
   * Use teamStorage.save() directly
   */
  async update(teamId, updates) {
    // Backend route not implemented yet
    throw new Error('Backend /api/teams/:id not implemented. Use teamStorage.save() instead.');
    // return client.put(`/api/teams/${teamId}`, updates);
  }

  /**
   * Delete team
   * ⚠️ DISABLED: Backend endpoint does not exist
   * Use teamStorage.delete() directly
   */
  async delete(teamId) {
    // Backend route not implemented yet
    throw new Error('Backend /api/teams/:id not implemented. Use teamStorage.delete() instead.');
    // return client.delete(`/api/teams/${teamId}`);
  }

  /**
   * Start team execution
   */
  async start(teamId, config = {}) {
    return client.post(`/api/teams/${teamId}/start`, config);
  }

  /**
   * Stop team execution
   */
  async stop(teamId) {
    return client.post(`/api/teams/${teamId}/stop`);
  }

  /**
   * Export team as JSON
   */
  async export(teamId) {
    const team = await this.load(teamId);
    return JSON.stringify(team, null, 2);
  }

  /**
   * Import team from JSON
   */
  async import(jsonData) {
    const teamData = typeof jsonData === 'string'
      ? JSON.parse(jsonData)
      : jsonData;

    return this.save(teamData);
  }

  /**
   * Validate team configuration
   */
  validate(teamData) {
    const errors = [];

    if (!teamData.nodes || teamData.nodes.length === 0) {
      errors.push('Team must have at least one agent');
    }

    if (teamData.nodes && teamData.nodes.length > 0) {
      const rootAgent = teamData.nodes.find(n => n.data?.isRoot);
      if (!rootAgent) {
        errors.push('Team must have a root agent');
      }
    }

    if (!teamData.name || teamData.name.trim() === '') {
      errors.push('Team must have a name');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clone team
   */
  async clone(teamId, newName) {
    const original = await this.load(teamId);
    const cloned = {
      ...original,
      id: undefined, // Let server generate new ID
      name: newName || `${original.name} (Copy)`,
      createdAt: new Date().toISOString()
    };

    return this.save(cloned);
  }
}

export default new TeamService();
