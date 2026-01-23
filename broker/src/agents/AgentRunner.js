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

/**
 * Build the full environment that Claude Code expects.
 * This mimics what happens when you run `claude` in a terminal
 * with your shell profile fully loaded.
 *
 * CRITICAL: Must delete ANTHROPIC_API_KEY to force subscription auth!
 */
function buildClaudeEnvironment() {
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

    // Session tracking: agentId -> { hasSession: true }
    this.sessions = new Map();

    // Active subprocess calls: agentId -> ChildProcess
    this.activeCalls = new Map();

    console.log('[AgentRunner] Initialized with pre-built Claude environment');
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

    if (agent.commMode !== 'headless') {
      throw new Error(`Agent ${agentId} is not in headless mode (current: ${agent.commMode})`);
    }

    const startTime = Date.now();
    let convId;

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
      this.conversationStore.addTurn(convId, {
        role: 'user',
        content: prompt,
        metadata: { source: 'broker', ...metadata }
      });

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
      this.conversationStore.addTurn(convId, {
        role: 'assistant',
        content: result.response,
        metadata: {
          durationMs: result.durationMs,
          sessionId: result.sessionId,
          exitCode: result.code
        }
      });

      const durationMs = Date.now() - startTime;

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

      // Log error turn if we have a conversation (use convId, not options.conversationId)
      if (convId) {
        this.conversationStore.addTurn(convId, {
          role: 'system',
          content: `Error: ${error.message}`,
          metadata: { error: true, durationMs }
        });
      }

      throw error;
    }
  }

  /**
   * Execute a single prompt against Claude Code CLI
   *
   * Reference: Network Chuck's runClaudeOnce()
   */
  async runClaudeOnce({ agentId, prompt, cwd, timeoutMs = 300000 }) {
    const startTime = Date.now();

    // Build CLI arguments
    const args = [
      '--dangerously-skip-permissions',  // REQUIRED for headless
      '-p', prompt,
      '--model', process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    ];

    // Session management: --session-id for NEW, --resume for EXISTING
    const sessionInfo = this.sessions.get(agentId);
    if (sessionInfo?.sessionId) {
      // Continue existing session (resume uses the UUID session ID)
      args.push('--resume', sessionInfo.sessionId);
      console.log(`[AgentRunner] Resuming session: ${sessionInfo.sessionId}`);
    } else {
      // Create new session with UUID
      const sessionId = randomUUID();
      args.push('--session-id', sessionId);
      this.sessions.set(agentId, { sessionId });
      console.log(`[AgentRunner] Starting new session: ${sessionId} for agent ${agentId}`);
    }

    // Add MCP config if configured
    const agent = await this.registry.get(agentId);
    if (agent?.metadata?.mcpConfigPath) {
      args.push('--mcp-config', agent.metadata.mcpConfigPath);
    }

    return new Promise((resolve, reject) => {
      const claude = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: claudeEnv,  // Pre-built environment
        cwd: cwd || process.cwd(),
      });

      // Track active call for cancellation
      this.activeCalls.set(agentId, claude);

      let stdout = '';
      let stderr = '';

      // Close stdin immediately (headless mode)
      claude.stdin.end();

      // Collect stdout
      claude.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      claude.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process errors
      claude.on('error', (error) => {
        this.activeCalls.delete(agentId);
        reject(new Error(`Failed to spawn Claude CLI: ${error.message}`));
      });

      // Handle process exit
      claude.on('close', (code) => {
        this.activeCalls.delete(agentId);
        const durationMs = Date.now() - startTime;

        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }

        const { response, sessionId } = parseClaudeStdout(stdout);

        resolve({
          code,
          response,
          sessionId,
          durationMs,
          stdout,
          stderr,
        });
      });

      // Timeout handling
      const timeout = setTimeout(() => {
        if (this.activeCalls.has(agentId)) {
          claude.kill('SIGTERM');
          this.activeCalls.delete(agentId);
          reject(new Error(`Execution timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      claude.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * End a session when agent is stopped
   */
  endSession(agentId) {
    if (this.sessions.has(agentId)) {
      this.sessions.delete(agentId);
      console.log(`[AgentRunner] Session ended: ${agentId}`);
    }

    // Kill active call if running
    if (this.activeCalls.has(agentId)) {
      const process = this.activeCalls.get(agentId);
      process.kill('SIGTERM');
      this.activeCalls.delete(agentId);
      console.log(`[AgentRunner] Killed active process for: ${agentId}`);
    }
  }

  /**
   * Cancel running execution
   */
  async cancel(agentId) {
    if (this.activeCalls.has(agentId)) {
      const process = this.activeCalls.get(agentId);
      process.kill('SIGTERM');
      this.activeCalls.delete(agentId);
      console.log(`[AgentRunner] Cancelled execution for: ${agentId}`);
      return true;
    }
    return false;
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
