/**
 * Monitoring Routes - Agent monitoring and metrics endpoints
 *
 * Provides access to agent metrics, events, errors, and dashboard data
 * for Phase 6 monitoring system.
 */

import { jsonResponse } from '../../utils/response.js';
import { MonitoringService } from '../../services/MonitoringService.js';

/**
 * Create monitoring route handlers
 *
 * @param {MonitoringService} monitoringService - Monitoring service instance
 * @returns {object} Route handlers
 */
export function createMonitoringRoutes(monitoringService) {
  return {
    /**
     * GET /api/monitoring/dashboard
     * Returns comprehensive monitoring dashboard with all agents
     *
     * Response includes:
     * - List of all agents with latest metrics
     * - Recent events across all agents
     * - Unresolved errors grouped by agent
     * - System-wide metrics (CPU, memory, uptime)
     */
    async getDashboard(req, res) {
      try {
        const data = await monitoringService.getDashboardData();
        jsonResponse(res, 200, data);
      } catch (error) {
        console.error('[Monitoring] Dashboard error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch monitoring dashboard' });
      }
    },

    /**
     * GET /api/monitoring/agents/:agentId
     * Returns detailed monitoring data for specific agent
     *
     * Path params:
     * - agentId: Agent identifier
     *
     * Query params:
     * - hours: Hours of history to retrieve (default: 1, max: 168)
     *
     * Response includes:
     * - Agent info
     * - Recent metrics (CPU, memory, status)
     * - Recent events
     * - Error logs
     * - Metrics summary (avg/max CPU, avg/max memory)
     */
    async getAgentDashboard(req, res) {
      try {
        const { agentId } = req.params;
        const hours = Math.max(1, Math.min(168, parseInt(req.query.hours) || 1));

        const data = await monitoringService.getAgentDashboard(agentId, hours);
        jsonResponse(res, 200, data);
      } catch (error) {
        if (error.message.includes('not found')) {
          jsonResponse(res, 404, { error: error.message });
        } else {
          console.error('[Monitoring] Agent dashboard error:', error);
          jsonResponse(res, 500, { error: 'Failed to fetch agent dashboard' });
        }
      }
    },

    /**
     * GET /api/monitoring/metrics
     * Returns recent metrics for all agents or specific agent
     *
     * Query params:
     * - agentId: Filter by specific agent (optional)
     * - limit: Maximum records to return (default: 100, max: 1000)
     * - status: Filter by status (online|offline|error) (optional)
     */
    async getMetrics(req, res) {
      try {
        const { agentId, status } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

        let sql = 'SELECT * FROM agent_metrics WHERE 1=1';
        const params = [];

        if (agentId) {
          sql += ' AND agent_id = ?';
          params.push(agentId);
        }

        if (status) {
          sql += ' AND status = ?';
          params.push(status);
        }

        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const db = await import('../../db/schema.js');
        const metrics = db.default.prepare(sql).all(...params);

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          count: metrics.length,
          filters: { agentId, status, limit },
          metrics
        });
      } catch (error) {
        console.error('[Monitoring] Metrics error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch metrics' });
      }
    },

    /**
     * GET /api/monitoring/events
     * Returns recent events across all agents or specific agent
     *
     * Query params:
     * - agentId: Filter by specific agent (optional)
     * - eventType: Filter by event type (started|stopped|error|warning|info) (optional)
     * - limit: Maximum records to return (default: 50, max: 500)
     */
    async getEvents(req, res) {
      try {
        const { agentId, eventType } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);

        let sql = 'SELECT * FROM agent_events WHERE 1=1';
        const params = [];

        if (agentId) {
          sql += ' AND agent_id = ?';
          params.push(agentId);
        }

        if (eventType) {
          sql += ' AND event_type = ?';
          params.push(eventType);
        }

        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const db = await import('../../db/schema.js');
        const events = db.default.prepare(sql).all(...params);

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          count: events.length,
          filters: { agentId, eventType, limit },
          events
        });
      } catch (error) {
        console.error('[Monitoring] Events error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch events' });
      }
    },

    /**
     * GET /api/monitoring/errors
     * Returns error logs across all agents or specific agent
     *
     * Query params:
     * - agentId: Filter by specific agent (optional)
     * - resolved: Filter by resolution status (true|false) (optional)
     * - limit: Maximum records to return (default: 50, max: 500)
     */
    async getErrors(req, res) {
      try {
        const { agentId } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);

        let sql = 'SELECT * FROM error_logs WHERE 1=1';
        const params = [];

        if (agentId) {
          sql += ' AND agent_id = ?';
          params.push(agentId);
        }

        if (req.query.resolved !== undefined) {
          const resolved = req.query.resolved === 'true' ? 1 : 0;
          sql += ' AND resolved = ?';
          params.push(resolved);
        }

        sql += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);

        const db = await import('../../db/schema.js');
        const errors = db.default.prepare(sql).all(...params);

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          count: errors.length,
          filters: { agentId, resolved: req.query.resolved, limit },
          errors
        });
      } catch (error) {
        console.error('[Monitoring] Errors fetch error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch error logs' });
      }
    },

    /**
     * PATCH /api/monitoring/errors/:errorId/resolve
     * Mark an error as resolved
     *
     * Path params:
     * - errorId: Error log ID
     *
     * Body:
     * - resolvedBy: Who resolved the error (required)
     */
    async resolveError(req, res) {
      try {
        const { errorId } = req.params;
        const { resolvedBy } = req.body;

        if (!resolvedBy) {
          return jsonResponse(res, 400, { error: 'resolvedBy is required' });
        }

        monitoringService.resolveError(parseInt(errorId), resolvedBy);

        jsonResponse(res, 200, {
          message: 'Error resolved successfully',
          errorId: parseInt(errorId),
          resolvedBy
        });
      } catch (error) {
        console.error('[Monitoring] Resolve error failed:', error);
        jsonResponse(res, 500, { error: 'Failed to resolve error' });
      }
    },

    /**
     * POST /api/monitoring/cleanup
     * Manually trigger monitoring data cleanup
     *
     * Body:
     * - daysToKeep: Days to retain (default: 7)
     */
    async cleanup(req, res) {
      try {
        // Validate and clamp daysToKeep to positive integer, max 365
        const daysToKeep = Math.max(1, Math.min(365, parseInt(req.body?.daysToKeep) || 7));

        const result = await monitoringService.cleanup(daysToKeep);

        jsonResponse(res, 200, {
          message: 'Monitoring cleanup completed',
          ...result
        });
      } catch (error) {
        console.error('[Monitoring] Cleanup error:', error);
        jsonResponse(res, 500, { error: 'Failed to cleanup monitoring data' });
      }
    },

    /**
     * GET /api/monitoring/status
     * Returns monitoring service status
     *
     * Response includes:
     * - Service running status
     * - Configuration (intervals, retention)
     * - Alert thresholds
     */
    async getStatus(req, res) {
      try {
        const status = {
          running: monitoringService.isRunning,
          config: {
            collectionIntervalMs: monitoringService.COLLECTION_INTERVAL_MS,
            alertCheckIntervalMs: monitoringService.ALERT_CHECK_INTERVAL_MS,
            cleanupIntervalMs: monitoringService.CLEANUP_INTERVAL_MS,
            dataRetentionDays: monitoringService.DATA_RETENTION_DAYS
          },
          thresholds: monitoringService.THRESHOLDS
        };

        jsonResponse(res, 200, status);
      } catch (error) {
        console.error('[Monitoring] Status error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch monitoring status' });
      }
    },

    /**
     * GET /api/monitoring/timeline
     * Returns unified timeline of all agent activity (messages + conversations)
     *
     * Query params:
     * - from: ISO timestamp (default: 1 hour ago)
     * - to: ISO timestamp (default: now)
     * - agents: Comma-separated agent IDs to filter by (optional)
     * - types: Comma-separated types: 'message' | 'conversation' (optional)
     * - threadId: Filter by specific thread (optional)
     * - limit: Maximum records to return (default: 1000, max: 5000)
     * - offset: Pagination offset (default: 0)
     *
     * Response includes:
     * - entries: Array of timeline entries (messages + conversation turns)
     * - total: Total count matching filters
     * - hasMore: Whether more results exist
     * - oldestTimestamp: Timestamp of oldest entry
     * - newestTimestamp: Timestamp of newest entry
     */
    async getTimeline(req, res) {
      try {
        // Parse query parameters
        const now = new Date().toISOString();
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

        const from = req.query.from || oneHourAgo;
        const to = req.query.to || now;
        const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);
        const offset = parseInt(req.query.offset) || 0;
        const threadId = req.query.threadId;

        // Parse array filters
        const agents = req.query.agents ? req.query.agents.split(',') : null;
        const types = req.query.types ? req.query.types.split(',') : null;

        // Build SQL query
        let sql = `
          SELECT * FROM (
            -- Cross-agent messages
            SELECT
              'message' as type,
              message_id as id,
              timestamp,
              from_agent as agent_id,
              to_agent as target_agent_id,
              thread_id,
              payload as content,
              metadata
            FROM messages

            UNION ALL

            -- Conversation turns
            SELECT
              'conversation' as type,
              CAST(turn_id AS TEXT) as id,
              created_at as timestamp,
              c.agent_id,
              NULL as target_agent_id,
              c.conversation_id as thread_id,
              t.content,
              t.metadata
            FROM turns t
            JOIN conversations c ON t.conversation_id = c.conversation_id
          ) timeline
          WHERE timestamp >= ? AND timestamp <= ?
        `;

        const params = [from, to];

        // Apply agent filter
        if (agents && agents.length > 0) {
          const placeholders = agents.map(() => '?').join(',');
          sql += ` AND (agent_id IN (${placeholders}) OR target_agent_id IN (${placeholders}))`;
          params.push(...agents, ...agents);
        }

        // Apply type filter
        if (types && types.length > 0) {
          const placeholders = types.map(() => '?').join(',');
          sql += ` AND type IN (${placeholders})`;
          params.push(...types);
        }

        // Apply thread filter
        if (threadId) {
          sql += ` AND thread_id = ?`;
          params.push(threadId);
        }

        // Get total count for pagination
        const countSql = `SELECT COUNT(*) as total FROM (${sql}) counted`;
        const db = await import('../../db/schema.js');
        const countResult = db.default.prepare(countSql).get(...params);
        const total = countResult.total;

        // Add ordering and pagination
        sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        // Execute query
        const entries = db.default.prepare(sql).all(...params);

        // Calculate metadata
        const hasMore = (offset + entries.length) < total;
        const oldestTimestamp = entries.length > 0 ? entries[entries.length - 1].timestamp : null;
        const newestTimestamp = entries.length > 0 ? entries[0].timestamp : null;

        jsonResponse(res, 200, {
          entries,
          total,
          hasMore,
          oldestTimestamp,
          newestTimestamp,
          pagination: {
            limit,
            offset,
            returned: entries.length
          },
          filters: {
            from,
            to,
            agents,
            types,
            threadId
          }
        });
      } catch (error) {
        console.error('[Monitoring] Timeline error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch timeline' });
      }
    }
  };
}

/**
 * Register monitoring routes on router
 *
 * @param {APIRouter} router - Router instance
 * @param {MonitoringService} monitoringService - Monitoring service instance
 */
export function registerMonitoringRoutes(router, monitoringService) {
  const handlers = createMonitoringRoutes(monitoringService);

  // Register all monitoring endpoints
  router.get('/monitoring/dashboard', handlers.getDashboard);
  router.get('/monitoring/agents/:agentId', handlers.getAgentDashboard);
  router.get('/monitoring/metrics', handlers.getMetrics);
  router.get('/monitoring/events', handlers.getEvents);
  router.get('/monitoring/errors', handlers.getErrors);
  router.patch('/monitoring/errors/:errorId/resolve', handlers.resolveError);
  router.post('/monitoring/cleanup', handlers.cleanup);
  router.get('/monitoring/status', handlers.getStatus);
  router.get('/monitoring/timeline', handlers.getTimeline);

  console.log('[Monitoring] Registered 9 monitoring endpoints');
}
