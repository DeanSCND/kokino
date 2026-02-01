import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { getMigrator } from './migrator.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'kokino.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

console.log(`[db] Database path: ${DB_PATH}`);

// Initialize database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema: Agents table
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'online',
    comm_mode TEXT NOT NULL DEFAULT 'tmux' CHECK(comm_mode IN ('tmux', 'headless', 'shadow')),
    metadata JSON,
    heartbeat_interval_ms INTEGER DEFAULT 30000,
    last_heartbeat TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Schema: Tickets table
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    ticket_id TEXT PRIMARY KEY,
    target_agent TEXT NOT NULL,
    origin_agent TEXT NOT NULL,
    payload TEXT NOT NULL,
    metadata JSON,
    expect_reply INTEGER DEFAULT 1,
    timeout_ms INTEGER DEFAULT 30000,
    status TEXT NOT NULL DEFAULT 'pending',
    response JSON,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (target_agent) REFERENCES agents(agent_id) ON DELETE CASCADE
  )
`);

// Schema: Messages table (for timeline/history)
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    thread_id TEXT,
    payload TEXT NOT NULL,
    metadata JSON,
    status TEXT NOT NULL DEFAULT 'sent',
    latency_ms INTEGER,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (from_agent) REFERENCES agents(agent_id) ON DELETE CASCADE,
    FOREIGN KEY (to_agent) REFERENCES agents(agent_id) ON DELETE CASCADE
  )
`);

// Schema: Conversations table (headless agent chat sessions)
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

// Schema: Turns table (individual messages/responses in conversations)
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

// Schema: Shadow results table (parallel tmux vs headless testing)
db.exec(`
  CREATE TABLE IF NOT EXISTS shadow_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    tmux_success INTEGER NOT NULL,
    headless_success INTEGER NOT NULL,
    output_match INTEGER NOT NULL,
    latency_delta_ms INTEGER,
    tmux_duration_ms INTEGER,
    headless_duration_ms INTEGER,
    tmux_error TEXT,
    headless_error TEXT,
    tmux_response TEXT,
    headless_response TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
  )
`);

console.log('[db] ✓ Database tables created');

// Run migrations
const migrator = getMigrator(db);
try {
  const migrationsApplied = migrator.migrate();
  if (migrationsApplied > 0) {
    console.log(`[db] ✓ Applied ${migrationsApplied} migration(s)`);
  }

  // Verify integrity
  if (!migrator.verifyIntegrity()) {
    console.error('[db] ⚠️  Migration integrity check failed - migrations may have been modified after applying');
  }
} catch (error) {
  console.error('[db] Failed to run migrations:', error.message);
  // Don't exit - allow broker to start even if migrations fail
  // This ensures we can still debug the issue
}

// Create indexes for common queries (after migrations to ensure all columns exist)
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_target_agent ON tickets(target_agent);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
  CREATE INDEX IF NOT EXISTS idx_agents_comm_mode ON agents(comm_mode);
  CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent);
  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
  CREATE INDEX IF NOT EXISTS idx_turns_conversation ON turns(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created_at);
  CREATE INDEX IF NOT EXISTS idx_shadow_results_agent ON shadow_results(agent_id);
  CREATE INDEX IF NOT EXISTS idx_shadow_results_created ON shadow_results(created_at);
  CREATE INDEX IF NOT EXISTS idx_shadow_results_ticket ON shadow_results(ticket_id);
`);

console.log('[db] ✓ Database schema initialized');

export default db;
