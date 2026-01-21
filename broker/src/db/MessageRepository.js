import db from './schema.js';

/**
 * Message Repository
 *
 * Handles CRUD operations for message history
 */
export class MessageRepository {
  constructor() {
    // Prepared statements
    this.saveStmt = db.prepare(`
      INSERT INTO messages (message_id, from_agent, to_agent, thread_id, payload, metadata, status, latency_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getAllStmt = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?');
    this.getByThreadStmt = db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY timestamp ASC');
    this.getByAgentStmt = db.prepare('SELECT * FROM messages WHERE from_agent = ? OR to_agent = ? ORDER BY timestamp DESC LIMIT ?');
    this.searchStmt = db.prepare(`
      SELECT * FROM messages
      WHERE payload LIKE ? OR from_agent LIKE ? OR to_agent LIKE ?
      ORDER BY timestamp DESC LIMIT ?
    `);
    this.deleteOldStmt = db.prepare('DELETE FROM messages WHERE timestamp < ?');
  }

  /**
   * Save a message to history
   */
  save(message) {
    const {
      messageId,
      from,
      to,
      threadId = null,
      payload,
      metadata = null,
      status = 'sent',
      latency = null
    } = message;

    const timestamp = new Date().toISOString();

    try {
      this.saveStmt.run(
        messageId,
        from,
        to,
        threadId,
        typeof payload === 'string' ? payload : JSON.stringify(payload),
        metadata ? JSON.stringify(metadata) : null,
        status,
        latency,
        timestamp
      );
      return true;
    } catch (error) {
      console.error('[MessageRepository] Save failed:', error);
      return false;
    }
  }

  /**
   * Get all messages (limited)
   */
  getAll(limit = 1000) {
    const rows = this.getAllStmt.all(limit);
    return rows.map(this.parseRow);
  }

  /**
   * Get messages by thread ID
   */
  getByThread(threadId) {
    const rows = this.getByThreadStmt.all(threadId);
    return rows.map(this.parseRow);
  }

  /**
   * Get messages involving an agent
   */
  getByAgent(agentId, limit = 100) {
    const rows = this.getByAgentStmt.all(agentId, agentId, limit);
    return rows.map(this.parseRow);
  }

  /**
   * Search messages by keyword
   */
  search(query, limit = 100) {
    const pattern = `%${query}%`;
    const rows = this.searchStmt.all(pattern, pattern, pattern, limit);
    return rows.map(this.parseRow);
  }

  /**
   * Delete messages older than timestamp
   */
  deleteOld(olderThan) {
    const result = this.deleteOldStmt.run(olderThan);
    return result.changes;
  }

  /**
   * Parse database row to message object
   */
  parseRow(row) {
    return {
      id: row.id,
      messageId: row.message_id,
      from: row.from_agent,
      to: row.to_agent,
      threadId: row.thread_id,
      payload: row.payload,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      status: row.status,
      latency: row.latency_ms,
      timestamp: row.timestamp
    };
  }
}
