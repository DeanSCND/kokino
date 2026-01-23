import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

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

// Create indexes for common queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_target_agent ON tickets(target_agent);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
  CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent);
  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
`);

console.log('[db] ✓ Database schema initialized');

export default db;
