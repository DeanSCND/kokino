/**
 * MonitoringService
 * Phase 6: Practical Monitoring System
 *
 * Collects and tracks agent metrics, events, and errors.
 * Provides dashboard data and simple alerting.
 */

import db from '../db/schema.js';
import { EventEmitter } from 'events';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class MonitoringService extends EventEmitter {
  constructor(agentRegistry) {
    super();
    this.registry = agentRegistry;
    this.metricsInterval = null;
    this.alertInterval = null;
    this.isRunning = false;

    // Configuration
    this.COLLECTION_INTERVAL_MS = 30000; // 30 seconds
    this.ALERT_CHECK_INTERVAL_MS = 60000; // 1 minute
    this.DATA_RETENTION_DAYS = 7;

    // Alert thresholds
    this.THRESHOLDS = {
      CPU_WARNING: 80,
      CPU_CRITICAL: 95,
      MEMORY_WARNING_MB: 1024,
      MEMORY_CRITICAL_MB: 2048,
      ERROR_COUNT_WARNING: 5,
      ERROR_COUNT_CRITICAL: 10
    };

    console.log('[MonitoringService] Initialized');
  }

  /**
   * Start monitoring service
   * @param {number} collectionIntervalMs - Metrics collection interval
   */
  start(collectionIntervalMs = this.COLLECTION_INTERVAL_MS) {
    if (this.isRunning) {
      console.log('[MonitoringService] Already running');
      return;
    }

    this.isRunning = true;
    this.COLLECTION_INTERVAL_MS = collectionIntervalMs;

    // Initial collection
    this.collectMetrics().catch(err =>
      console.error('[MonitoringService] Initial collection failed:', err)
    );

    // Regular metrics collection
    this.metricsInterval = setInterval(() => {
      this.collectMetrics().catch(err =>
        console.error('[MonitoringService] Metrics collection failed:', err)
      );
    }, this.COLLECTION_INTERVAL_MS);

    // Alert checking
    this.alertInterval = setInterval(() => {
      this.checkAlerts().catch(err =>
        console.error('[MonitoringService] Alert check failed:', err)
      );
    }, this.ALERT_CHECK_INTERVAL_MS);

    console.log(`[MonitoringService] Started (collection: ${this.COLLECTION_INTERVAL_MS}ms, alerts: ${this.ALERT_CHECK_INTERVAL_MS}ms)`);
  }

  /**
   * Stop monitoring service
   */
  stop() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.alertInterval) {
      clearInterval(this.alertInterval);
      this.alertInterval = null;
    }

    this.isRunning = false;
    console.log('[MonitoringService] Stopped');
  }

  /**
   * Collect metrics for all agents
   */
  async collectMetrics() {
    const agents = this.registry.list({ status: 'online' });

    for (const agent of agents) {
      try {
        const metrics = await this.getAgentMetrics(agent.agentId);
        this.saveMetrics(agent.agentId, metrics);
      } catch (error) {
        console.error(`[MonitoringService] Failed to collect metrics for ${agent.agentId}:`, error.message);
        this.logEvent(agent.agentId, 'error', 'Metrics collection failed', {
          error: error.message
        });
      }
    }
  }

  /**
   * Get metrics for a specific agent
   * @param {string} agentId - Agent ID
   * @returns {Promise<Object>} Metrics data
   */
  async getAgentMetrics(agentId) {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in registry`);
    }

    const pid = agent.metadata?.pid;

    // Get process metrics if we have a PID
    let cpuPercent = 0;
    let memoryMb = 0;

    if (pid) {
      try {
        const processMetrics = await this.getProcessMetrics(pid);
        cpuPercent = processMetrics.cpu;
        memoryMb = processMetrics.memory;
      } catch (error) {
        // Process might have died or be inaccessible
        console.warn(`[MonitoringService] Could not get process metrics for PID ${pid}:`, error.message);
      }
    }

    // Get error and message counts from database
    const errorCount = db.prepare(
      'SELECT COUNT(*) as count FROM error_logs WHERE agent_id = ? AND resolved = 0'
    ).get(agentId)?.count || 0;

    const messageCount = db.prepare(
      'SELECT COUNT(*) as count FROM tickets WHERE target_agent = ? OR origin_agent = ?'
    ).get(agentId, agentId)?.count || 0;

    return {
      cpuPercent,
      memoryMb,
      status: agent.status,
      errorCount,
      messageCount
    };
  }

  /**
   * Get process metrics (CPU and memory) for a given PID
   * Platform-specific implementation
   * @param {number} pid - Process ID
   * @returns {Promise<Object>} {cpu: number, memory: number}
   */
  async getProcessMetrics(pid) {
    try {
      if (process.platform === 'darwin') {
        // macOS - use ps command
        const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,rss`);
        const lines = stdout.trim().split('\n');

        if (lines.length > 1) {
          const [cpu, rss] = lines[1].trim().split(/\s+/);
          return {
            cpu: parseFloat(cpu) || 0,
            memory: Math.round(parseInt(rss) / 1024) || 0  // KB to MB
          };
        }
      } else if (process.platform === 'linux') {
        // Linux - use ps command
        const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,rss --no-headers`);
        const [cpu, rss] = stdout.trim().split(/\s+/);
        return {
          cpu: parseFloat(cpu) || 0,
          memory: Math.round(parseInt(rss) / 1024) || 0  // KB to MB
        };
      } else if (process.platform === 'win32') {
        // Windows - use wmic (basic support)
        const { stdout } = await execAsync(`wmic process where ProcessId=${pid} get WorkingSetSize,PercentProcessorTime /format:csv`);
        const lines = stdout.trim().split('\n');

        if (lines.length > 1) {
          const data = lines[1].split(',');
          return {
            cpu: parseFloat(data[1]) || 0,
            memory: Math.round(parseInt(data[2]) / (1024 * 1024)) || 0  // Bytes to MB
          };
        }
      }
    } catch (error) {
      // Process might have terminated or be inaccessible
      console.debug(`[MonitoringService] Process ${pid} metrics unavailable:`, error.message);
    }

    return { cpu: 0, memory: 0 };
  }

  /**
   * Save metrics to database
   * @param {string} agentId - Agent ID
   * @param {Object} metrics - Metrics data
   */
  saveMetrics(agentId, metrics) {
    db.prepare(`
      INSERT INTO agent_metrics (agent_id, cpu_percent, memory_mb, status, error_count, message_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      metrics.cpuPercent,
      metrics.memoryMb,
      metrics.status,
      metrics.errorCount,
      metrics.messageCount
    );

    // Emit for real-time updates
    this.emit('metrics', { agentId, ...metrics });
  }

  /**
   * Log an event
   * @param {string} agentId - Agent ID
   * @param {string} eventType - Event type (started, stopped, error, warning, info)
   * @param {string} message - Event message
   * @param {Object} metadata - Additional context
   */
  logEvent(agentId, eventType, message, metadata = {}) {
    db.prepare(`
      INSERT INTO agent_events (agent_id, event_type, message, metadata)
      VALUES (?, ?, ?, ?)
    `).run(
      agentId,
      eventType,
      message,
      JSON.stringify(metadata)
    );

    console.log(`[MonitoringService] Event: ${agentId} - ${eventType} - ${message}`);

    // Emit for real-time updates
    this.emit('event', { agentId, eventType, message, metadata, timestamp: new Date().toISOString() });
  }

  /**
   * Log an error
   * @param {string} agentId - Agent ID
   * @param {Error|Object} error - Error object or plain object with error details
   */
  logError(agentId, error) {
    const errorType = error.name || error.type || 'Error';
    const errorMessage = error.message || String(error);
    const stackTrace = error.stack || null;

    db.prepare(`
      INSERT INTO error_logs (agent_id, error_type, message, stack_trace)
      VALUES (?, ?, ?, ?)
    `).run(
      agentId,
      errorType,
      errorMessage,
      stackTrace
    );

    console.error(`[MonitoringService] Error logged for ${agentId}:`, errorMessage);

    // Emit for real-time updates
    this.emit('error', { agentId, error: { type: errorType, message: errorMessage, stack: stackTrace } });
  }

  /**
   * Resolve an error
   * @param {number} errorId - Error log ID
   * @param {string} resolvedBy - Who resolved it
   */
  resolveError(errorId, resolvedBy = 'system') {
    db.prepare(`
      UPDATE error_logs
      SET resolved = 1, resolved_at = ?, resolved_by = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      resolvedBy,
      errorId
    );

    console.log(`[MonitoringService] Error ${errorId} resolved by ${resolvedBy}`);
  }

  /**
   * Check for alert conditions
   */
  async checkAlerts() {
    const agents = this.registry.list({ status: 'online' });

    for (const agent of agents) {
      try {
        // Get latest metrics
        const latestMetric = db.prepare(`
          SELECT * FROM agent_metrics
          WHERE agent_id = ?
          ORDER BY timestamp DESC
          LIMIT 1
        `).get(agent.agentId);

        if (!latestMetric) continue;

        // High CPU alert
        if (latestMetric.cpu_percent >= this.THRESHOLDS.CPU_CRITICAL) {
          this.emitAlert(agent.agentId, 'high_cpu',
            `Critical CPU usage: ${latestMetric.cpu_percent.toFixed(1)}%`,
            'critical');
        } else if (latestMetric.cpu_percent >= this.THRESHOLDS.CPU_WARNING) {
          this.emitAlert(agent.agentId, 'high_cpu',
            `High CPU usage: ${latestMetric.cpu_percent.toFixed(1)}%`,
            'warning');
        }

        // High memory alert
        if (latestMetric.memory_mb >= this.THRESHOLDS.MEMORY_CRITICAL_MB) {
          this.emitAlert(agent.agentId, 'high_memory',
            `Critical memory usage: ${latestMetric.memory_mb}MB`,
            'critical');
        } else if (latestMetric.memory_mb >= this.THRESHOLDS.MEMORY_WARNING_MB) {
          this.emitAlert(agent.agentId, 'high_memory',
            `High memory usage: ${latestMetric.memory_mb}MB`,
            'warning');
        }

        // Error count alert
        if (latestMetric.error_count >= this.THRESHOLDS.ERROR_COUNT_CRITICAL) {
          this.emitAlert(agent.agentId, 'high_errors',
            `Critical: ${latestMetric.error_count} unresolved errors`,
            'critical');
        } else if (latestMetric.error_count >= this.THRESHOLDS.ERROR_COUNT_WARNING) {
          this.emitAlert(agent.agentId, 'high_errors',
            `${latestMetric.error_count} unresolved errors`,
            'warning');
        }

      } catch (error) {
        console.error(`[MonitoringService] Alert check failed for ${agent.agentId}:`, error.message);
      }
    }
  }

  /**
   * Emit an alert
   * @param {string} agentId - Agent ID
   * @param {string} type - Alert type
   * @param {string} message - Alert message
   * @param {string} severity - Alert severity (warning, critical)
   */
  emitAlert(agentId, type, message, severity) {
    const alert = {
      agentId,
      type,
      message,
      severity,
      timestamp: new Date().toISOString()
    };

    // Log as warning/error event
    this.logEvent(agentId, severity === 'critical' ? 'error' : 'warning', message, { alertType: type });

    // Emit alert event
    this.emit('alert', alert);

    console.warn(`[MonitoringService] ALERT [${severity.toUpperCase()}]: ${agentId} - ${message}`);
  }

  /**
   * Get dashboard data (overview of all agents)
   * @returns {Promise<Object>} Dashboard data
   */
  async getDashboardData() {
    const agents = this.registry.list();

    // Get latest metrics for each agent
    const agentMetrics = {};
    for (const agent of agents) {
      const metrics = db.prepare(`
        SELECT * FROM agent_metrics
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(agent.agentId);

      agentMetrics[agent.agentId] = metrics || null;
    }

    // Get recent events (last 50)
    const recentEvents = db.prepare(`
      SELECT * FROM agent_events
      ORDER BY timestamp DESC
      LIMIT 50
    `).all();

    // Get unresolved errors grouped by agent
    const activeErrors = db.prepare(`
      SELECT agent_id, COUNT(*) as count
      FROM error_logs
      WHERE resolved = 0
      GROUP BY agent_id
    `).all();

    // System metrics
    const systemMetrics = {
      cpuUsage: os.loadavg()[0],
      totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024),
      uptime: os.uptime(),
      platform: os.platform(),
      nodeVersion: process.version
    };

    return {
      agents: agents.map(agent => ({
        ...agent,
        metrics: agentMetrics[agent.agentId]
      })),
      recentEvents,
      activeErrors,
      systemMetrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get agent-specific dashboard data
   * @param {string} agentId - Agent ID
   * @param {number} hours - Hours of history to retrieve
   * @returns {Promise<Object>} Agent dashboard data
   */
  async getAgentDashboard(agentId, hours = 1) {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Recent metrics
    const metrics = db.prepare(`
      SELECT * FROM agent_metrics
      WHERE agent_id = ? AND timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp DESC
    `).all(agentId);

    // Recent events
    const events = db.prepare(`
      SELECT * FROM agent_events
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `).all(agentId);

    // Errors
    const errors = db.prepare(`
      SELECT * FROM error_logs
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(agentId);

    // Calculate metrics summary
    const metricsSummary = {
      avgCpu: 0,
      maxCpu: 0,
      avgMemory: 0,
      maxMemory: 0,
      dataPoints: metrics.length
    };

    if (metrics.length > 0) {
      metricsSummary.avgCpu = metrics.reduce((sum, m) => sum + m.cpu_percent, 0) / metrics.length;
      metricsSummary.maxCpu = Math.max(...metrics.map(m => m.cpu_percent));
      metricsSummary.avgMemory = metrics.reduce((sum, m) => sum + m.memory_mb, 0) / metrics.length;
      metricsSummary.maxMemory = Math.max(...metrics.map(m => m.memory_mb));
    }

    return {
      agent,
      metrics,
      events,
      errors,
      summary: metricsSummary,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clean up old monitoring data
   * @param {number} daysToKeep - Number of days to retain
   */
  async cleanup(daysToKeep = this.DATA_RETENTION_DAYS) {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    const metricsDeleted = db.prepare('DELETE FROM agent_metrics WHERE timestamp < ?').run(cutoff).changes;
    const eventsDeleted = db.prepare('DELETE FROM agent_events WHERE timestamp < ?').run(cutoff).changes;
    const errorsDeleted = db.prepare('DELETE FROM error_logs WHERE timestamp < ? AND resolved = 1').run(cutoff).changes;

    console.log(`[MonitoringService] Cleanup complete: ${metricsDeleted} metrics, ${eventsDeleted} events, ${errorsDeleted} resolved errors deleted`);

    return {
      metricsDeleted,
      eventsDeleted,
      errorsDeleted,
      cutoffDate: cutoff
    };
  }
}

export default MonitoringService;
