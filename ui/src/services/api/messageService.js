/**
 * Message & Ticket Service
 *
 * Handles all inter-agent messaging and ticket operations.
 * Provides semantic API for Canvas orchestration.
 */

import apiClient from '../api-client';

/**
 * Send a message to an agent
 */
export async function sendMessage(agentId, { payload, metadata = {}, expectReply = true, timeoutMs = 30000 }) {
  return apiClient.sendMessage(agentId, { payload, metadata, expectReply, timeoutMs });
}

/**
 * Get pending tickets for an agent
 */
export async function getPendingTickets(agentId) {
  return apiClient.getPendingTickets(agentId);
}

/**
 * Post a reply to a ticket
 */
export async function postReply(ticketId, payload, metadata = {}) {
  return apiClient.postReply(ticketId, payload, metadata);
}

/**
 * Get reply for a ticket (non-blocking)
 */
export async function getReply(ticketId) {
  return apiClient.getReply(ticketId);
}

/**
 * Wait for reply to a ticket (blocking)
 */
export async function waitForReply(ticketId) {
  return apiClient.waitForReply(ticketId);
}
