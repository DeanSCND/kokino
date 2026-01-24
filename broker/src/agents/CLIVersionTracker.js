/**
 * CLIVersionTracker - Tracks CLI versions for debugging JSONL schema changes
 *
 * Captures CLI version information to correlate:
 * - Schema validation failures with CLI updates
 * - JSONL format changes over time
 * - Agent-specific CLI versions
 *
 * Related: Issue #91 - JSONL Parser Hardening & Schema Validation
 */

import { execSync } from 'node:child_process';
import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

export class CLIVersionTracker {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'cli_versions.db');

    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initSchema();

    console.log(`[CLIVersionTracker] Initialized (db: ${this.dbPath})`);
  }

  /**
   * Initialize database schema
   */
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cli_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cli_type TEXT NOT NULL,
        version TEXT NOT NULL,
        full_output TEXT,
        timestamp TEXT NOT NULL,
        UNIQUE(agent_id, cli_type, version)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_cli ON cli_versions(agent_id, cli_type);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cli_versions(timestamp);
    `);
  }

  /**
   * Capture and store CLI version
   *
   * @param {string} agentId - Agent identifier
   * @param {string} cliType - CLI type (claude-code, factory-droid, etc.)
   * @param {string} command - Version command (default: --version)
   * @returns {object|null} Version info or null if capture failed
   */
  capture(agentId, cliType, command = '--version') {
    const cliCommand = this.getCLICommand(cliType);

    if (!cliCommand) {
      console.warn(`[CLIVersionTracker] Unknown CLI type: ${cliType}`);
      return null;
    }

    try {
      // Execute version command (5s timeout)
      const output = execSync(`${cliCommand} ${command}`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      // Extract version string (first line usually contains version)
      const version = output.split('\n')[0].trim();

      if (!version) {
        console.warn(`[CLIVersionTracker] Empty version output for ${cliType}`);
        return null;
      }

      // Store in database
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO cli_versions (agent_id, cli_type, version, full_output, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      const timestamp = new Date().toISOString();
      const result = stmt.run(agentId, cliType, version, output, timestamp);

      const versionInfo = {
        agentId,
        cliType,
        version,
        fullOutput: output,
        timestamp,
        isNew: result.changes > 0
      };

      if (versionInfo.isNew) {
        console.log(`[CLIVersionTracker] Captured ${cliType} version ${version} for ${agentId}`);
      }

      return versionInfo;

    } catch (error) {
      console.error(`[CLIVersionTracker] Failed to capture version for ${cliType}:`, error.message);
      return null;
    }
  }

  /**
   * Get CLI command for type
   *
   * @param {string} cliType - CLI type
   * @returns {string|null} CLI command or null
   */
  getCLICommand(cliType) {
    const commands = {
      'claude-code': 'claude',
      'factory-droid': 'droid',
      'gemini': 'gemini',
    };

    return commands[cliType] || null;
  }

  /**
   * Get latest version for agent + CLI type
   *
   * @param {string} agentId - Agent identifier
   * @param {string} cliType - CLI type
   * @returns {object|null} Version record or null
   */
  getLatest(agentId, cliType) {
    const stmt = this.db.prepare(`
      SELECT * FROM cli_versions
      WHERE agent_id = ? AND cli_type = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);

    return stmt.get(agentId, cliType) || null;
  }

  /**
   * Get version history for agent
   *
   * @param {string} agentId - Agent identifier
   * @param {number} limit - Max results (default: 10)
   * @returns {Array<object>} Version records
   */
  getHistory(agentId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM cli_versions
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(agentId, limit);
  }

  /**
   * Get all unique versions for CLI type
   *
   * @param {string} cliType - CLI type
   * @returns {Array<object>} Unique versions with first seen timestamp
   */
  getUniqueVersions(cliType) {
    const stmt = this.db.prepare(`
      SELECT version, MIN(timestamp) as first_seen, COUNT(*) as agent_count
      FROM cli_versions
      WHERE cli_type = ?
      GROUP BY version
      ORDER BY first_seen DESC
    `);

    return stmt.all(cliType);
  }

  /**
   * Cleanup old version records (retain last 30 days)
   *
   * @param {number} retentionDays - Days to retain (default: 30)
   * @returns {number} Number of records deleted
   */
  cleanup(retentionDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    const stmt = this.db.prepare(`
      DELETE FROM cli_versions
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffISO);

    if (result.changes > 0) {
      console.log(`[CLIVersionTracker] Cleaned up ${result.changes} old version records (>${retentionDays}d)`);
    }

    return result.changes;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    console.log('[CLIVersionTracker] Database closed');
  }
}
