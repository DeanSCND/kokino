/**
 * Orchestration Service - Workflow execution and management
 * Phase 4a: Service Layer Foundation
 *
 * ⚠️ CRITICAL: Backend /api/orchestration/* endpoints do NOT exist yet.
 * All methods are DISABLED and throw errors until backend routes are implemented.
 *
 * TODO Phase 5: Implement /api/orchestration routes in broker:
 *   - POST /api/orchestration/start
 *   - POST /api/orchestration/:id/stop
 *   - POST /api/orchestration/:id/pause
 *   - POST /api/orchestration/:id/resume
 *   - GET /api/orchestration/:id/status
 *   - GET /api/orchestration/:id/messages
 */

import client from './client.js';

class OrchestrationService {
  /**
   * Start orchestration execution
   * ⚠️ DISABLED: Backend endpoint does not exist
   */
  async start(teamId, config = {}) {
    throw new Error('Backend /api/orchestration/start not implemented. Orchestration unavailable until Phase 5.');
    // return client.post('/api/orchestration/start', {
    //   teamId,
    //   ...config
    // });
  }

  /**
   * Stop orchestration
   * ⚠️ DISABLED: Backend endpoint does not exist
   */
  async stop(executionId) {
    throw new Error('Backend /api/orchestration/:id/stop not implemented. Orchestration unavailable until Phase 5.');
    // return client.post(`/api/orchestration/${executionId}/stop`);
  }

  /**
   * Pause orchestration
   * ⚠️ DISABLED: Backend endpoint does not exist
   */
  async pause(executionId) {
    throw new Error('Backend /api/orchestration/:id/pause not implemented. Orchestration unavailable until Phase 5.');
    // return client.post(`/api/orchestration/${executionId}/pause`);
  }

  /**
   * Resume orchestration
   * ⚠️ DISABLED: Backend endpoint does not exist
   */
  async resume(executionId) {
    throw new Error('Backend /api/orchestration/:id/resume not implemented. Orchestration unavailable until Phase 5.');
    // return client.post(`/api/orchestration/${executionId}/resume`);
  }

  /**
   * Get orchestration status
   * ⚠️ DISABLED: Backend endpoint does not exist
   */
  async getStatus(executionId) {
    throw new Error('Backend /api/orchestration/:id/status not implemented. Orchestration unavailable until Phase 5.');
    // return client.get(`/api/orchestration/${executionId}/status`);
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
