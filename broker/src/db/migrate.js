#!/usr/bin/env node
/**
 * Database Migration Script
 * Safely migrates existing Kokino databases to add headless agent support
 */

import Database from 'better-sqlite3';
import * as path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'kokino.db');

console.log('[migrate] Starting database migration...');
console.log(`[migrate] Database: ${DB_PATH}`);

const db = new Database(DB_PATH);

// Begin transaction for atomic migration
db.exec('BEGIN TRANSACTION');

try {
  // Check if comm_mode column exists
  const columns = db.prepare("PRAGMA table_info(agents)").all();
  const hasCommMode = columns.some(col => col.name === 'comm_mode');

  if (!hasCommMode) {
    console.log('[migrate] Adding comm_mode column to agents table...');
    db.exec(`
      ALTER TABLE agents
      ADD COLUMN comm_mode TEXT NOT NULL DEFAULT 'tmux' CHECK(comm_mode IN ('tmux', 'headless'))
    `);
    console.log('[migrate] ✓ Added comm_mode column');
  } else {
    console.log('[migrate] comm_mode column already exists, skipping');
  }

  // Create conversations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      conversation_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT,
      metadata JSON,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
    )
  `);
  console.log('[migrate] ✓ Conversations table ready');

  // Create turns table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS turns (
      turn_id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      metadata JSON,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
    )
  `);
  console.log('[migrate] ✓ Turns table ready');

  // Create new indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agents_comm_mode ON agents(comm_mode);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created_at);
  `);
  console.log('[migrate] ✓ Indexes created');

  // Commit transaction
  db.exec('COMMIT');
  console.log('[migrate] ✓ Migration completed successfully');

  // Print migration summary
  const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
  const conversationCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;
  console.log(`[migrate] Summary: ${agentCount} agents, ${conversationCount} conversations`);

} catch (error) {
  // Rollback on error
  db.exec('ROLLBACK');
  console.error('[migrate] ✗ Migration failed:', error.message);
  console.error('[migrate] Database rolled back to previous state');
  process.exit(1);
} finally {
  db.close();
}
