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

// Create indexes for common queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_tickets_target_agent ON tickets(target_agent);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
`);

console.log('[db] ✓ Database schema initialized');

export default db;
