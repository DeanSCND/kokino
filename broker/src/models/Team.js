/**
 * Team Model
 * Phase 5: Team Lifecycle Management
 *
 * Manages team configurations for starting/stopping multiple agents together.
 * No workflow orchestration - just simple group management.
 */

import { randomUUID } from 'crypto';
import db from '../db/schema.js';

export class Team {
  constructor(data = {}) {
    this.id = data.id || randomUUID();
    this.name = data.name;
    this.description = data.description || null;
    this.projectId = data.projectId || null;
    this.agents = data.agents || [];  // Array of agent config IDs
    this.createdAt = data.created_at || data.createdAt || new Date().toISOString();
    this.updatedAt = data.updated_at || data.updatedAt || new Date().toISOString();
  }

  /**
   * Validate team data
   * @returns {Array<string>} Array of validation errors
   */
  validate() {
    const errors = [];

    if (!this.name || this.name.trim() === '') {
      errors.push('Team name is required');
    }

    if (!this.agents || !Array.isArray(this.agents)) {
      errors.push('Agents must be an array');
    } else if (this.agents.length === 0) {
      errors.push('Team must have at least one agent');
    } else {
      // Check that all agent configs exist
      for (const agentConfigId of this.agents) {
        const exists = db.prepare(
          'SELECT id FROM agent_configs WHERE id = ?'
        ).get(agentConfigId);

        if (!exists) {
          errors.push(`Agent config ${agentConfigId} not found`);
        }
      }
    }

    // Check for unique team name
    const existing = db.prepare(
      'SELECT id FROM teams WHERE name = ? AND id != ?'
    ).get(this.name, this.id);

    if (existing) {
      errors.push(`Team name "${this.name}" already exists`);
    }

    return errors;
  }

  /**
   * Save team to database (insert or update)
   * @returns {Team} The saved team instance
   */
  save() {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    const existing = db.prepare('SELECT id FROM teams WHERE id = ?').get(this.id);

    if (existing) {
      // Update existing team
      db.prepare(`
        UPDATE teams
        SET name = ?, description = ?, project_id = ?, agents = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        this.name,
        this.description,
        this.projectId,
        JSON.stringify(this.agents),
        this.id
      );

      // Fetch updated record
      const updated = db.prepare('SELECT * FROM teams WHERE id = ?').get(this.id);
      this.updatedAt = updated.updated_at;
    } else {
      // Insert new team
      db.prepare(`
        INSERT INTO teams (id, name, description, project_id, agents)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        this.id,
        this.name,
        this.description,
        this.projectId,
        JSON.stringify(this.agents)
      );
    }

    return this;
  }

  /**
   * Delete team from database
   * @returns {boolean} True if deleted successfully
   */
  delete() {
    // Check for active runs
    const activeRun = db.prepare(
      'SELECT id FROM team_runs WHERE team_id = ? AND status = ?'
    ).get(this.id, 'running');

    if (activeRun) {
      throw new Error('Cannot delete team with active run');
    }

    // Delete team (cascade will delete runs)
    const result = db.prepare('DELETE FROM teams WHERE id = ?').run(this.id);
    return result.changes > 0;
  }

  /**
   * Get expanded agent configurations
   * @returns {Array<Object>} Array of full agent config objects
   */
  getAgentConfigs() {
    const configs = [];

    for (const configId of this.agents) {
      const config = db.prepare(`
        SELECT * FROM agent_configs WHERE id = ?
      `).get(configId);

      if (config) {
        configs.push({
          ...config,
          capabilities: JSON.parse(config.capabilities || '[]'),
          environmentVariables: JSON.parse(config.environment_variables || '{}'),
          bootstrapCommands: JSON.parse(config.bootstrap_commands || '[]')
        });
      }
    }

    return configs;
  }

  /**
   * Get current team status
   * @returns {Object} Status information
   */
  getStatus() {
    const latestRun = db.prepare(`
      SELECT * FROM team_runs
      WHERE team_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(this.id);

    if (!latestRun) {
      return { status: 'never_run', teamId: this.id };
    }

    return {
      teamId: this.id,
      runId: latestRun.id,
      status: latestRun.status,
      startedAt: latestRun.started_at,
      stoppedAt: latestRun.stopped_at,
      agentPids: JSON.parse(latestRun.agent_pids || '{}'),
      errorMessage: latestRun.error_message
    };
  }

  /**
   * Convert to JSON representation
   * @returns {Object} JSON object
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      projectId: this.projectId,
      agents: this.agents,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Find team by ID
   * @param {string} id - Team ID
   * @returns {Team|null} Team instance or null
   */
  static findById(id) {
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    if (!row) return null;

    return new Team({
      ...row,
      agents: JSON.parse(row.agents || '[]')
    });
  }

  /**
   * Find team by name
   * @param {string} name - Team name
   * @returns {Team|null} Team instance or null
   */
  static findByName(name) {
    const row = db.prepare('SELECT * FROM teams WHERE name = ?').get(name);
    if (!row) return null;

    return new Team({
      ...row,
      agents: JSON.parse(row.agents || '[]')
    });
  }

  /**
   * List all teams
   * @param {string|null} projectId - Optional project filter
   * @returns {Array<Team>} Array of team instances
   */
  static list(projectId = null) {
    const query = projectId
      ? 'SELECT * FROM teams WHERE project_id = ? ORDER BY name'
      : 'SELECT * FROM teams ORDER BY name';

    const rows = projectId
      ? db.prepare(query).all(projectId)
      : db.prepare(query).all();

    return rows.map(row => new Team({
      ...row,
      agents: JSON.parse(row.agents || '[]')
    }));
  }

  /**
   * List teams with their current status
   * @param {string|null} projectId - Optional project filter
   * @returns {Array<Object>} Array of teams with status
   */
  static listWithStatus(projectId = null) {
    const teams = Team.list(projectId);

    return teams.map(team => ({
      ...team.toJSON(),
      status: team.getStatus()
    }));
  }

  /**
   * Count total teams
   * @param {string|null} projectId - Optional project filter
   * @returns {number} Number of teams
   */
  static count(projectId = null) {
    const query = projectId
      ? 'SELECT COUNT(*) as count FROM teams WHERE project_id = ?'
      : 'SELECT COUNT(*) as count FROM teams';

    const result = projectId
      ? db.prepare(query).get(projectId)
      : db.prepare(query).get();

    return result.count;
  }
}

export default Team;