/**
 * Escalation Tracking System (Phase 8)
 * Tracks agent issues and triggers escalation indicators
 */

export class EscalationTracker {
  constructor() {
    this.escalations = new Map(); // agentId -> escalation
    this.listeners = [];
    this.messageTimeouts = new Map(); // agentId -> timeout tracker
    this.blockThreshold = 5000; // 5 seconds without response = blocked
  }

  /**
   * Track a message sent to an agent
   */
  trackMessageSent(toAgent, fromAgent, timestamp = Date.now()) {
    // Clear any existing timeout for this agent
    if (this.messageTimeouts.has(toAgent)) {
      clearTimeout(this.messageTimeouts.get(toAgent).timeoutId);
    }

    // Set new timeout to detect blocked state
    const timeoutId = setTimeout(() => {
      this.escalate(toAgent, 'blocked', `Waiting for response from ${fromAgent}`, fromAgent);
    }, this.blockThreshold);

    this.messageTimeouts.set(toAgent, {
      timeoutId,
      from: fromAgent,
      timestamp
    });
  }

  /**
   * Track a message received by an agent (clears blocked state)
   */
  trackMessageReceived(agent) {
    // Clear timeout - agent is responsive
    if (this.messageTimeouts.has(agent)) {
      clearTimeout(this.messageTimeouts.get(agent).timeoutId);
      this.messageTimeouts.delete(agent);
    }

    // Clear any blocked escalation for this agent
    if (this.escalations.has(agent) && this.escalations.get(agent).type === 'blocked') {
      this.clearEscalation(agent);
    }
  }

  /**
   * Mark an agent as having an error
   */
  reportError(agent, reason) {
    this.escalate(agent, 'error', reason);
  }

  /**
   * Mark an agent as needing help
   */
  requestHelp(agent, reason) {
    this.escalate(agent, 'needsHelp', reason);
  }

  /**
   * Mark a message as urgent
   */
  markUrgent(agent, reason) {
    this.escalate(agent, 'urgent', reason);
  }

  /**
   * Create or update an escalation
   */
  escalate(agent, type, reason, relatedAgent = null) {
    const escalation = {
      type,
      reason,
      timestamp: Date.now(),
      relatedAgent
    };

    this.escalations.set(agent, escalation);
    this.notifyListeners(agent, escalation);

    return escalation;
  }

  /**
   * Clear an escalation for an agent
   */
  clearEscalation(agent) {
    if (this.escalations.has(agent)) {
      this.escalations.delete(agent);
      this.notifyListeners(agent, null);
    }

    // Clear any pending timeout
    if (this.messageTimeouts.has(agent)) {
      clearTimeout(this.messageTimeouts.get(agent).timeoutId);
      this.messageTimeouts.delete(agent);
    }
  }

  /**
   * Get escalation for an agent
   */
  getEscalation(agent) {
    return this.escalations.get(agent) || null;
  }

  /**
   * Get all escalations
   */
  getAllEscalations() {
    return Object.fromEntries(this.escalations);
  }

  /**
   * Listen for escalation changes
   */
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify listeners of changes
   */
  notifyListeners(agent, escalation) {
    this.listeners.forEach(callback => {
      try {
        callback(agent, escalation);
      } catch (error) {
        console.error('[EscalationTracker] Listener error:', error);
      }
    });
  }

  /**
   * Get escalation statistics
   */
  getStats() {
    const stats = {
      total: this.escalations.size,
      byType: {
        blocked: 0,
        urgent: 0,
        error: 0,
        needsHelp: 0
      }
    };

    this.escalations.forEach((escalation) => {
      stats.byType[escalation.type]++;
    });

    return stats;
  }

  /**
   * Clear all escalations
   */
  reset() {
    // Clear all timeouts
    this.messageTimeouts.forEach(({ timeoutId }) => {
      clearTimeout(timeoutId);
    });

    this.messageTimeouts.clear();
    this.escalations.clear();
    this.notifyListeners(null, null); // Notify global reset
  }
}
