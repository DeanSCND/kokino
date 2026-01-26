/**
 * CompactionMonitor - Detect Claude Code conversation degradation
 * Phase 3: Bootstrap System
 *
 * Monitors agent conversation health to detect when compaction
 * (context window issues) requires an agent restart.
 *
 * Thresholds:
 * - Warning: 50 conversation turns
 * - Critical: 100 conversation turns
 */

import db from '../db/schema.js';

export class CompactionMonitor {
  constructor() {
    this.thresholds = {
      turns: {
        warning: 50,
        critical: 100
      },
      tokens: {
        warning: 100000,
        critical: 200000
      },
      errorRate: {
        warning: 0.2,   // 20% error rate
        critical: 0.4   // 40% error rate
      }
    };
  }

  /**
   * Track a conversation turn for an agent
   * @param {string} agentId - Agent ID
   * @param {object} metadata - Optional metadata (tokens, errors, etc.)
   * @returns {object} Compaction status
   */
  async trackTurn(agentId, metadata = {}) {
    const now = new Date().toISOString();

    // Get current metrics
    const current = db.prepare(`
      SELECT * FROM compaction_metrics
      WHERE agent_id = ?
      ORDER BY measured_at DESC
      LIMIT 1
    `).get(agentId);

    const turns = (current?.conversation_turns || 0) + 1;
    const totalTokens = (current?.total_tokens || 0) + (metadata.tokens || 0);
    const errorCount = (current?.error_count || 0) + (metadata.error ? 1 : 0);

    // Insert or replace metrics (handle duplicate timestamps)
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO compaction_metrics
      (agent_id, conversation_turns, total_tokens, error_count,
       confusion_count, avg_response_time, measured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agentId,
      turns,
      totalTokens,
      errorCount,
      metadata.confusionCount || 0,
      metadata.responseTime || null,
      now
    );

    // Check for compaction
    return this.checkCompaction(agentId, turns, totalTokens, errorCount);
  }

  /**
   * Check if agent is experiencing compaction
   * @param {string} agentId - Agent ID
   * @param {number} turns - Conversation turn count
   * @param {number} totalTokens - Total tokens used
   * @param {number} errorCount - Error count
   * @returns {object} Compaction status
   */
  checkCompaction(agentId, turns, totalTokens = 0, errorCount = 0) {
    const reasons = [];
    let severity = 'normal';

    // Check turn count
    if (turns >= this.thresholds.turns.critical) {
      severity = 'critical';
      reasons.push(`Conversation has ${turns} turns (critical threshold: ${this.thresholds.turns.critical})`);
    } else if (turns >= this.thresholds.turns.warning) {
      severity = severity === 'normal' ? 'warning' : severity;
      reasons.push(`Conversation has ${turns} turns (warning threshold: ${this.thresholds.turns.warning})`);
    }

    // Check token count
    if (totalTokens >= this.thresholds.tokens.critical) {
      severity = 'critical';
      reasons.push(`Total tokens: ${totalTokens} (critical threshold: ${this.thresholds.tokens.critical})`);
    } else if (totalTokens >= this.thresholds.tokens.warning) {
      severity = severity === 'normal' ? 'warning' : severity;
      reasons.push(`Total tokens: ${totalTokens} (warning threshold: ${this.thresholds.tokens.warning})`);
    }

    // Check error rate
    if (turns > 10) { // Only check error rate after 10 turns
      const errorRate = errorCount / turns;
      if (errorRate >= this.thresholds.errorRate.critical) {
        severity = 'critical';
        reasons.push(`Error rate: ${(errorRate * 100).toFixed(1)}% (critical threshold: ${this.thresholds.errorRate.critical * 100}%)`);
      } else if (errorRate >= this.thresholds.errorRate.warning) {
        severity = severity === 'normal' ? 'warning' : severity;
        reasons.push(`Error rate: ${(errorRate * 100).toFixed(1)}% (warning threshold: ${this.thresholds.errorRate.warning * 100}%)`);
      }
    }

    return {
      agentId,
      isCompacted: severity !== 'normal',
      severity,
      recommendation: this.getRecommendation(severity),
      reasons: reasons.length > 0 ? reasons : ['Agent operating normally'],
      metrics: {
        conversationTurns: turns,
        totalTokens,
        errorCount
      }
    };
  }

  /**
   * Get recommendation based on severity
   */
  getRecommendation(severity) {
    switch (severity) {
      case 'critical':
        return 'Restart agent immediately - context degradation detected';
      case 'warning':
        return 'Consider restarting agent soon to maintain performance';
      default:
        return 'Agent operating normally';
    }
  }

  /**
   * Get current compaction status for an agent
   * @param {string} agentId - Agent ID
   * @returns {object} Current status
   */
  async getStatus(agentId) {
    const metrics = db.prepare(`
      SELECT * FROM compaction_metrics
      WHERE agent_id = ?
      ORDER BY measured_at DESC
      LIMIT 1
    `).get(agentId);

    if (!metrics) {
      return {
        agentId,
        conversationTurns: 0,
        totalTokens: 0,
        errorCount: 0,
        compactionStatus: {
          isCompacted: false,
          severity: 'normal',
          recommendation: 'Agent operating normally',
          reasons: ['No metrics available - agent just started']
        }
      };
    }

    const compactionStatus = this.checkCompaction(
      agentId,
      metrics.conversation_turns,
      metrics.total_tokens,
      metrics.error_count
    );

    return {
      agentId,
      conversationTurns: metrics.conversation_turns,
      totalTokens: metrics.total_tokens || 0,
      errorCount: metrics.error_count || 0,
      avgResponseTime: metrics.avg_response_time,
      lastMeasured: metrics.measured_at,
      compactionStatus
    };
  }

  /**
   * Reset metrics for an agent (after restart)
   * @param {string} agentId - Agent ID
   */
  async resetMetrics(agentId) {
    const stmt = db.prepare('DELETE FROM compaction_metrics WHERE agent_id = ?');
    stmt.run(agentId);
  }

  /**
   * Get metrics history for an agent
   * @param {string} agentId - Agent ID
   * @param {number} limit - Number of records to return
   * @returns {Array} Metrics history
   */
  async getHistory(agentId, limit = 20) {
    const metrics = db.prepare(`
      SELECT * FROM compaction_metrics
      WHERE agent_id = ?
      ORDER BY measured_at DESC
      LIMIT ?
    `).all(agentId, limit);

    return metrics.map(m => ({
      conversationTurns: m.conversation_turns,
      totalTokens: m.total_tokens,
      errorCount: m.error_count,
      avgResponseTime: m.avg_response_time,
      measuredAt: m.measured_at
    }));
  }
}

export default CompactionMonitor;
