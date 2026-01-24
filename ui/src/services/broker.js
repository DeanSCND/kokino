// Broker API client for Kokino UI
// Store & Forward pattern: All broker calls return immediately

const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';

class BrokerClient {
  constructor(baseUrl = BROKER_URL) {
    this.baseUrl = baseUrl;
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const { retries = this.maxRetries, noRetry = false } = options;

    let lastError;
    const attemptCount = noRetry ? 1 : retries + 1;

    for (let attempt = 0; attempt < attemptCount; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          signal: options.signal || AbortSignal.timeout(options.timeout || 10000)
        });

        if (!response.ok && response.status !== 202 && response.status !== 204) {
          const error = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        if (response.status === 204) {
          return null;
        }

        return response.json();
      } catch (err) {
        lastError = err;

        // Don't retry on abort/timeout or if this is the last attempt
        if (err.name === 'AbortError' || err.name === 'TimeoutError' || attempt === attemptCount - 1) {
          break;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = this.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Enhance error message with connection context
    if (lastError.name === 'TypeError' || lastError.message.includes('fetch')) {
      throw new Error('Broker unreachable - check if broker is running');
    }
    if (lastError.name === 'AbortError' || lastError.name === 'TimeoutError') {
      throw new Error('Request timeout - broker may be overloaded');
    }
    throw lastError;
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

  // Lifecycle

  async startAgent(agentId) {
    return this.request(`/agents/${agentId}/start`, { method: 'POST' });
  }

  async stopAgent(agentId) {
    return this.request(`/agents/${agentId}/stop`, { method: 'POST' });
  }

  async restartAgent(agentId) {
    return this.request(`/agents/${agentId}/restart`, { method: 'POST' });
  }

  async killTmuxSession(agentId) {
    return this.request(`/agents/${agentId}/kill-tmux`, { method: 'POST' });
  }

  // Headless Execution

  async executeTask(agentId, { prompt, timeoutMs, metadata }) {
    return this.request(`/agents/${agentId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ prompt, timeoutMs, metadata }),
      timeout: timeoutMs + 5000  // Add 5s buffer to HTTP timeout
    });
  }

  async cancelExecution(agentId) {
    return this.request(`/agents/${agentId}/execute/cancel`, { method: 'POST' });
  }

  async endSession(agentId) {
    return this.request(`/agents/${agentId}/end-session`, { method: 'POST' });
  }

  async getSessionStatus() {
    return this.request('/agents/sessions/status');
  }

  async getConversations(agentId) {
    return this.request(`/agents/${agentId}/conversations`);
  }

  async getConversation(conversationId) {
    return this.request(`/conversations/${conversationId}`);
  }

  async deleteConversation(conversationId) {
    return this.request(`/conversations/${conversationId}`, { method: 'DELETE' });
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
