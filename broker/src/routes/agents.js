import { jsonResponse, parseJson } from '../utils/response.js';

export function createAgentRoutes(registry, ticketStore, messageRepository = null) {
  return {
    // POST /agents/register
    async register(req, res) {
      try {
        const body = await parseJson(req);
        const { agentId, type, metadata, heartbeatIntervalMs } = body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId required' });
        }

        const record = registry.register(agentId, { type, metadata, heartbeatIntervalMs });
        jsonResponse(res, 200, record);
      } catch (error) {
        console.error('[agents/register] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents?type=claude-code&status=online
    async list(req, res) {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filters = {
          type: url.searchParams.get('type'),
          status: url.searchParams.get('status')
        };

        // Remove null values
        Object.keys(filters).forEach(key => {
          if (filters[key] === null) delete filters[key];
        });

        const agents = registry.list(filters);
        jsonResponse(res, 200, agents);
      } catch (error) {
        console.error('[agents/list] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/send - CRITICAL: Store & Forward pattern
    async send(req, res, agentId) {
      try {
        const body = await parseJson(req);
        const {
          ticketId,
          payload,
          metadata = {},
          expectReply = true,
          timeoutMs = 30000
        } = body;

        // CRITICAL: NO validation if agent exists!
        // Store & Forward: Accept messages for offline agents

        const ticket = ticketStore.create({
          targetAgent: agentId,
          originAgent: metadata.origin || 'ui',
          payload,
          metadata,
          expectReply,
          timeoutMs
        });

        // Log message to history (Phase 8)
        if (messageRepository) {
          messageRepository.save({
            messageId: ticket.ticketId,
            from: metadata.origin || 'ui',
            to: agentId,
            threadId: metadata.threadId || null,
            payload,
            metadata,
            status: 'sent'
          });
        }

        // Return immediately (10-20ms target)
        jsonResponse(res, 202, {
          ticketId: ticket.ticketId,
          status: 'pending',
          waitEndpoint: `/replies/${ticket.ticketId}/stream`
        });

        // TODO: Background worker will handle delivery

      } catch (error) {
        console.error(`[agents/${agentId}/send] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/:agentId/tickets/pending
    async getPendingTickets(req, res, agentId) {
      try {
        const pending = ticketStore.getPending(agentId);
        const serialized = pending.map(t => ticketStore.serialize(t));
        jsonResponse(res, 200, serialized);
      } catch (error) {
        console.error(`[agents/${agentId}/tickets] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/heartbeat
    async heartbeat(req, res, agentId) {
      try {
        const record = registry.touch(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 200, { status: 'ok', lastHeartbeat: record.lastHeartbeat });
      } catch (error) {
        console.error(`[agents/${agentId}/heartbeat] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // DELETE /agents/:agentId
    async delete(req, res, agentId) {
      try {
        const existed = registry.delete(agentId);
        if (!existed) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 204);
      } catch (error) {
        console.error(`[agents/${agentId}] Delete error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // Lifecycle endpoints

    // POST /agents/:agentId/start
    async start(req, res, agentId) {
      try {
        const record = registry.start(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 200, { status: 'started', agent: record });
      } catch (error) {
        console.error(`[agents/${agentId}/start] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/stop
    async stop(req, res, agentId) {
      try {
        const record = registry.stop(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 200, { status: 'stopped', agent: record });
      } catch (error) {
        console.error(`[agents/${agentId}/stop] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/restart
    async restart(req, res, agentId) {
      try {
        const record = registry.restart(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 200, { status: 'restarting', agent: record });
      } catch (error) {
        console.error(`[agents/${agentId}/restart] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };
}
