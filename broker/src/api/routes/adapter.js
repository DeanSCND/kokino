/**
 * Adapter Routes - REST endpoints wrapping existing broker methods
 *
 * This is a thin pass-through layer that exposes existing broker functionality
 * via REST API. No business logic here - just parameter mapping and delegation.
 *
 * These endpoints match exactly what Canvas currently uses via broker.js
 */

import { jsonResponse } from '../../utils/response.js';

/**
 * Create adapter routes
 *
 * @param {object} deps - Dependencies
 * @param {AgentRegistry} deps.registry - Agent registry
 * @param {TicketStore} deps.ticketStore - Ticket store
 * @param {object} deps.agentRoutes - Existing agent route handlers
 * @returns {object} Route handlers
 */
export function createAdapterRoutes({ registry, ticketStore, agentRoutes }) {

  return {
    /**
     * POST /api/adapter/register
     * Wraps agentRoutes.register()
     */
    async register(req, res) {
      try {
        // Extract params from body (matches broker.js interface)
        const { agentId, type, metadata, heartbeatIntervalMs } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request for legacy handler
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'data' && req.body) {
              handler(JSON.stringify(req.body));
            }
            if (event === 'end') {
              handler();
            }
          }
        };

        // Call existing handler
        return await agentRoutes.register(mockReq, res);

      } catch (error) {
        console.error('[Adapter] Register error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/adapter/send
     * Wraps agentRoutes.send() for specific agent
     */
    async send(req, res) {
      try {
        const { agentId, payload, metadata, expectReply, timeoutMs } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request with agent ID in path
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'data' && req.body) {
              // Reformat body for legacy handler
              const legacyBody = { payload, metadata, expectReply, timeoutMs };
              handler(JSON.stringify(legacyBody));
            }
            if (event === 'end') {
              handler();
            }
          }
        };

        // Call existing handler
        return await agentRoutes.send(mockReq, res, agentId);

      } catch (error) {
        console.error('[Adapter] Send error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/adapter/start
     * Wraps agentRoutes.start()
     */
    async start(req, res) {
      try {
        const { agentId } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'end') handler();
          }
        };

        // Call existing handler
        return await agentRoutes.start(mockReq, res, agentId);

      } catch (error) {
        console.error('[Adapter] Start error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/adapter/stop
     * Wraps agentRoutes.stop()
     */
    async stop(req, res) {
      try {
        const { agentId } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'end') handler();
          }
        };

        // Call existing handler
        return await agentRoutes.stop(mockReq, res, agentId);

      } catch (error) {
        console.error('[Adapter] Stop error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/adapter/restart
     * Wraps agentRoutes.restart()
     */
    async restart(req, res) {
      try {
        const { agentId } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'end') handler();
          }
        };

        // Call existing handler
        return await agentRoutes.restart(mockReq, res, agentId);

      } catch (error) {
        console.error('[Adapter] Restart error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * DELETE /api/adapter/agent/:id
     * Wraps agentRoutes.delete()
     */
    async deleteAgent(req, res) {
      try {
        const agentId = req.params.id;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Call existing handler
        return await agentRoutes.delete(req, res, agentId);

      } catch (error) {
        console.error('[Adapter] Delete error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * GET /api/adapter/agents
     * Wraps agentRoutes.list()
     */
    async listAgents(req, res) {
      try {
        // Call existing handler
        return await agentRoutes.list(req, res);

      } catch (error) {
        console.error('[Adapter] List error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * GET /api/adapter/pending/:id
     * Wraps agentRoutes.getPendingTickets()
     */
    async getPendingTickets(req, res) {
      try {
        const agentId = req.params.id;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Call existing handler
        return await agentRoutes.getPendingTickets(req, res, agentId);

      } catch (error) {
        console.error('[Adapter] Get pending error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/adapter/kill-tmux
     * Wraps agentRoutes.killTmux()
     */
    async killTmux(req, res) {
      try {
        const { agentId } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'end') handler();
          }
        };

        // Call existing handler
        return await agentRoutes.killTmux(mockReq, res, agentId);

      } catch (error) {
        console.error('[Adapter] Kill tmux error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/adapter/heartbeat
     * Wraps agentRoutes.heartbeat()
     */
    async heartbeat(req, res) {
      try {
        const { agentId } = req.body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId is required' });
        }

        // Create mock request
        const mockReq = {
          ...req,
          on: (event, handler) => {
            if (event === 'end') handler();
          }
        };

        // Call existing handler
        return await agentRoutes.heartbeat(mockReq, res, agentId);

      } catch (error) {
        console.error('[Adapter] Heartbeat error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };
}

/**
 * Register adapter routes on router
 *
 * @param {APIRouter} router - Router instance
 * @param {object} deps - Dependencies
 */
export function registerAdapterRoutes(router, deps) {
  const handlers = createAdapterRoutes(deps);

  // Register all adapter endpoints
  router.post('/adapter/register', handlers.register);
  router.post('/adapter/send', handlers.send);
  router.post('/adapter/start', handlers.start);
  router.post('/adapter/stop', handlers.stop);
  router.post('/adapter/restart', handlers.restart);
  router.delete('/adapter/agent/:id', handlers.deleteAgent);
  router.get('/adapter/agents', handlers.listAgents);
  router.get('/adapter/pending/:id', handlers.getPendingTickets);
  router.post('/adapter/kill-tmux', handlers.killTmux);
  router.post('/adapter/heartbeat', handlers.heartbeat);

  console.log('[Adapter] Registered 10 adapter endpoints');
}