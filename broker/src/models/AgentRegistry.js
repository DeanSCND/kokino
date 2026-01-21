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

    const record = {
      agentId,
      type: type ?? existing?.type ?? 'unknown',
      metadata: { ...existing?.metadata, ...metadata },
      status: 'online',
      lastHeartbeat: now,
      heartbeatIntervalMs: heartbeatIntervalMs ?? existing?.heartbeatIntervalMs ?? 30000
    };

    this.repo.save(record);
    console.log(`[registry] Registered agent: ${agentId} (${type})`);
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

  size() {
    return this.repo.getAll().length;
  }
}
