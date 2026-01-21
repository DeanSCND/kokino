// In-memory agent registry with heartbeat tracking

export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  register(agentId, { type, metadata = {}, heartbeatIntervalMs }) {
    const now = new Date().toISOString();
    const record = this.agents.get(agentId) || { agentId };

    record.type = type ?? record.type ?? 'unknown';
    record.metadata = { ...record.metadata, ...metadata };
    record.status = 'online';
    record.lastHeartbeat = now;
    record.heartbeatIntervalMs = heartbeatIntervalMs ?? record.heartbeatIntervalMs ?? null;

    this.agents.set(agentId, record);
    console.log(`[registry] Registered agent: ${agentId} (${type})`);
    return record;
  }

  touch(agentId) {
    const record = this.agents.get(agentId);
    if (record) {
      record.lastHeartbeat = new Date().toISOString();
      record.status = 'online';
    }
    return record;
  }

  get(agentId) {
    return this.agents.get(agentId);
  }

  list(filters = {}) {
    let results = Array.from(this.agents.values());

    if (filters.type) {
      results = results.filter(a => a.type === filters.type);
    }

    if (filters.status) {
      results = results.filter(a => a.status === filters.status);
    }

    return results;
  }

  delete(agentId) {
    const existed = this.agents.delete(agentId);
    if (existed) {
      console.log(`[registry] Deleted agent: ${agentId}`);
    }
    return existed;
  }

  size() {
    return this.agents.size;
  }
}
