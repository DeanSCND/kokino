/**
 * Metrics Routes - Performance and telemetry endpoints
 *
 * Provides visibility into system performance, SLO compliance,
 * and per-endpoint metrics for monitoring and debugging.
 */

import { jsonResponse } from '../../utils/response.js';
import { getMetricsCollector } from '../../telemetry/MetricsCollector.js';

/**
 * Create metrics route handlers
 *
 * @returns {object} Route handlers
 */
export function createMetricsRoutes() {
  const metricsCollector = getMetricsCollector();

  return {
    /**
     * GET /api/metrics/dashboard
     * Returns comprehensive metrics dashboard data
     *
     * Response includes:
     * - SLO compliance (availability, latency)
     * - Per-endpoint performance metrics
     * - Recent errors
     * - Request rate over time
     */
    async getDashboard(req, res) {
      try {
        const metrics = metricsCollector.getDashboardMetrics();
        jsonResponse(res, 200, metrics);
      } catch (error) {
        console.error('[Metrics] Dashboard error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch metrics' });
      }
    },

    /**
     * GET /api/metrics/performance
     * Returns performance metrics for last N hours
     *
     * Query params:
     * - hours: Time window (default: 1)
     */
    async getPerformance(req, res) {
      try {
        const hours = parseInt(req.query.hours) || 1;

        const performance = {
          timestamp: new Date().toISOString(),
          window: `${hours} hour${hours > 1 ? 's' : ''}`,
          availability: metricsCollector.getAvailability(hours),
          latency: {
            p50: metricsCollector.getLatencyPercentile(50, hours),
            p95: metricsCollector.getLatencyPercentile(95, hours),
            p99: metricsCollector.getLatencyPercentile(99, hours)
          },
          endpoints: metricsCollector.getEndpointMetrics(hours)
        };

        jsonResponse(res, 200, performance);
      } catch (error) {
        console.error('[Metrics] Performance error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch performance metrics' });
      }
    },

    /**
     * GET /api/metrics/endpoints
     * Returns per-endpoint statistics
     *
     * Query params:
     * - hours: Time window (default: 1)
     * - sort: Sort field (requests|latency|errors) (default: requests)
     */
    async getEndpoints(req, res) {
      try {
        const hours = parseInt(req.query.hours) || 1;
        const sort = req.query.sort || 'requests';

        const endpoints = metricsCollector.getEndpointMetrics(hours);

        // Sort endpoints based on requested field
        const sorted = Object.entries(endpoints)
          .sort((a, b) => {
            switch (sort) {
              case 'latency':
                return b[1].latency.p95 - a[1].latency.p95;
              case 'errors':
                return (100 - b[1].successRate) - (100 - a[1].successRate);
              default: // requests
                return b[1].requests - a[1].requests;
            }
          })
          .reduce((acc, [key, val]) => {
            acc[key] = val;
            return acc;
          }, {});

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          window: `${hours} hour${hours > 1 ? 's' : ''}`,
          sortedBy: sort,
          endpoints: sorted
        });
      } catch (error) {
        console.error('[Metrics] Endpoints error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch endpoint metrics' });
      }
    },

    /**
     * GET /api/metrics/slo
     * Returns SLO compliance report
     *
     * Query params:
     * - period: daily|weekly|monthly (default: daily)
     */
    async getSLOStatus(req, res) {
      try {
        const period = req.query.period || 'daily';

        let hours;
        switch (period) {
          case 'weekly':
            hours = 24 * 7;
            break;
          case 'monthly':
            hours = 24 * 30;
            break;
          default: // daily
            hours = 24;
        }

        const sloStatus = metricsCollector.getSLIStatus();
        const errorBudgets = {
          availability: metricsCollector.getErrorBudget('availability', hours),
          latency: metricsCollector.getErrorBudget('latency', hours),
          correctness: metricsCollector.getErrorBudget('correctness', hours),
          integrity: metricsCollector.getErrorBudget('integrity', hours)
        };

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          period,
          window: `${hours} hours`,
          status: sloStatus,
          errorBudgets,
          compliant: Object.values(errorBudgets).every(b => b.percentConsumed < 100)
        });
      } catch (error) {
        console.error('[Metrics] SLO status error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch SLO status' });
      }
    },

    /**
     * GET /api/metrics/errors
     * Returns recent errors for debugging
     *
     * Query params:
     * - limit: Maximum errors to return (default: 20)
     * - hours: Time window (default: 1)
     */
    async getErrors(req, res) {
      try {
        const limit = parseInt(req.query.limit) || 20;
        const hours = parseInt(req.query.hours) || 1;

        const errors = metricsCollector.getRecentErrors(limit);

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          window: `${hours} hour${hours > 1 ? 's' : ''}`,
          count: errors.length,
          errors
        });
      } catch (error) {
        console.error('[Metrics] Errors fetch error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch errors' });
      }
    },

    /**
     * GET /api/metrics/rate
     * Returns request rate over time
     *
     * Query params:
     * - minutes: Time window (default: 60)
     */
    async getRequestRate(req, res) {
      try {
        const minutes = parseInt(req.query.minutes) || 60;

        const rate = metricsCollector.getRequestRate(minutes);

        jsonResponse(res, 200, {
          timestamp: new Date().toISOString(),
          window: `${minutes} minutes`,
          ...rate
        });
      } catch (error) {
        console.error('[Metrics] Rate error:', error);
        jsonResponse(res, 500, { error: 'Failed to fetch request rate' });
      }
    },

    /**
     * POST /api/metrics/cleanup
     * Manually trigger metrics cleanup
     *
     * Body:
     * - retentionDays: Days to retain (default: 90)
     */
    async cleanup(req, res) {
      try {
        const retentionDays = req.body?.retentionDays || 90;

        const deleted = metricsCollector.cleanup(retentionDays);

        jsonResponse(res, 200, {
          message: 'Metrics cleanup completed',
          deleted,
          retentionDays
        });
      } catch (error) {
        console.error('[Metrics] Cleanup error:', error);
        jsonResponse(res, 500, { error: 'Failed to cleanup metrics' });
      }
    }
  };
}

/**
 * Register metrics routes on router
 *
 * @param {APIRouter} router - Router instance
 */
export function registerMetricsRoutes(router) {
  const handlers = createMetricsRoutes();

  // Register all metrics endpoints
  router.get('/metrics/dashboard', handlers.getDashboard);
  router.get('/metrics/performance', handlers.getPerformance);
  router.get('/metrics/endpoints', handlers.getEndpoints);
  router.get('/metrics/slo', handlers.getSLOStatus);
  router.get('/metrics/errors', handlers.getErrors);
  router.get('/metrics/rate', handlers.getRequestRate);
  router.post('/metrics/cleanup', handlers.cleanup);

  console.log('[Metrics] Registered 7 metrics endpoints');
}