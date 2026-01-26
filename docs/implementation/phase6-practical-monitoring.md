# Phase 6: Practical Monitoring Implementation

## Realistic Scope (1 Week Implementation)

### What We're Building (MVP)
- Agent status dashboard
- Basic metrics collection (CPU, memory)
- Simple error log aggregation
- Agent lifecycle events

### What We're NOT Building (Defer)
- ❌ File operation interception
- ❌ Workspace boundary monitoring
- ❌ Complex alerting rules
- ❌ Time-series database
- ❌ Performance profiling

## Why Simpler Monitoring?

The original spec wanted to intercept all file operations to track boundary violations. This requires:
- Modifying agent runtime (Claude Code internals)
- Process wrapping complexity
- Performance overhead
- Security concerns

Instead, we'll build **practical monitoring** that helps debug and operate agents.

## Database Schema

```sql
-- Migration 007_add_monitoring_tables.sql
CREATE TABLE agent_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cpu_percent REAL,
  memory_mb INTEGER,
  status TEXT,
  error_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- started, stopped, error, warning
  message TEXT,
  metadata JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  error_type TEXT,
  message TEXT,
  stack_trace TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

-- Indexes for performance
CREATE INDEX idx_agent_metrics_agent_time ON agent_metrics(agent_id, timestamp);
CREATE INDEX idx_agent_events_agent_type ON agent_events(agent_id, event_type);
CREATE INDEX idx_error_logs_agent_resolved ON error_logs(agent_id, resolved);
```

## Monitoring Service

`broker/src/services/MonitoringService.js`:
```javascript
import db from '../db/schema.js';
import { EventEmitter } from 'events';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class MonitoringService extends EventEmitter {
  constructor(agentRegistry) {
    super();
    this.agentRegistry = agentRegistry;
    this.metricsInterval = null;
    this.isRunning = false;
  }

  start(intervalMs = 30000) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.collectMetrics(); // Initial collection

    // Regular collection
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    console.log(`[monitoring] Started metrics collection (interval: ${intervalMs}ms)`);
  }

  stop() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.isRunning = false;
    console.log('[monitoring] Stopped metrics collection');
  }

  async collectMetrics() {
    const agents = this.agentRegistry.list({ status: 'online' });

    for (const agent of agents) {
      try {
        const metrics = await this.getAgentMetrics(agent.agentId);
        this.saveMetrics(agent.agentId, metrics);
      } catch (error) {
        console.error(`Failed to collect metrics for ${agent.agentId}:`, error);
        this.logEvent(agent.agentId, 'error', 'Metrics collection failed', {
          error: error.message
        });
      }
    }
  }

  async getAgentMetrics(agentId) {
    // Get process info if we have PID
    const agent = this.agentRegistry.get(agentId);
    const pid = agent?.metadata?.pid;

    if (!pid) {
      return {
        cpuPercent: 0,
        memoryMb: 0,
        status: agent?.status || 'unknown',
        errorCount: 0,
        messageCount: this.getMessageCount(agentId)
      };
    }

    // Get CPU and memory for process (platform-specific)
    const metrics = await this.getProcessMetrics(pid);

    // Get message/error counts from database
    const errorCount = db.prepare(
      'SELECT COUNT(*) as count FROM error_logs WHERE agent_id = ? AND resolved = 0'
    ).get(agentId)?.count || 0;

    const messageCount = this.getMessageCount(agentId);

    return {
      cpuPercent: metrics.cpu,
      memoryMb: metrics.memory,
      status: agent.status,
      errorCount,
      messageCount
    };
  }

  async getProcessMetrics(pid) {
    try {
      if (process.platform === 'darwin') {
        // macOS
        const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,rss`);
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          const [cpu, rss] = lines[1].trim().split(/\s+/);
          return {
            cpu: parseFloat(cpu) || 0,
            memory: Math.round(parseInt(rss) / 1024) || 0  // KB to MB
          };
        }
      } else if (process.platform === 'linux') {
        // Linux
        const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,rss --no-headers`);
        const [cpu, rss] = stdout.trim().split(/\s+/);
        return {
          cpu: parseFloat(cpu) || 0,
          memory: Math.round(parseInt(rss) / 1024) || 0
        };
      }
    } catch (error) {
      // Process might have died
      return { cpu: 0, memory: 0 };
    }

    return { cpu: 0, memory: 0 };
  }

  saveMetrics(agentId, metrics) {
    db.prepare(`
      INSERT INTO agent_metrics (agent_id, cpu_percent, memory_mb, status, error_count, message_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      metrics.cpuPercent,
      metrics.memoryMb,
      metrics.status,
      metrics.errorCount,
      metrics.messageCount
    );

    // Emit for real-time dashboard
    this.emit('metrics', { agentId, ...metrics });
  }

  getMessageCount(agentId) {
    // Count tickets/messages for this agent
    const count = db.prepare(
      'SELECT COUNT(*) as count FROM tickets WHERE target_agent = ? OR origin_agent = ?'
    ).get(agentId, agentId);

    return count?.count || 0;
  }

  // Event logging
  logEvent(agentId, eventType, message, metadata = {}) {
    db.prepare(`
      INSERT INTO agent_events (agent_id, event_type, message, metadata)
      VALUES (?, ?, ?, ?)
    `).run(
      agentId,
      eventType,
      message,
      JSON.stringify(metadata)
    );

    this.emit('event', { agentId, eventType, message, metadata });
  }

  // Error tracking
  logError(agentId, error) {
    db.prepare(`
      INSERT INTO error_logs (agent_id, error_type, message, stack_trace)
      VALUES (?, ?, ?, ?)
    `).run(
      agentId,
      error.name || 'Error',
      error.message,
      error.stack
    );

    this.emit('error', { agentId, error });
  }

  // Dashboard data
  async getDashboardData() {
    const agents = this.agentRegistry.list();

    // Get latest metrics for each agent
    const agentMetrics = {};
    for (const agent of agents) {
      const metrics = db.prepare(`
        SELECT * FROM agent_metrics
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(agent.agentId);

      agentMetrics[agent.agentId] = metrics || {
        cpuPercent: 0,
        memoryMb: 0,
        status: agent.status
      };
    }

    // Get recent events
    const recentEvents = db.prepare(`
      SELECT * FROM agent_events
      ORDER BY timestamp DESC
      LIMIT 20
    `).all();

    // Get unresolved errors
    const activeErrors = db.prepare(`
      SELECT agent_id, COUNT(*) as count
      FROM error_logs
      WHERE resolved = 0
      GROUP BY agent_id
    `).all();

    // System metrics
    const systemMetrics = {
      cpuUsage: os.loadavg()[0],
      totalMemory: Math.round(os.totalmem() / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024),
      uptime: os.uptime()
    };

    return {
      agents: agents.map(agent => ({
        ...agent,
        metrics: agentMetrics[agent.agentId]
      })),
      recentEvents,
      activeErrors,
      systemMetrics
    };
  }

  // Get agent-specific data
  async getAgentDashboard(agentId) {
    // Recent metrics (last hour)
    const metrics = db.prepare(`
      SELECT * FROM agent_metrics
      WHERE agent_id = ? AND timestamp > datetime('now', '-1 hour')
      ORDER BY timestamp DESC
    `).all(agentId);

    // Recent events
    const events = db.prepare(`
      SELECT * FROM agent_events
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT 50
    `).all(agentId);

    // Errors
    const errors = db.prepare(`
      SELECT * FROM error_logs
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(agentId);

    return {
      agentId,
      metrics,
      events,
      errors
    };
  }

  // Simple alerting
  checkAlerts() {
    const agents = this.agentRegistry.list({ status: 'online' });

    for (const agent of agents) {
      const latestMetric = db.prepare(`
        SELECT * FROM agent_metrics
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(agent.agentId);

      if (!latestMetric) continue;

      // High CPU alert
      if (latestMetric.cpu_percent > 80) {
        this.emit('alert', {
          agentId: agent.agentId,
          type: 'high_cpu',
          message: `CPU usage at ${latestMetric.cpu_percent}%`,
          severity: 'warning'
        });
      }

      // High memory alert
      if (latestMetric.memory_mb > 1024) {
        this.emit('alert', {
          agentId: agent.agentId,
          type: 'high_memory',
          message: `Memory usage at ${latestMetric.memory_mb}MB`,
          severity: 'warning'
        });
      }

      // Error count alert
      if (latestMetric.error_count > 10) {
        this.emit('alert', {
          agentId: agent.agentId,
          type: 'high_errors',
          message: `${latestMetric.error_count} unresolved errors`,
          severity: 'critical'
        });
      }
    }
  }

  // Cleanup old data
  async cleanup(daysToKeep = 7) {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('DELETE FROM agent_metrics WHERE timestamp < ?').run(cutoff);
    db.prepare('DELETE FROM agent_events WHERE timestamp < ?').run(cutoff);
    db.prepare('DELETE FROM error_logs WHERE timestamp < ? AND resolved = 1').run(cutoff);

    console.log(`[monitoring] Cleaned up data older than ${daysToKeep} days`);
  }
}
```

## API Routes

`broker/src/api/routes/monitoring.js`:
```javascript
export function createMonitoringRoutes(monitoringService) {
  return {
    // GET /api/monitoring/dashboard
    async getDashboard(req, res) {
      try {
        const data = await monitoringService.getDashboardData();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    // GET /api/monitoring/agents/:agentId
    async getAgentDashboard(req, res) {
      try {
        const data = await monitoringService.getAgentDashboard(req.params.agentId);
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    // POST /api/monitoring/agents/:agentId/events
    async logEvent(req, res) {
      try {
        const { agentId } = req.params;
        const { eventType, message, metadata } = req.body;

        monitoringService.logEvent(agentId, eventType, message, metadata);
        res.status(201).json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // POST /api/monitoring/agents/:agentId/errors
    async logError(req, res) {
      try {
        const { agentId } = req.params;
        const { error } = req.body;

        monitoringService.logError(agentId, error);
        res.status(201).json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // PATCH /api/monitoring/errors/:errorId/resolve
    async resolveError(req, res) {
      try {
        db.prepare('UPDATE error_logs SET resolved = 1 WHERE id = ?').run(req.params.errorId);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    }
  };
}
```

## Simple Dashboard UI

`ui/src/components/MonitoringDashboard.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, Cpu, HardDrive } from 'lucide-react';
import apiClient from '../services/api-client';

export function MonitoringDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await apiClient.get('/api/monitoring/dashboard');
      setDashboard(response.data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading monitoring data...</div>;
  if (!dashboard) return <div>No monitoring data available</div>;

  return (
    <div className="p-6">
      {/* System Overview */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">System Overview</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Agents</p>
                <p className="text-2xl font-bold">
                  {dashboard.agents.filter(a => a.status === 'online').length}
                </p>
              </div>
              <Activity className="text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">CPU Load</p>
                <p className="text-2xl font-bold">
                  {dashboard.systemMetrics.cpuUsage.toFixed(2)}
                </p>
              </div>
              <Cpu className="text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Memory</p>
                <p className="text-2xl font-bold">
                  {Math.round((dashboard.systemMetrics.totalMemory - dashboard.systemMetrics.freeMemory) / dashboard.systemMetrics.totalMemory * 100)}%
                </p>
              </div>
              <HardDrive className="text-purple-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Errors</p>
                <p className="text-2xl font-bold">
                  {dashboard.activeErrors.reduce((sum, e) => sum + e.count, 0)}
                </p>
              </div>
              <AlertCircle className="text-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Status Table */}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Agent Status</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">CPU %</th>
                <th className="px-4 py-2 text-left">Memory MB</th>
                <th className="px-4 py-2 text-left">Messages</th>
                <th className="px-4 py-2 text-left">Errors</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.agents.map(agent => (
                <tr
                  key={agent.agentId}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedAgent(agent.agentId)}
                >
                  <td className="px-4 py-2">{agent.agentId}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      agent.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {agent.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">{agent.metrics?.cpuPercent?.toFixed(1) || '0'}</td>
                  <td className="px-4 py-2">{agent.metrics?.memoryMb || '0'}</td>
                  <td className="px-4 py-2">{agent.metrics?.messageCount || '0'}</td>
                  <td className="px-4 py-2">
                    {agent.metrics?.errorCount > 0 && (
                      <span className="text-red-600 font-semibold">
                        {agent.metrics.errorCount}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Events */}
      <div>
        <h2 className="text-xl font-bold mb-4">Recent Events</h2>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="space-y-2">
            {dashboard.recentEvents.map(event => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <span className="text-gray-500">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  event.event_type === 'error' ? 'bg-red-100 text-red-800' :
                  event.event_type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {event.event_type}
                </span>
                <span className="font-medium">{event.agent_id}</span>
                <span className="text-gray-600">{event.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Integration Points

### With Agent Lifecycle

```javascript
// In agent start
monitoringService.logEvent(agentId, 'started', 'Agent started', {
  config: agentConfig,
  pid: process.pid
});

// In agent stop
monitoringService.logEvent(agentId, 'stopped', 'Agent stopped');

// In error handlers
monitoringService.logError(agentId, error);
```

### With WebSocket for Real-time

```javascript
// Broadcast metrics to dashboard
monitoringService.on('metrics', (data) => {
  wss.broadcast({
    type: 'metrics_update',
    data
  });
});

monitoringService.on('alert', (alert) => {
  wss.broadcast({
    type: 'alert',
    data: alert
  });
});
```

## Testing

```javascript
describe('MonitoringService', () => {
  it('should collect agent metrics');
  it('should log events');
  it('should track errors');
  it('should generate dashboard data');
  it('should emit alerts for thresholds');
  it('should cleanup old data');
});
```

## Timeline

### Day 1: Database & Core Service
- Migration and schema
- MonitoringService class

### Day 2: Metrics Collection
- Process metrics
- System metrics
- Storage

### Day 3: Event & Error Tracking
- Event logging
- Error tracking
- Alert logic

### Day 4: API & Dashboard
- API routes
- Dashboard component
- Real-time updates

### Day 5: Integration & Testing
- Integration with agents
- Testing
- Documentation

## What This Gives Us

✅ **Visibility** - See what agents are doing
✅ **Debugging** - Track errors and events
✅ **Performance** - Monitor resource usage
✅ **Alerting** - Basic threshold alerts
✅ **History** - Event and metric history

## What We're Deferring

- File operation tracking (complex)
- Workspace boundary monitoring (needs agent modifications)
- Complex alerting rules (can add later)
- Time-series database (SQLite is fine for MVP)
- Distributed tracing (overkill for now)

This practical approach gives us useful monitoring without the complexity of intercepting file operations or modifying agent internals.