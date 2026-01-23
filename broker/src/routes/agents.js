import { jsonResponse, parseJson } from '../utils/response.js';
import { execSync } from 'node:child_process';
import { spawnAgentInTmux, killAgentTmux } from '../utils/spawn-agent.js';

export function createAgentRoutes(registry, ticketStore, messageRepository = null, agentRunner = null, conversationStore = null) {
  return {
    // POST /agents/register
    async register(req, res) {
      try {
        const body = await parseJson(req);
        const { agentId, type, metadata = {}, heartbeatIntervalMs } = body;

        if (!agentId) {
          return jsonResponse(res, 400, { error: 'agentId required' });
        }

        // Auto-detect commMode based on CLI type if not explicitly set
        // Supported headless CLIs: claude-code, factory-droid, gemini
        const supportedHeadlessCLIs = ['claude-code', 'factory-droid', 'gemini'];
        const defaultCommMode = supportedHeadlessCLIs.includes(type) ? 'headless' : 'tmux';

        // Use explicit commMode from metadata, or fall back to auto-detected default
        const commMode = metadata.commMode || defaultCommMode;

        // Merge commMode into metadata
        const enrichedMetadata = {
          ...metadata,
          commMode
        };

        console.log(`[agents/register] Registering ${agentId} (type: ${type}, commMode: ${commMode})`);

        const record = registry.register(agentId, {
          type,
          metadata: enrichedMetadata,
          heartbeatIntervalMs
        });

        jsonResponse(res, 200, record);
      } catch (error) {
        console.error('[agents/register] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents?type=claude-code&status=online
    async list(req, res) {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const filters = {
          type: url.searchParams.get('type'),
          status: url.searchParams.get('status')
        };

        // Remove null values
        Object.keys(filters).forEach(key => {
          if (filters[key] === null) delete filters[key];
        });

        const agents = registry.list(filters);
        jsonResponse(res, 200, agents);
      } catch (error) {
        console.error('[agents/list] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/send - CRITICAL: Store & Forward pattern
    async send(req, res, agentId) {
      try {
        const body = await parseJson(req);
        const {
          ticketId,
          payload,
          metadata = {},
          expectReply = true,
          timeoutMs = 30000
        } = body;

        // CRITICAL: NO validation if agent exists!
        // Store & Forward: Accept messages for offline agents

        const ticket = ticketStore.create({
          targetAgent: agentId,
          originAgent: metadata.origin || 'ui',
          payload,
          metadata,
          expectReply,
          timeoutMs
        });

        // Log message to history (Phase 8)
        if (messageRepository) {
          messageRepository.save({
            messageId: ticket.ticketId,
            from: metadata.origin || 'ui',
            to: agentId,
            threadId: metadata.threadId || null,
            payload,
            metadata,
            status: 'sent'
          });
        }

        // Return immediately (10-20ms target)
        jsonResponse(res, 202, {
          ticketId: ticket.ticketId,
          status: 'pending',
          waitEndpoint: `/replies/${ticket.ticketId}/stream`
        });

        // TODO: Background worker will handle delivery

      } catch (error) {
        console.error(`[agents/${agentId}/send] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/:agentId/tickets/pending
    async getPendingTickets(req, res, agentId) {
      try {
        const pending = ticketStore.getPending(agentId);
        const serialized = pending.map(t => ticketStore.serialize(t));
        jsonResponse(res, 200, serialized);
      } catch (error) {
        console.error(`[agents/${agentId}/tickets] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/heartbeat
    async heartbeat(req, res, agentId) {
      try {
        const record = registry.touch(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 200, { status: 'ok', lastHeartbeat: record.lastHeartbeat });
      } catch (error) {
        console.error(`[agents/${agentId}/heartbeat] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // DELETE /agents/:agentId
    async delete(req, res, agentId) {
      try {
        const existed = registry.delete(agentId);
        if (!existed) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 204);
      } catch (error) {
        console.error(`[agents/${agentId}] Delete error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // Lifecycle endpoints

    // POST /agents/:agentId/start
    async start(req, res, agentId) {
      try {
        const record = registry.get(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }

        // Spawn tmux session with mock agent
        const role = record.metadata?.role || 'Developer';
        const spawnResult = spawnAgentInTmux(agentId, role);

        if (spawnResult.success) {
          // Update status to online
          registry.start(agentId);
          jsonResponse(res, 200, {
            status: 'started',
            agent: record,
            tmux: spawnResult.session,
            created: spawnResult.created
          });
        } else {
          jsonResponse(res, 500, { error: 'Failed to spawn agent', details: spawnResult.error });
        }
      } catch (error) {
        console.error(`[agents/${agentId}/start] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/stop
    async stop(req, res, agentId) {
      try {
        const record = registry.stop(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }

        // Kill tmux session if it exists
        killAgentTmux(agentId);

        jsonResponse(res, 200, { status: 'stopped', agent: record });
      } catch (error) {
        console.error(`[agents/${agentId}/stop] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/restart
    async restart(req, res, agentId) {
      try {
        const record = registry.restart(agentId);
        if (!record) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }
        jsonResponse(res, 200, { status: 'restarting', agent: record });
      } catch (error) {
        console.error(`[agents/${agentId}/restart] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/kill-tmux
    async killTmux(req, res, agentId) {
      try {
        // Tmux sessions are created with pattern: dev-{agentId}
        const tmuxSession = `dev-${agentId}`;

        // Check if tmux session exists first
        try {
          execSync(`tmux has-session -t ${tmuxSession} 2>/dev/null`, { stdio: 'ignore' });
          // Session exists, kill it
          execSync(`tmux kill-session -t ${tmuxSession}`, { stdio: 'ignore' });
          console.log(`[agents/${agentId}] Killed tmux session: ${tmuxSession}`);
          jsonResponse(res, 200, { status: 'killed', session: tmuxSession });
        } catch (error) {
          // Session doesn't exist - that's fine
          console.log(`[agents/${agentId}] No tmux session to kill: ${tmuxSession}`);
          jsonResponse(res, 200, { status: 'not_found', session: tmuxSession });
        }
      } catch (error) {
        console.error(`[agents/${agentId}/kill-tmux] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/execute - Execute headless task
    async execute(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const body = await parseJson(req);
        const { prompt, timeoutMs, metadata } = body;

        if (!prompt) {
          return jsonResponse(res, 400, { error: 'prompt required' });
        }

        const result = await agentRunner.execute(agentId, prompt, {
          timeoutMs,
          metadata
        });

        jsonResponse(res, 200, result);
      } catch (error) {
        console.error(`[agents/${agentId}/execute] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/end-session - End headless session
    async endSession(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        agentRunner.endSession(agentId);
        jsonResponse(res, 200, { status: 'session ended', agentId });
      } catch (error) {
        console.error(`[agents/${agentId}/end-session] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/:agentId/conversations - Get agent conversations
    async getConversations(req, res, agentId) {
      try {
        if (!conversationStore) {
          return jsonResponse(res, 503, { error: 'ConversationStore not available' });
        }

        const conversations = conversationStore.getAgentConversations(agentId);
        jsonResponse(res, 200, conversations);
      } catch (error) {
        console.error(`[agents/${agentId}/conversations] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /conversations/:conversationId - Get conversation with turns
    async getConversation(req, res, conversationId) {
      try {
        if (!conversationStore) {
          return jsonResponse(res, 503, { error: 'ConversationStore not available' });
        }

        const conversation = conversationStore.getConversationWithTurns(conversationId);
        if (!conversation) {
          return jsonResponse(res, 404, { error: 'Conversation not found' });
        }

        jsonResponse(res, 200, conversation);
      } catch (error) {
        console.error(`[conversations/${conversationId}] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // DELETE /conversations/:conversationId - Delete conversation
    async deleteConversation(req, res, conversationId) {
      try {
        if (!conversationStore) {
          return jsonResponse(res, 503, { error: 'ConversationStore not available' });
        }

        const deleted = conversationStore.deleteConversation(conversationId);
        if (!deleted) {
          return jsonResponse(res, 404, { error: 'Conversation not found' });
        }

        jsonResponse(res, 200, { status: 'deleted', conversationId });
      } catch (error) {
        console.error(`[conversations/${conversationId}/delete] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };
}
