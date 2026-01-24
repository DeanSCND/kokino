/**
 * AgentSessionManager - Manages headless agent session lifecycle and execution serialization
 *
 * Prevents concurrent execution bugs by:
 * - Serializing executions per agent (one at a time)
 * - Tracking session state (--session-id vs --resume)
 * - Providing cancellation/cleanup
 * - Auto-cleaning stale sessions
 *
 * Related: Issue #89 - Session Manager with Locks & Cancellation
 */

import { EventEmitter } from 'node:events';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

export class AgentSessionManager extends EventEmitter {
  constructor() {
    super();

    // agentId -> { sessionId, hasSession, lock, activeExecution, executionQueue }
    this.sessions = new Map();

    // agentId -> ChildProcess (currently running CLI process)
    this.activeProcesses = new Map();

    // Telemetry
    this.metrics = getMetricsCollector();

    console.log('[SessionManager] Initialized');
  }

  /**
   * Acquire lock for agent execution (blocks if agent busy)
   *
   * @param {string} agentId - Agent identifier
   * @param {number} timeoutMs - Max wait time for lock (default: 5 minutes)
   * @returns {Promise<object>} Session info { sessionId, hasSession }
   */
  async acquireLock(agentId, timeoutMs = 300000) {
    let session = this.sessions.get(agentId);

    if (!session) {
      // First execution for this agent - create session state
      session = {
        sessionId: agentId,
        hasSession: false,
        lock: false,
        activeExecution: null,
        executionQueue: []
      };
      this.sessions.set(agentId, session);

      // Emit SESSION_CREATED event
      this.metrics.record('SESSION_CREATED', agentId, {
        metadata: { sessionId: session.sessionId }
      });
    }

    const startTime = Date.now();

    // Wait for lock to be released (polling with exponential backoff)
    let pollInterval = 100; // Start at 100ms
    while (session.lock) {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeoutMs) {
        // Emit LOCK_TIMEOUT event
        this.metrics.record('LOCK_TIMEOUT', agentId, {
          durationMs: elapsed,
          success: false,
          metadata: { timeoutMs }
        });

        throw new Error(`Lock timeout for agent ${agentId} after ${elapsed}ms (waited ${Math.round(elapsed/1000)}s)`);
      }

      // Exponential backoff: 100ms -> 200ms -> 400ms -> 800ms -> 1s (max)
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval * 2, 1000);
    }

    // Acquire lock
    session.lock = true;
    session.activeExecution = {
      startedAt: Date.now(),
      timeoutMs
    };

    const waitDuration = Date.now() - startTime;

    // Emit LOCK_ACQUIRED event
    this.metrics.record('LOCK_ACQUIRED', agentId, {
      durationMs: waitDuration,
      success: true,
      metadata: {
        sessionId: session.sessionId,
        hasSession: session.hasSession,
        waitedMs: waitDuration
      }
    });

    console.log(`[SessionManager] Lock acquired for ${agentId} (waited ${waitDuration}ms)`);

    return session;
  }

  /**
   * Release lock after execution completes
   *
   * @param {string} agentId - Agent identifier
   */
  releaseLock(agentId) {
    const session = this.sessions.get(agentId);

    if (session) {
      const executionDuration = session.activeExecution
        ? Date.now() - session.activeExecution.startedAt
        : 0;

      session.lock = false;
      session.activeExecution = null;

      console.log(`[SessionManager] Lock released for ${agentId} (held for ${executionDuration}ms)`);

      this.emit('lock-released', agentId);

      // Process queued executions (future enhancement for #89)
      // Currently TicketStore handles retries with setTimeout
    }
  }

  /**
   * Mark session as initialized (switch from --session-id to --resume)
   *
   * @param {string} agentId - Agent identifier
   * @param {string} sessionId - CLI session identifier
   */
  markSessionInitialized(agentId, sessionId) {
    const session = this.sessions.get(agentId);

    if (session && !session.hasSession) {
      session.hasSession = true;
      session.sessionId = sessionId;

      console.log(`[SessionManager] Session initialized for ${agentId}: ${sessionId}`);

      // Emit SESSION_RESUMED event (first real session after --session-id)
      this.metrics.record('SESSION_RESUMED', agentId, {
        metadata: { sessionId }
      });
    }
  }

  /**
   * Get session info for building CLI args
   *
   * @param {string} agentId - Agent identifier
   * @returns {object|null} Session state or null
   */
  getSessionInfo(agentId) {
    return this.sessions.get(agentId);
  }

  /**
   * Cancel running execution for agent
   *
   * @param {string} agentId - Agent identifier
   */
  async cancelExecution(agentId) {
    const process = this.activeProcesses.get(agentId);

    if (!process) {
      console.log(`[SessionManager] No active execution to cancel for ${agentId}`);
      return;
    }

    console.log(`[SessionManager] Cancelling execution for ${agentId} (PID: ${process.pid})`);

    // Send SIGTERM, then SIGKILL after grace period
    process.kill('SIGTERM');

    await new Promise(resolve => setTimeout(resolve, 5000)); // 5s grace period

    if (!process.killed) {
      console.warn(`[SessionManager] Force killing ${agentId} (PID: ${process.pid})`);
      process.kill('SIGKILL');
    }

    this.activeProcesses.delete(agentId);
    this.releaseLock(agentId);

    // Emit EXECUTION_CANCELLED event
    this.metrics.record('EXECUTION_CANCELLED', agentId, {
      metadata: { pid: process.pid }
    });

    this.emit('execution-cancelled', agentId);
  }

  /**
   * Track active CLI process for cancellation
   *
   * @param {string} agentId - Agent identifier
   * @param {ChildProcess} process - Spawned CLI process
   */
  registerProcess(agentId, process) {
    this.activeProcesses.set(agentId, process);

    // Auto-cleanup on exit
    process.on('close', () => {
      this.activeProcesses.delete(agentId);
    });

    console.log(`[SessionManager] Registered process for ${agentId} (PID: ${process.pid})`);
  }

  /**
   * End session and cleanup state
   *
   * @param {string} agentId - Agent identifier
   */
  async endSession(agentId) {
    const session = this.sessions.get(agentId);

    if (!session) {
      console.log(`[SessionManager] No session to end for ${agentId}`);
      return;
    }

    // Cancel any running execution
    await this.cancelExecution(agentId);

    // Delete session state
    this.sessions.delete(agentId);

    // Emit SESSION_ENDED event
    this.metrics.record('SESSION_ENDED', agentId, {
      metadata: {
        sessionId: session.sessionId,
        hadSession: session.hasSession
      }
    });

    console.log(`[SessionManager] Session ended for ${agentId}`);
    this.emit('session-ended', agentId);
  }

  /**
   * Cleanup stale sessions (no activity for X time)
   *
   * @param {number} maxAgeMs - Max age in milliseconds (default: 24 hours)
   */
  cleanupStaleSessions(maxAgeMs = 86400000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [agentId, session] of this.sessions.entries()) {
      if (session.activeExecution) {
        const age = now - session.activeExecution.startedAt;

        if (age > maxAgeMs) {
          console.warn(`[SessionManager] Cleaning up stale session for ${agentId} (age: ${Math.round(age/1000)}s)`);

          // Force end stale session
          this.endSession(agentId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[SessionManager] Cleaned up ${cleanedCount} stale sessions`);
    }
  }

  /**
   * Get status of all sessions (for /agents/sessions/status endpoint)
   *
   * @returns {Array<object>} Session status list
   */
  getStatus() {
    return Array.from(this.sessions.entries()).map(([agentId, session]) => ({
      agentId,
      sessionId: session.sessionId,
      hasSession: session.hasSession,
      locked: session.lock,
      executing: !!session.activeExecution,
      executionStartedAt: session.activeExecution?.startedAt || null,
      queueLength: session.executionQueue.length
    }));
  }
}
