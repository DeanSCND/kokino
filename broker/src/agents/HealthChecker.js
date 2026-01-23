import { execSync } from 'node:child_process';

/**
 * HealthChecker - Monitor agent health and auto-recover failed agents
 *
 * Responsibilities:
 * - Periodic health checks on tmux sessions
 * - Auto-deregister dead agents
 * - Optional auto-restart for critical agents
 * - Emit health events via WebSocket (future)
 */
export class HealthChecker {
  constructor(registry, processManager) {
    this.registry = registry;
    this.processManager = processManager;
    this.intervalId = null;
    this.isRunning = false;

    // Auto-restart configuration (can be extended per agent)
    this.autoRestartEnabled = new Set(); // agentIds that should auto-restart

    console.log('[HealthChecker] Initialized');
  }

  /**
   * Start periodic health checks
   */
  start(intervalMs = 30000) {
    if (this.isRunning) {
      console.warn('[HealthChecker] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[HealthChecker] Starting health checks (every ${intervalMs}ms)`);

    // Run initial check immediately
    this.checkAll();

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.checkAll();
    }, intervalMs);
  }

  /**
   * Stop health checks
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[HealthChecker] Stopping health checks');
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Check all registered agents
   */
  async checkAll() {
    const agents = this.registry.list({ status: 'online' });

    if (agents.length === 0) {
      return;
    }

    console.log(`[HealthChecker] Checking ${agents.length} online agents...`);

    let healthy = 0;
    let unhealthy = 0;
    let restarted = 0;

    for (const agent of agents) {
      const isHealthy = await this.checkAgent(agent.agentId);

      if (isHealthy) {
        healthy++;
      } else {
        unhealthy++;

        // Auto-restart if enabled
        if (this.autoRestartEnabled.has(agent.agentId)) {
          console.log(`[HealthChecker] Auto-restarting ${agent.agentId}...`);
          const result = await this.processManager.restart(agent.agentId);
          if (result.success) {
            restarted++;
          }
        }
      }
    }

    if (unhealthy > 0) {
      console.log(`[HealthChecker] Health check complete: ${healthy} healthy, ${unhealthy} unhealthy, ${restarted} restarted`);
    }
  }

  /**
   * Check a single agent
   */
  async checkAgent(agentId) {
    const agent = this.registry.get(agentId);

    if (!agent) {
      return false;
    }

    // Get session from metadata
    const sessionName = agent.metadata?.session || `dev-${agentId}`;

    // Check if tmux session exists
    const sessionAlive = this.isSessionAlive(sessionName);

    if (!sessionAlive) {
      console.warn(`[HealthChecker] Agent ${agentId} session ${sessionName} is dead`);

      // Update registry status to offline
      this.registry.stop(agentId);

      // Optionally delete from registry entirely
      // this.registry.delete(agentId);

      return false;
    }

    // Check heartbeat freshness (optional - depends on agent sending heartbeats)
    const heartbeatAge = Date.now() - new Date(agent.lastHeartbeat).getTime();
    const heartbeatTimeout = (agent.heartbeatIntervalMs || 60000) * 3; // 3x interval

    if (heartbeatAge > heartbeatTimeout) {
      console.warn(`[HealthChecker] Agent ${agentId} heartbeat stale (${Math.floor(heartbeatAge / 1000)}s ago)`);
      // Could mark as unhealthy but session is alive, so just log for now
    }

    return true;
  }

  /**
   * Enable auto-restart for an agent
   */
  enableAutoRestart(agentId) {
    this.autoRestartEnabled.add(agentId);
    console.log(`[HealthChecker] Auto-restart enabled for ${agentId}`);
  }

  /**
   * Disable auto-restart for an agent
   */
  disableAutoRestart(agentId) {
    this.autoRestartEnabled.delete(agentId);
    console.log(`[HealthChecker] Auto-restart disabled for ${agentId}`);
  }

  /**
   * Helpers
   */

  isSessionAlive(sessionName) {
    try {
      execSync(`tmux has-session -t ${sessionName} 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
