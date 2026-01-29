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

        // Validate and clamp limit: must be positive, default 1000, max 5000
        const rawLimit = parseInt(req.query.limit);
        const limit = Math.min(Math.max(isNaN(rawLimit) ? 1000 : rawLimit, 1), 5000);

        // Validate and clamp offset: must be non-negative, default 0
        const rawOffset = parseInt(req.query.offset);
        const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

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
              m.message_id as id,
              m.timestamp,
              m.from_agent as agent_id,
              m.to_agent as target_agent_id,
              m.thread_id,
              m.payload as content,
              m.metadata
            FROM messages m

            UNION ALL

            -- Conversation turns
            SELECT
              'conversation' as type,
              CAST(t.turn_id AS TEXT) as id,
              t.created_at as timestamp,
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
    },

    /**
     * GET /api/monitoring/interactions
     * Returns agent interaction data for message flow graph visualization
     *
     * Query params:
     * - timeRange: 'hour' | 'day' | 'week' (default: 'hour')
     * - teamId: Filter by team ID (optional)
     *
     * Response includes:
     * - agents: Array of agent nodes with status and message stats
     * - edges: Array of interaction edges between agents
     * - summary: Overall statistics
     */
    async getInteractions(req, res) {
      try {
        // Parse time range
        const timeRange = req.query.timeRange || 'hour';
        const teamId = req.query.teamId;

        // Calculate time cutoff
        const timeRanges = {
          'hour': 3600000,      // 1 hour
          'day': 86400000,      // 24 hours
          'week': 604800000     // 7 days
        };
        const cutoffMs = timeRanges[timeRange] || timeRanges['hour'];
        const cutoff = new Date(Date.now() - cutoffMs).toISOString();

        const db = await import('../../db/schema.js');

        // First, get all agents that participated in messages during the time range
        // This ensures we include agents even if their heartbeat is stale
        const participantsSql = `
          SELECT DISTINCT agent_id FROM (
            SELECT from_agent as agent_id FROM messages WHERE timestamp > ?
            UNION
            SELECT to_agent as agent_id FROM messages WHERE timestamp > ?
          )
        `;
        const participants = db.default.prepare(participantsSql).all(cutoff, cutoff);
        const participantIds = new Set(participants.map(p => p.agent_id));

        // Get agent details from agents table (for status, heartbeat, metadata)
        const agentDetailsMap = new Map();
        if (participantIds.size > 0) {
          const placeholders = Array.from(participantIds).map(() => '?').join(',');
          const agentsSql = `
            SELECT agent_id, status, last_heartbeat, metadata
            FROM agents
            WHERE agent_id IN (${placeholders})
          `;
          const agentRows = db.default.prepare(agentsSql).all(...Array.from(participantIds));
          agentRows.forEach(agent => {
            agentDetailsMap.set(agent.agent_id, agent);
          });
        }

        // Build agent nodes with message statistics
        const agentStatsMap = new Map();

        participantIds.forEach(agentId => {
          // Get sent messages
          const sentSql = `
            SELECT COUNT(*) as count
            FROM messages m
            WHERE m.from_agent = ? AND m.timestamp > ?
          `;
          const sent = db.default.prepare(sentSql).get(agentId, cutoff);

          // Get received messages
          const receivedSql = `
            SELECT COUNT(*) as count
            FROM messages m
            WHERE m.to_agent = ? AND m.timestamp > ?
          `;
          const received = db.default.prepare(receivedSql).get(agentId, cutoff);

          // Get pending tickets
          const pendingSql = `
            SELECT COUNT(*) as count
            FROM tickets t
            WHERE t.target_agent = ? AND t.status = 'pending'
          `;
          const pending = db.default.prepare(pendingSql).get(agentId);

          // Calculate average response time (for messages with latency)
          const avgResponseSql = `
            SELECT AVG(m.latency_ms) as avg_latency
            FROM messages m
            WHERE m.to_agent = ? AND m.timestamp > ? AND m.latency_ms IS NOT NULL
          `;
          const avgResponse = db.default.prepare(avgResponseSql).get(agentId, cutoff);

          // Get agent details if available
          const agentDetails = agentDetailsMap.get(agentId);

          agentStatsMap.set(agentId, {
            agentId: agentId,
            name: agentId,
            status: agentDetails?.status || 'unknown',
            lastSeen: agentDetails?.last_heartbeat || null,
            messageStats: {
              sent: sent.count,
              received: received.count,
              pending: pending.count,
              avgResponseTime: Math.round(avgResponse.avg_latency || 0)
            }
          });
        });

        // Get interaction edges (agent-to-agent message flows)
        const edgesSql = `
          SELECT
            m.from_agent,
            m.to_agent,
            COUNT(*) as message_count,
            GROUP_CONCAT(DISTINCT m.thread_id) as threads,
            MAX(m.timestamp) as last_activity
          FROM messages m
          WHERE m.timestamp > ?
          GROUP BY m.from_agent, m.to_agent
          HAVING message_count > 0
        `;

        const edgeRows = db.default.prepare(edgesSql).all(cutoff);

        const edges = edgeRows.map(row => ({
          from: row.from_agent,
          to: row.to_agent,
          messageCount: row.message_count,
          threads: row.threads ? row.threads.split(',').filter(Boolean) : [],
          lastActivity: row.last_activity,
          isActive: new Date(row.last_activity) > new Date(Date.now() - 300000) // Active in last 5 min
        }));

        // Calculate summary statistics
        const totalMessages = edges.reduce((sum, edge) => sum + edge.messageCount, 0);
        const activeThreads = new Set();
        edges.forEach(edge => edge.threads.forEach(t => activeThreads.add(t)));

        // Calculate messages per minute
        const timeRangeMinutes = cutoffMs / 60000;
        const messagesPerMinute = totalMessages > 0 ? (totalMessages / timeRangeMinutes).toFixed(2) : 0;

        jsonResponse(res, 200, {
          agents: Array.from(agentStatsMap.values()),
          edges,
          summary: {
            totalAgents: agentStatsMap.size,
            totalMessages,
            activeThreads: activeThreads.size,
            messagesPerMinute: parseFloat(messagesPerMinute)
          }
        });
      } catch (error) {
        console.error('[Monitoring] Interactions error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch interactions' });
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
  router.get('/monitoring/interactions', handlers.getInteractions);

  console.log('[Monitoring] Registered 10 monitoring endpoints');
}
