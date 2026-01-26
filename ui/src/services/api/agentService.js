/**
 * Agent Service - All agent-related API operations
 * Phase 4a: Service Layer Foundation
 */

import client from './client.js';

class AgentService {
  /**
   * List all agent configurations
   */
  async listConfigs(filters = {}) {
    return client.get('/api/agents', { params: filters });
  }

  /**
   * Get single agent configuration
   */
  async getConfig(id) {
    return client.get(`/api/agents/${id}`);
  }

  /**
   * Create new agent configuration
   */
  async createConfig(config) {
    return client.post('/api/agents', config);
  }

  /**
   * Update agent configuration
   */
  async updateConfig(id, updates) {
    return client.put(`/api/agents/${id}`, updates);
  }

  /**
   * Delete agent configuration
   */
  async deleteConfig(id) {
    return client.delete(`/api/agents/${id}`);
  }

  /**
   * Register agent with broker (runtime)
   */
  async register(agentId, config) {
    return client.post('/agents/register', {
      agentId,
      type: config.cliType || 'claude-code',
      metadata: config
    });
  }

  /**
   * Deregister agent from broker
   */
  async deregister(agentId) {
    return client.post('/agents/deregister', { agentId });
  }

  /**
   * Get agent status
   */
  async getStatus(agentId) {
    return client.get(`/agents/${agentId}/status`);
  }

  /**
   * Start agent execution
   */
  async start(agentId, config = {}) {
    return client.post(`/agents/${agentId}/start`, config);
  }

  /**
   * Stop agent execution
   */
  async stop(agentId) {
    return client.post(`/agents/${agentId}/stop`);
  }

  /**
   * Restart agent
   */
  async restart(agentId) {
    await this.stop(agentId);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
    return this.start(agentId);
  }

  /**
   * Send message to agent
   */
  async sendMessage(agentId, payload, options = {}) {
    return client.post('/messages/send', {
      targetAgent: agentId,
      payload,
      ...options
    });
  }

  /**
   * Get agent conversation history
   */
  async getConversation(agentId, conversationId) {
    return client.get(`/agents/${agentId}/conversations/${conversationId}`);
  }

  /**
   * List agent conversations
   */
  async listConversations(agentId) {
    return client.get(`/agents/${agentId}/conversations`);
  }

  /**
   * Bootstrap agent with context
   */
  async bootstrap(agentId, config = {}) {
    return client.post(`/api/agents/${agentId}/bootstrap`, config);
  }

  /**
   * Get bootstrap status
   */
  async getBootstrapStatus(agentId) {
    return client.get(`/api/agents/${agentId}/bootstrap/status`);
  }

  /**
   * Get compaction status
   */
  async getCompactionStatus(agentId) {
    return client.get(`/api/agents/${agentId}/compaction-status`);
  }
}

export default new AgentService();
