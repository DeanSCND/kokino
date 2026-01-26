/**
 * BootstrapManager - Core bootstrap orchestration
 * Phase 3: Bootstrap System
 *
 * Manages agent context loading on startup via 4 modes:
 * - none: No context, system prompt only
 * - auto: Load CLAUDE.md and .kokino files automatically
 * - manual: User-triggered via API
 * - custom: Run custom bootstrap script
 */

import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BootstrapMode, BootstrapStatus } from './BootstrapModes.js';
import { FileLoader } from './FileLoader.js';
import db from '../db/schema.js';

const execAsync = promisify(exec);

export class BootstrapManager {
  constructor(agentRegistry) {
    this.registry = agentRegistry;
  }

  /**
   * Bootstrap an agent with specified configuration
   * @param {string} agentId - Agent ID
   * @param {object} config - Bootstrap configuration
   * @returns {Promise<object>} Bootstrap result
   */
  async bootstrapAgent(agentId, config) {
    const startTime = Date.now();
    const historyId = randomUUID();

    try {
      // Record bootstrap start
      await this.recordBootstrapStart(historyId, agentId, config.mode);

      let result;
      switch (config.mode) {
        case BootstrapMode.NONE:
          result = await this.bootstrapNone(agentId);
          break;
        case BootstrapMode.AUTO:
          result = await this.bootstrapAuto(agentId, config);
          break;
        case BootstrapMode.MANUAL:
          result = await this.bootstrapManual(agentId, config);
          break;
        case BootstrapMode.CUSTOM:
          result = await this.bootstrapCustom(agentId, config);
          break;
        default:
          throw new Error(`Unknown bootstrap mode: ${config.mode}`);
      }

      // Record success
      const duration = Date.now() - startTime;
      await this.recordBootstrapComplete(historyId, result, duration);

      // Update agent bootstrap status
      await this.updateAgentBootstrapStatus(agentId, BootstrapStatus.READY);

      // Increment bootstrap count
      await this.incrementBootstrapCount(agentId);

      return {
        success: true,
        ...result,
        duration: duration / 1000 // seconds
      };

    } catch (error) {
      // Record failure
      const duration = Date.now() - startTime;
      await this.recordBootstrapError(historyId, error, duration);

      // Update agent bootstrap status
      await this.updateAgentBootstrapStatus(agentId, BootstrapStatus.FAILED);

      throw error;
    }
  }

  /**
   * Bootstrap mode: none
   * No context loading, agent starts with system prompt only
   */
  async bootstrapNone(agentId) {
    return {
      mode: 'none',
      filesLoaded: [],
      contextSize: 0
    };
  }

  /**
   * Bootstrap mode: auto
   * Automatically load CLAUDE.md and .kokino files
   */
  async bootstrapAuto(agentId, config) {
    const agent = await this.getAgentInfo(agentId);
    const loader = new FileLoader(agent.workingDirectory || process.cwd());

    // Load files in order
    const files = await loader.loadAutoFiles(config.autoLoadPaths);

    // Build context
    const context = this.buildContext(files);

    // Inject context into agent
    await this.injectContext(agentId, context);

    return {
      mode: 'auto',
      filesLoaded: files.map(f => f.path),
      contextSize: context.length
    };
  }

  /**
   * Bootstrap mode: manual
   * User specifies files to load via API
   */
  async bootstrapManual(agentId, config) {
    const agent = await this.getAgentInfo(agentId);
    const loader = new FileLoader(agent.workingDirectory || process.cwd());

    const files = [];
    for (const filePath of config.files || []) {
      const result = await loader.loadFile(filePath);
      if (result.loaded) {
        files.push(result);
      }
    }

    const context = this.buildContext(files, config.additionalContext);
    await this.injectContext(agentId, context);

    return {
      mode: 'manual',
      filesLoaded: files.map(f => f.path),
      contextSize: context.length
    };
  }

  /**
   * Bootstrap mode: custom
   * Execute custom script to generate context
   */
  async bootstrapCustom(agentId, config) {
    const agent = await this.getAgentInfo(agentId);

    // Validate script safety (basic checks)
    this.validateScript(config.bootstrapScript);

    // Execute custom script with limited permissions
    const { stdout, stderr } = await execAsync(config.bootstrapScript, {
      cwd: agent.workingDirectory || process.cwd(),
      env: {
        ...process.env,
        AGENT_ID: agentId,
        AGENT_ROLE: agent.metadata?.role || 'unknown',
        WORKING_DIR: agent.workingDirectory || process.cwd(),
        ...config.bootstrapEnv
      },
      timeout: config.bootstrapTimeout || 30000,
      maxBuffer: 1024 * 1024 // 1MB max output
    });

    if (stderr) {
      console.warn(`[Bootstrap] Script stderr for ${agentId}:`, stderr);
    }

    // Use script output as context
    await this.injectContext(agentId, stdout);

    return {
      mode: 'custom',
      script: config.bootstrapScript,
      contextSize: stdout.length
    };
  }

  /**
   * Validate bootstrap script for dangerous commands
   * @param {string} script - Script command to validate
   * @throws {Error} If script contains forbidden commands
   */
  validateScript(script) {
    const forbidden = [
      'rm -rf',
      'rm -fr',
      'sudo',
      'mkfs',
      'dd if=',
      '> /dev/',
      'wget',
      'curl http',
      '$(', // Command substitution
      '`',  // Backtick command substitution
    ];

    for (const cmd of forbidden) {
      if (script.includes(cmd)) {
        throw new Error(`Bootstrap script contains forbidden command: ${cmd}`);
      }
    }

    // Check for suspicious redirects and pipes to system locations
    if (script.match(/>\s*\/(?:dev|etc|sys|proc)/)) {
      throw new Error('Bootstrap script contains suspicious system redirect');
    }
  }

  /**
   * Build context from loaded files
   * @param {Array} files - Loaded file objects
   * @param {string} additionalContext - Optional additional context
   * @returns {string} Combined context
   */
  buildContext(files, additionalContext = '') {
    let context = '';

    for (const file of files) {
      context += `# File: ${file.path}\n\n`;
      context += file.content;
      context += '\n\n---\n\n';
    }

    if (additionalContext) {
      context += `# Additional Context\n\n${additionalContext}\n`;
    }

    return context;
  }

  /**
   * Inject context into agent
   * Stores in database and attempts direct delivery if agent is running
   */
  async injectContext(agentId, context) {
    // Store context in database
    const stmt = db.prepare(
      'UPDATE agents SET bootstrap_context = ?, bootstrap_status = ? WHERE agent_id = ?'
    );
    stmt.run(context, 'ready', agentId);

    // TODO: Send context via tmux/headless to running agent
    // This would use AgentRunner or tmux send-keys
    // For now, context is available in DB for agent to read
  }

  /**
   * Get agent information from registry
   */
  async getAgentInfo(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Working directory is stored in metadata
    return {
      ...agent,
      workingDirectory: agent.metadata?.workingDirectory || agent.workingDirectory || process.cwd()
    };
  }

  /**
   * Update agent bootstrap status
   */
  async updateAgentBootstrapStatus(agentId, status) {
    const stmt = db.prepare(
      'UPDATE agents SET bootstrap_status = ?, updated_at = datetime(\'now\') WHERE agent_id = ?'
    );
    stmt.run(status, agentId);
  }

  /**
   * Increment bootstrap count for agent config
   */
  async incrementBootstrapCount(agentId) {
    // Get config ID from agent
    const agent = db.prepare('SELECT config_id FROM agents WHERE agent_id = ?').get(agentId);
    if (agent && agent.config_id) {
      const stmt = db.prepare(`
        UPDATE agent_configs
        SET bootstrap_count = bootstrap_count + 1,
            last_bootstrap = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `);
      stmt.run(agent.config_id);
    }
  }

  /**
   * Record bootstrap start in history
   */
  async recordBootstrapStart(id, agentId, mode) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO bootstrap_history
      (id, agent_id, mode, started_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, agentId, mode, now, now);
  }

  /**
   * Record bootstrap completion
   */
  async recordBootstrapComplete(id, result, duration) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE bootstrap_history
      SET completed_at = ?, success = ?, files_loaded = ?,
          context_size = ?, duration_ms = ?
      WHERE id = ?
    `);
    stmt.run(
      now,
      1, // SQLite uses 0/1 for booleans
      JSON.stringify(result.filesLoaded || []),
      result.contextSize || 0,
      duration,
      id
    );
  }

  /**
   * Record bootstrap error
   */
  async recordBootstrapError(id, error, duration) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE bootstrap_history
      SET completed_at = ?, success = ?, error_message = ?, duration_ms = ?
      WHERE id = ?
    `);
    stmt.run(now, 0, error.message, duration, id); // SQLite uses 0/1 for booleans
  }

  /**
   * Get bootstrap status for an agent
   */
  async getBootstrapStatus(agentId) {
    const agent = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);

    const history = db.prepare(`
      SELECT * FROM bootstrap_history
      WHERE agent_id = ?
      ORDER BY started_at DESC
      LIMIT 5
    `).all(agentId);

    return {
      agentId,
      status: agent?.bootstrap_status || 'unknown',
      lastBootstrap: history[0]?.completed_at || null,
      history: history.map(h => ({
        mode: h.mode,
        success: Boolean(h.success),
        filesLoaded: JSON.parse(h.files_loaded || '[]'),
        contextSize: h.context_size,
        duration: h.duration_ms,
        startedAt: h.started_at,
        completedAt: h.completed_at,
        error: h.error_message
      }))
    };
  }
}

export default BootstrapManager;
