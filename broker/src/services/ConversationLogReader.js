/**
 * ConversationLogReader Service
 * Phase 6: Team Monitoring & Visibility
 *
 * Reads and parses JSONL conversation logs from headless agents.
 * Extracts meaningful messages for display in the UI.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Readable } from 'node:stream';

const LOG_DIR = path.join(process.cwd(), 'data', 'logs', 'headless');

export class ConversationLogReader {
  /**
   * Read conversation log for a specific agent
   * @param {string} agentId - Agent identifier
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Parsed conversation entries
   */
  static async readAgentConversation(agentId, options = {}) {
    const { offset = 0, limit = 100, includeSystem = false } = options;

    const logPath = path.join(LOG_DIR, `${agentId}.log`);

    if (!fs.existsSync(logPath)) {
      return [];
    }

    const entries = [];
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNumber = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        // Extract JSON from log line (format: [timestamp] [OUT] {...})
        const jsonMatch = line.match(/\[OUT\]\s*({.*})/);
        if (!jsonMatch) continue;

        const data = JSON.parse(jsonMatch[1]);

        // Extract relevant message data
        const entry = this._extractMessageEntry(data, agentId, includeSystem);
        if (entry) {
          entries.push(entry);
        }
      } catch (err) {
        // Skip malformed lines
        continue;
      }

      lineNumber++;
    }

    // Apply pagination
    return entries.slice(offset, offset + limit);
  }

  /**
   * Read and merge conversations from multiple agents (for team view)
   * @param {Array<string>} agentIds - Array of agent identifiers
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} Merged conversation sorted by timestamp
   */
  static async readTeamConversation(agentIds, options = {}) {
    const { offset = 0, limit = 100, includeSystem = false } = options;

    // Read all agent conversations in parallel
    const conversations = await Promise.all(
      agentIds.map(agentId => this.readAgentConversation(agentId, { ...options, offset: 0, limit: 10000 }))
    );

    // Merge and sort by timestamp
    const merged = conversations.flat().sort((a, b) => {
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    // Apply pagination
    return merged.slice(offset, offset + limit);
  }

  /**
   * Extract message entry from JSONL data
   * @param {Object} data - Parsed JSONL object
   * @param {string} agentId - Agent ID
   * @param {boolean} includeSystem - Include system messages
   * @returns {Object|null} Extracted message entry
   */
  static _extractMessageEntry(data, agentId, includeSystem) {
    // Skip non-message types
    if (data.type === 'result' && !includeSystem) {
      return null;
    }

    // Extract timestamp from parent log line or use current time
    const timestamp = data.timestamp || new Date().toISOString();

    // Handle different message types
    if (data.type === 'assistant' && data.message) {
      const content = data.message.content;

      // Check if this is a tool use (agent-to-agent message)
      const toolUse = content?.find(c => c.type === 'tool_use' && c.name === 'mcp__agent-bridge__send_message');

      if (toolUse) {
        // Agent-to-agent message
        return {
          id: data.uuid || data.message.id,
          timestamp,
          sender: toolUse.input?.metadata?.origin || agentId,
          recipient: toolUse.input?.agentId || 'unknown',
          message: toolUse.input?.payload || '',
          type: 'agent_message',
          metadata: toolUse.input?.metadata || {}
        };
      }

      // Regular assistant message (thinking/response)
      const textContent = content?.find(c => c.type === 'text');
      if (textContent && textContent.text) {
        return {
          id: data.uuid || data.message.id,
          timestamp,
          sender: agentId,
          recipient: null,
          message: textContent.text,
          type: 'assistant_output',
          metadata: {}
        };
      }
    }

    // System init messages
    if (data.type === 'system' && data.subtype === 'init' && includeSystem) {
      return {
        id: data.uuid,
        timestamp,
        sender: 'system',
        recipient: agentId,
        message: `Agent started (session: ${data.session_id})`,
        type: 'system',
        metadata: { cwd: data.cwd, model: data.model }
      };
    }

    // Result messages (completion)
    if (data.type === 'result' && data.result && includeSystem) {
      return {
        id: data.uuid,
        timestamp,
        sender: agentId,
        recipient: null,
        message: data.result,
        type: 'result',
        metadata: {
          duration_ms: data.duration_ms,
          num_turns: data.num_turns,
          total_cost_usd: data.total_cost_usd
        }
      };
    }

    return null;
  }

  /**
   * Get list of available agent logs
   * @returns {Promise<Array<string>>} Array of agent IDs with logs
   */
  static async listAvailableLogs() {
    if (!fs.existsSync(LOG_DIR)) {
      return [];
    }

    const files = fs.readdirSync(LOG_DIR);
    return files
      .filter(f => f.endsWith('.log'))
      .map(f => f.replace('.log', ''));
  }

  /**
   * Get conversation statistics for an agent
   * @param {string} agentId - Agent identifier
   * @returns {Promise<Object>} Statistics object
   */
  static async getStats(agentId) {
    const logPath = path.join(LOG_DIR, `${agentId}.log`);

    if (!fs.existsSync(logPath)) {
      return { exists: false };
    }

    const stats = fs.statSync(logPath);
    const entries = await this.readAgentConversation(agentId, { limit: 10000, includeSystem: true });

    const messagesSent = entries.filter(e => e.type === 'agent_message' && e.sender === agentId).length;
    const messagesReceived = entries.filter(e => e.type === 'agent_message' && e.recipient === agentId).length;

    return {
      exists: true,
      fileSizeBytes: stats.size,
      lastModified: stats.mtime,
      totalEntries: entries.length,
      messagesSent,
      messagesReceived
    };
  }
}
