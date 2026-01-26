import { jsonResponse, parseJson } from '../utils/response.js';
import { execSync } from 'node:child_process';
import { spawnAgentInTmux, killAgentTmux } from '../utils/spawn-agent.js';
import { BootstrapManager } from '../bootstrap/BootstrapManager.js';
import { CompactionMonitor } from '../bootstrap/CompactionMonitor.js';
import { DEFAULT_BOOTSTRAP_CONFIG } from '../bootstrap/BootstrapModes.js';
import db from '../db/schema.js';

export function createAgentRoutes(registry, ticketStore, messageRepository = null, agentRunner = null, conversationStore = null, fallbackController = null) {
  // Initialize bootstrap system (Phase 3)
  const bootstrapManager = new BootstrapManager(registry);
  const compactionMonitor = new CompactionMonitor();

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
        const agent = registry.get(agentId);
        if (!agent) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }

        // Clean up headless sessions and processes
        if (agentRunner && (agent.commMode === 'headless' || agent.commMode === 'shadow')) {
          await agentRunner.endSession(agentId);
        }

        // Delete from registry
        const existed = registry.delete(agentId);
        if (!existed) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }

        console.log(`[agents/${agentId}] Deleted agent and cleaned up resources`);
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

        // Phase 3: Reset compaction metrics on agent restart
        await compactionMonitor.resetMetrics(agentId);

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

        // Check fallback controller - reject if headless disabled
        if (fallbackController) {
          const agent = registry.get(agentId);
          if (agent) {
            const fallbackCheck = fallbackController.shouldUseTmux(agent);
            if (fallbackCheck.useTmux) {
              return jsonResponse(res, 503, {
                error: 'Headless execution disabled for this agent',
                reason: fallbackCheck.reason,
                fallbackMode: 'tmux',
                message: 'Agent is in fallback mode. Use tmux watcher for delivery instead of direct execute endpoint.'
              });
            }
          }
        }

        // Issue #110: Update status to busy during execution
        registry.updateStatus(agentId, 'busy');

        try {
          const result = await agentRunner.execute(agentId, prompt, {
            timeoutMs,
            metadata
          });

          // Set back to ready on success
          registry.updateStatus(agentId, 'ready');
          jsonResponse(res, 200, result);
        } catch (execError) {
          // Set back to ready on error (or error status if fatal)
          registry.updateStatus(agentId, 'ready');
          throw execError;
        }
      } catch (error) {
        console.error(`[agents/${agentId}/execute] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/start - Bootstrap agent (Issue #110 + Phase 3)
    async start(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const agent = registry.get(agentId);
        if (!agent) {
          return jsonResponse(res, 404, { error: 'Agent not found' });
        }

        // Check if already started
        if (agent.status === 'ready' || agent.status === 'busy') {
          return jsonResponse(res, 200, {
            status: agent.status,
            message: 'Agent already started',
            sessionId: null
          });
        }

        // Update status to 'starting'
        registry.updateStatus(agentId, 'starting');

        // Phase 3: Get agent config and bootstrap configuration
        let bootstrapConfig = { ...DEFAULT_BOOTSTRAP_CONFIG };
        const agentRecord = db.prepare('SELECT config_id FROM agents WHERE agent_id = ?').get(agentId);

        if (agentRecord && agentRecord.config_id) {
          const config = db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(agentRecord.config_id);
          if (config) {
            bootstrapConfig = {
              mode: config.bootstrap_mode || 'auto',
              autoLoadPaths: DEFAULT_BOOTSTRAP_CONFIG.autoLoadPaths,
              bootstrapScript: config.bootstrap_script || '',
              bootstrapTimeout: DEFAULT_BOOTSTRAP_CONFIG.timeout,
              bootstrapEnv: {}
            };
          }
        }

        // Phase 3: Reset compaction metrics on agent start
        await compactionMonitor.resetMetrics(agentId);

        // Phase 3: Run bootstrap if mode is not 'none'
        let bootstrapResult = null;
        if (bootstrapConfig.mode !== 'none') {
          try {
            console.log(`[agents/${agentId}/start] Running bootstrap (mode: ${bootstrapConfig.mode})`);
            bootstrapResult = await bootstrapManager.bootstrapAgent(agentId, bootstrapConfig);
          } catch (bootstrapError) {
            console.error(`[agents/${agentId}/start] Bootstrap failed:`, bootstrapError);
            registry.updateStatus(agentId, 'error', `Bootstrap failed: ${bootstrapError.message}`);
            return jsonResponse(res, 500, {
              error: 'Bootstrap failed',
              message: bootstrapError.message,
              mode: bootstrapConfig.mode
            });
          }
        }

        // Execute lightweight warmup prompt
        const warmupPrompt = 'You are now online. Respond with a brief greeting confirming you are ready.';

        try {
          const result = await agentRunner.execute(agentId, warmupPrompt, {
            timeoutMs: 120000, // 2 min timeout for bootstrap
            metadata: { type: 'bootstrap' }
          });

          // Update status to 'ready'
          registry.updateStatus(agentId, 'ready');

          jsonResponse(res, 200, {
            status: 'ready',
            sessionId: result.metadata?.sessionId,
            bootstrapTime: result.durationMs,
            bootstrap: bootstrapResult ? {
              mode: bootstrapResult.mode,
              filesLoaded: bootstrapResult.filesLoaded || [],
              contextSize: bootstrapResult.contextSize || 0,
              duration: bootstrapResult.duration || 0
            } : null,
            response: result.content
          });
        } catch (error) {
          registry.updateStatus(agentId, 'error', error.message);
          throw error;
        }
      } catch (error) {
        console.error(`[agents/${agentId}/start] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/execute/cancel - Cancel running execution
    async cancelExecution(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        await agentRunner.cancelExecution(agentId);
        jsonResponse(res, 200, { status: 'cancelled', agentId });
      } catch (error) {
        console.error(`[agents/${agentId}/execute/cancel] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/end-session - End headless session
    async endSession(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        await agentRunner.endSession(agentId);
        jsonResponse(res, 200, { status: 'session ended', agentId });
      } catch (error) {
        console.error(`[agents/${agentId}/end-session] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/sessions/status - Get all session statuses
    async getSessionStatus(req, res) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const status = agentRunner.sessionManager.getStatus();
        jsonResponse(res, 200, status);
      } catch (error) {
        console.error('[agents/sessions/status] Error:', error);
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
    },

    // GET /agents/processes/status - Get process supervisor status
    async getProcessStatus(req, res) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const processes = agentRunner.processSupervisor.getStatus();
        jsonResponse(res, 200, { processes });
      } catch (error) {
        console.error('[agents/processes/status] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/circuits/status - Get circuit breaker status
    async getCircuitStatus(req, res) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const circuits = agentRunner.circuitBreaker.getStatus();
        jsonResponse(res, 200, { circuits });
      } catch (error) {
        console.error('[agents/circuits/status] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // POST /agents/:agentId/circuit/reset - Reset circuit breaker for agent
    async resetCircuit(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        agentRunner.circuitBreaker.reset(agentId);
        jsonResponse(res, 200, { status: 'reset', agentId });
      } catch (error) {
        console.error(`[agents/${agentId}/circuit/reset] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/logs/status - Get log rotator status
    async getLogStatus(req, res) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const logs = agentRunner.logRotator.getStats();
        jsonResponse(res, 200, { logs });
      } catch (error) {
        console.error('[agents/logs/status] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    // GET /agents/:agentId/logs - Get recent logs for agent
    async getLogs(req, res, agentId) {
      try {
        if (!agentRunner) {
          return jsonResponse(res, 503, { error: 'AgentRunner not available' });
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const lines = parseInt(url.searchParams.get('lines')) || 100;

        const content = agentRunner.logRotator.read(agentId, lines);
        jsonResponse(res, 200, { agentId, lines, content });
      } catch (error) {
        console.error(`[agents/${agentId}/logs] Error:`, error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };
}
