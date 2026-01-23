import { randomUUID } from 'node:crypto';
import { TicketRepository } from '../db/TicketRepository.js';

// Ticket correlation system with SQLite persistence for Store & Forward pattern

export class TicketStore {
  constructor(registry = null) {
    this.repo = new TicketRepository();
    this.registry = registry; // Optional: for checking agent existence
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

    // Create reverse ticket for origin agent (async reply delivery)
    // This enables true Store & Forward: replies are delivered via watcher, not polling
    // Only create reverse ticket if origin agent is registered (to avoid FK constraint errors)
    const originAgentExists = this.registry ? this.registry.get(ticket.originAgent) : true;

    if (originAgentExists) {
      const reverseTicket = this.create({
        targetAgent: ticket.originAgent,
        originAgent: ticket.targetAgent,
        payload: payload,
        metadata: {
          ...metadata,
          replyTo: ticketId,
          isReply: true
        },
        expectReply: false,
        timeoutMs: 30000
      });

      console.log(`[tickets] Responded to ticket ${ticketId}, created reverse ticket ${reverseTicket.ticketId} for ${ticket.originAgent}`);
    } else {
      console.log(`[tickets] Responded to ticket ${ticketId}, but origin agent '${ticket.originAgent}' not registered - skipping reverse ticket`);
    }

    // Notify long-poll waiters (runtime-only)
    const waiters = this.waiters.get(ticketId);
    if (waiters && waiters.size > 0) {
      for (const waiter of waiters) {
        waiter(response);
      }
      this.waiters.delete(ticketId);
    }

    return this.repo.get(ticketId);
  }

  acknowledge(ticketId) {
    const ticket = this.repo.get(ticketId);
    if (!ticket) {
      return null;
    }

    // Only acknowledge pending tickets (don't re-acknowledge delivered/responded tickets)
    if (ticket.status !== 'pending') {
      return ticket;
    }

    this.repo.updateStatus(ticketId, 'delivered');
    console.log(`[tickets] Acknowledged delivery of ticket ${ticketId}`);
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
