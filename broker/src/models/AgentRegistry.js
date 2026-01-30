// Agent registry with SQLite persistence and heartbeat tracking
import { AgentRepository } from '../db/AgentRepository.js';

export class AgentRegistry {
  constructor() {
    this.repo = new AgentRepository();
    this.monitoringStream = null; // Set via setMonitoringStream() - for real-time event broadcasting

    // Load existing agents from database on startup
    const agents = this.repo.getAll();
    console.log(`[registry] Loaded ${agents.length} agents from database`);
  }

  /**
   * Set monitoring stream for real-time event broadcasting
   * @param {MonitoringStream} stream - Monitoring stream instance
   */
  setMonitoringStream(stream) {
    this.monitoringStream = stream;
  }

  register(agentId, { type, metadata = {}, heartbeatIntervalMs }) {
    const now = new Date().toISOString();
    const existing = this.repo.get(agentId);

    // Extract commMode from metadata if provided, otherwise default to tmux
    const commMode = metadata.commMode ?? existing?.commMode ?? 'tmux';

    // Extract projectId and configId from metadata for Phase 2 linkage
    const projectId = metadata.projectId ?? existing?.projectId ?? null;
    const configId = metadata.configId ?? existing?.configId ?? null;

    const record = {
      agentId,
      type: type ?? existing?.type ?? 'unknown',
      commMode,
      projectId,
      configId,
      metadata: { ...existing?.metadata, ...metadata },
      status: 'idle',  // Issue #110: Start in idle state, require explicit start
      lastHeartbeat: now,
      heartbeatIntervalMs: heartbeatIntervalMs ?? existing?.heartbeatIntervalMs ?? 30000
    };

    this.repo.save(record);
    console.log(`[registry] Registered agent: ${agentId} (${type}, commMode: ${commMode}, project: ${projectId}, config: ${configId})`);
    return record;
  }

  touch(agentId) {
    const updated = this.repo.updateHeartbeat(agentId);
    if (updated) {
      return this.repo.get(agentId);
    }
    return null;
  }

  get(agentId) {
    return this.repo.get(agentId);
  }

  list(filters = {}) {
    return this.repo.getAll(filters);
  }

  delete(agentId) {
    const existed = this.repo.delete(agentId);
    if (existed) {
      console.log(`[registry] Deleted agent: ${agentId}`);
    }
    return existed;
  }

  // Lifecycle methods
  start(agentId) {
    const agent = this.updateStatus(agentId, 'online', 'Started');
    if (agent) {
      console.log(`[registry] Started agent: ${agentId}`);
    }
    return agent;
  }

  stop(agentId) {
    const agent = this.updateStatus(agentId, 'offline', 'Stopped');
    if (agent) {
      console.log(`[registry] Stopped agent: ${agentId}`);
    }
    return agent;
  }

  restart(agentId) {
    // First stop, then start
    const stopped = this.updateStatus(agentId, 'offline', 'Restarting');
    if (stopped) {
      // Small delay to simulate restart
      setTimeout(() => {
        this.updateStatus(agentId, 'online', 'Restarted');
        console.log(`[registry] Restarted agent: ${agentId}`);
      }, 100);
    }
    return stopped;
  }

  size() {
    return this.repo.getAll().length;
  }

  // Issue #110: Agent lifecycle states (idle → starting → ready → busy → ready)
  updateStatus(agentId, status, message = null) {
    const agent = this.repo.get(agentId);
    const oldStatus = agent?.status;

    const updated = this.repo.updateStatus(agentId, status);
    if (updated) {
      console.log(`[registry] Status updated: ${agentId} → ${status}${message ? ` (${message})` : ''}`);

      // Broadcast real-time event to monitoring stream if status changed
      if (this.monitoringStream && oldStatus !== status) {
        this.monitoringStream.broadcast('agent.status', {
          agentId,
          oldStatus: oldStatus || 'unknown',
          newStatus: status,
          timestamp: new Date().toISOString()
        });
      }

      return this.repo.get(agentId);
    }
    return null;
  }

  getStatus(agentId) {
    const agent = this.repo.get(agentId);
    return agent ? agent.status : null;
  }
}
