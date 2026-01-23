/**
 * Communication Graph Enforcement (Phase 8)
 * Enforces that agents can only communicate along defined edges
 */

export class GraphEnforcer {
  constructor(nodes = [], edges = []) {
    this.nodes = nodes;
    this.edges = edges;
    this.violationListeners = [];
  }

  /**
   * Update graph topology
   */
  updateGraph(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
  }

  /**
   * Check if a message path is valid according to the graph
   */
  isValidPath(fromAgent, toAgent) {
    // Find node IDs for agents
    const fromNode = this.nodes.find(n => n.data.name === fromAgent);
    const toNode = this.nodes.find(n => n.data.name === toAgent);

    if (!fromNode || !toNode) {
      return {
        valid: false,
        reason: `Agent not found: ${!fromNode ? fromAgent : toAgent}`
      };
    }

    // Check if there's an edge connecting these nodes (bidirectional)
    const hasEdge = this.edges.some(edge =>
      (edge.source === fromNode.id && edge.target === toNode.id) ||
      (edge.source === toNode.id && edge.target === fromNode.id)
    );

    if (!hasEdge) {
      return {
        valid: false,
        reason: `No connection exists between ${fromAgent} and ${toAgent}`
      };
    }

    return { valid: true };
  }

  /**
   * Validate a message before sending
   */
  validateMessage(fromAgent, toAgent) {
    const result = this.isValidPath(fromAgent, toAgent);

    if (!result.valid) {
      this.notifyViolation({
        from: fromAgent,
        to: toAgent,
        reason: result.reason,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Get all valid targets for an agent
   */
  getValidTargets(agent) {
    const node = this.nodes.find(n => n.data.name === agent);
    if (!node) return [];

    const targets = [];

    this.edges.forEach(edge => {
      if (edge.source === node.id) {
        const targetNode = this.nodes.find(n => n.id === edge.target);
        if (targetNode) targets.push(targetNode.data.name);
      } else if (edge.target === node.id) {
        const sourceNode = this.nodes.find(n => n.id === edge.source);
        if (sourceNode) targets.push(sourceNode.data.name);
      }
    });

    return [...new Set(targets)];
  }

  /**
   * Get communication paths (for visualization)
   */
  getAllPaths() {
    return this.edges.map(edge => {
      const sourceNode = this.nodes.find(n => n.id === edge.source);
      const targetNode = this.nodes.find(n => n.id === edge.target);

      return {
        from: sourceNode?.data.name,
        to: targetNode?.data.name,
        purpose: edge.data?.purpose,
        bidirectional: true // Our edges are bidirectional
      };
    }).filter(path => path.from && path.to);
  }

  /**
   * Check if graph has any isolated nodes (agents with no connections)
   */
  getIsolatedNodes() {
    return this.nodes.filter(node => {
      const hasConnection = this.edges.some(edge =>
        edge.source === node.id || edge.target === node.id
      );
      return !hasConnection;
    }).map(n => n.data.name);
  }

  /**
   * Suggest shortest path between two agents (for routing)
   */
  findShortestPath(fromAgent, toAgent) {
    const fromNode = this.nodes.find(n => n.data.name === fromAgent);
    const toNode = this.nodes.find(n => n.data.name === toAgent);

    if (!fromNode || !toNode) return null;

    // BFS to find shortest path
    const queue = [[fromNode.id]];
    const visited = new Set([fromNode.id]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toNode.id) {
        // Convert node IDs to agent names
        return path.map(nodeId => {
          const node = this.nodes.find(n => n.id === nodeId);
          return node?.data.name;
        });
      }

      // Find neighbors
      this.edges.forEach(edge => {
        let next = null;
        if (edge.source === current && !visited.has(edge.target)) {
          next = edge.target;
        } else if (edge.target === current && !visited.has(edge.source)) {
          next = edge.source;
        }

        if (next) {
          visited.add(next);
          queue.push([...path, next]);
        }
      });
    }

    return null; // No path found
  }

  /**
   * Listen for graph violations
   */
  onViolation(callback) {
    this.violationListeners.push(callback);
    return () => {
      this.violationListeners = this.violationListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify listeners of a violation
   */
  notifyViolation(violation) {
    this.violationListeners.forEach(callback => {
      try {
        callback(violation);
      } catch (error) {
        console.error('[GraphEnforcer] Listener error:', error);
      }
    });
  }

  /**
   * Get enforcement statistics
   */
  getStats() {
    return {
      totalNodes: this.nodes.length,
      totalEdges: this.edges.length,
      isolatedNodes: this.getIsolatedNodes().length,
      averageConnections: this.nodes.length > 0
        ? (this.edges.length * 2 / this.nodes.length).toFixed(2)
        : 0
    };
  }
}
