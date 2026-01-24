/**
 * CircuitBreaker - Rate limiting and failure protection for headless execution
 *
 * Prevents cascading failures by:
 * - Opening circuit after threshold failures
 * - Auto-recovery via half-open state
 * - Telemetry emission
 * - Per-agent state tracking
 *
 * States:
 * - CLOSED: Normal operation
 * - OPEN: Too many failures, reject requests
 * - HALF_OPEN: Testing recovery, allow single request
 *
 * Related: Issue #90 - Subprocess Sandboxing & Resource Limits
 */

import { EventEmitter } from 'node:events';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

export class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeMs = options.resetTimeMs || 60000; // 1 minute default
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 1;

    // Per-agent circuit state: agentId -> { state, failures, lastFailureTime, resetTimer }
    this.circuits = new Map();

    this.metrics = getMetricsCollector();

    console.log(`[CircuitBreaker] Initialized with threshold=${this.failureThreshold}, resetTime=${this.resetTimeMs}ms`);
  }

  /**
   * Execute function with circuit breaker protection
   *
   * @param {string} agentId - Agent identifier
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Function result
   * @throws {Error} If circuit is open
   */
  async execute(agentId, fn) {
    const circuit = this.getCircuit(agentId);

    // Check circuit state
    if (circuit.state === 'OPEN') {
      const timeSinceFailure = Date.now() - circuit.lastFailureTime;

      this.metrics.record('CIRCUIT_REJECTED', agentId, {
        metadata: {
          state: circuit.state,
          failures: circuit.failures,
          timeSinceFailure
        }
      });

      throw new Error(`Circuit breaker is OPEN for ${agentId} - too many failures (${circuit.failures}/${this.failureThreshold}). Retry in ${Math.round((this.resetTimeMs - timeSinceFailure) / 1000)}s.`);
    }

    // Half-open state: only allow one attempt
    if (circuit.state === 'HALF_OPEN' && circuit.halfOpenAttempts >= this.halfOpenMaxAttempts) {
      throw new Error(`Circuit breaker is HALF_OPEN for ${agentId} - already testing recovery`);
    }

    try {
      if (circuit.state === 'HALF_OPEN') {
        circuit.halfOpenAttempts++;
      }

      const result = await fn();

      this.onSuccess(agentId);
      return result;

    } catch (error) {
      this.onFailure(agentId, error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   *
   * @param {string} agentId - Agent identifier
   */
  onSuccess(agentId) {
    const circuit = this.circuits.get(agentId);

    if (!circuit) return;

    const previousState = circuit.state;

    // Reset failures
    circuit.failures = 0;
    circuit.halfOpenAttempts = 0;

    // Transition to CLOSED
    if (circuit.state === 'HALF_OPEN') {
      console.log(`[CircuitBreaker] ${agentId}: HALF_OPEN → CLOSED (recovery successful)`);

      this.metrics.record('CIRCUIT_RECOVERED', agentId, {
        metadata: { previousState }
      });

      circuit.state = 'CLOSED';
      this.emit('circuit-closed', agentId);
    }
  }

  /**
   * Handle failed execution
   *
   * @param {string} agentId - Agent identifier
   * @param {Error} error - Execution error
   */
  onFailure(agentId, error) {
    const circuit = this.getCircuit(agentId);

    circuit.failures++;
    circuit.lastFailureTime = Date.now();

    console.log(`[CircuitBreaker] ${agentId}: Failure ${circuit.failures}/${this.failureThreshold} - ${error.message}`);

    // Check if threshold exceeded
    if (circuit.failures >= this.failureThreshold && circuit.state === 'CLOSED') {
      this.openCircuit(agentId);
    }

    // Half-open → open if attempt fails
    if (circuit.state === 'HALF_OPEN') {
      console.log(`[CircuitBreaker] ${agentId}: HALF_OPEN → OPEN (recovery failed)`);
      circuit.state = 'OPEN';
      circuit.halfOpenAttempts = 0;

      this.metrics.record('CIRCUIT_RECOVERY_FAILED', agentId, {
        metadata: { error: error.message }
      });

      // Restart reset timer
      this.scheduleReset(agentId);
    }
  }

  /**
   * Open circuit for agent
   *
   * @param {string} agentId - Agent identifier
   */
  openCircuit(agentId) {
    const circuit = this.circuits.get(agentId);

    if (!circuit) return;

    console.warn(`[CircuitBreaker] ${agentId}: CLOSED → OPEN (failures: ${circuit.failures}/${this.failureThreshold})`);

    circuit.state = 'OPEN';

    this.metrics.record('CIRCUIT_OPENED', agentId, {
      metadata: {
        failures: circuit.failures,
        threshold: this.failureThreshold
      }
    });

    this.emit('circuit-opened', agentId);

    // Schedule reset to half-open
    this.scheduleReset(agentId);
  }

  /**
   * Schedule transition from OPEN → HALF_OPEN
   *
   * @param {string} agentId - Agent identifier
   */
  scheduleReset(agentId) {
    const circuit = this.circuits.get(agentId);

    if (!circuit) return;

    // Clear existing timer
    if (circuit.resetTimer) {
      clearTimeout(circuit.resetTimer);
    }

    // Schedule half-open transition
    circuit.resetTimer = setTimeout(() => {
      console.log(`[CircuitBreaker] ${agentId}: OPEN → HALF_OPEN (testing recovery)`);

      circuit.state = 'HALF_OPEN';
      circuit.halfOpenAttempts = 0;

      this.metrics.record('CIRCUIT_HALF_OPEN', agentId, {
        metadata: { resetTimeMs: this.resetTimeMs }
      });

      this.emit('circuit-half-open', agentId);
    }, this.resetTimeMs);
  }

  /**
   * Get or create circuit state for agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {object} Circuit state
   */
  getCircuit(agentId) {
    if (!this.circuits.has(agentId)) {
      this.circuits.set(agentId, {
        state: 'CLOSED',
        failures: 0,
        lastFailureTime: null,
        resetTimer: null,
        halfOpenAttempts: 0
      });
    }

    return this.circuits.get(agentId);
  }

  /**
   * Force reset circuit for agent (emergency recovery)
   *
   * @param {string} agentId - Agent identifier
   */
  reset(agentId) {
    const circuit = this.circuits.get(agentId);

    if (!circuit) return;

    console.log(`[CircuitBreaker] ${agentId}: Manual reset to CLOSED`);

    if (circuit.resetTimer) {
      clearTimeout(circuit.resetTimer);
    }

    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.lastFailureTime = null;
    circuit.halfOpenAttempts = 0;

    this.metrics.record('CIRCUIT_RESET', agentId, {
      metadata: { manual: true }
    });

    this.emit('circuit-reset', agentId);
  }

  /**
   * Get status of all circuits
   *
   * @returns {Array<object>} Circuit status list
   */
  getStatus() {
    const now = Date.now();

    return Array.from(this.circuits.entries()).map(([agentId, circuit]) => ({
      agentId,
      state: circuit.state,
      failures: circuit.failures,
      timeSinceFailureMs: circuit.lastFailureTime ? now - circuit.lastFailureTime : null,
      halfOpenAttempts: circuit.halfOpenAttempts
    }));
  }
}
