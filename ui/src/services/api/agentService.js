/**
 * Agent Lifecycle Service
 *
 * Handles all agent CRUD and lifecycle operations.
 * Provides semantic API for Canvas to interact with agents.
 */

import apiClient from '../api-client';

/**
 * Register a new agent with the broker
 */
export async function registerAgent(agentId, { type, metadata = {}, heartbeatIntervalMs = 30000 }) {
  return apiClient.registerAgent(agentId, { type, metadata, heartbeatIntervalMs });
}

/**
 * List all agents with optional filters
 */
export async function listAgents(filters = {}) {
  return apiClient.listAgents(filters);
}

/**
 * Start an agent (spawn tmux or start headless)
 */
export async function startAgent(agentName) {
  return apiClient.startAgent(agentName);
}

/**
 * Stop a running agent
 */
export async function stopAgent(agentName) {
  return apiClient.stopAgent(agentName);
}

/**
 * Restart an agent (stop + start)
 */
export async function restartAgent(agentName) {
  return apiClient.restartAgent(agentName);
}

/**
 * Delete an agent from the registry
 */
export async function deleteAgent(agentName) {
  return apiClient.deleteAgent(agentName);
}

/**
 * Kill tmux session for an agent
 */
export async function killTmuxSession(agentName) {
  return apiClient.killTmuxSession(agentName);
}

/**
 * Send heartbeat for an agent
 */
export async function heartbeat(agentId) {
  return apiClient.heartbeat(agentId);
}

/**
 * Connect to agent terminal via WebSocket
 */
export function connectTerminal(agentId) {
  return apiClient.connectTerminal(agentId);
}

/**
 * Execute a task in headless mode
 */
export async function executeTask(agentId, { prompt, timeoutMs, metadata }) {
  return apiClient.executeTask(agentId, { prompt, timeoutMs, metadata });
}

/**
 * Cancel ongoing execution
 */
export async function cancelExecution(agentId) {
  return apiClient.cancelExecution(agentId);
}

/**
 * End agent session
 */
export async function endSession(agentId) {
  return apiClient.endSession(agentId);
}

/**
 * Get session status for all agents
 */
export async function getSessionStatus() {
  return apiClient.getSessionStatus();
}

/**
 * Get conversations for an agent
 */
export async function getConversations(agentId) {
  return apiClient.getConversations(agentId);
}

/**
 * Get a specific conversation
 */
export async function getConversation(conversationId) {
  return apiClient.getConversation(conversationId);
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId) {
  return apiClient.deleteConversation(conversationId);
}
