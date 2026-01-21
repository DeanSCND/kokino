import { randomUUID } from 'node:crypto';
import { TicketRepository } from '../db/TicketRepository.js';

// Ticket correlation system with SQLite persistence for Store & Forward pattern

export class TicketStore {
  constructor() {
    this.repo = new TicketRepository();
    // Waiters are runtime-only (not persisted - they're for long-poll HTTP connections)
    this.waiters = new Map(); // ticketId -> Set of callback functions

    // Load existing tickets from database on startup
    console.log(`[tickets] Repository initialized`);
  }

  create({ targetAgent, originAgent, payload, metadata = {}, expectReply = true, timeoutMs = 30000 }) {
    const ticketId = randomUUID();
    const now = new Date().toISOString();

    const ticket = {
      ticketId,
      targetAgent,
      originAgent,
      payload,
      metadata,
      expectReply,
      timeoutMs,
      status: 'pending',
      response: null,
      createdAt: now,
      updatedAt: now
    };

    this.repo.save(ticket);
    this.waiters.set(ticketId, new Set()); // Initialize waiter set for this ticket
    console.log(`[tickets] Created ticket ${ticketId}: ${originAgent} → ${targetAgent}`);
    return ticket;
  }

  get(ticketId) {
    return this.repo.get(ticketId);
  }

  respond(ticketId, payload, metadata = {}) {
    const ticket = this.repo.get(ticketId);
    if (!ticket) {
      return null;
    }

    const now = new Date().toISOString();
    const response = { payload, metadata, at: now };

    this.repo.updateStatus(ticketId, 'responded', response);

    // Notify long-poll waiters (runtime-only)
    const waiters = this.waiters.get(ticketId);
    if (waiters && waiters.size > 0) {
      for (const waiter of waiters) {
        waiter(response);
      }
      this.waiters.delete(ticketId);
    }

    console.log(`[tickets] Responded to ticket ${ticketId}`);
    return this.repo.get(ticketId);
  }

  timeout(ticketId) {
    const ticket = this.repo.get(ticketId);
    if (!ticket || ticket.status !== 'pending') {
      return null;
    }

    this.repo.updateStatus(ticketId, 'timeout');

    // Notify waiters of timeout (runtime-only)
    const waiters = this.waiters.get(ticketId);
    if (waiters && waiters.size > 0) {
      for (const waiter of waiters) {
        waiter(null);
      }
      this.waiters.delete(ticketId);
    }

    console.log(`[tickets] Ticket ${ticketId} timed out`);
    return this.repo.get(ticketId);
  }

  addWaiter(ticketId, waiterCallback) {
    let waiters = this.waiters.get(ticketId);
    if (!waiters) {
      waiters = new Set();
      this.waiters.set(ticketId, waiters);
    }

    waiters.add(waiterCallback);
    return true;
  }

  getPending(targetAgent) {
    return this.repo.getPending(targetAgent);
  }

  serialize(ticket) {
    return {
      ticketId: ticket.ticketId,
      agentId: ticket.targetAgent,
      originAgent: ticket.originAgent,
      status: ticket.status,
      payload: ticket.payload,
      metadata: ticket.metadata,
      response: ticket.response,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      timeoutMs: ticket.timeoutMs,
      latencyMs: ticket.response
        ? new Date(ticket.response.at).getTime() - new Date(ticket.createdAt).getTime()
        : undefined
    };
  }

  size() {
    // Note: This could be optimized with a COUNT query in the repository
    const pending = this.repo.getPending('*'); // Placeholder - need to add getAll to repo
    return pending.length;
  }

  cleanup(maxAgeMs = 60000) {
    const cleaned = this.repo.cleanup(maxAgeMs);

    if (cleaned > 0) {
      console.log(`[tickets] Cleaned up ${cleaned} old tickets`);
    }
  }
}
