/**
 * ShadowModeController - Parallel execution of tmux and headless modes for testing
 *
 * Runs both communication modes for the same ticket and compares:
 * - Success rates
 * - Response output matching
 * - Latency differences
 *
 * Related: Issue #93 - Shadow Mode Testing
 */

import db from '../db/schema.js';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

export class ShadowModeController {
  constructor(ticketStore, agentRunner) {
    this.ticketStore = ticketStore;
    this.agentRunner = agentRunner;
    this.metrics = getMetricsCollector();
    console.log('[ShadowMode] Initialized');
  }

  /**
   * Execute ticket in shadow mode (parallel tmux + headless)
   *
   * @param {string} agentId - Target agent ID
   * @param {object} ticket - Ticket to execute
   * @returns {Promise<object>} Primary result (tmux during shadow phase)
   */
  async executeInShadowMode(agentId, ticket) {
    console.log(`[ShadowMode] Executing ticket ${ticket.ticketId} in parallel (tmux + headless)`);

    const startTime = Date.now();

    // Run both modes in parallel
    const [tmuxResult, headlessResult] = await Promise.allSettled([
      this.runTmuxDelivery(agentId, ticket),
      this.runHeadlessDelivery(agentId, ticket),
    ]);

    const totalDuration = Date.now() - startTime;

    // Compare results
    const comparison = this.compareResults(tmuxResult, headlessResult);

    // Log to shadow_results table
    await this.logShadowResult(ticket.ticketId, agentId, comparison);

    // Emit telemetry
    this.emitShadowTelemetry(agentId, comparison, totalDuration);

    console.log(`[ShadowMode] Ticket ${ticket.ticketId} completed - tmux: ${comparison.tmuxSuccess}, headless: ${comparison.headlessSuccess}, match: ${comparison.outputMatch}`);

    // Return primary result (tmux is canonical during shadow phase)
    if (tmuxResult.status === 'fulfilled') {
      return tmuxResult.value;
    } else {
      throw tmuxResult.reason;
    }
  }

  /**
   * Run tmux delivery for ticket (Store & Forward pattern)
   *
   * Creates a pending ticket and waits for watcher to poll and respond.
   * This exercises the full tmux stack: ticket creation → watcher poll →
   * tmux delivery → watcher reply.
   *
   * @param {string} agentId - Target agent ID
   * @param {object} ticket - Ticket to execute
   * @returns {Promise<object>} Execution result
   */
  async runTmuxDelivery(agentId, ticket) {
    const startTime = Date.now();

    try {
      // CRITICAL: Temporarily mark ticket as tmux-only to avoid re-triggering shadow mode
      // We'll create a pending ticket that the watcher will poll and deliver to tmux
      const tmuxTicket = this.ticketStore.repo.save({
        ticketId: `${ticket.ticketId}-tmux`,
        targetAgent: agentId,
        originAgent: ticket.originAgent,
        payload: ticket.payload,
        metadata: JSON.stringify({
          ...ticket.metadata,
          shadowMode: 'tmux-baseline',
          originalTicketId: ticket.ticketId,
        }),
        expectReply: 1,
        timeoutMs: ticket.timeoutMs,
        status: 'pending',
        response: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Initialize waiter set for this ticket
      this.ticketStore.waiters.set(tmuxTicket.ticketId, new Set());

      // Wait for watcher to poll, deliver, and respond
      const response = await new Promise((resolve, reject) => {
        const waiter = (reply) => {
          if (!reply) {
            reject(new Error('Tmux delivery timeout or no response'));
          } else {
            resolve(reply);
          }
        };

        // Add waiter to ticket
        this.ticketStore.addWaiter(tmuxTicket.ticketId, waiter);

        // Set timeout
        setTimeout(() => {
          this.ticketStore.timeout(tmuxTicket.ticketId);
          reject(new Error('Tmux delivery timeout'));
        }, ticket.timeoutMs);
      });

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        response: response.response || response,
        durationMs,
        error: null,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        success: false,
        response: null,
        durationMs,
        error: error.message,
      };
    }
  }

  /**
   * Run headless delivery for ticket
   *
   * @param {string} agentId - Target agent ID
   * @param {object} ticket - Ticket to execute
   * @returns {Promise<object>} Execution result
   */
  async runHeadlessDelivery(agentId, ticket) {
    const startTime = Date.now();

    try {
      // Use AgentRunner for headless execution
      const result = await this.agentRunner.execute(agentId, ticket.payload, {
        timeoutMs: ticket.timeoutMs,
      });

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        response: result.response,
        durationMs,
        error: null,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      return {
        success: false,
        response: null,
        durationMs,
        error: error.message,
      };
    }
  }

  /**
   * Compare tmux and headless results
   *
   * @param {object} tmuxResult - Promise.allSettled result for tmux
   * @param {object} headlessResult - Promise.allSettled result for headless
   * @returns {object} Comparison data
   */
  compareResults(tmuxResult, headlessResult) {
    const comparison = {
      tmuxSuccess: tmuxResult.status === 'fulfilled' && tmuxResult.value.success,
      headlessSuccess: headlessResult.status === 'fulfilled' && headlessResult.value.success,
      outputMatch: false,
      latencyDelta: 0,
      tmuxDuration: 0,
      headlessDuration: 0,
      tmuxError: null,
      headlessError: null,
      tmuxResponse: null,
      headlessResponse: null,
    };

    // Extract tmux data
    if (tmuxResult.status === 'fulfilled') {
      comparison.tmuxDuration = tmuxResult.value.durationMs;
      comparison.tmuxResponse = tmuxResult.value.response;
      comparison.tmuxError = tmuxResult.value.error;
    } else {
      comparison.tmuxError = tmuxResult.reason?.message || 'Unknown error';
    }

    // Extract headless data
    if (headlessResult.status === 'fulfilled') {
      comparison.headlessDuration = headlessResult.value.durationMs;
      comparison.headlessResponse = headlessResult.value.response;
      comparison.headlessError = headlessResult.value.error;
    } else {
      comparison.headlessError = headlessResult.reason?.message || 'Unknown error';
    }

    // Compare outputs if both succeeded
    if (comparison.tmuxSuccess && comparison.headlessSuccess) {
      comparison.outputMatch = this.fuzzyMatch(
        comparison.tmuxResponse,
        comparison.headlessResponse
      );
      comparison.latencyDelta = comparison.headlessDuration - comparison.tmuxDuration;
    }

    return comparison;
  }

  /**
   * Fuzzy match two outputs (normalize whitespace differences)
   *
   * @param {string} a - First output
   * @param {string} b - Second output
   * @returns {boolean} Whether outputs match
   */
  fuzzyMatch(a, b) {
    if (!a || !b) return false;

    const normalize = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    return normalize(a) === normalize(b);
  }

  /**
   * Log shadow result to database
   *
   * @param {string} ticketId - Ticket ID
   * @param {string} agentId - Agent ID
   * @param {object} comparison - Comparison data
   */
  async logShadowResult(ticketId, agentId, comparison) {
    db.prepare(`
      INSERT INTO shadow_results (
        ticket_id, agent_id,
        tmux_success, headless_success, output_match,
        latency_delta_ms, tmux_duration_ms, headless_duration_ms,
        tmux_error, headless_error,
        tmux_response, headless_response,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      ticketId,
      agentId,
      comparison.tmuxSuccess ? 1 : 0,
      comparison.headlessSuccess ? 1 : 0,
      comparison.outputMatch ? 1 : 0,
      comparison.latencyDelta || null,
      comparison.tmuxDuration || null,
      comparison.headlessDuration || null,
      comparison.tmuxError || null,
      comparison.headlessError || null,
      comparison.tmuxResponse || null,
      comparison.headlessResponse || null
    );
  }

  /**
   * Emit telemetry events for shadow mode execution
   *
   * @param {string} agentId - Agent ID
   * @param {object} comparison - Comparison data
   * @param {number} totalDuration - Total duration in ms
   */
  emitShadowTelemetry(agentId, comparison, totalDuration) {
    // Emit mismatch event if outputs don't match (for SLO tracking)
    if (comparison.tmuxSuccess && comparison.headlessSuccess && !comparison.outputMatch) {
      this.metrics.record('SHADOW_MISMATCH', agentId, {
        metadata: {
          latencyDelta: comparison.latencyDelta,
          tmuxDuration: comparison.tmuxDuration,
          headlessDuration: comparison.headlessDuration,
        },
      });
    }

    // Emit failure event if headless failed but tmux succeeded
    if (comparison.tmuxSuccess && !comparison.headlessSuccess) {
      this.metrics.record('SHADOW_HEADLESS_FAILURE', agentId, {
        metadata: {
          tmuxDuration: comparison.tmuxDuration,
          headlessError: comparison.headlessError,
        },
      });
    }

    // Emit failure event if tmux failed but headless succeeded
    if (!comparison.tmuxSuccess && comparison.headlessSuccess) {
      this.metrics.record('SHADOW_TMUX_FAILURE', agentId, {
        metadata: {
          headlessDuration: comparison.headlessDuration,
          tmuxError: comparison.tmuxError,
        },
      });
    }
  }

  /**
   * Get shadow mode metrics for a time window
   *
   * @param {number} days - Number of days to look back
   * @returns {object} Metrics summary
   */
  getShadowMetrics(days = 30) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(tmux_success) as tmux_successes,
        SUM(headless_success) as headless_successes,
        SUM(output_match) as output_matches,
        AVG(latency_delta_ms) as avg_latency_delta,
        MIN(latency_delta_ms) as min_latency_delta,
        MAX(latency_delta_ms) as max_latency_delta,
        AVG(tmux_duration_ms) as avg_tmux_duration,
        AVG(headless_duration_ms) as avg_headless_duration
      FROM shadow_results
      WHERE created_at >= ?
    `).get(cutoff);

    if (!stats.total || stats.total === 0) {
      return {
        days,
        total: 0,
        tmuxSuccessRate: 0,
        headlessSuccessRate: 0,
        outputMatchRate: 0,
        avgLatencyDelta: 0,
        minLatencyDelta: 0,
        maxLatencyDelta: 0,
        avgTmuxDuration: 0,
        avgHeadlessDuration: 0,
      };
    }

    return {
      days,
      total: stats.total,
      tmuxSuccessRate: (stats.tmux_successes / stats.total) * 100,
      headlessSuccessRate: (stats.headless_successes / stats.total) * 100,
      outputMatchRate: (stats.output_matches / stats.total) * 100,
      avgLatencyDelta: Math.round(stats.avg_latency_delta || 0),
      minLatencyDelta: Math.round(stats.min_latency_delta || 0),
      maxLatencyDelta: Math.round(stats.max_latency_delta || 0),
      avgTmuxDuration: Math.round(stats.avg_tmux_duration || 0),
      avgHeadlessDuration: Math.round(stats.avg_headless_duration || 0),
    };
  }

  /**
   * Get shadow mode failures
   *
   * @param {string} mode - 'tmux' or 'headless'
   * @param {number} limit - Max results to return
   * @returns {Array<object>} Failure records
   */
  getShadowFailures(mode = 'headless', limit = 100) {
    const column = mode === 'tmux' ? 'tmux_success' : 'headless_success';

    const failures = db.prepare(`
      SELECT * FROM shadow_results
      WHERE ${column} = 0
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    return failures;
  }

  /**
   * Get shadow mode output mismatches
   *
   * @param {number} limit - Max results to return
   * @returns {Array<object>} Mismatch records
   */
  getShadowMismatches(limit = 100) {
    const mismatches = db.prepare(`
      SELECT * FROM shadow_results
      WHERE tmux_success = 1 AND headless_success = 1 AND output_match = 0
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);

    return mismatches;
  }
}
