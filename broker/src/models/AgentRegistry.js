// Agent registry with SQLite persistence and heartbeat tracking
import { AgentRepository } from '../db/AgentRepository.js';

export class AgentRegistry {
  constructor() {
    this.repo = new AgentRepository();

    // Load existing agents from database on startup
    const agents = this.repo.getAll();
    console.log(`[registry] Loaded ${agents.length} agents from database`);
  }

  register(agentId, { type, metadata = {}, heartbeatIntervalMs }) {
    const now = new Date().toISOString();
    const existing = this.repo.get(agentId);

    // Extract commMode from metadata if provided, otherwise default to tmux
    const commMode = metadata.commMode ?? existing?.commMode ?? 'tmux';

    const record = {
      agentId,
      type: type ?? existing?.type ?? 'unknown',
      commMode,
      metadata: { ...existing?.metadata, ...metadata },
      status: 'online',
      lastHeartbeat: now,
      heartbeatIntervalMs: heartbeatIntervalMs ?? existing?.heartbeatIntervalMs ?? 30000
    };

    this.repo.save(record);
    console.log(`[registry] Registered agent: ${agentId} (${type}, commMode: ${commMode})`);
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
    const updated = this.repo.updateStatus(agentId, 'online');
    if (updated) {
      console.log(`[registry] Started agent: ${agentId}`);
      return this.repo.get(agentId);
    }
    return null;
  }

  stop(agentId) {
    const updated = this.repo.updateStatus(agentId, 'offline');
    if (updated) {
      console.log(`[registry] Stopped agent: ${agentId}`);
      return this.repo.get(agentId);
    }
    return null;
  }

  restart(agentId) {
    // First stop, then start
    const stopped = this.repo.updateStatus(agentId, 'offline');
    if (stopped) {
      // Small delay to simulate restart
      setTimeout(() => {
        this.repo.updateStatus(agentId, 'online');
        console.log(`[registry] Restarted agent: ${agentId}`);
      }, 100);
      return this.repo.get(agentId);
    }
    return null;
  }

  size() {
    return this.repo.getAll().length;
  }
}
