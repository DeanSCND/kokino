/**
 * AgentRunner - Headless CLI Execution Service
 *
 * Executes agents via direct CLI subprocess invocation (claude, droid, gemini)
 * instead of tmux terminal injection. Provides structured conversation history
 * and <100ms latency vs 5s polling.
 *
 * Reference: Network Chuck's claude-phone
 * https://github.com/theNetworkChuck/claude-phone
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ConversationStore } from '../db/ConversationStore.js';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';
import { AgentSessionManager } from './AgentSessionManager.js';
import { ProcessSupervisor } from './ProcessSupervisor.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { LogRotator } from './LogRotator.js';
import { JSONLParser } from './JSONLParser.js';
import { CLIVersionTracker } from './CLIVersionTracker.js';
import { CompactionMonitor } from '../bootstrap/CompactionMonitor.js';

/**
 * Build the full environment that Claude Code expects.
 * This mimics what happens when you run `claude` in a terminal
 * with your shell profile fully loaded.
 *
 * CRITICAL: Must delete ANTHROPIC_API_KEY to force subscription auth!
 */
export function buildClaudeEnvironment() {
  const HOME = process.env.HOME;
  const CLAUDE_DIR = path.join(HOME, '.claude');

  // Load ~/.claude/.env if it exists (API keys, tokens)
  const claudeEnv = {};
  const envPath = path.join(CLAUDE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          claudeEnv[key] = valueParts.join('=');
        }
      }
    }
  }

  // Build PATH with all expected binary locations
  const nvmNodePath = process.env.NVM_BIN || (process.env.NVM_DIR && path.join(process.env.NVM_DIR, 'current/bin'));
  const pathEntries = [
    nvmNodePath,                   // NVM-managed Node.js binaries (includes claude)
    '/opt/homebrew/bin',           // macOS Homebrew
    '/usr/local/bin',
    path.join(HOME, '.local/bin'), // pipx, etc.
    path.join(HOME, '.bun/bin'),   // Bun
    '/usr/bin',
    '/bin',
  ].filter(Boolean);
  const fullPath = pathEntries.join(':');

  const env = {
    ...process.env,
    ...claudeEnv,
    PATH: fullPath,
    HOME,

    // CRITICAL: Tell Claude Code it's running in CLI mode
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
  };

  // CRITICAL: Remove ANTHROPIC_API_KEY to force subscription auth
  // If set (even to placeholder), CLI tries API auth instead of subscription
  delete env.ANTHROPIC_API_KEY;

  return env;
}

// Pre-build environment once at startup
const claudeEnv = buildClaudeEnvironment();

/**
 * Parse Claude Code JSONL (newline-delimited JSON) output.
 * Each line is a separate JSON object. The final result is in a message with type: "result".
 */
function parseClaudeStdout(stdout) {
  let response = '';
  let sessionId = null;

  const lines = String(stdout || '').trim().split('\n');
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'result' && parsed.result) {
        response = parsed.result;
        sessionId = parsed.session_id;
      }
    } catch {
      // Not JSON, ignore
    }
  }

  // Fallback to raw stdout if no JSONL found
  if (!response) {
    response = String(stdout || '').trim();
  }

  return { response, sessionId };
}

/**
 * Build layered prompt for agent execution
 *
 * 3 Layers:
 * 1. Agent Identity (role, name, systemPrompt)
 * 2. Kokino Context (co_workers, send_message, post_reply)
 * 3. Actual message/task payload
 */
function buildAgentPrompt({ agent, ticketPayload }) {
  let fullPrompt = '';

  // Layer 1: Agent Identity
  if (agent.metadata?.systemPrompt || agent.metadata?.role) {
    fullPrompt += `[AGENT IDENTITY]\n`;
    fullPrompt += `You are agent '${agent.agentId}'`;
    if (agent.metadata.role) {
      fullPrompt += ` with role: ${agent.metadata.role}`;
    }
    fullPrompt += `.\n`;
    if (agent.metadata.systemPrompt) {
      fullPrompt += agent.metadata.systemPrompt;
      fullPrompt += `\n`;
    }
    fullPrompt += `[END AGENT IDENTITY]\n\n`;
  }

  // Layer 2: Kokino System Context
  fullPrompt += `[KOKINO CONTEXT]\n`;
  fullPrompt += `You are part of a multi-agent team. Use co_workers() to see other agents.\n`;
  fullPrompt += `Use send_message() to communicate with other agents.\n`;
  fullPrompt += `Use post_reply() to respond to messages.\n`;
  fullPrompt += `[END KOKINO CONTEXT]\n\n`;

  // Layer 3: The actual message
  fullPrompt += ticketPayload;

  return fullPrompt;
}

export class AgentRunner {
  constructor(registry, conversationStore) {
    this.registry = registry;
    this.conversationStore = conversationStore || new ConversationStore();
    this.metrics = getMetricsCollector();
    this.sessionManager = new AgentSessionManager();
    this.processSupervisor = new ProcessSupervisor();
    this.circuitBreaker = new CircuitBreaker();
    this.logRotator = new LogRotator();
    this.jsonlParser = new JSONLParser();
    this.versionTracker = new CLIVersionTracker();
    this.compactionMonitor = new CompactionMonitor(); // Phase 3: Issue #135

    // Active subprocess calls: agentId -> ChildProcess
    this.activeCalls = new Map();

    // Cleanup stale sessions every hour
    setInterval(() => {
      this.sessionManager.cleanupStaleSessions();
    }, 3600000); // 1 hour

    // Cleanup zombie processes every 5 minutes
    setInterval(() => {
      this.processSupervisor.cleanupZombies();
    }, 300000); // 5 minutes

    // Cleanup old log archives daily
    setInterval(() => {
      this.logRotator.cleanup();
    }, 86400000); // 24 hours

    // Cleanup old CLI version records monthly
    setInterval(() => {
      this.versionTracker.cleanup(30);
    }, 2592000000); // 30 days

    console.log('[AgentRunner] Initialized with hardened JSONL parsing and CLI version tracking');
  }

  /**
   * Execute a single turn with a headless agent
   *
   * @param {string} agentId - Agent to execute
   * @param {string} prompt - Prompt/message to send
   * @param {object} options - Execution options
   * @returns {Promise<TurnResult>}
   */
  async execute(agentId, prompt, options = {}) {
    const {
      timeoutMs = 300000,  // 5 minutes default
      metadata = {},
      conversationId = null
    } = options;

    const agent = await this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Check commMode from both agent root and metadata
    const commMode = agent.commMode || agent.metadata?.commMode || 'tmux';
    if (commMode !== 'headless' && commMode !== 'shadow') {
      throw new Error(`Agent ${agentId} is not in headless/shadow mode (current: ${commMode})`);
    }

    // CRITICAL: Check circuit breaker BEFORE acquiring lock (for load shedding)
    // Use a lightweight check that doesn't wrap execution (avoids double-wrapping)
    await this.checkCircuitBreaker(agentId);

    // Acquire execution lock via SessionManager (waits if agent busy)
    const session = await this.sessionManager.acquireLock(agentId, timeoutMs);

    const startTime = Date.now();
    const cliType = agent.type || 'claude-code';
    let convId;

    // Emit EXECUTION_STARTED event
    this.metrics.record('EXECUTION_STARTED', agentId, {
      cliType,
      metadata: { prompt: prompt.substring(0, 100) + '...' }
    });

    try {
      // Get or create conversation
      convId = conversationId;
      if (!convId) {
        const existing = this.conversationStore.getAgentConversations(agentId);
        if (existing.length > 0) {
          // Continue most recent conversation
          convId = existing[0].conversationId;
        } else {
          // Create new conversation
          convId = this.conversationStore.createConversation(agentId, {
            title: 'Headless Conversation',
            metadata: { startedAt: new Date().toISOString() }
          });
        }
      }

      // Add user turn to conversation
      try {
        this.conversationStore.addTurn(convId, {
          role: 'user',
          content: prompt,
          metadata: { source: 'broker', ...metadata }
        });
        console.log(`[AgentRunner] Logged user turn to conversation ${convId}`);
      } catch (error) {
        console.error(`[AgentRunner] Failed to log user turn:`, error);
      }

      // Build layered prompt
      const fullPrompt = buildAgentPrompt({ agent, ticketPayload: prompt });

      // Execute via CLI
      const result = await this.runClaudeOnce({
        agentId,
        prompt: fullPrompt,
        cwd: agent.metadata?.cwd || process.cwd(),
        timeoutMs
      });

      // Add assistant turn to conversation
      try {
        this.conversationStore.addTurn(convId, {
          role: 'assistant',
          content: result.response,
          metadata: {
            durationMs: result.durationMs,
            sessionId: result.sessionId,
            exitCode: result.code
          }
        });
        console.log(`[AgentRunner] Logged assistant turn to conversation ${convId}`);
      } catch (error) {
        console.error(`[AgentRunner] Failed to log assistant turn:`, error);
      }

      const durationMs = Date.now() - startTime;

      // Phase 3 - Issue #135: Track conversation turn for compaction monitoring
      try {
        const compactionStatus = await this.compactionMonitor.trackTurn(agentId, {
          tokens: result.response.length, // Estimate tokens from response length
          error: result.code !== 0,
          responseTime: durationMs / 1000, // Convert to seconds
          confusionCount: 0
        });

        // Log warnings when thresholds are hit
        if (compactionStatus.severity === 'warning') {
          console.warn(`[AgentRunner] Compaction warning for ${agentId}: ${compactionStatus.reasons.join(', ')}`);
        } else if (compactionStatus.severity === 'critical') {
          console.error(`[AgentRunner] CRITICAL compaction for ${agentId}: ${compactionStatus.recommendation}`);
          console.error(`[AgentRunner] Metrics: ${JSON.stringify(compactionStatus.metrics)}`);
        }
      } catch (error) {
        console.error(`[AgentRunner] Failed to track compaction:`, error);
      }

      // Emit EXECUTION_COMPLETED event
      this.metrics.record('EXECUTION_COMPLETED', agentId, {
        cliType,
        durationMs,
        success: result.code === 0,
        metadata: { sessionId: result.sessionId, exitCode: result.code }
      });

      // Mark session as initialized if we got a sessionId
      if (result.sessionId) {
        this.sessionManager.markSessionInitialized(agentId, result.sessionId);
      }

      // Release lock on success
      this.sessionManager.releaseLock(agentId);

      return {
        conversationId: convId,
        content: result.response,
        success: result.code === 0,
        durationMs,
        metadata: {
          sessionId: result.sessionId,
          exitCode: result.code
        }
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;

      console.error(`[AgentRunner] Execution failed for ${agentId}:`, error.message);

      // Emit EXECUTION_FAILED event
      const eventType = error.message.includes('timeout') || error.message.includes('TIMEOUT')
        ? 'EXECUTION_TIMEOUT'
        : 'EXECUTION_FAILED';

      this.metrics.record(eventType, agentId, {
        cliType,
        durationMs,
        success: false,
        metadata: { error: error.message }
      });

      // Log error turn if we have a conversation (use convId, not options.conversationId)
      if (convId) {
        this.conversationStore.addTurn(convId, {
          role: 'system',
          content: `Error: ${error.message}`,
          metadata: { error: true, durationMs }
        });
      }

      // Phase 3 - Issue #135: Track error in compaction monitoring
      try {
        await this.compactionMonitor.trackTurn(agentId, {
          tokens: 0,
          error: true,
          responseTime: durationMs / 1000,
          confusionCount: 0
        });
      } catch (trackError) {
        console.error(`[AgentRunner] Failed to track error in compaction:`, trackError);
      }

      // CRITICAL: Always release lock on error
      this.sessionManager.releaseLock(agentId);

      throw error;
    }
  }

  /**
   * Cancel execution for an agent
   */
  async cancelExecution(agentId) {
    return this.sessionManager.cancelExecution(agentId);
  }

  /**
   * End session for an agent
   */
  async endSession(agentId) {
    return this.sessionManager.endSession(agentId);
  }

  /**
   * Check circuit breaker state (lightweight check before lock acquisition)
   *
   * @param {string} agentId - Agent identifier
   * @throws {Error} If circuit is OPEN or HALF_OPEN with max attempts
   */
  async checkCircuitBreaker(agentId) {
    const circuit = this.circuitBreaker.getCircuit(agentId);

    // Reject if circuit is OPEN
    if (circuit.state === 'OPEN') {
      const timeSinceFailure = Date.now() - circuit.lastFailureTime;
      const resetTimeMs = this.circuitBreaker.resetTimeMs;

      this.metrics.record('CIRCUIT_REJECTED', agentId, {
        metadata: {
          state: circuit.state,
          failures: circuit.failures,
          timeSinceFailure
        }
      });

      throw new Error(`Circuit breaker is OPEN for ${agentId} - too many failures (${circuit.failures}/${this.circuitBreaker.failureThreshold}). Retry in ${Math.round((resetTimeMs - timeSinceFailure) / 1000)}s.`);
    }

    // Reject if HALF_OPEN and already testing
    if (circuit.state === 'HALF_OPEN' && circuit.halfOpenAttempts >= this.circuitBreaker.halfOpenMaxAttempts) {
      throw new Error(`Circuit breaker is HALF_OPEN for ${agentId} - already testing recovery`);
    }
  }

  /**
   * Build system context that teaches agents about Kokino and inter-agent communication.
   * Issue #112: Agents need context to know they should use MCP tools for team collaboration.
   */
  buildSystemContext(agent) {
    const templatePath = path.join(process.cwd(), 'prompts', 'agent-system-context.md');

    if (!fs.existsSync(templatePath)) {
      console.warn(`[AgentRunner] System context template not found: ${templatePath}`);
      return '';
    }

    let template = fs.readFileSync(templatePath, 'utf8');

    // Replace template variables
    template = template
      .replace(/\{\{agentId\}\}/g, agent.agentId || 'unknown')
      .replace(/\{\{role\}\}/g, agent.metadata?.role || 'general-purpose')
      .replace(/\{\{status\}\}/g, agent.status || 'unknown');

    return template;
  }

  /**
   * Execute a single prompt against Claude Code CLI
   *
   * Reference: Network Chuck's runClaudeOnce()
   *
   * NOTE: Circuit breaker check happens in execute() BEFORE lock acquisition.
   * This method wraps execution in circuit breaker for success/failure tracking.
   */
  async runClaudeOnce({ agentId, prompt, cwd, timeoutMs = 300000 }) {
    const startTime = Date.now();

    // Get agent to determine CLI type
    const agent = await this.registry.get(agentId);
    const cliType = agent?.type || 'claude-code';

    // Track success/failure with circuit breaker (check already done in execute())
    return this.circuitBreaker.execute(agentId, async () => {
      // Issue #112: Inject system context to teach agents about inter-agent communication
      const systemContext = this.buildSystemContext(agent);
      const fullPrompt = systemContext ? `${systemContext}\n\n---\n\n${prompt}` : prompt;

      // Build CLI arguments
      const args = [
        '--dangerously-skip-permissions',  // REQUIRED for headless
        '-p', fullPrompt,  // Issue #112: Include system context
        '--model', process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        '--output-format', 'stream-json',  // Issue #110: Fix JSONL parsing
        '--verbose',  // Required for stream-json output format
      ];

      // Session management: --session-id for NEW, --resume for EXISTING
      const sessionInfo = this.sessionManager.getSessionInfo(agentId);
      if (sessionInfo?.hasSession && sessionInfo?.sessionId) {
        // Continue existing session (resume uses the UUID session ID)
        args.push('--resume', sessionInfo.sessionId);
        console.log(`[AgentRunner] Resuming session: ${sessionInfo.sessionId}`);
      } else {
        // Create new session with UUID
        const sessionId = sessionInfo?.sessionId || randomUUID();
        args.push('--session-id', sessionId);
        console.log(`[AgentRunner] Starting new session: ${sessionId} for agent ${agentId}`);
      }

      // Add MCP config if configured
      if (agent?.metadata?.mcpConfigPath) {
        args.push('--mcp-config', agent.metadata.mcpConfigPath);
      }

      return new Promise((resolve, reject) => {
        // Use ProcessSupervisor for resource monitoring
        // Resolve 'claude' from PATH (via claudeEnv)
        const claude = this.processSupervisor.spawn('claude', args, {
          agentId,
          maxMemoryMB: 2048,
          maxCPUPercent: 200,
          timeoutMs,
          env: claudeEnv,
          cwd: cwd || process.cwd(),
        });

        // Track active call for cancellation in SessionManager
        this.sessionManager.registerProcess(agentId, claude);
        this.activeCalls.set(agentId, claude);

        // Log process start
        this.logRotator.writeEvent(agentId, 'PROCESS_STARTED', { pid: claude.pid, timeoutMs });

        let stdout = '';
        let stderr = '';

        // Close stdin immediately (headless mode)
        claude.stdin.end();

        // Collect stdout and log
        claude.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          this.logRotator.write(agentId, text, 'stdout');
        });

        // Collect stderr and log
        claude.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          this.logRotator.write(agentId, text, 'stderr');
        });

        // Handle process errors
        claude.on('error', (error) => {
          this.activeCalls.delete(agentId);
          this.logRotator.writeEvent(agentId, 'PROCESS_ERROR', { error: error.message });
          reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
        });

        // Handle process exit
        claude.on('close', (code) => {
          this.activeCalls.delete(agentId);
          const durationMs = Date.now() - startTime;

          this.logRotator.writeEvent(agentId, 'PROCESS_EXITED', { code, durationMs });

          // Capture CLI version (async, don't block)
          setImmediate(() => {
            this.versionTracker.capture(agentId, cliType);
          });

          if (code !== 0) {
            reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
            return;
          }

          // Parse JSONL output with hardened parser
          const parsed = this.jsonlParser.parse(stdout, {
            agentId,
            cliType,
            strict: false // Don't fail on unknown events
          });

          // Log parsing warnings
          if (parsed.unknownEvents.length > 0) {
            console.warn(`[AgentRunner] ${parsed.unknownEvents.length} unknown JSONL events for ${agentId}`);
          }
          if (parsed.errors.length > 0) {
            console.warn(`[AgentRunner] ${parsed.errors.length} JSONL parse errors for ${agentId}`);
          }

          resolve({
            code,
            response: parsed.response,
            sessionId: parsed.sessionId,
            durationMs,
            stdout,
            stderr,
            usage: parsed.usage,
            events: parsed.events,
            parseWarnings: {
              unknownEvents: parsed.unknownEvents,
              errors: parsed.errors
            }
          });
        });

        // Timeout handling
        const timeout = setTimeout(() => {
          if (this.activeCalls.has(agentId)) {
            claude.kill('SIGTERM');
            this.activeCalls.delete(agentId);
            this.logRotator.writeEvent(agentId, 'PROCESS_TIMEOUT', { timeoutMs });
            reject(new Error(`Execution timeout after ${timeoutMs}ms`));
          }
        }, timeoutMs);

        claude.on('close', () => clearTimeout(timeout));
      });
    });
  }

  /**
   * Get conversation history for agent
   */
  async getHistory(agentId) {
    const conversations = this.conversationStore.getAgentConversations(agentId);
    if (conversations.length === 0) return [];

    const latestConv = conversations[0];
    return this.conversationStore.getTurns(latestConv.conversationId);
  }

  /**
   * Get or create conversation for agent
   */
  async getConversation(agentId) {
    const conversations = this.conversationStore.getAgentConversations(agentId);
    if (conversations.length > 0) {
      return conversations[0].conversationId;
    }
    return this.conversationStore.createConversation(agentId);
  }
}
