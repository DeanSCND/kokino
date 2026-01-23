import { spawn, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../..');

/**
 * ProcessManager - Centralized agent process spawning and lifecycle management
 *
 * Responsibilities:
 * - Spawn agents in tmux sessions with proper configuration
 * - Track PIDs, sessions, and agent metadata
 * - Stop/restart agents gracefully
 * - Auto-register agents with broker
 * - Start message watchers for each agent
 */
export class ProcessManager {
  constructor(registry, brokerUrl = 'http://127.0.0.1:5050') {
    this.registry = registry;
    this.brokerUrl = brokerUrl;

    // Track spawned processes
    // agentId -> { pid, watcherPid, session, type, spawned }
    this.processes = new Map();

    // Supported agent types
    this.agentTypes = {
      'claude-code': { command: 'claude', checkCommand: 'claude', flags: '--dangerously-skip-permissions' },
      'droid': { command: 'droid', checkCommand: 'droid', flags: '' },
      'gemini': { command: 'gemini', checkCommand: 'gemini', flags: '' },
      'mock-agent': { command: 'node', checkCommand: 'node', flags: '' }
    };

    // Ensure logs directory exists
    const logsDir = join(PROJECT_ROOT, 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    console.log('[ProcessManager] Initialized');
  }

  /**
   * Spawn a new agent
   */
  async spawn({ agentId, type = 'claude-code', role = 'Developer', cwd = PROJECT_ROOT, capabilities = [] }) {
    // Check if already spawned
    if (this.processes.has(agentId)) {
      const existing = this.processes.get(agentId);
      if (this.isSessionAlive(existing.session)) {
        return {
          success: false,
          error: `Agent ${agentId} already running in session ${existing.session}`,
          existing: true
        };
      }
      // Session dead, clean up stale entry
      this.processes.delete(agentId);
    }

    // Validate agent type
    if (!this.agentTypes[type]) {
      return {
        success: false,
        error: `Unknown agent type: ${type}. Supported: ${Object.keys(this.agentTypes).join(', ')}`
      };
    }

    const agentConfig = this.agentTypes[type];

    // Check if CLI is available (except for mock-agent)
    if (type !== 'mock-agent' && !this.isCommandAvailable(agentConfig.checkCommand)) {
      return {
        success: false,
        error: `Command '${agentConfig.checkCommand}' not found. Please install ${type} CLI first.`
      };
    }

    const sessionName = `dev-${agentId}`;

    try {
      // Create tmux session
      execSync(`tmux new-session -d -s ${sessionName} -c "${cwd}"`, { stdio: 'ignore' });
      console.log(`[ProcessManager] Created tmux session: ${sessionName}`);

      // Get pane ID
      const paneId = execSync(`tmux display-message -p -t "${sessionName}:0.0" -F "#{pane_id}"`, { encoding: 'utf-8' }).trim();

      // Register agent with broker
      const metadata = {
        cwd,
        session: sessionName,
        paneId,
        role,
        capabilities,
        spawned: new Date().toISOString()
      };

      const registration = this.registry.register(agentId, { type, metadata, heartbeatIntervalMs: 60000 });
      console.log(`[ProcessManager] Registered ${agentId} with broker`);

      // Start message watcher in background
      const watcherLogPath = join(PROJECT_ROOT, 'logs', `watcher-${agentId}.log`);
      const watcherArgs = [
        join(PROJECT_ROOT, 'mcp/bin/message-watcher.js'),
        '--agent', agentId,
        '--session', sessionName,
        '--pane', paneId
      ];

      const watcher = spawn('node', watcherArgs, {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore']
      });

      watcher.unref();
      const watcherPid = watcher.pid;

      console.log(`[ProcessManager] Started message watcher (PID: ${watcherPid})`);

      // Generate MCP config for agent
      const mcpConfigDir = join(PROJECT_ROOT, 'mcp/configs');
      if (!existsSync(mcpConfigDir)) {
        mkdirSync(mcpConfigDir, { recursive: true });
      }

      const mcpConfigPath = join(mcpConfigDir, `${agentId}.mcp.json`);
      const mcpConfig = {
        mcpServers: {
          'agent-bridge': {
            command: 'node',
            args: [join(PROJECT_ROOT, 'mcp/build/index.js')],
            env: {
              BRIDGE_BROKER_URL: this.brokerUrl,
              AGENT_ID: agentId
            }
          }
        }
      };

      const fs = await import('node:fs/promises');
      await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

      // Build agent identity prompt
      let identityPrompt = `You are agent '${agentId}' (${type})`;
      if (role) {
        identityPrompt += ` with role: ${role}`;
      }
      identityPrompt += '. You have been automatically registered with the agent-bridge broker. Use co_workers() to see other agents and send_message() to communicate with them.';

      // Start agent CLI based on type
      let startCommand;
      if (type === 'mock-agent') {
        const mockAgentScript = join(PROJECT_ROOT, 'broker/src/agents/mock-agent.js');
        startCommand = `cd "${cwd}" && BROKER_URL=${this.brokerUrl} node "${mockAgentScript}" ${agentId} "${role}"`;
      } else {
        startCommand = `cd "${cwd}" && ${agentConfig.command} ${agentConfig.flags} --mcp-config "${mcpConfigPath}" --append-system-prompt "${identityPrompt}"`;
      }

      // Send command to tmux session
      await this.sendToTmux(sessionName, startCommand);

      // Track the spawned process
      this.processes.set(agentId, {
        session: sessionName,
        paneId,
        type,
        role,
        cwd,
        watcherPid,
        spawned: new Date().toISOString()
      });

      console.log(`[ProcessManager] ✅ Spawned ${agentId} (${type}) in ${sessionName}`);

      return {
        success: true,
        agentId,
        session: sessionName,
        paneId,
        type,
        role,
        watcherPid,
        registration
      };

    } catch (error) {
      console.error(`[ProcessManager] ❌ Failed to spawn ${agentId}:`, error);

      // Cleanup on failure
      try {
        this.registry.delete(agentId);
        execSync(`tmux kill-session -t ${sessionName} 2>/dev/null`, { stdio: 'ignore' });
      } catch {}

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop an agent
   */
  async stop(agentId) {
    const process = this.processes.get(agentId);

    if (!process) {
      return {
        success: false,
        error: `Agent ${agentId} not found in process manager`
      };
    }

    try {
      // Stop message watcher
      if (process.watcherPid) {
        try {
          execSync(`kill ${process.watcherPid} 2>/dev/null`, { stdio: 'ignore' });
          console.log(`[ProcessManager] Stopped watcher (PID: ${process.watcherPid})`);
        } catch {
          // Watcher already stopped
        }
      }

      // Kill tmux session
      if (this.isSessionAlive(process.session)) {
        execSync(`tmux kill-session -t ${process.session}`, { stdio: 'ignore' });
        console.log(`[ProcessManager] Killed session: ${process.session}`);
      }

      // Update registry
      this.registry.stop(agentId);

      // Remove from tracking
      this.processes.delete(agentId);

      console.log(`[ProcessManager] ✅ Stopped ${agentId}`);

      return {
        success: true,
        agentId,
        stopped: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[ProcessManager] ❌ Failed to stop ${agentId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Restart an agent
   */
  async restart(agentId) {
    const process = this.processes.get(agentId);

    if (!process) {
      return {
        success: false,
        error: `Agent ${agentId} not found in process manager`
      };
    }

    const { type, role, cwd } = process;

    // Stop then spawn
    await this.stop(agentId);
    await new Promise(r => setTimeout(r, 1000)); // Brief pause
    return await this.spawn({ agentId, type, role, cwd });
  }

  /**
   * Get status of an agent
   */
  getStatus(agentId) {
    const process = this.processes.get(agentId);

    if (!process) {
      return {
        found: false,
        agentId
      };
    }

    const sessionAlive = this.isSessionAlive(process.session);
    const registration = this.registry.get(agentId);

    return {
      found: true,
      agentId,
      ...process,
      sessionAlive,
      registrationStatus: registration?.status || 'unknown'
    };
  }

  /**
   * List all tracked processes
   */
  listAll() {
    return Array.from(this.processes.entries()).map(([agentId, process]) => ({
      agentId,
      ...process,
      sessionAlive: this.isSessionAlive(process.session)
    }));
  }

  /**
   * Helpers
   */

  isCommandAvailable(command) {
    try {
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  isSessionAlive(sessionName) {
    try {
      execSync(`tmux has-session -t ${sessionName} 2>/dev/null`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async sendToTmux(sessionName, command) {
    return new Promise((resolve, reject) => {
      // Load command into buffer
      const loadBuffer = spawn('tmux', ['load-buffer', '-']);
      loadBuffer.stdin.write(command);
      loadBuffer.stdin.end();

      loadBuffer.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error('Failed to load tmux buffer'));
        }

        // Paste buffer and send Enter
        const pasteBuffer = spawn('tmux', ['paste-buffer', '-t', sessionName, '-d']);
        pasteBuffer.on('close', (pasteCode) => {
          if (pasteCode !== 0) {
            return reject(new Error('Failed to paste tmux buffer'));
          }

          // Send Enter
          const sendEnter = spawn('tmux', ['send-keys', '-t', sessionName, 'C-m']);
          sendEnter.on('close', (enterCode) => {
            if (enterCode === 0) {
              resolve();
            } else {
              reject(new Error('Failed to send Enter'));
            }
          });
        });
      });
    });
  }

  /**
   * Session Recovery - Reconnect to existing tmux sessions on broker restart
   */
  async recoverSessions() {
    console.log('[ProcessManager] Starting session recovery...');

    const agents = this.registry.list(); // Get all registered agents
    let reconnected = 0;
    let cleaned = 0;

    for (const agent of agents) {
      const sessionName = agent.metadata?.session || `dev-${agent.agentId}`;

      // Check if session exists
      if (this.isSessionAlive(sessionName)) {
        // Session exists - reconnect
        const watcherPid = await this.restartWatcher(agent.agentId, sessionName, agent.metadata?.paneId);

        this.processes.set(agent.agentId, {
          session: sessionName,
          paneId: agent.metadata?.paneId,
          type: agent.type,
          role: agent.metadata?.role,
          cwd: agent.metadata?.cwd || PROJECT_ROOT,
          watcherPid,
          spawned: agent.metadata?.spawned
        });

        // Update status to online
        this.registry.start(agent.agentId);
        reconnected++;

        console.log(`[ProcessManager] ✓ Reconnected to ${agent.agentId} in ${sessionName}`);
      } else {
        // Session dead - mark as offline and clean up
        this.registry.stop(agent.agentId);
        cleaned++;

        console.log(`[ProcessManager] ✗ Session ${sessionName} for ${agent.agentId} not found - marked offline`);
      }
    }

    return { reconnected, cleaned, total: agents.length };
  }

  /**
   * Restart message watcher for an existing agent
   */
  async restartWatcher(agentId, sessionName, paneId) {
    const watcherArgs = [
      join(PROJECT_ROOT, 'mcp/bin/message-watcher.js'),
      '--agent', agentId,
      '--session', sessionName
    ];

    if (paneId) {
      watcherArgs.push('--pane', paneId);
    }

    const watcher = spawn('node', watcherArgs, {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore']
    });

    watcher.unref();
    const watcherPid = watcher.pid;

    console.log(`[ProcessManager] Restarted watcher for ${agentId} (PID: ${watcherPid})`);
    return watcherPid;
  }
}
