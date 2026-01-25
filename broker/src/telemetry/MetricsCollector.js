import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Telemetry Events Schema
 *
 * HTTP API:
 * - HTTP_REQUEST, HTTP_REQUEST_ERROR, SLO_VIOLATION
 *
 * Execution lifecycle:
 * - EXECUTION_STARTED, EXECUTION_COMPLETED, EXECUTION_FAILED,
 * - EXECUTION_TIMEOUT, EXECUTION_CANCELLED
 *
 * Session management:
 * - SESSION_CREATED, SESSION_RESUMED, SESSION_ENDED
 * - LOCK_ACQUIRED, LOCK_TIMEOUT
 *
 * Environment health:
 * - ENV_CHECK_PASSED, ENV_CHECK_FAILED, ENV_DEGRADED
 *
 * Resource management:
 * - MEMORY_LIMIT_EXCEEDED, CPU_LIMIT_EXCEEDED
 * - CIRCUIT_BREAKER_OPENED, CIRCUIT_BREAKER_CLOSED
 *
 * Data integrity:
 * - CONVERSATION_INTEGRITY_PASS, CONVERSATION_INTEGRITY_FAIL, ORPHAN_DETECTED
 *
 * Shadow mode:
 * - SHADOW_MISMATCH, SHADOW_LATENCY_DELTA
 */

const METRICS_DB_PATH = process.env.METRICS_DB_PATH || path.join(process.cwd(), 'data', 'metrics.db');

/**
 * Unified telemetry collector for headless execution monitoring
 *
 * SLI/SLO Targets:
 * - Availability: ≥99.5% (30-day success rate)
 * - Latency: P95 <30s execution time
 * - Correctness: ≥95% shadow mode match rate
 * - Data Integrity: 100% conversation consistency
 * - Resource Efficiency: <500MB avg memory per execution
 */
export class MetricsCollector {
  constructor(dbPath = METRICS_DB_PATH) {
    // Ensure metrics data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.initSchema();
    console.log('[MetricsCollector] Initialized with database:', dbPath);
  }

  /**
   * Initialize metrics database schema
   */
  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        cli_type TEXT,
        duration_ms INTEGER,
        success INTEGER,
        metadata JSON,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_metrics_event ON metrics(event);
      CREATE INDEX IF NOT EXISTS idx_metrics_agent ON metrics(agent_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_success ON metrics(success);
    `);

    console.log('[MetricsCollector] Schema initialized');
  }

  /**
   * Record a telemetry event
   *
   * @param {string} event - Event type (e.g., EXECUTION_COMPLETED)
   * @param {string} agentId - Agent identifier
   * @param {object} options - Additional event data
   */
  record(event, agentId, options = {}) {
    const {
      cliType = null,
      durationMs = null,
      success = null,
      metadata = {}
    } = options;

    const stmt = this.db.prepare(`
      INSERT INTO metrics (event, agent_id, cli_type, duration_ms, success, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event,
      agentId,
      cliType,
      durationMs,
      success ? 1 : 0,
      JSON.stringify(metadata)
    );

    console.log(`[Metrics] ${event} - ${agentId} (${cliType || 'N/A'})`);
  }

  /**
   * Calculate availability SLI (success rate over time window)
   *
   * Target: ≥99.5% (30-day)
   * Alert: <99.0% for 1h
   *
   * @param {number} windowHours - Time window in hours (default: 24*30 = 30 days)
   * @returns {number} Availability as decimal (0.995 = 99.5%)
   */
  getAvailability(windowHours = 24 * 30) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM metrics
      WHERE event IN ('EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_TIMEOUT')
        AND timestamp >= datetime('now', '-' || ? || ' hours')
    `);

    const result = stmt.get(windowHours);

    if (result.total === 0) return 1.0; // No data = 100% (neutral)

    return result.successes / result.total;
  }

  /**
   * Calculate latency percentile (P50, P95, P99)
   *
   * Target: P95 <30s
   * Alert: P95 >60s for 5m
   *
   * @param {number} percentile - Percentile to calculate (50, 95, 99)
   * @param {number} windowHours - Time window in hours (default: 24)
   * @returns {number} Latency in milliseconds
   */
  getLatencyPercentile(percentile = 95, windowHours = 24) {
    const stmt = this.db.prepare(`
      SELECT duration_ms
      FROM metrics
      WHERE event = 'EXECUTION_COMPLETED'
        AND duration_ms IS NOT NULL
        AND timestamp >= datetime('now', '-' || ? || ' hours')
      ORDER BY duration_ms ASC
    `);

    const durations = stmt.all(windowHours).map(row => row.duration_ms);

    if (durations.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * durations.length) - 1;
    return durations[index];
  }

  /**
   * Calculate error budget consumption
   *
   * Error Budget = (1 - SLO Target) * Total Requests
   * Example: 99.5% SLO = 0.5% error budget
   *
   * @param {string} sli - SLI name ('availability', 'latency', 'correctness', 'integrity')
   * @param {number} windowHours - Time window in hours
   * @returns {object} { budget, consumed, remaining, percentConsumed }
   */
  getErrorBudget(sli, windowHours = 24 * 30) {
    let consumed = 0;
    let total = 0;
    let target = 0;

    switch (sli) {
      case 'availability': {
        target = 0.995; // 99.5%
        const availability = this.getAvailability(windowHours);
        const stmt = this.db.prepare(`
          SELECT COUNT(*) as total
          FROM metrics
          WHERE event IN ('EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_TIMEOUT')
            AND timestamp >= datetime('now', '-' || ? || ' hours')
        `);
        total = stmt.get(windowHours).total;
        consumed = Math.round(total * (1 - availability));
        break;
      }

      case 'latency': {
        target = 0.95; // 95% under 30s
        const stmt = this.db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN duration_ms > 30000 THEN 1 ELSE 0 END) as over_target
          FROM metrics
          WHERE event = 'EXECUTION_COMPLETED'
            AND duration_ms IS NOT NULL
            AND timestamp >= datetime('now', '-' || ? || ' hours')
        `);
        const result = stmt.get(windowHours);
        total = result.total;
        consumed = result.over_target;
        break;
      }

      case 'correctness': {
        target = 0.95; // 95% match rate (shadow mode)
        const stmt = this.db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN event = 'SHADOW_MISMATCH' THEN 1 ELSE 0 END) as mismatches
          FROM metrics
          WHERE event IN ('SHADOW_MISMATCH', 'EXECUTION_COMPLETED')
            AND timestamp >= datetime('now', '-' || ? || ' hours')
        `);
        const result = stmt.get(windowHours);
        total = result.total;
        consumed = result.mismatches;
        break;
      }

      case 'integrity': {
        target = 1.0; // 100% (zero tolerance)
        const stmt = this.db.prepare(`
          SELECT COUNT(*) as failures
          FROM metrics
          WHERE event IN ('CONVERSATION_INTEGRITY_FAIL', 'ORPHAN_DETECTED')
            AND timestamp >= datetime('now', '-' || ? || ' hours')
        `);
        consumed = stmt.get(windowHours).failures;
        total = consumed; // Any failure consumes entire budget
        break;
      }

      default:
        throw new Error(`Unknown SLI: ${sli}`);
    }

    const budget = Math.round(total * (1 - target));
    const remaining = Math.max(0, budget - consumed);
    const percentConsumed = budget > 0 ? (consumed / budget) * 100 : 0;

    return {
      sli,
      target,
      budget,
      consumed,
      remaining,
      percentConsumed: Math.round(percentConsumed * 10) / 10, // 1 decimal place
      windowHours
    };
  }

  /**
   * Get current SLI values for all targets
   *
   * @returns {object} Current SLI metrics
   */
  getSLIStatus() {
    return {
      availability: {
        current: this.getAvailability(24 * 30),
        target: 0.995,
        breach: this.getAvailability(24 * 30) < 0.995,
      },
      latency: {
        p50: this.getLatencyPercentile(50, 24),
        p95: this.getLatencyPercentile(95, 24),
        p99: this.getLatencyPercentile(99, 24),
        target_p95: 30000, // 30s
        breach: this.getLatencyPercentile(95, 24) > 30000,
      },
      errorBudget: {
        availability: this.getErrorBudget('availability', 24 * 30),
        latency: this.getErrorBudget('latency', 24),
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get event counts by type for time window
   *
   * @param {number} windowHours - Time window in hours
   * @returns {object} Event counts by type
   */
  getEventCounts(windowHours = 24) {
    const stmt = this.db.prepare(`
      SELECT
        event,
        COUNT(*) as count
      FROM metrics
      WHERE timestamp >= datetime('now', '-' || ? || ' hours')
      GROUP BY event
      ORDER BY count DESC
    `);

    const rows = stmt.all(windowHours);
    return rows.reduce((acc, row) => {
      acc[row.event] = row.count;
      return acc;
    }, {});
  }

  /**
   * Get metrics for Prometheus export
   *
   * @returns {object} Prometheus-compatible metrics
   */
  getPrometheusMetrics() {
    const windowHours = 1; // Last hour for Prometheus scraping

    const executionCounts = this.db.prepare(`
      SELECT
        agent_id,
        cli_type,
        event,
        success,
        COUNT(*) as count
      FROM metrics
      WHERE event IN ('EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_TIMEOUT')
        AND timestamp >= datetime('now', '-' || ? || ' hours')
      GROUP BY agent_id, cli_type, event, success
    `).all(windowHours);

    const latencies = this.db.prepare(`
      SELECT
        agent_id,
        cli_type,
        duration_ms
      FROM metrics
      WHERE event = 'EXECUTION_COMPLETED'
        AND duration_ms IS NOT NULL
        AND timestamp >= datetime('now', '-' || ? || ' hours')
    `).all(windowHours);

    return {
      headless_executions_total: executionCounts,
      headless_execution_duration_seconds: latencies,
      headless_availability: this.getAvailability(24),
      headless_latency_p95_ms: this.getLatencyPercentile(95, 24),
    };
  }

  /**
   * Clean up old metrics (retention policy)
   *
   * @param {number} retentionDays - Keep metrics for this many days (default: 90)
   */
  cleanup(retentionDays = 90) {
    const stmt = this.db.prepare(`
      DELETE FROM metrics
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(retentionDays);
    console.log(`[MetricsCollector] Cleaned up ${result.changes} old metrics (retention: ${retentionDays} days)`);
    return result.changes;
  }

  /**
   * Record HTTP endpoint-specific metrics
   * Tracks per-endpoint latency and success rates
   *
   * @param {string} endpoint - Endpoint pattern (e.g., "GET /api/agents")
   * @param {object} options - Metric data
   */
  recordEndpointMetric(endpoint, options = {}) {
    const { durationMs, statusCode, success } = options;

    // Store in metrics table with HTTP_ENDPOINT event type
    this.record('HTTP_ENDPOINT', 'broker', {
      durationMs,
      success,
      metadata: {
        endpoint,
        statusCode
      }
    });
  }

  /**
   * Get endpoint performance metrics
   * Returns P50, P95, P99 latencies and success rates per endpoint
   *
   * @param {number} windowHours - Time window in hours (default: 1)
   * @returns {object} Endpoint metrics grouped by endpoint
   */
  getEndpointMetrics(windowHours = 1) {
    const stmt = this.db.prepare(`
      SELECT
        json_extract(metadata, '$.endpoint') as endpoint,
        COUNT(*) as requests,
        AVG(duration_ms) as avg_latency,
        MIN(duration_ms) as min_latency,
        MAX(duration_ms) as max_latency,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
      FROM metrics
      WHERE event = 'HTTP_ENDPOINT'
        AND timestamp >= datetime('now', '-' || ? || ' hours')
        AND json_extract(metadata, '$.endpoint') IS NOT NULL
      GROUP BY endpoint
      ORDER BY requests DESC
    `);

    const endpoints = stmt.all(windowHours);

    // Calculate percentiles for each endpoint
    const result = {};
    for (const endpoint of endpoints) {
      const percentileStmt = this.db.prepare(`
        SELECT duration_ms
        FROM metrics
        WHERE event = 'HTTP_ENDPOINT'
          AND json_extract(metadata, '$.endpoint') = ?
          AND timestamp >= datetime('now', '-' || ? || ' hours')
          AND duration_ms IS NOT NULL
        ORDER BY duration_ms ASC
      `);

      const durations = percentileStmt.all(endpoint.endpoint, windowHours).map(r => r.duration_ms);

      result[endpoint.endpoint] = {
        requests: endpoint.requests,
        successRate: endpoint.success_rate,
        latency: {
          min: endpoint.min_latency,
          avg: Math.round(endpoint.avg_latency),
          max: endpoint.max_latency,
          p50: this.calculatePercentile(durations, 50),
          p95: this.calculatePercentile(durations, 95),
          p99: this.calculatePercentile(durations, 99)
        }
      };
    }

    return result;
  }

  /**
   * Calculate a specific percentile from an array of values
   *
   * @param {number[]} values - Sorted array of values
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} Percentile value
   */
  calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  /**
   * Get metrics dashboard data
   * Aggregates all key metrics for display
   *
   * @returns {object} Dashboard metrics
   */
  getDashboardMetrics() {
    const now = new Date();

    return {
      timestamp: now.toISOString(),
      slo: {
        availability: {
          current: this.getAvailability(1), // Last hour
          daily: this.getAvailability(24),
          monthly: this.getAvailability(24 * 30),
          target: 0.995
        },
        latency: {
          p50: this.getLatencyPercentile(50, 1),
          p95: this.getLatencyPercentile(95, 1),
          p99: this.getLatencyPercentile(99, 1),
          targetP95: 30000 // 30s
        }
      },
      endpoints: this.getEndpointMetrics(1), // Last hour
      recentErrors: this.getRecentErrors(10),
      requestRate: this.getRequestRate(60) // Last 60 minutes
    };
  }

  /**
   * Get recent errors for debugging
   *
   * @param {number} limit - Maximum number of errors to return
   * @returns {Array} Recent error entries
   */
  getRecentErrors(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT
        event,
        agent_id,
        json_extract(metadata, '$.error') as error,
        json_extract(metadata, '$.path') as path,
        json_extract(metadata, '$.method') as method,
        timestamp
      FROM metrics
      WHERE event IN ('HTTP_REQUEST_ERROR', 'EXECUTION_FAILED', 'EXECUTION_TIMEOUT')
        AND timestamp >= datetime('now', '-1 hour')
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get request rate over time
   *
   * @param {number} minutes - Time window in minutes
   * @returns {object} Request counts per minute
   */
  getRequestRate(minutes = 60) {
    const stmt = this.db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:%M', timestamp) as minute,
        COUNT(*) as requests
      FROM metrics
      WHERE event IN ('HTTP_REQUEST', 'HTTP_ENDPOINT')
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
      GROUP BY minute
      ORDER BY minute ASC
    `);

    const data = stmt.all(minutes);

    return {
      labels: data.map(d => d.minute),
      values: data.map(d => d.requests)
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton instance for shared use
let instance = null;

export function getMetricsCollector() {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}
