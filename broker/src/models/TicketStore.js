import { randomUUID } from 'node:crypto';
import { TicketRepository } from '../db/TicketRepository.js';

// Ticket correlation system with SQLite persistence for Store & Forward pattern

export class TicketStore {
  constructor(registry = null, agentRunner = null) {
    this.repo = new TicketRepository();
    this.registry = registry; // Optional: for checking agent existence
    this.agentRunner = agentRunner; // For headless agent execution
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

    // CRITICAL: Attempt immediate delivery for headless agents
    // This is async and non-blocking - failures are handled gracefully
    this.deliverTicket(ticket).catch(err => {
      console.error(`[tickets] Background delivery failed for ticket ${ticketId}:`, err.message);
    });

    return ticket;
  }

  /**
   * Deliver ticket to target agent based on commMode (headless vs tmux)
   *
   * HEADLESS: Direct execution via AgentRunner
   * TMUX: Store & Forward (ticket stays pending for watcher to poll)
   */
  async deliverTicket(ticket) {
    const agent = this.registry ? this.registry.get(ticket.targetAgent) : null;

    if (!agent) {
      console.log(`[tickets] Agent ${ticket.targetAgent} not registered - ticket ${ticket.ticketId} stays pending (Store & Forward)`);
      return; // Ticket stays pending for when agent comes online
    }

    const commMode = agent.commMode || agent.metadata?.commMode || 'tmux';

    if (commMode === 'headless' && this.agentRunner) {
      // HEADLESS MODE: Execute immediately via AgentRunner
      console.log(`[tickets] Delivering ticket ${ticket.ticketId} to headless agent ${ticket.targetAgent} via AgentRunner`);

      try {
        const result = await this.agentRunner.execute(
          ticket.targetAgent,
          ticket.payload,
          {
            metadata: {
              ...ticket.metadata,
              ticketId: ticket.ticketId,
              originAgent: ticket.originAgent
            },
            timeoutMs: ticket.timeoutMs
          }
        );

        // Auto-respond to ticket with execution result
        this.respond(ticket.ticketId, result.content, {
          conversationId: result.conversationId,
          durationMs: result.durationMs,
          success: result.success
        });

        console.log(`[tickets] Headless delivery complete for ticket ${ticket.ticketId} (${result.durationMs}ms)`);

      } catch (error) {
        console.error(`[tickets] Headless execution failed for ticket ${ticket.ticketId}:`, error.message);

        // If agent is busy (lock conflict), retry after delay instead of failing
        if (error.message.includes('already executing')) {
          console.log(`[tickets] Agent ${ticket.targetAgent} busy - will retry ticket ${ticket.ticketId} in 2s`);

          // Keep ticket as pending and retry after delay
          setTimeout(() => {
            const freshTicket = this.repo.get(ticket.ticketId);
            if (freshTicket && freshTicket.status === 'pending') {
              console.log(`[tickets] Retrying delivery for ticket ${ticket.ticketId}`);
              this.deliverTicket(freshTicket);
            }
          }, 2000); // 2 second retry delay

          return; // Exit without marking as error
        }

        // For other errors (timeout, CLI failure, etc.), mark as error
        this.repo.updateStatus(ticket.ticketId, 'error', {
          error: error.message,
          stack: error.stack
        });

        // Notify waiters of error
        const waiters = this.waiters.get(ticket.ticketId);
        if (waiters && waiters.size > 0) {
          for (const waiter of waiters) {
            waiter(null);
          }
          this.waiters.delete(ticket.ticketId);
        }
      }

    } else {
      // TMUX MODE: Store & Forward (ticket stays pending for watcher to poll)
      console.log(`[tickets] Ticket ${ticket.ticketId} for tmux agent ${ticket.targetAgent} stays pending for watcher poll`);
      // No action needed - watcher will poll and deliver
    }
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

    // Dual-mode async reply delivery based on agent commMode
    const originAgent = this.registry ? this.registry.get(ticket.originAgent) : null;

    if (originAgent) {
      const commMode = originAgent.commMode || 'tmux';

      if (commMode === 'headless' && this.agentRunner) {
        // HEADLESS MODE: Direct execution via AgentRunner
        // Deliver reply immediately via CLI subprocess instead of polling
        console.log(`[tickets] Responded to ticket ${ticketId}, delivering to headless agent ${ticket.originAgent} via AgentRunner`);

        // Execute async (don't block respond() return)
        this.agentRunner.execute(ticket.originAgent, payload, {
          metadata: {
            ...metadata,
            replyTo: ticketId,
            isReply: true
          }
        }).catch(err => {
          console.error(`[tickets] Failed to deliver reply to headless agent ${ticket.originAgent}:`, err.message);
        });

      } else {
        // TMUX MODE: Store & Forward with reverse ticket (polling-based)
        // Create reverse ticket for tmux watcher to poll and inject
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

        console.log(`[tickets] Responded to ticket ${ticketId}, created reverse ticket ${reverseTicket.ticketId} for tmux agent ${ticket.originAgent}`);
      }
    } else {
      console.log(`[tickets] Responded to ticket ${ticketId}, but origin agent '${ticket.originAgent}' not registered - skipping delivery`);
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
