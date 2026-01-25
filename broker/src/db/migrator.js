/**
 * Database Migration System
 *
 * Manages database schema migrations with tracking and rollback capability.
 * Migrations are run on broker startup to ensure database is up-to-date.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DatabaseMigrator {
  constructor(db) {
    this.db = db;
    this.migrationsDir = path.join(__dirname, 'migrations');

    // Ensure migrations directory exists
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }

    this.initMigrationsTable();
  }

  /**
   * Initialize migrations tracking table
   */
  initMigrationsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        checksum TEXT NOT NULL
      )
    `);
  }

  /**
   * Calculate checksum for migration file
   * @param {string} content - Migration file content
   * @returns {string} Simple checksum
   */
  calculateChecksum(content) {
    // Simple checksum for detecting changes
    let sum = 0;
    for (let i = 0; i < content.length; i++) {
      sum = ((sum << 5) - sum) + content.charCodeAt(i);
      sum = sum & sum; // Convert to 32bit integer
    }
    return Math.abs(sum).toString(16);
  }

  /**
   * Get list of pending migrations
   * @returns {Array} List of migration files to apply
   */
  getPendingMigrations() {
    // Get all migration files
    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Ensure migrations run in order

    // Get applied migrations
    const applied = this.db.prepare('SELECT name FROM migrations').all()
      .map(row => row.name);

    // Return pending migrations
    return files.filter(file => !applied.includes(file));
  }

  /**
   * Apply a single migration
   * @param {string} filename - Migration file name
   */
  applyMigration(filename) {
    const filepath = path.join(this.migrationsDir, filename);
    const content = fs.readFileSync(filepath, 'utf8');
    const checksum = this.calculateChecksum(content);

    console.log(`[Migrator] Applying migration: ${filename}`);

    // Start transaction
    const transaction = this.db.transaction(() => {
      // Execute migration SQL
      this.db.exec(content);

      // Record migration
      const stmt = this.db.prepare(`
        INSERT INTO migrations (name, checksum)
        VALUES (?, ?)
      `);
      stmt.run(filename, checksum);
    });

    try {
      transaction();
      console.log(`[Migrator] ✓ Applied migration: ${filename}`);
    } catch (error) {
      console.error(`[Migrator] ✗ Failed to apply migration ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Run all pending migrations
   * @returns {number} Number of migrations applied
   */
  migrate() {
    const pending = this.getPendingMigrations();

    if (pending.length === 0) {
      console.log('[Migrator] Database is up to date');
      return 0;
    }

    console.log(`[Migrator] Found ${pending.length} pending migration(s)`);

    for (const migration of pending) {
      this.applyMigration(migration);
    }

    console.log(`[Migrator] ✓ Applied ${pending.length} migration(s)`);
    return pending.length;
  }

  /**
   * Verify migration checksums haven't changed
   * @returns {boolean} True if all checksums match
   */
  verifyIntegrity() {
    const applied = this.db.prepare('SELECT name, checksum FROM migrations').all();

    for (const migration of applied) {
      const filepath = path.join(this.migrationsDir, migration.name);

      if (!fs.existsSync(filepath)) {
        console.warn(`[Migrator] Warning: Migration file missing: ${migration.name}`);
        continue;
      }

      const content = fs.readFileSync(filepath, 'utf8');
      const currentChecksum = this.calculateChecksum(content);

      if (currentChecksum !== migration.checksum) {
        console.error(`[Migrator] Error: Migration file changed after applying: ${migration.name}`);
        console.error(`[Migrator] Expected checksum: ${migration.checksum}, got: ${currentChecksum}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Get migration status
   * @returns {object} Migration status info
   */
  getStatus() {
    const applied = this.db.prepare('SELECT * FROM migrations ORDER BY applied_at DESC').all();
    const pending = this.getPendingMigrations();

    return {
      applied: applied.length,
      pending: pending.length,
      lastMigration: applied[0] || null,
      pendingMigrations: pending,
      integrityValid: this.verifyIntegrity()
    };
  }

  /**
   * Create a new migration file
   * @param {string} name - Migration name (will be prefixed with timestamp)
   * @param {string} sql - SQL content
   * @returns {string} Created filename
   */
  createMigration(name, sql) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${timestamp}_${name}.sql`;
    const filepath = path.join(this.migrationsDir, filename);

    const content = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

${sql}
`;

    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`[Migrator] Created migration: ${filename}`);
    return filename;
  }
}

// Export singleton instance
let migrator = null;

export function getMigrator(db) {
  if (!migrator) {
    migrator = new DatabaseMigrator(db);
  }
  return migrator;
}

export default DatabaseMigrator;