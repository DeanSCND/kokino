# Monitoring & Boundaries Specification

## Phase 6: Agent Behavior Monitoring & Workspace Boundaries

### Overview

This phase implements comprehensive monitoring of agent behavior to understand what files they access, when they violate soft boundaries, and how they perform. This data will inform future hard isolation designs and provide visibility into agent operations.

### Problem Statement

Currently we have:
- No visibility into which files agents read/write
- No tracking of workspace boundary violations
- No performance metrics for agent operations
- No alerting for problematic behavior
- No data to inform security boundaries

We need monitoring to:
- Build trust in agent behavior
- Identify security/isolation requirements
- Optimize performance
- Debug issues
- Plan for hard boundaries (Docker/VM isolation)

### Monitoring Architecture

```
┌─────────────────────────────────────────────┐
│              Agent Process                  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │         Interceptor Layer           │   │
│  │  (Monitors file ops, API calls)     │   │
│  └────────────────┬────────────────────┘   │
│                   │                         │
│  ┌────────────────▼────────────────────┐   │
│  │         Event Collector             │   │
│  │  (Batches and sends to broker)      │   │
│  └────────────────┬────────────────────┘   │
│                   │                         │
└───────────────────┼─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│            Monitoring Service               │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │          Event Processor            │   │
│  │   (Analyzes, detects violations)    │   │
│  └────────────────┬────────────────────┘   │
│                   │                         │
│  ┌────────────────▼────────────────────┐   │
│  │           Data Storage              │   │
│  │    (TimeSeries DB, Logs, Metrics)   │   │
│  └────────────────┬────────────────────┘   │
│                   │                         │
│  ┌────────────────▼────────────────────┐   │
│  │          Alert Manager              │   │
│  │    (Threshold detection, notify)    │   │
│  └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

### File Operation Monitoring

#### What to Track

```javascript
const FileOperationEvent = {
  // Identifiers
  agentId: "alice-frontend",
  sessionId: "session-123",
  teamId: "team-456",

  // Operation details
  operation: "read",        // read, write, delete, create, execute
  path: "/project/src/App.js",
  absolutePath: "/home/user/project/src/App.js",

  // Context
  timestamp: "2026-01-25T10:30:45.123Z",
  workingDirectory: "/project/frontend",
  isWithinBoundary: true,

  // File metadata
  fileSize: 2048,
  fileType: "javascript",
  permissions: "rw-r--r--",

  // Operation metadata
  bytesRead: 2048,
  bytesWritten: 0,
  duration: 15,           // milliseconds
  success: true,
  error: null
};
```

#### Implementation Approach

##### Option 1: Process Wrapper (Recommended)

```javascript
// Wrap agent process with monitoring
class MonitoredAgentProcess {
  constructor(agentConfig, monitor) {
    this.config = agentConfig;
    this.monitor = monitor;
    this.originalFs = require('fs');
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Override fs methods
    const fs = require('fs');
    const original = {
      readFile: fs.readFile,
      writeFile: fs.writeFile,
      unlink: fs.unlink,
      mkdir: fs.mkdir
    };

    fs.readFile = (path, ...args) => {
      this.monitor.trackFileOp('read', path);
      return original.readFile(path, ...args);
    };

    fs.writeFile = (path, ...args) => {
      this.monitor.trackFileOp('write', path);
      return original.writeFile(path, ...args);
    };
  }
}
```

##### Option 2: Filesystem Watcher

```javascript
// Watch filesystem for changes
class FilesystemMonitor {
  constructor(watchPaths) {
    this.watchers = new Map();
    this.events = [];

    for (const path of watchPaths) {
      const watcher = chokidar.watch(path, {
        persistent: true,
        ignoreInitial: true
      });

      watcher
        .on('add', path => this.onFileAdded(path))
        .on('change', path => this.onFileChanged(path))
        .on('unlink', path => this.onFileDeleted(path));

      this.watchers.set(path, watcher);
    }
  }

  onFileChanged(path) {
    this.events.push({
      type: 'write',
      path,
      timestamp: new Date(),
      agentId: this.currentAgent
    });
  }
}
```

##### Option 3: System Call Tracing (Linux)

```bash
# Use strace to monitor system calls
strace -e trace=file -o trace.log agent-process

# Parse trace log for file operations
grep -E "open|read|write|close" trace.log
```

### Workspace Boundary Detection

#### Boundary Definition

```javascript
class WorkspaceBoundary {
  constructor(agentConfig) {
    this.agentId = agentConfig.agentId;
    this.allowedPaths = [
      agentConfig.workingDirectory,
      '/tmp',
      '/usr/lib/node_modules'  // Read-only system paths
    ];
    this.deniedPaths = [
      '/etc',
      '/sys',
      '~/.ssh',
      '~/.aws'
    ];
  }

  checkBoundary(operation, path) {
    const absolutePath = path.resolve(path);

    // Check denied paths first
    for (const denied of this.deniedPaths) {
      if (absolutePath.startsWith(denied)) {
        return {
          allowed: false,
          reason: 'denied_path',
          severity: 'critical'
        };
      }
    }

    // Check allowed paths
    for (const allowed of this.allowedPaths) {
      if (absolutePath.startsWith(allowed)) {
        return {
          allowed: true,
          reason: 'within_boundary'
        };
      }
    }

    // Outside boundary but not explicitly denied
    return {
      allowed: false,
      reason: 'outside_boundary',
      severity: 'warning'
    };
  }
}
```

#### Violation Tracking

```javascript
const BoundaryViolation = {
  id: "violation-789",
  agentId: "backend-agent",
  timestamp: "2026-01-25T10:30:45.123Z",

  violation: {
    type: "file_access",
    operation: "read",
    path: "/etc/passwd",
    boundaryType: "denied_path",
    severity: "critical"
  },

  context: {
    workingDirectory: "/project/backend",
    allowedPaths: ["/project/backend", "/tmp"],
    sessionId: "session-123",
    teamId: "team-456"
  },

  response: {
    action: "blocked",      // blocked, warned, allowed
    notification: true,
    logged: true
  }
};
```

### Performance Monitoring

#### Metrics to Collect

```javascript
const PerformanceMetrics = {
  agentId: "frontend-agent",
  timestamp: "2026-01-25T10:30:00Z",
  interval: 60000,  // 1 minute

  cpu: {
    usage: 25.5,        // percentage
    user: 20.3,
    system: 5.2
  },

  memory: {
    rss: 256,           // MB - Resident Set Size
    heapTotal: 128,     // MB
    heapUsed: 96,       // MB
    external: 32        // MB
  },

  io: {
    filesRead: 45,
    filesWritten: 12,
    bytesRead: 524288,
    bytesWritten: 131072,
    networkRequests: 23,
    networkBytes: 45678
  },

  operations: {
    tasksCompleted: 5,
    messagesProcessed: 34,
    errorsEncountered: 2,
    avgResponseTime: 234  // ms
  }
};
```

#### Collection Implementation

```javascript
class PerformanceCollector {
  constructor(agentId) {
    this.agentId = agentId;
    this.metrics = {
      operations: new Map(),
      timings: []
    };

    // Collect every minute
    setInterval(() => this.collect(), 60000);
  }

  async collect() {
    const metrics = {
      agentId: this.agentId,
      timestamp: new Date().toISOString(),

      // CPU usage
      cpu: await this.getCpuUsage(),

      // Memory usage
      memory: process.memoryUsage(),

      // Custom metrics
      operations: this.getOperationMetrics()
    };

    await this.send(metrics);
  }

  async getCpuUsage() {
    const startUsage = process.cpuUsage();
    await new Promise(resolve => setTimeout(resolve, 100));
    const endUsage = process.cpuUsage(startUsage);

    const totalTime = (endUsage.user + endUsage.system) / 1000;
    const percentage = (totalTime / 100) * 100;

    return {
      usage: percentage,
      user: endUsage.user / 1000000,
      system: endUsage.system / 1000000
    };
  }

  trackOperation(name, duration, success) {
    if (!this.metrics.operations.has(name)) {
      this.metrics.operations.set(name, {
        count: 0,
        totalDuration: 0,
        failures: 0
      });
    }

    const op = this.metrics.operations.get(name);
    op.count++;
    op.totalDuration += duration;
    if (!success) op.failures++;
  }
}
```

### Dashboard Design

#### Main Dashboard

```
┌──────────────────────────────────────────────────────┐
│                  Kokino Monitor                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Active Teams: 3     Active Agents: 12   Alerts: 2  │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │          File Operations (Last Hour)           │ │
│  │                                                │ │
│  │  [============================] Reads: 1,234  │ │
│  │  [==================] Writes: 567             │ │
│  │  [==] Deletes: 12                             │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │         Boundary Violations                    │ │
│  │                                                │ │
│  │  ⚠ frontend-agent: /etc/hosts (read)          │ │
│  │  🔴 backend-agent: ~/.ssh/id_rsa (read)        │ │
│  │  ⚠ test-agent: ../../../secrets (read)        │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │           Performance Metrics                  │ │
│  │                                                │ │
│  │  CPU: [████████░░] 78%                        │ │
│  │  Memory: [██████░░░░] 61% (2.4GB / 4GB)       │ │
│  │  Disk I/O: 124 MB/s                           │ │
│  │  Network: 45 req/s                            │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### Agent Detail View

```
┌──────────────────────────────────────────────────────┐
│           Agent: frontend-alice                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Status: Active    Session: session-123             │
│  Team: feature-team    Uptime: 2h 34m               │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │         File Access Pattern                   │ │
│  │                                                │ │
│  │  📁 /project/frontend/                        │ │
│  │     📄 src/App.js (R:12 W:3)                 │ │
│  │     📄 src/index.js (R:8 W:1)                │ │
│  │     📁 components/                            │ │
│  │        📄 Button.jsx (R:5 W:2)               │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │         Performance Timeline                  │ │
│  │                                                │ │
│  │  CPU  ▁▂▄█▆▃▂▁▂▃▄▅▆█▇▅▃▂▁                  │ │
│  │  MEM  ▄▄▅▅▅▆▆▆▇▇▇█████████                  │ │
│  │  I/O  ▁▁▁█▁▁▁▁█▁▁▁▁█▁▁▁▁                  │ │
│  │                                                │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Alert System

#### Alert Rules

```yaml
alerts:
  - name: boundary_violation_critical
    condition: violation.severity == "critical"
    action:
      - log
      - notify
      - stop_agent

  - name: high_cpu_usage
    condition: cpu.usage > 90
    duration: 5m
    action:
      - log
      - notify

  - name: excessive_file_operations
    condition: file_ops_per_minute > 1000
    action:
      - log
      - throttle

  - name: suspicious_path_access
    condition: path matches ".*\\.ssh|.*\\.aws|.*password.*"
    action:
      - log
      - notify
      - review

  - name: memory_leak
    condition: memory.growth_rate > 10  # MB/minute
    duration: 10m
    action:
      - notify
      - suggest_restart
```

#### Alert Implementation

```javascript
class AlertManager {
  constructor(rules, notifier) {
    this.rules = rules;
    this.notifier = notifier;
    this.activeAlerts = new Map();
  }

  async evaluate(event) {
    for (const rule of this.rules) {
      if (this.matchesCondition(event, rule)) {
        await this.triggerAlert(rule, event);
      }
    }
  }

  matchesCondition(event, rule) {
    // Parse and evaluate rule condition
    const condition = this.parseCondition(rule.condition);
    return condition.evaluate(event);
  }

  async triggerAlert(rule, event) {
    const alert = {
      id: generateId(),
      rule: rule.name,
      severity: rule.severity || 'warning',
      event,
      timestamp: new Date(),
      status: 'active'
    };

    this.activeAlerts.set(alert.id, alert);

    // Execute actions
    for (const action of rule.actions) {
      await this.executeAction(action, alert);
    }
  }

  async executeAction(action, alert) {
    switch(action) {
      case 'log':
        console.error(`[ALERT] ${alert.rule}: ${JSON.stringify(alert.event)}`);
        break;

      case 'notify':
        await this.notifier.send({
          channel: 'alerts',
          message: `Alert: ${alert.rule}`,
          details: alert
        });
        break;

      case 'stop_agent':
        await this.agentManager.stop(alert.event.agentId);
        break;

      case 'throttle':
        await this.rateLimiter.throttle(alert.event.agentId);
        break;
    }
  }
}
```

### Data Storage

#### Database Schema

```sql
-- File operations log
CREATE TABLE file_operations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  team_id TEXT,
  operation TEXT NOT NULL,
  path TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER,
  bytes_read INTEGER,
  bytes_written INTEGER,
  success BOOLEAN,
  error TEXT,
  within_boundary BOOLEAN
);

-- Boundary violations
CREATE TABLE boundary_violations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  violation_type TEXT NOT NULL,
  path TEXT,
  severity TEXT,
  action_taken TEXT,
  details JSON
);

-- Performance metrics (time series)
CREATE TABLE performance_metrics (
  agent_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  cpu_usage REAL,
  memory_rss INTEGER,
  memory_heap INTEGER,
  io_reads INTEGER,
  io_writes INTEGER,
  tasks_completed INTEGER,
  errors_count INTEGER,
  PRIMARY KEY (agent_id, timestamp)
);

-- Alerts
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  rule_name TEXT NOT NULL,
  agent_id TEXT,
  severity TEXT,
  status TEXT,
  triggered_at TEXT NOT NULL,
  resolved_at TEXT,
  event_data JSON,
  actions_taken JSON
);

-- Indexes for performance
CREATE INDEX idx_file_ops_agent ON file_operations(agent_id, timestamp);
CREATE INDEX idx_file_ops_path ON file_operations(path);
CREATE INDEX idx_violations_agent ON boundary_violations(agent_id, timestamp);
CREATE INDEX idx_metrics_agent ON performance_metrics(agent_id, timestamp);
CREATE INDEX idx_alerts_status ON alerts(status, triggered_at);
```

#### Data Retention

```javascript
class DataRetention {
  constructor(db) {
    this.db = db;
    this.policies = {
      file_operations: 7,      // days
      boundary_violations: 30,  // days
      performance_metrics: 14,  // days
      alerts: 90               // days
    };
  }

  async cleanup() {
    for (const [table, days] of Object.entries(this.policies)) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      await this.db.run(`
        DELETE FROM ${table}
        WHERE timestamp < ?
      `, cutoff.toISOString());

      console.log(`Cleaned ${table}: removed data older than ${days} days`);
    }
  }

  // Run daily
  schedule() {
    setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);
  }
}
```

### API Endpoints

```http
GET /api/monitoring/overview
```
Get monitoring overview dashboard data

```http
GET /api/monitoring/agents/:agentId/metrics
```
Get performance metrics for specific agent

```http
GET /api/monitoring/agents/:agentId/file-operations
```
Get file operation history

```http
GET /api/monitoring/violations
```
Get boundary violations with filtering

```http
GET /api/monitoring/alerts
```
Get active and historical alerts

```http
POST /api/monitoring/alerts/:alertId/acknowledge
```
Acknowledge an alert

```http
GET /api/monitoring/reports/summary
```
Get summary report for date range

### Testing Requirements

#### Unit Tests

```javascript
describe('BoundaryDetection', () => {
  it('should detect access outside working directory', () => {
    const boundary = new WorkspaceBoundary({
      workingDirectory: '/project'
    });

    const result = boundary.checkBoundary('read', '/etc/passwd');
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('critical');
  });

  it('should allow access within boundary', () => {
    const result = boundary.checkBoundary('write', '/project/src/file.js');
    expect(result.allowed).toBe(true);
  });
});

describe('AlertManager', () => {
  it('should trigger alert on condition match', async () => {
    const manager = new AlertManager(rules, notifier);

    await manager.evaluate({
      type: 'file_operation',
      path: '/etc/shadow',
      operation: 'read'
    });

    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'alerts',
        message: expect.stringContaining('critical')
      })
    );
  });
});
```

#### Integration Tests

1. Full monitoring pipeline (intercept → collect → store → alert)
2. Dashboard data aggregation
3. Alert rule evaluation with real events
4. Performance impact on agent operations
5. Data retention and cleanup

### Implementation Phases

#### Phase 1: Basic Monitoring (Week 1)
- File operation tracking
- Simple boundary detection
- Basic data storage

#### Phase 2: Performance Metrics (Week 2)
- CPU/Memory monitoring
- Operation timings
- Metric aggregation

#### Phase 3: Alert System (Week 3)
- Alert rules engine
- Notification system
- Alert management API

#### Phase 4: Dashboard (Week 4)
- Web dashboard UI
- Real-time updates
- Historical analysis

### Success Criteria

- [ ] All file operations tracked with < 5% performance impact
- [ ] Boundary violations detected with 100% accuracy
- [ ] Performance metrics collected every minute
- [ ] Dashboard updates in real-time (< 2s delay)
- [ ] Alert notifications delivered within 10 seconds
- [ ] Data retention policies enforced automatically
- [ ] Zero data loss during normal operations
- [ ] API response times < 200ms
- [ ] Dashboard loads in < 2 seconds
- [ ] 95% test coverage for monitoring code
- [ ] Documentation includes runbooks for all alerts
- [ ] Monitoring system uses < 100MB RAM per agent