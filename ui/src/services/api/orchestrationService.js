/**
 * Orchestration Service - Workflow execution and management
 * Phase 4a: Service Layer Foundation
 */

import client from './client.js';

class OrchestrationService {
  /**
   * Start orchestration execution
   */
  async start(teamId, config = {}) {
    return client.post('/api/orchestration/start', {
      teamId,
      ...config
    });
  }

  /**
   * Stop orchestration
   */
  async stop(executionId) {
    return client.post(`/api/orchestration/${executionId}/stop`);
  }

  /**
   * Pause orchestration
   */
  async pause(executionId) {
    return client.post(`/api/orchestration/${executionId}/pause`);
  }

  /**
   * Resume orchestration
   */
  async resume(executionId) {
    return client.post(`/api/orchestration/${executionId}/resume`);
  }

  /**
   * Get orchestration status
   */
  async getStatus(executionId) {
    return client.get(`/api/orchestration/${executionId}/status`);
  }

  /**
   * Get current phase
   */
  async getPhase(executionId) {
    const status = await this.getStatus(executionId);
    return status.currentPhase;
  }

  /**
   * Get execution messages
   */
  async getMessages(executionId, since = null) {
    const params = since ? { since } : {};
    return client.get(`/api/orchestration/${executionId}/messages`, { params });
  }

  /**
   * Step to next phase (for step mode)
   */
  async step(executionId) {
    return client.post(`/api/orchestration/${executionId}/step`);
  }

  /**
   * Get execution history
   */
  async getHistory(teamId, limit = 10) {
    return client.get('/api/orchestration/history', {
      params: { teamId, limit }
    });
  }

  /**
   * Get execution logs
   */
  async getLogs(executionId) {
    return client.get(`/api/orchestration/${executionId}/logs`);
  }
}

export default new OrchestrationService();
