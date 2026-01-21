import { randomUUID } from 'node:crypto';

// In-memory ticket correlation system for Store & Forward pattern

export class TicketStore {
  constructor() {
    this.tickets = new Map();
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
      updatedAt: now,
      waiters: new Set() // For long-poll support
    };

    this.tickets.set(ticketId, ticket);
    console.log(`[tickets] Created ticket ${ticketId}: ${originAgent} → ${targetAgent}`);
    return ticket;
  }

  get(ticketId) {
    return this.tickets.get(ticketId);
  }

  respond(ticketId, payload, metadata = {}) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return null;
    }

    const now = new Date().toISOString();
    ticket.status = 'responded';
    ticket.response = { payload, metadata, at: now };
    ticket.updatedAt = now;

    // Notify long-poll waiters
    if (ticket.waiters && ticket.waiters.size > 0) {
      for (const waiter of ticket.waiters) {
        waiter(ticket.response);
      }
      ticket.waiters.clear();
    }

    console.log(`[tickets] Responded to ticket ${ticketId}`);
    return ticket;
  }

  timeout(ticketId) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.status !== 'pending') {
      return null;
    }

    ticket.status = 'timeout';
    ticket.updatedAt = new Date().toISOString();

    // Notify waiters of timeout
    if (ticket.waiters && ticket.waiters.size > 0) {
      for (const waiter of ticket.waiters) {
        waiter(null);
      }
      ticket.waiters.clear();
    }

    console.log(`[tickets] Ticket ${ticketId} timed out`);
    return ticket;
  }

  addWaiter(ticketId, waiterCallback) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return false;
    }

    if (!ticket.waiters) {
      ticket.waiters = new Set();
    }

    ticket.waiters.add(waiterCallback);
    return true;
  }

  getPending(targetAgent) {
    return Array.from(this.tickets.values())
      .filter(t => t.targetAgent === targetAgent && t.status === 'pending');
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
    return this.tickets.size;
  }

  cleanup(maxAgeMs = 60000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [ticketId, ticket] of this.tickets.entries()) {
      const age = now - new Date(ticket.createdAt).getTime();
      if (ticket.status !== 'pending' && age > maxAgeMs) {
        this.tickets.delete(ticketId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[tickets] Cleaned up ${cleaned} old tickets`);
    }
  }
}
