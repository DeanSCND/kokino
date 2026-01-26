/**
 * API Client with Feature Flag Support
 *
 * This module provides a unified interface that can switch between:
 * 1. Direct broker.js calls (legacy mode)
 * 2. REST API adapter endpoints (new mode with telemetry)
 *
 * The transport is controlled by VITE_USE_REST_API environment variable.
 * This enables zero-breaking-change migration with instant rollback capability.
 */

import broker from './broker';

// Feature flag to control transport mode
const USE_REST_API = import.meta.env.VITE_USE_REST_API === 'true';
const API_BASE_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';

console.log(`[api-client] Transport mode: ${USE_REST_API ? 'REST API' : 'Direct Broker'}`);

/**
 * REST API implementation that mirrors broker.js interface
 */
class RestApiClient {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.maxRetries = 3;
    this.retryDelay = 1000;
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

        if (err.name === 'AbortError' || err.name === 'TimeoutError' || attempt === attemptCount - 1) {
          break;
        }

        const delay = this.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (lastError.name === 'TypeError' || lastError.message.includes('fetch')) {
      throw new Error('Broker unreachable - check if broker is running');
    }
    if (lastError.name === 'AbortError' || lastError.name === 'TimeoutError') {
      throw new Error('Request timeout - broker may be overloaded');
    }
    throw lastError;
  }

  // Agent Management - Maps to adapter endpoints

  async registerAgent(agentId, { type, metadata = {}, heartbeatIntervalMs = 30000 }) {
    return this.request('/api/adapter/register', {
      method: 'POST',
      body: JSON.stringify({ agentId, type, metadata, heartbeatIntervalMs })
    });
  }

  async listAgents(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await this.request(`/api/adapter/agents?${params}`);
    // Adapter returns { agents: [...] }, broker returns raw array
    return response.agents || [];
  }

  async deleteAgent(agentId) {
    return this.request(`/api/adapter/agent/${agentId}`, { method: 'DELETE' });
  }

  async heartbeat(agentId) {
    return this.request('/api/adapter/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
  }

  // Messaging (Store & Forward) - Maps to adapter endpoints

  async sendMessage(agentId, { payload, metadata = {}, expectReply = true, timeoutMs = 30000 }) {
    return this.request('/api/adapter/send', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        payload,
        metadata,
        expectReply,
        timeoutMs
      })
    });
  }

  async getPendingTickets(agentId) {
    return this.request(`/api/adapter/pending/${agentId}`);
  }

  // Lifecycle - Maps to adapter endpoints

  async startAgent(agentId) {
    return this.request('/api/adapter/start', {
      method: 'POST',
      body: JSON.stringify({ agentId }),
      timeout: 125000  // 2min + 5s buffer
    });
  }

  async stopAgent(agentId) {
    return this.request('/api/adapter/stop', {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
  }

  async restartAgent(agentId) {
    return this.request('/api/adapter/restart', {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
  }

  async killTmuxSession(agentId) {
    return this.request('/api/adapter/kill-tmux', {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
  }

  // Headless Execution - Fallback to direct broker until adapter endpoints ready
  // These methods use broker directly to maintain functionality

  async executeTask(agentId, { prompt, timeoutMs, metadata }) {
    // Fallback to direct broker call for now
    console.warn('[api-client] executeTask falling back to direct broker - adapter endpoint not yet implemented');
    return broker.executeTask(agentId, { prompt, timeoutMs, metadata });
  }

  async cancelExecution(agentId) {
    // Fallback to direct broker call for now
    console.warn('[api-client] cancelExecution falling back to direct broker - adapter endpoint not yet implemented');
    return broker.cancelExecution(agentId);
  }

  async endSession(agentId) {
    // Fallback to direct broker call for now
    console.warn('[api-client] endSession falling back to direct broker - adapter endpoint not yet implemented');
    return broker.endSession(agentId);
  }

  async getSessionStatus() {
    // Fallback to direct broker call for now
    console.warn('[api-client] getSessionStatus falling back to direct broker - adapter endpoint not yet implemented');
    return broker.getSessionStatus();
  }

  async getConversations(agentId) {
    // Fallback to direct broker call for now
    console.warn('[api-client] getConversations falling back to direct broker - adapter endpoint not yet implemented');
    return broker.getConversations(agentId);
  }

  async getConversation(conversationId) {
    // Fallback to direct broker call for now
    console.warn('[api-client] getConversation falling back to direct broker - adapter endpoint not yet implemented');
    return broker.getConversation(conversationId);
  }

  async deleteConversation(conversationId) {
    // Fallback to direct broker call for now
    console.warn('[api-client] deleteConversation falling back to direct broker - adapter endpoint not yet implemented');
    return broker.deleteConversation(conversationId);
  }

  // Reply management - Fallback to direct broker until adapter endpoints ready

  async postReply(ticketId, payload, metadata = {}) {
    // Fallback to direct broker call for now
    return broker.postReply(ticketId, payload, metadata);
  }

  async getReply(ticketId) {
    // Fallback to direct broker call for now
    return broker.getReply(ticketId);
  }

  async waitForReply(ticketId) {
    // Fallback to direct broker call for now
    return broker.waitForReply(ticketId);
  }

  // Agent Configuration (Phase 2: Configurable Agents)

  async listAgentConfigs(filters = {}) {
    // Clean up filters - only include defined values
    const cleanFilters = {};
    Object.keys(filters).forEach(key => {
      if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
        cleanFilters[key] = filters[key];
      }
    });

    const params = new URLSearchParams(cleanFilters);
    const queryString = params.toString();
    return this.request(`/api/agents${queryString ? `?${queryString}` : ''}`);
  }

  async getAgentConfig(configId) {
    return this.request(`/api/agents/${configId}`);
  }

  async createAgentConfig(config) {
    const response = await this.request('/api/agents', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    return response.agent;
  }

  async updateAgentConfig(configId, updates) {
    const response = await this.request(`/api/agents/${configId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return response.agent;
  }

  async deleteAgentConfig(configId) {
    return this.request(`/api/agents/${configId}`, { method: 'DELETE' });
  }

  async cloneAgentConfig(configId, newName) {
    const response = await this.request(`/api/agents/${configId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ name: newName })
    });
    return response.agent;
  }

  async instantiateAgent(configId, agentName) {
    const response = await this.request(`/api/agents/${configId}/instantiate`, {
      method: 'POST',
      body: JSON.stringify({ name: agentName })
    });
    return response.agent;
  }

  // System

  async health() {
    // TODO: Add /api/adapter/health endpoint
    return this.request('/api/adapter/health').catch(() => {
      // Fallback to /health for now
      return this.request('/health');
    });
  }

  // WebSocket connection for terminal
  connectTerminal(agentId) {
    // WebSocket connections always go direct, not through REST API
    const wsUrl = `ws://127.0.0.1:5050/ws/terminal/${agentId}`;
    return new WebSocket(wsUrl);
  }
}

// Create the appropriate client based on feature flag
const apiClient = USE_REST_API ? new RestApiClient() : broker;

// Export both named and default
export { apiClient };
export default apiClient;