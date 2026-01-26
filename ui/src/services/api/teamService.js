/**
 * Team Service - Team composition and management
 * Phase 5: Full Teams API Integration
 *
 * Provides methods for team CRUD, lifecycle management, and orchestration.
 * Backend endpoints implemented at /api/teams/*
 */

import client from './client.js';

class TeamService {
  /**
   * Create new team configuration
   */
  async create(teamData) {
    const validated = this.validate(teamData);
    if (!validated.valid) {
      throw new Error(`Invalid team: ${validated.errors.join(', ')}`);
    }

    const response = await fetch('http://127.0.0.1:5050/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create team');
    }

    return response.json();
  }

  /**
   * Load team configuration by ID
   */
  async load(teamId) {
    const response = await fetch(`http://127.0.0.1:5050/api/teams/${teamId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to load team');
    }

    return response.json();
  }

  /**
   * List all teams, optionally filtered by project
   */
  async list(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`http://127.0.0.1:5050/api/teams?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list teams');
    }

    return response.json();
  }

  /**
   * Update existing team
   */
  async update(teamId, updates) {
    const response = await fetch(`http://127.0.0.1:5050/api/teams/${teamId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update team');
    }

    return response.json();
  }

  /**
   * Delete team
   */
  async delete(teamId) {
    const response = await fetch(`http://127.0.0.1:5050/api/teams/${teamId}`, {
      method: 'DELETE'
    });

    if (!response.ok && response.status !== 204) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete team');
    }

    return null;
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
