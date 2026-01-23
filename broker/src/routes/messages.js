import { jsonResponse, parseJson } from '../utils/response.js';

export function createMessageRoutes(ticketStore, messageRepository = null) {
  return {
    // POST /replies
    async postReply(req, res) {
      try {
        const body = await parseJson(req);
        const { ticketId, payload, metadata = {} } = body;

        if (!ticketId) {
          return jsonResponse(res, 400, { error: 'ticketId required' });
        }

        const ticket = ticketStore.respond(ticketId, payload, metadata);
        if (!ticket) {
          return jsonResponse(res, 404, { error: 'Ticket not found' });
        }

        jsonResponse(res, 204);
      } catch (error) {
        console.error('[messages/reply] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /replies/:ticketId
    async getReply(req, res, ticketId) {
      try {
        const ticket = ticketStore.get(ticketId);
        if (!ticket) {
          return jsonResponse(res, 404, { error: 'Ticket not found' });
        }

        const serialized = ticketStore.serialize(ticket);
        jsonResponse(res, 200, serialized);
      } catch (error) {
        console.error(`[messages/reply/${ticketId}] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /replies/:ticketId/wait - Long-poll support
    async waitForReply(req, res, ticketId) {
      try {
        const ticket = ticketStore.get(ticketId);
        if (!ticket) {
          return jsonResponse(res, 404, { error: 'Ticket not found' });
        }

        // If already responded, return immediately
        if (ticket.status === 'responded') {
          return jsonResponse(res, 200, ticketStore.serialize(ticket));
        }

        // If timed out, return immediately
        if (ticket.status === 'timeout') {
          return jsonResponse(res, 408, { error: 'Request timeout' });
        }

        // Long-poll: wait for response
        const timeoutHandle = setTimeout(() => {
          ticketStore.timeout(ticketId);
          jsonResponse(res, 408, { error: 'Request timeout' });
        }, ticket.timeoutMs);

        ticketStore.addWaiter(ticketId, (response) => {
          clearTimeout(timeoutHandle);
          if (response) {
            jsonResponse(res, 200, ticketStore.serialize(ticket));
          } else {
            jsonResponse(res, 408, { error: 'Request timeout' });
          }
        });

      } catch (error) {
        console.error(`[messages/wait/${ticketId}] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /messages/history - Get message history
    async getHistory(req, res) {
      try {
        if (!messageRepository) {
          return jsonResponse(res, 501, { error: 'Message history not enabled' });
        }

        const messages = messageRepository.getAll(1000);
        jsonResponse(res, 200, { messages, count: messages.length });
      } catch (error) {
        console.error('[messages/history] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /messages/thread/:threadId - Get thread messages
    async getThread(req, res, threadId) {
      try {
        if (!messageRepository) {
          return jsonResponse(res, 501, { error: 'Message history not enabled' });
        }

        const messages = messageRepository.getByThread(threadId);
        jsonResponse(res, 200, { messages, count: messages.length });
      } catch (error) {
        console.error(`[messages/thread/${threadId}] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /messages/agent/:agentId - Get agent messages
    async getAgentMessages(req, res, agentId) {
      try {
        if (!messageRepository) {
          return jsonResponse(res, 501, { error: 'Message history not enabled' });
        }

        const messages = messageRepository.getByAgent(agentId, 100);
        jsonResponse(res, 200, { messages, count: messages.length });
      } catch (error) {
        console.error(`[messages/agent/${agentId}] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /tickets/:ticketId/acknowledge - Acknowledge ticket delivery
    async acknowledgeTicket(req, res, ticketId) {
      try {
        const ticket = ticketStore.acknowledge(ticketId);
        if (!ticket) {
          return jsonResponse(res, 404, { error: 'Ticket not found' });
        }

        jsonResponse(res, 200, { ticketId: ticket.ticketId, status: ticket.status });
      } catch (error) {
        console.error(`[tickets/${ticketId}/acknowledge] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };
}
