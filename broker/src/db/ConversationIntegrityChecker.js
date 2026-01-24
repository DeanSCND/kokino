/**
 * ConversationIntegrityChecker - Validates conversation data consistency
 *
 * Detects and reports:
 * - Orphaned turns (conversation deleted but turns remain)
 * - Invalid turn sequences (duplicate roles, missing user turns)
 * - Out-of-order timestamps
 * - Referential integrity violations
 *
 * Related: Issue #92 - Conversation Store Integrity Checks
 */

import db from './schema.js';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

export class ConversationIntegrityChecker {
  constructor() {
    this.metrics = getMetricsCollector();
    console.log('[IntegrityChecker] Initialized');
  }

  /**
   * Check for orphaned turns (turns without parent conversation)
   *
   * NOTE: This should never happen with ON DELETE CASCADE, but we check anyway
   *
   * @returns {Array<object>} Orphaned turn records
   */
  checkOrphans() {
    const orphans = db.prepare(`
      SELECT turn_id, conversation_id, role, created_at
      FROM turns
      WHERE conversation_id NOT IN (SELECT conversation_id FROM conversations)
    `).all();

    if (orphans.length > 0) {
      console.warn(`[IntegrityChecker] Found ${orphans.length} orphaned turns`);

      this.metrics.record('INTEGRITY_ORPHANS', 'system', {
        metadata: { count: orphans.length }
      });
    }

    return orphans;
  }

  /**
   * Check turn sequence for a conversation
   *
   * Validates:
   * - User/assistant alternation (no consecutive same roles)
   * - Timestamp ordering (monotonic increase)
   * - First turn is user (optional)
   *
   * @param {string} conversationId - Conversation to check
   * @returns {object} Validation result { valid, issues[] }
   */
  checkTurnSequence(conversationId) {
    const turns = db.prepare(`
      SELECT turn_id, role, created_at
      FROM turns
      WHERE conversation_id = ?
      ORDER BY turn_id ASC
    `).all(conversationId);

    const issues = [];

    for (let i = 0; i < turns.length; i++) {
      const current = turns[i];
      const previous = turns[i - 1];

      // Check role alternation (user → assistant → user → ...)
      if (i > 0 && current.role === previous.role) {
        issues.push({
          type: 'duplicate_role',
          turnId: current.turn_id,
          index: i,
          role: current.role,
          message: `Consecutive ${current.role} turns at index ${i-1} and ${i}`
        });
      }

      // Check timestamp ordering
      if (i > 0 && current.created_at < previous.created_at) {
        issues.push({
          type: 'out_of_order_timestamp',
          turnId: current.turn_id,
          index: i,
          message: `Turn ${i} timestamp (${current.created_at}) before turn ${i-1} timestamp (${previous.created_at})`
        });
      }
    }

    // Optional: Check first turn is user
    if (turns.length > 0 && turns[0].role !== 'user') {
      issues.push({
        type: 'first_turn_not_user',
        turnId: turns[0].turn_id,
        role: turns[0].role,
        message: `First turn has role '${turns[0].role}' instead of 'user'`
      });
    }

    if (issues.length > 0) {
      console.warn(`[IntegrityChecker] Conversation ${conversationId} has ${issues.length} issues`);

      this.metrics.record('INTEGRITY_SEQUENCE_ISSUES', conversationId, {
        metadata: {
          conversationId,
          issueCount: issues.length,
          issueTypes: [...new Set(issues.map(i => i.type))]
        }
      });
    }

    return {
      conversationId,
      valid: issues.length === 0,
      turnCount: turns.length,
      issues
    };
  }

  /**
   * Run full integrity check across all conversations
   *
   * @returns {object} Integrity report
   */
  runFullCheck() {
    const startTime = Date.now();

    console.log('[IntegrityChecker] Running full integrity check...');

    // Check for orphaned turns
    const orphans = this.checkOrphans();

    // Get all conversations
    const conversations = db.prepare('SELECT conversation_id, agent_id FROM conversations').all();

    const results = {
      timestamp: new Date().toISOString(),
      durationMs: 0,
      orphanedTurns: orphans.length,
      orphanDetails: orphans,
      totalConversations: conversations.length,
      conversationsWithIssues: 0,
      conversations: []
    };

    // Check each conversation
    for (const conv of conversations) {
      const check = this.checkTurnSequence(conv.conversation_id);

      if (!check.valid) {
        results.conversationsWithIssues++;
        results.conversations.push({
          conversationId: conv.conversation_id,
          agentId: conv.agent_id,
          turnCount: check.turnCount,
          issues: check.issues
        });
      }
    }

    results.durationMs = Date.now() - startTime;

    // Emit summary telemetry
    const hasIssues = results.orphanedTurns > 0 || results.conversationsWithIssues > 0;

    this.metrics.record(hasIssues ? 'INTEGRITY_CHECK_FAILED' : 'INTEGRITY_CHECK_PASSED', 'system', {
      durationMs: results.durationMs,
      metadata: {
        orphanedTurns: results.orphanedTurns,
        conversationsWithIssues: results.conversationsWithIssues,
        totalConversations: results.totalConversations
      }
    });

    if (hasIssues) {
      console.error(`[IntegrityChecker] ✗ Integrity check FAILED: ${results.orphanedTurns} orphans, ${results.conversationsWithIssues}/${results.totalConversations} conversations with issues`);
    } else {
      console.log(`[IntegrityChecker] ✓ Integrity check PASSED: ${results.totalConversations} conversations OK`);
    }

    return results;
  }

  /**
   * Clean up orphaned turns (if any exist)
   *
   * @returns {number} Number of orphaned turns deleted
   */
  cleanupOrphans() {
    const result = db.prepare(`
      DELETE FROM turns
      WHERE conversation_id NOT IN (SELECT conversation_id FROM conversations)
    `).run();

    if (result.changes > 0) {
      console.log(`[IntegrityChecker] Cleaned up ${result.changes} orphaned turns`);

      this.metrics.record('INTEGRITY_ORPHANS_CLEANED', 'system', {
        metadata: { count: result.changes }
      });
    }

    return result.changes;
  }

  /**
   * Get statistics about conversation store
   *
   * @returns {object} Statistics
   */
  getStats() {
    const stats = {
      totalConversations: 0,
      totalTurns: 0,
      conversationsByAgent: {},
      turnsByRole: { user: 0, assistant: 0, system: 0 },
      averageTurnsPerConversation: 0
    };

    // Total conversations
    const convCount = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
    stats.totalConversations = convCount.count;

    // Total turns
    const turnCount = db.prepare('SELECT COUNT(*) as count FROM turns').get();
    stats.totalTurns = turnCount.count;

    // Conversations by agent
    const byAgent = db.prepare(`
      SELECT agent_id, COUNT(*) as count
      FROM conversations
      GROUP BY agent_id
    `).all();

    for (const row of byAgent) {
      stats.conversationsByAgent[row.agent_id] = row.count;
    }

    // Turns by role
    const byRole = db.prepare(`
      SELECT role, COUNT(*) as count
      FROM turns
      GROUP BY role
    `).all();

    for (const row of byRole) {
      stats.turnsByRole[row.role] = row.count;
    }

    // Average turns per conversation
    stats.averageTurnsPerConversation = stats.totalConversations > 0
      ? (stats.totalTurns / stats.totalConversations).toFixed(2)
      : 0;

    return stats;
  }
}
