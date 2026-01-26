/**
 * Agent Configuration Service
 *
 * Handles all agent configuration CRUD operations.
 * Provides semantic API for agent templates and config management.
 */

import apiClient from '../api-client';

/**
 * List all agent configurations with optional filters
 */
export async function listAgentConfigs(filters = {}) {
  return apiClient.listAgentConfigs(filters);
}

/**
 * Get a specific agent configuration
 */
export async function getAgentConfig(configId) {
  return apiClient.getAgentConfig(configId);
}

/**
 * Create a new agent configuration
 */
export async function createAgentConfig(config) {
  return apiClient.createAgentConfig(config);
}

/**
 * Update an existing agent configuration
 */
export async function updateAgentConfig(configId, updates) {
  return apiClient.updateAgentConfig(configId, updates);
}

/**
 * Delete an agent configuration
 */
export async function deleteAgentConfig(configId) {
  return apiClient.deleteAgentConfig(configId);
}

/**
 * Clone an agent configuration
 */
export async function cloneAgentConfig(configId, newName) {
  return apiClient.cloneAgentConfig(configId, newName);
}

/**
 * Instantiate an agent from a configuration
 */
export async function instantiateAgent(configId, agentName) {
  return apiClient.instantiateAgent(configId, agentName);
}
