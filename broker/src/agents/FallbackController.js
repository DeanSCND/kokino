/**
 * FallbackController - Runtime fallback from headless to tmux for degraded agents/CLIs
 *
 * Allows operators to quickly disable headless mode for:
 * - Entire CLI types (e.g., all claude-code agents)
 * - Individual agents
 *
 * Triggers:
 * - Manual via API
 * - Automatic based on environment health checks
 *
 * Related: Issue #96 - Runtime Fallback Toggle
 */

import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

export class FallbackController {
  constructor() {
    // cliType -> { disabled: boolean, reason: string, since: Date }
    this.disabledCLIs = new Map();

    // agentId -> { forceTmux: boolean, reason: string, since: Date }
    this.forcedFallbacks = new Map();

    this.metrics = getMetricsCollector();

    console.log('[FallbackController] Initialized');
  }

  /**
   * Disable headless mode for entire CLI type
   *
   * @param {string} cliType - CLI type (e.g., 'claude-code')
   * @param {string} reason - Reason for disabling
   */
  disableCLI(cliType, reason) {
    this.disabledCLIs.set(cliType, {
      disabled: true,
      reason,
      since: new Date().toISOString(),
    });

    console.warn(`[FallbackController] Disabled headless for ${cliType}: ${reason}`);

    this.metrics.record('FALLBACK_CLI_DISABLED', cliType, {
      metadata: { reason }
    });
  }

  /**
   * Re-enable headless mode for CLI type
   *
   * @param {string} cliType - CLI type
   */
  enableCLI(cliType) {
    const wasDisabled = this.disabledCLIs.has(cliType);
    this.disabledCLIs.delete(cliType);

    if (wasDisabled) {
      console.log(`[FallbackController] Re-enabled headless for ${cliType}`);

      this.metrics.record('FALLBACK_CLI_ENABLED', cliType, {});
    }
  }

  /**
   * Force specific agent to use tmux
   *
   * @param {string} agentId - Agent ID
   * @param {string} reason - Reason for forcing fallback
   */
  forceAgentFallback(agentId, reason) {
    this.forcedFallbacks.set(agentId, {
      forceTmux: true,
      reason,
      since: new Date().toISOString(),
    });

    console.warn(`[FallbackController] Forced ${agentId} to tmux: ${reason}`);

    this.metrics.record('FALLBACK_AGENT_FORCED', agentId, {
      metadata: { reason }
    });
  }

  /**
   * Allow agent to use headless again
   *
   * @param {string} agentId - Agent ID
   */
  clearAgentFallback(agentId) {
    const wasForced = this.forcedFallbacks.has(agentId);
    this.forcedFallbacks.delete(agentId);

    if (wasForced) {
      console.log(`[FallbackController] Cleared fallback for ${agentId}`);

      this.metrics.record('FALLBACK_AGENT_CLEARED', agentId, {});
    }
  }

  /**
   * Check if agent should use tmux instead of headless
   *
   * @param {object} agent - Agent object with agentId, type, commMode
   * @returns {object} { useTmux: boolean, reason: string }
   */
  shouldUseTmux(agent) {
    if (!agent) {
      return { useTmux: true, reason: 'Agent not found' };
    }

    // Check agent-specific override
    if (this.forcedFallbacks.has(agent.agentId)) {
      const info = this.forcedFallbacks.get(agent.agentId);
      return { useTmux: true, reason: `Agent fallback: ${info.reason}` };
    }

    // Check CLI-type disable
    if (this.disabledCLIs.has(agent.type)) {
      const info = this.disabledCLIs.get(agent.type);
      return { useTmux: true, reason: `CLI disabled: ${info.reason}` };
    }

    // Use configured commMode
    const commMode = agent.commMode || agent.metadata?.commMode || 'tmux';
    return {
      useTmux: commMode === 'tmux',
      reason: `Configured comm_mode: ${commMode}`
    };
  }

  /**
   * Get status of all fallbacks
   *
   * @returns {object} Current fallback state
   */
  getStatus() {
    return {
      disabledCLIs: Array.from(this.disabledCLIs.entries()).map(([cli, info]) => ({
        cli,
        disabled: info.disabled,
        reason: info.reason,
        since: info.since,
      })),
      forcedFallbacks: Array.from(this.forcedFallbacks.entries()).map(([agentId, info]) => ({
        agentId,
        forceTmux: info.forceTmux,
        reason: info.reason,
        since: info.since,
      })),
    };
  }

  /**
   * Clear all fallbacks (emergency recovery)
   */
  clearAll() {
    const cliCount = this.disabledCLIs.size;
    const agentCount = this.forcedFallbacks.size;

    this.disabledCLIs.clear();
    this.forcedFallbacks.clear();

    console.log(`[FallbackController] Cleared all fallbacks (${cliCount} CLIs, ${agentCount} agents)`);

    this.metrics.record('FALLBACK_CLEARED_ALL', 'system', {
      metadata: { cliCount, agentCount }
    });
  }
}
