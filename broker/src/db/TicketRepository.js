import db from './schema.js';

export class TicketRepository {
  constructor() {
    // Prepared statements
    this.insertStmt = db.prepare(`
      INSERT INTO tickets (ticket_id, target_agent, origin_agent, payload, metadata, expect_reply, timeout_ms, status, response, created_at, updated_at)
      VALUES (@ticketId, @targetAgent, @originAgent, @payload, @metadata, @expectReply, @timeoutMs, @status, @response, @createdAt, @updatedAt)
    `);

    this.getStmt = db.prepare('SELECT * FROM tickets WHERE ticket_id = ?');
    this.getPendingStmt = db.prepare('SELECT * FROM tickets WHERE target_agent = ? AND status = ?');
    this.updateStatusStmt = db.prepare('UPDATE tickets SET status = ?, response = ?, updated_at = ? WHERE ticket_id = ?');
    this.deleteOldStmt = db.prepare('DELETE FROM tickets WHERE status != ? AND julianday(?) - julianday(created_at) > ?');
  }

  save(ticket) {
    const now = new Date().toISOString();

    this.insertStmt.run({
      ticketId: ticket.ticketId,
      targetAgent: ticket.targetAgent,
      originAgent: ticket.originAgent,
      payload: ticket.payload,
      metadata: JSON.stringify(ticket.metadata || {}),
      expectReply: ticket.expectReply ? 1 : 0,
      timeoutMs: ticket.timeoutMs || 30000,
      status: ticket.status,
      response: ticket.response ? JSON.stringify(ticket.response) : null,
      createdAt: ticket.createdAt || now,
      updatedAt: now
    });
  }

  get(ticketId) {
    const row = this.getStmt.get(ticketId);
    return row ? this.deserialize(row) : null;
  }

  getPending(targetAgent) {
    const rows = this.getPendingStmt.all(targetAgent, 'pending');
    return rows.map(r => this.deserialize(r));
  }

  updateStatus(ticketId, status, response = null) {
    const now = new Date().toISOString();
    const result = this.updateStatusStmt.run(
      status,
      response ? JSON.stringify(response) : null,
      now,
      ticketId
    );
    return result.changes > 0;
  }

  cleanup(maxAgeMs) {
    const now = new Date().toISOString();
    const maxAgeDays = maxAgeMs / (1000 * 60 * 60 * 24);
    const result = this.deleteOldStmt.run('pending', now, maxAgeDays);
    return result.changes;
  }

  deserialize(row) {
    return {
      ticketId: row.ticket_id,
      targetAgent: row.target_agent,
      originAgent: row.origin_agent,
      payload: row.payload,
      metadata: JSON.parse(row.metadata || '{}'),
      expectReply: Boolean(row.expect_reply),
      timeoutMs: row.timeout_ms,
      status: row.status,
      response: row.response ? JSON.parse(row.response) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
