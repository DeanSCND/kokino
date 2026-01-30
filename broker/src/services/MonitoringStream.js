/**
 * MonitoringStream Service
 * Real-time event broadcasting to WebSocket clients
 *
 * Provides a centralized event stream for all agent activity:
 * - Message creation (cross-agent communication)
 * - Conversation turns (agent chat sessions)
 * - Agent status changes
 *
 * Supports client-side filtering to reduce bandwidth.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';

export class MonitoringStream extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // clientId -> { ws, filters }
    this.heartbeatInterval = null;

    console.log('[MonitoringStream] Initialized');
  }

  /**
   * Start heartbeat interval
   */
  start() {
    if (this.heartbeatInterval) {
      return; // Already started
    }

    // Send heartbeat pings every 30 seconds to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, 30000);

    console.log('[MonitoringStream] Heartbeat started (30s interval)');
  }

  /**
   * Stop heartbeat interval
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[MonitoringStream] Heartbeat stopped');
    }
  }

  /**
   * Add a new WebSocket client
   * @param {WebSocket} ws - WebSocket connection
   * @param {string} clientId - Unique client identifier
   */
  addClient(ws, clientId) {
    this.clients.set(clientId, {
      ws,
      filters: {
        agents: null,    // null = all agents
        types: null      // null = all types
      }
    });

    // Send connection confirmation
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    console.log(`[MonitoringStream] Client ${clientId} connected (${this.clients.size} total)`);

    // Emit event for monitoring
    this.emit('client-connected', { clientId, totalClients: this.clients.size });
  }

  /**
   * Remove a WebSocket client
   * @param {string} clientId - Client identifier
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      console.log(`[MonitoringStream] Client ${clientId} disconnected (${this.clients.size} remaining)`);

      // Emit event for monitoring
      this.emit('client-disconnected', { clientId, totalClients: this.clients.size });
    }
  }

  /**
   * Update client filters
   * @param {string} clientId - Client identifier
   * @param {object} filterUpdate - Filter configuration
   */
  updateFilters(clientId, filterUpdate) {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`[MonitoringStream] Cannot update filters for unknown client ${clientId}`);
      return;
    }

    // Merge filter updates
    if (filterUpdate.agents !== undefined) {
      client.filters.agents = Array.isArray(filterUpdate.agents) ? filterUpdate.agents : null;
    }

    if (filterUpdate.types !== undefined) {
      client.filters.types = Array.isArray(filterUpdate.types) ? filterUpdate.types : null;
    }

    console.log(`[MonitoringStream] Client ${clientId} filters updated:`, client.filters);

    // Send confirmation
    this.sendToClient(clientId, {
      type: 'filter-updated',
      filters: client.filters,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast an event to all connected clients
   * Applies client-specific filters before sending
   *
   * @param {string} eventType - Event type (e.g., 'message.sent', 'conversation.turn')
   * @param {object} data - Event payload
   */
  broadcast(eventType, data) {
    const event = {
      type: eventType,
      data,
      timestamp: Date.now()
    };

    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      if (this.matchesFilter(client.filters, eventType, data)) {
        this.sendToClient(clientId, event);
        sentCount++;
      }
    });

    // Emit for monitoring (useful for debugging)
    if (sentCount > 0) {
      this.emit('broadcast', { eventType, sentCount, totalClients: this.clients.size });
    }
  }

  /**
   * Check if an event matches client filters
   * @param {object} filters - Client filter configuration
   * @param {string} eventType - Event type
   * @param {object} data - Event data
   * @returns {boolean} True if event should be sent to client
   */
  matchesFilter(filters, eventType, data) {
    // Check type filter
    if (filters.types && filters.types.length > 0) {
      // Extract base type (e.g., 'message.sent' -> 'message')
      const baseType = eventType.split('.')[0];
      if (!filters.types.includes(baseType) && !filters.types.includes(eventType)) {
        return false;
      }
    }

    // Check agent filter
    if (filters.agents && filters.agents.length > 0) {
      const agentId = data.agentId || data.fromAgent || data.toAgent;
      const targetAgentId = data.targetAgentId || data.toAgent;

      // Match if event involves any of the filtered agents
      const matchesAgent = filters.agents.includes(agentId) ||
                          (targetAgentId && filters.agents.includes(targetAgentId));

      if (!matchesAgent) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send a message to a specific client
   * @param {string} clientId - Client identifier
   * @param {object} message - Message to send
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    const { ws } = client;

    // Check if WebSocket is still open
    if (ws.readyState === 1) { // 1 = OPEN
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[MonitoringStream] Failed to send to client ${clientId}:`, error.message);
        // Remove dead connection
        this.removeClient(clientId);
      }
    } else {
      // Connection is closing or closed - remove client
      this.removeClient(clientId);
    }
  }

  /**
   * Send heartbeat pings to all clients
   * Removes dead connections
   */
  sendHeartbeats() {
    const now = new Date().toISOString();
    let deadClients = [];

    this.clients.forEach((client, clientId) => {
      const { ws } = client;

      if (ws.readyState === 1) { // OPEN
        try {
          // Send ping
          ws.ping();
        } catch (error) {
          console.error(`[MonitoringStream] Heartbeat failed for client ${clientId}:`, error.message);
          deadClients.push(clientId);
        }
      } else {
        // Connection not open
        deadClients.push(clientId);
      }
    });

    // Clean up dead connections
    deadClients.forEach(clientId => this.removeClient(clientId));

    if (deadClients.length > 0) {
      console.log(`[MonitoringStream] Heartbeat removed ${deadClients.length} dead connections`);
    }
  }

  /**
   * Get current client count
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get all connected client IDs
   * @returns {string[]} Array of client IDs
   */
  getClientIds() {
    return Array.from(this.clients.keys());
  }

  /**
   * Shutdown the monitoring stream
   * Closes all client connections gracefully
   */
  shutdown() {
    console.log(`[MonitoringStream] Shutting down (${this.clients.size} clients)`);

    this.stop(); // Stop heartbeat

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      const { ws } = client;
      if (ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({
            type: 'shutdown',
            message: 'Monitoring stream shutting down',
            timestamp: new Date().toISOString()
          }));
          ws.close(1000, 'Server shutdown');
        } catch (error) {
          console.error(`[MonitoringStream] Error closing client ${clientId}:`, error.message);
        }
      }
    });

    this.clients.clear();
    console.log('[MonitoringStream] Shutdown complete');
  }
}
