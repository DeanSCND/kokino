/**
 * Team Service - Team composition and management
 * Phase 4a: Service Layer Foundation
 *
 * NOTE: Backend /api/teams/* endpoints do not exist yet.
 * This service layer is ready for when those routes are implemented.
 * Until then, calls will return 404.
 */

import client from './client.js';

class TeamService {
  /**
   * Save team configuration
   */
  async save(teamData) {
    const validated = this.validate(teamData);
    if (!validated.valid) {
      throw new Error(`Invalid team: ${validated.errors.join(', ')}`);
    }

    return client.post('/api/teams', teamData);
  }

  /**
   * Load team configuration
   */
  async load(teamId) {
    return client.get(`/api/teams/${teamId}`);
  }

  /**
   * List all teams
   */
  async list(filters = {}) {
    return client.get('/api/teams', { params: filters });
  }

  /**
   * Update team
   */
  async update(teamId, updates) {
    return client.put(`/api/teams/${teamId}`, updates);
  }

  /**
   * Delete team
   */
  async delete(teamId) {
    return client.delete(`/api/teams/${teamId}`);
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
