/**
 * Loop Detection System (Phase 8)
 * Detects circular message patterns between agents to prevent infinite loops
 */

export class LoopDetector {
  constructor(options = {}) {
    this.maxPathLength = options.maxPathLength || 10; // Max messages before considering it a loop
    this.loopThreshold = options.loopThreshold || 3; // Number of times pattern must repeat
    this.windowSize = options.windowSize || 50; // Number of recent messages to analyze

    this.messageHistory = [];
    this.detectedLoops = [];
    this.listeners = [];
  }

  /**
   * Add a message to the tracking history
   */
  addMessage(from, to, timestamp = Date.now()) {
    this.messageHistory.push({ from, to, timestamp });

    // Keep only recent messages within window
    if (this.messageHistory.length > this.windowSize) {
      this.messageHistory.shift();
    }

    // Check for loops after each message
    this.detectLoops();
  }

  /**
   * Detect circular patterns in message history
   */
  detectLoops() {
    if (this.messageHistory.length < this.maxPathLength) {
      return null;
    }

    // Get recent message path
    const recentPath = this.messageHistory
      .slice(-this.maxPathLength)
      .map(m => `${m.from}→${m.to}`);

    // Look for repeating patterns
    for (let patternLength = 2; patternLength <= Math.floor(this.maxPathLength / 2); patternLength++) {
      const pattern = recentPath.slice(-patternLength);
      const patternStr = pattern.join('|');

      // Count how many times this pattern repeats in the recent path
      let repeatCount = 0;
      for (let i = recentPath.length - patternLength; i >= 0; i -= patternLength) {
        const segment = recentPath.slice(i, i + patternLength).join('|');
        if (segment === patternStr) {
          repeatCount++;
        } else {
          break;
        }
      }

      // If pattern repeats enough times, it's a loop
      if (repeatCount >= this.loopThreshold) {
        const loop = {
          pattern: pattern,
          patternString: patternStr,
          repeatCount: repeatCount,
          detectedAt: Date.now(),
          affectedAgents: this.extractAgentsFromPattern(pattern)
        };

        // Check if this is a new loop (not already detected)
        if (!this.isLoopAlreadyDetected(loop)) {
          this.detectedLoops.push(loop);
          this.notifyListeners(loop);
          return loop;
        }
      }
    }

    return null;
  }

  /**
   * Extract unique agent names from a pattern
   */
  extractAgentsFromPattern(pattern) {
    const agents = new Set();
    pattern.forEach(step => {
      const [from, to] = step.split('→');
      agents.add(from);
      agents.add(to);
    });
    return Array.from(agents);
  }

  /**
   * Check if this loop pattern was already detected recently
   */
  isLoopAlreadyDetected(newLoop) {
    const recentThreshold = 5000; // 5 seconds
    const now = Date.now();

    return this.detectedLoops.some(loop =>
      loop.patternString === newLoop.patternString &&
      (now - loop.detectedAt) < recentThreshold
    );
  }

  /**
   * Register a listener for loop detection events
   */
  onLoopDetected(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners of a detected loop
   */
  notifyListeners(loop) {
    this.listeners.forEach(callback => {
      try {
        callback(loop);
      } catch (error) {
        console.error('[LoopDetector] Listener error:', error);
      }
    });
  }

  /**
   * Get all detected loops
   */
  getDetectedLoops() {
    return [...this.detectedLoops];
  }

  /**
   * Clear loop history
   */
  reset() {
    this.messageHistory = [];
    this.detectedLoops = [];
  }

  /**
   * Get current message path visualization
   */
  getCurrentPath() {
    return this.messageHistory
      .slice(-this.maxPathLength)
      .map(m => `${m.from} → ${m.to}`)
      .join(' → ');
  }

  /**
   * Get statistics about message flow
   */
  getStats() {
    const agentCounts = {};
    this.messageHistory.forEach(({ from, to }) => {
      agentCounts[from] = (agentCounts[from] || 0) + 1;
      agentCounts[to] = (agentCounts[to] || 0) + 1;
    });

    return {
      totalMessages: this.messageHistory.length,
      uniqueAgents: new Set([
        ...this.messageHistory.map(m => m.from),
        ...this.messageHistory.map(m => m.to)
      ]).size,
      loopsDetected: this.detectedLoops.length,
      mostActiveAgent: Object.keys(agentCounts).reduce((a, b) =>
        agentCounts[a] > agentCounts[b] ? a : b, null
      ),
      agentActivity: agentCounts
    };
  }
}
