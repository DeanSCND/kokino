/**
 * Agent Configuration Model
 *
 * Manages agent templates and configurations for Phase 2.
 * Replaces hardcoded agent definitions with dynamic database-backed configs.
 */

import { randomUUID } from 'node:crypto';
import db from '../db/schema.js';

export class AgentConfig {
  constructor(data) {
    this.id = data.id || randomUUID();
    this.projectId = data.projectId || 'default';
    this.name = data.name;
    this.role = data.role;
    this.cliType = data.cliType || 'claude-code';
    this.systemPrompt = data.systemPrompt || '';
    this.workingDirectory = data.workingDirectory || '.';
    this.bootstrapMode = data.bootstrapMode || 'auto';
    this.bootstrapScript = data.bootstrapScript || '';
    this.capabilities = data.capabilities || [];
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  /**
   * Validate agent configuration
   */
  validate() {
    const errors = [];

    if (!this.name) errors.push('Name is required');
    if (!this.role) errors.push('Role is required');
    if (!this.projectId) errors.push('Project ID is required');
    if (!['claude-code', 'factory-droid', 'gemini'].includes(this.cliType)) {
      errors.push('Invalid CLI type');
    }
    if (!['none', 'auto', 'manual', 'custom'].includes(this.bootstrapMode)) {
      errors.push('Invalid bootstrap mode');
    }

    return errors;
  }

  /**
   * Convert to database format
   */
  toDatabase() {
    return {
      id: this.id,
      project_id: this.projectId,
      name: this.name,
      role: this.role,
      cli_type: this.cliType,
      system_prompt: this.systemPrompt,
      working_directory: this.workingDirectory,
      bootstrap_mode: this.bootstrapMode,
      bootstrap_script: this.bootstrapScript,
      capabilities: JSON.stringify(this.capabilities),
      metadata: JSON.stringify(this.metadata),
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }

  /**
   * Create from database row
   */
  static fromDatabase(row) {
    if (!row) return null;

    return new AgentConfig({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      role: row.role,
      cliType: row.cli_type,
      systemPrompt: row.system_prompt,
      workingDirectory: row.working_directory,
      bootstrapMode: row.bootstrap_mode,
      bootstrapScript: row.bootstrap_script,
      capabilities: typeof row.capabilities === 'string'
        ? JSON.parse(row.capabilities)
        : row.capabilities || [],
      metadata: typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  /**
   * Save agent configuration
   */
  save() {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    const data = this.toDatabase();

    // Try to insert or update
    const existing = db.prepare('SELECT id FROM agent_configs WHERE id = ?').get(this.id);

    if (existing) {
      // Update existing
      const stmt = db.prepare(`
        UPDATE agent_configs
        SET project_id = ?, name = ?, role = ?, cli_type = ?,
            system_prompt = ?, working_directory = ?, bootstrap_mode = ?,
            bootstrap_script = ?, capabilities = ?, metadata = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `);

      stmt.run(
        data.project_id, data.name, data.role, data.cli_type,
        data.system_prompt, data.working_directory, data.bootstrap_mode,
        data.bootstrap_script, data.capabilities, data.metadata,
        data.id
      );
    } else {
      // Insert new
      const stmt = db.prepare(`
        INSERT INTO agent_configs (
          id, project_id, name, role, cli_type, system_prompt,
          working_directory, bootstrap_mode, bootstrap_script,
          capabilities, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        data.id, data.project_id, data.name, data.role, data.cli_type,
        data.system_prompt, data.working_directory, data.bootstrap_mode,
        data.bootstrap_script, data.capabilities, data.metadata,
        data.created_at, data.updated_at
      );
    }

    return this;
  }

  /**
   * Find agent configuration by ID
   */
  static findById(id) {
    const row = db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(id);
    return AgentConfig.fromDatabase(row);
  }

  /**
   * Find all configs for a project
   */
  static findByProject(projectId) {
    const rows = db.prepare('SELECT * FROM agent_configs WHERE project_id = ? ORDER BY role, name')
      .all(projectId);
    return rows.map(row => AgentConfig.fromDatabase(row));
  }

  /**
   * Find configs by role
   */
  static findByRole(role, projectId = null) {
    let query = 'SELECT * FROM agent_configs WHERE role = ?';
    const params = [role];

    if (projectId) {
      query += ' AND project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY name';

    const rows = db.prepare(query).all(...params);
    return rows.map(row => AgentConfig.fromDatabase(row));
  }

  /**
   * Find configs by capabilities
   */
  static findByCapability(capability, projectId = null) {
    let query = `SELECT * FROM agent_configs WHERE capabilities LIKE ?`;
    const params = [`%"${capability}"%`];

    if (projectId) {
      query += ' AND project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY role, name';

    const rows = db.prepare(query).all(...params);
    return rows.map(row => AgentConfig.fromDatabase(row));
  }

  /**
   * List all agent configurations
   */
  static listAll(projectId = null) {
    let query = 'SELECT * FROM agent_configs';
    const params = [];

    if (projectId) {
      query += ' WHERE project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY role, name';

    const rows = db.prepare(query).all(...params);
    return rows.map(row => AgentConfig.fromDatabase(row));
  }

  /**
   * Delete agent configuration
   */
  delete() {
    const stmt = db.prepare('DELETE FROM agent_configs WHERE id = ?');
    const result = stmt.run(this.id);
    return result.changes > 0;
  }

  /**
   * Clone configuration
   */
  clone(newName = null) {
    const clone = new AgentConfig({
      ...this,
      id: randomUUID(),
      name: newName || `${this.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return clone.save();
  }

  /**
   * Instantiate as runtime agent
   * Creates an agent registration from this configuration
   */
  instantiate(agentName = null) {
    const name = agentName || `${this.name}-${Date.now()}`;

    return {
      agentId: name,
      type: this.cliType,
      commMode: 'headless',
      configId: this.id,
      metadata: {
        ...this.metadata,
        role: this.role,
        projectId: this.projectId,
        configName: this.name,
        systemPrompt: this.systemPrompt,
        workingDirectory: this.workingDirectory,
        bootstrapMode: this.bootstrapMode,
        capabilities: this.capabilities
      }
    };
  }

  /**
   * Export as JSON (for UI/API responses)
   */
  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      name: this.name,
      role: this.role,
      cliType: this.cliType,
      systemPrompt: this.systemPrompt,
      workingDirectory: this.workingDirectory,
      bootstrapMode: this.bootstrapMode,
      bootstrapScript: this.bootstrapScript,
      capabilities: this.capabilities,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export default AgentConfig;