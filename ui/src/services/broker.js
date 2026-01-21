// Broker API client for Kokino UI
// Store & Forward pattern: All broker calls return immediately

const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';

class BrokerClient {
  constructor(baseUrl = BROKER_URL) {
    this.baseUrl = baseUrl;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok && response.status !== 202 && response.status !== 204) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // Agent Management

  async registerAgent(agentId, { type, metadata = {}, heartbeatIntervalMs = 30000 }) {
    return this.request('/agents/register', {
      method: 'POST',
      body: JSON.stringify({ agentId, type, metadata, heartbeatIntervalMs })
    });
  }

  async listAgents(filters = {}) {
    const params = new URLSearchParams(filters);
    return this.request(`/agents?${params}`);
  }

  async deleteAgent(agentId) {
    return this.request(`/agents/${agentId}`, { method: 'DELETE' });
  }

  async heartbeat(agentId) {
    return this.request(`/agents/${agentId}/heartbeat`, { method: 'POST' });
  }

  // Messaging (Store & Forward)

  async sendMessage(agentId, { payload, metadata = {}, expectReply = true, timeoutMs = 30000 }) {
    return this.request(`/agents/${agentId}/send`, {
      method: 'POST',
      body: JSON.stringify({ payload, metadata, expectReply, timeoutMs })
    });
  }

  async postReply(ticketId, payload, metadata = {}) {
    return this.request('/replies', {
      method: 'POST',
      body: JSON.stringify({ ticketId, payload, metadata })
    });
  }

  async getReply(ticketId) {
    return this.request(`/replies/${ticketId}`);
  }

  async waitForReply(ticketId) {
    return this.request(`/replies/${ticketId}/wait`);
  }

  async getPendingTickets(agentId) {
    return this.request(`/agents/${agentId}/tickets/pending`);
  }

  // System

  async health() {
    return this.request('/health');
  }

  // WebSocket connection for terminal (Phase 6)
  connectTerminal(agentId) {
    const wsUrl = `ws://127.0.0.1:5050/ws/terminal/${agentId}`;
    return new WebSocket(wsUrl);
  }
}

export const broker = new BrokerClient();
export default broker;
