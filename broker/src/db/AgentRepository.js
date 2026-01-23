import db from './schema.js';

export class AgentRepository {
  constructor() {
    // Prepared statements for performance
    this.insertStmt = db.prepare(`
      INSERT INTO agents (agent_id, type, status, comm_mode, metadata, heartbeat_interval_ms, last_heartbeat, created_at, updated_at)
      VALUES (@agentId, @type, @status, @commMode, @metadata, @heartbeatIntervalMs, @lastHeartbeat, @createdAt, @updatedAt)
      ON CONFLICT(agent_id) DO UPDATE SET
        type = @type,
        status = @status,
        comm_mode = @commMode,
        metadata = @metadata,
        heartbeat_interval_ms = @heartbeatIntervalMs,
        last_heartbeat = @lastHeartbeat,
        updated_at = @updatedAt
    `);

    this.getStmt = db.prepare('SELECT * FROM agents WHERE agent_id = ?');
    this.getAllStmt = db.prepare('SELECT * FROM agents');
    this.getByStatusStmt = db.prepare('SELECT * FROM agents WHERE status = ?');
    this.getByTypeStmt = db.prepare('SELECT * FROM agents WHERE type = ?');
    this.deleteStmt = db.prepare('DELETE FROM agents WHERE agent_id = ?');
    this.updateHeartbeatStmt = db.prepare('UPDATE agents SET last_heartbeat = ?, updated_at = ? WHERE agent_id = ?');
    this.updateStatusStmt = db.prepare('UPDATE agents SET status = ?, updated_at = ? WHERE agent_id = ?');
  }

  save(record) {
    const now = new Date().toISOString();

    this.insertStmt.run({
      agentId: record.agentId,
      type: record.type,
      status: record.status,
      commMode: record.commMode || 'tmux',
      metadata: JSON.stringify(record.metadata || {}),
      heartbeatIntervalMs: record.heartbeatIntervalMs || 30000,
      lastHeartbeat: record.lastHeartbeat || now,
      createdAt: record.createdAt || now,
      updatedAt: now
    });
  }

  get(agentId) {
    const row = this.getStmt.get(agentId);
    return row ? this.deserialize(row) : null;
  }

  getAll(filters = {}) {
    let rows;

    if (filters.status) {
      rows = this.getByStatusStmt.all(filters.status);
    } else if (filters.type) {
      rows = this.getByTypeStmt.all(filters.type);
    } else {
      rows = this.getAllStmt.all();
    }

    return rows.map(r => this.deserialize(r));
  }

  updateHeartbeat(agentId) {
    const now = new Date().toISOString();
    const result = this.updateHeartbeatStmt.run(now, now, agentId);
    return result.changes > 0;
  }

  updateStatus(agentId, status) {
    const now = new Date().toISOString();
    const result = this.updateStatusStmt.run(status, now, agentId);
    return result.changes > 0;
  }

  delete(agentId) {
    const result = this.deleteStmt.run(agentId);
    return result.changes > 0;
  }

  deserialize(row) {
    return {
      agentId: row.agent_id,
      type: row.type,
      status: row.status,
      commMode: row.comm_mode || 'tmux',
      metadata: JSON.parse(row.metadata || '{}'),
      heartbeatIntervalMs: row.heartbeat_interval_ms,
      lastHeartbeat: row.last_heartbeat,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
