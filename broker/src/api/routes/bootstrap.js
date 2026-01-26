/**
 * Bootstrap API Routes
 * Phase 3: Bootstrap System
 *
 * Endpoints for agent bootstrap control and monitoring
 */

import { jsonResponse } from '../../utils/response.js';
import { BootstrapManager } from '../../bootstrap/BootstrapManager.js';
import { CompactionMonitor } from '../../bootstrap/CompactionMonitor.js';
import { DEFAULT_BOOTSTRAP_CONFIG } from '../../bootstrap/BootstrapModes.js';
import db from '../../db/schema.js';

/**
 * Register bootstrap routes on the API router
 * @param {APIRouter} router - API router instance
 * @param {object} services - Service dependencies
 */
export function registerBootstrapRoutes(router, services) {
  const { registry } = services;
  const bootstrapManager = new BootstrapManager(registry);
  const compactionMonitor = new CompactionMonitor();

  /**
   * POST /api/agents/:agentId/bootstrap
   * Manually trigger bootstrap for an agent
   */
  router.post('/agents/:agentId/bootstrap', async (req, res) => {
    try {
      const { agentId } = req.params;
      const { files, additionalContext, variables } = req.body;

      const result = await bootstrapManager.bootstrapAgent(agentId, {
        ...DEFAULT_BOOTSTRAP_CONFIG,
        mode: 'manual',
        files: files || [],
        additionalContext,
        variables
      });

      jsonResponse(res, 200, result);
    } catch (error) {
      console.error('[Bootstrap] Error triggering bootstrap:', error);
      jsonResponse(res, 500, {
        error: 'Bootstrap failed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/agents/:agentId/bootstrap/status
   * Get bootstrap status and history for an agent
   */
  router.get('/agents/:agentId/bootstrap/status', async (req, res) => {
    try {
      const { agentId } = req.params;

      const status = await bootstrapManager.getBootstrapStatus(agentId);

      jsonResponse(res, 200, status);
    } catch (error) {
      console.error('[Bootstrap] Error getting status:', error);
      jsonResponse(res, 500, {
        error: 'Failed to get bootstrap status',
        message: error.message
      });
    }
  });

  /**
   * POST /api/agents/:agentId/bootstrap/reload
   * Force reload bootstrap (restart agent with fresh context)
   */
  router.post('/agents/:agentId/bootstrap/reload', async (req, res) => {
    try {
      const { agentId } = req.params;

      // Get agent's config to determine bootstrap mode
      const agent = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);
      if (!agent) {
        return jsonResponse(res, 404, { error: 'Agent not found' });
      }

      // Get agent config if available
      let bootstrapMode = 'auto';
      let autoLoadPaths = DEFAULT_BOOTSTRAP_CONFIG.autoLoadPaths;

      if (agent.config_id) {
        const config = db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(agent.config_id);
        if (config) {
          bootstrapMode = config.bootstrap_mode || 'auto';
        }
      }

      // Re-run bootstrap with current mode
      const result = await bootstrapManager.bootstrapAgent(agentId, {
        ...DEFAULT_BOOTSTRAP_CONFIG,
        mode: bootstrapMode,
        autoLoadPaths
      });

      jsonResponse(res, 200, result);
    } catch (error) {
      console.error('[Bootstrap] Error reloading bootstrap:', error);
      jsonResponse(res, 500, {
        error: 'Bootstrap reload failed',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/agents/:agentId/bootstrap/mode
   * Change bootstrap mode for an agent
   */
  router.put('/agents/:agentId/bootstrap/mode', async (req, res) => {
    try {
      const { agentId } = req.params;
      const { mode, config } = req.body;

      // Validate mode
      const validModes = ['none', 'auto', 'manual', 'custom'];
      if (!validModes.includes(mode)) {
        return jsonResponse(res, 400, {
          error: 'Invalid bootstrap mode',
          validModes
        });
      }

      // Update agent config if it has one
      const agent = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agentId);
      if (!agent) {
        return jsonResponse(res, 404, { error: 'Agent not found' });
      }

      if (agent.config_id) {
        const stmt = db.prepare(`
          UPDATE agent_configs
          SET bootstrap_mode = ?, updated_at = datetime('now')
          WHERE id = ?
        `);
        stmt.run(mode, agent.config_id);
      }

      jsonResponse(res, 200, {
        success: true,
        agentId,
        mode,
        message: 'Bootstrap mode updated'
      });
    } catch (error) {
      console.error('[Bootstrap] Error updating mode:', error);
      jsonResponse(res, 500, {
        error: 'Failed to update bootstrap mode',
        message: error.message
      });
    }
  });

  /**
   * GET /api/agents/:agentId/compaction-status
   * Get compaction status for an agent
   */
  router.get('/agents/:agentId/compaction-status', async (req, res) => {
    try {
      const { agentId } = req.params;

      const status = await compactionMonitor.getStatus(agentId);

      jsonResponse(res, 200, status);
    } catch (error) {
      console.error('[Bootstrap] Error getting compaction status:', error);
      jsonResponse(res, 500, {
        error: 'Failed to get compaction status',
        message: error.message
      });
    }
  });

  /**
   * POST /api/agents/:agentId/compaction/track
   * Track a conversation turn (for compaction monitoring)
   */
  router.post('/agents/:agentId/compaction/track', async (req, res) => {
    try {
      const { agentId } = req.params;
      const { tokens, error, responseTime, confusionCount } = req.body;

      const status = await compactionMonitor.trackTurn(agentId, {
        tokens,
        error,
        responseTime,
        confusionCount
      });

      jsonResponse(res, 200, status);
    } catch (error) {
      console.error('[Bootstrap] Error tracking turn:', error);
      jsonResponse(res, 500, {
        error: 'Failed to track turn',
        message: error.message
      });
    }
  });

  /**
   * POST /api/agents/:agentId/compaction/reset
   * Reset compaction metrics (after agent restart)
   */
  router.post('/agents/:agentId/compaction/reset', async (req, res) => {
    try {
      const { agentId } = req.params;

      await compactionMonitor.resetMetrics(agentId);

      jsonResponse(res, 200, {
        success: true,
        agentId,
        message: 'Compaction metrics reset'
      });
    } catch (error) {
      console.error('[Bootstrap] Error resetting metrics:', error);
      jsonResponse(res, 500, {
        error: 'Failed to reset metrics',
        message: error.message
      });
    }
  });

  /**
   * GET /api/agents/:agentId/compaction/history
   * Get compaction metrics history
   */
  router.get('/agents/:agentId/compaction/history', async (req, res) => {
    try {
      const { agentId } = req.params;
      const limit = parseInt(req.query.limit) || 20;

      const history = await compactionMonitor.getHistory(agentId, limit);

      jsonResponse(res, 200, {
        agentId,
        history
      });
    } catch (error) {
      console.error('[Bootstrap] Error getting history:', error);
      jsonResponse(res, 500, {
        error: 'Failed to get compaction history',
        message: error.message
      });
    }
  });
}

export default registerBootstrapRoutes;
