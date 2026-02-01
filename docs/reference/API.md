# Kokino API Reference

> **Complete REST + WebSocket API Documentation**
>
> **Base URL:** `http://127.0.0.1:5050`
>
> **WebSocket:** `ws://127.0.0.1:5050`
>
> Last Updated: 2026-01-26

---

## Quick Reference

### Core Endpoints
- **Agents:** `GET|POST|DELETE /agents`, `POST /agents/:id/execute`
- **Messages:** `POST /agents/:id/send`, `GET /agents/:id/tickets/pending`
- **Teams:** `GET|POST /api/teams`, `POST /api/teams/:id/start`
- **Bootstrap:** `POST /api/agents/:id/bootstrap`
- **Health:** `GET /health`, `GET /api/health/environment`

### Key Concepts
- **Store & Forward:** Messages acknowledged <20ms, delivered in background
- **Dual-Mode:** Agents run in tmux (legacy) or headless (modern) mode
- **Bootstrap:** Auto-load context on agent startup
- **Teams:** Start/stop multiple agents as coordinated units

---

## Table of Contents

1. [Agent Management](#agent-management)
2. [Agent Configuration (Phase 2)](#agent-configuration)
3. [Messaging](#messaging)
4. [Tickets](#tickets)
5. [Headless Execution](#headless-execution)
6. [Bootstrap System (Phase 3)](#bootstrap-system)
7. [Team Management (Phase 5)](#team-management)
8. [Monitoring (Phase 6)](#monitoring)
9. [GitHub Integration](#github-integration)
10. [Health & Diagnostics](#health--diagnostics)
11. [WebSocket API](#websocket-api)
12. [Error Handling](#error-handling)

---

## Agent Management

### List All Agents
```http
GET /agents
```
Lists all registered agent runtime instances.

**Response:**
```json
[{
  "agentId": "Alice",
  "cwd": "/path/to/workspace",
  "capabilities": ["code", "test"],
  "registeredAt": "2026-01-26T12:00:00Z",
  "lastSeen": "2026-01-26T12:05:00Z"
}]
```

### Register Agent
```http
POST /agents/register
```
**Request:**
```json
{
  "agentId": "Alice",
  "cwd": "/path/to/workspace",
  "capabilities": ["code", "test"]
}
```

**Response:** `{success: true, agentId: "Alice"}`

### Unregister Agent
```http
DELETE /agents/:agentId
```

---

## Agent Configuration

### List Agent Configs
```http
GET /api/agents?projectId=global&includeGlobal=true
```
Lists agent templates/configurations.

**Query Parameters:**
- `projectId` - Filter by project ("global" or project ID)
- `includeGlobal` - Include global agents (default: false)
- `cliType` - Filter by CLI type (claude-code|factory-droid|gemini)
- `search` - Search in name/role/prompt
- `limit`, `offset` - Pagination

**Response:** Array of agent configuration objects

### Create Agent Config
```http
POST /api/agents
```
**Request:**
```json
{
  "name": "Alice",
  "role": "Frontend Engineer",
  "projectId": "project-456",
  "cliType": "claude-code",
  "workingDirectory": "./frontend",
  "systemPrompt": "You are a React expert...",
  "bootstrapMode": "auto",
  "capabilities": ["code", "test", "ui"]
}
```

**Bootstrap Modes:**
- `none` - No context loading
- `auto` - Auto-load CLAUDE.md, .kokino files
- `manual` - User-triggered via API
- `custom` - Run custom bootstrap script

### Update Agent Config
```http
PUT /api/agents/:id
```

### Delete Agent Config
```http
DELETE /api/agents/:id
```

### Instantiate Agent from Config
```http
POST /api/agents/:id/instantiate
```
Spawns a runtime agent instance from a configuration.

---

## Messaging

### Send Message
```http
POST /agents/:agentId/send
```
Send message to another agent (store & forward).

**Request:**
```json
{
  "from": "Alice",
  "content": "Please review the code",
  "metadata": {"priority": "high"}
}
```

**Response:** `{ticketId: "abc123", status: "pending"}`

### Get Message History
```http
GET /api/messages/history?limit=50&offset=0
```

### Get Agent Messages
```http
GET /api/messages/agent/:agentId
```

---

## Tickets

### Get Pending Tickets
```http
GET /agents/:agentId/tickets/pending
```
Poll for pending messages for this agent.

**Response:** Array of ticket objects

### Reply to Ticket
```http
POST /replies
```
**Request:**
```json
{
  "ticketId": "abc123",
  "agentId": "Bob",
  "response": "Code review complete!"
}
```

### Get Reply Status
```http
GET /replies/:ticketId
```

### Wait for Reply (Long-Poll)
```http
GET /replies/:ticketId/wait?timeout=30000
```
Blocks until reply available or timeout.

---

## Headless Execution

### Execute Agent
```http
POST /agents/:agentId/execute
```
Execute agent with prompt (headless mode).

**Request:**
```json
{
  "prompt": "Please review the latest commit",
  "timeoutMs": 30000,
  "metadata": {}
}
```

**Response:**
```json
{
  "turnId": "uuid",
  "content": "agent response",
  "conversationId": "uuid",
  "durationMs": 3245,
  "success": true
}
```

### Cancel Execution
```http
POST /agents/:agentId/execute/cancel
```

### End Session
```http
POST /agents/:agentId/end-session
```

### Get Session Status
```http
GET /agents/sessions/status
```

**Response:** Array of session objects with lock status, queue length, etc.

### Get Conversations
```http
GET /agents/:agentId/conversations
```

### Get Conversation Details
```http
GET /conversations/:conversationId
```

### Delete Conversation
```http
DELETE /conversations/:conversationId
```

---

## Bootstrap System

### Trigger Bootstrap
```http
POST /api/agents/:agentId/bootstrap
```
Manually trigger context bootstrap.

**Request:**
```json
{
  "files": ["README.md", "docs/architecture.md"],
  "additionalContext": "Focus on authentication",
  "variables": {"sprint": "Sprint 23"}
}
```

**Response:**
```json
{
  "success": true,
  "filesLoaded": ["README.md", "docs/architecture.md"],
  "contextSize": 4523,
  "status": "ready",
  "bootstrapTime": 1.23
}
```

### Get Bootstrap Status
```http
GET /api/agents/:agentId/bootstrap/status
```

### Reload Bootstrap
```http
POST /api/agents/:agentId/bootstrap/reload
```

### Update Bootstrap Mode
```http
PUT /api/agents/:agentId/bootstrap/mode
```
**Request:** `{mode: "auto"|"none"|"manual"|"custom"}`

### Get Compaction Status
```http
GET /api/agents/:agentId/compaction-status
```
Check if agent needs restart due to Claude Code context compaction.

**Response:**
```json
{
  "agentId": "Alice",
  "conversationTurns": 67,
  "totalTokens": 125000,
  "compactionStatus": {
    "isCompacted": true,
    "severity": "warning",
    "recommendation": "Consider restarting agent soon"
  }
}
```

---

## Team Management

### List Teams
```http
GET /api/teams?projectId=project-123
```

### Create Team
```http
POST /api/teams
```
**Request:**
```json
{
  "name": "Feature Team Alpha",
  "description": "Full-stack dev team",
  "projectId": "project-123",
  "configuration": {
    "agents": [...],
    "connections": [...],
    "workflow": {...}
  }
}
```

### Get Team
```http
GET /api/teams/:teamId
```

### Update Team
```http
PUT /api/teams/:teamId
```

### Delete Team
```http
DELETE /api/teams/:teamId
```
Fails if team is running.

### Start Team
```http
POST /api/teams/:teamId/start
```
Start all agents in team as coordinated unit.

**Request:**
```json
{
  "environment": {"PROJECT_NAME": "MyProject"},
  "initialPrompt": "Build user auth feature",
  "options": {"parallel": true, "timeout": 3600000}
}
```

**Response:**
```json
{
  "sessionId": "session-456",
  "teamId": "team-123",
  "status": "starting",
  "agents": [{"agentId": "alice-123", "status": "starting", "pid": 12345}]
}
```

### Stop Team
```http
POST /api/teams/:teamId/stop
```
**Request:** `{force: false, saveState: true}`

### Get Team Status
```http
GET /api/teams/:teamId/status
```

### Restart/Pause/Resume Team
```http
POST /api/teams/:teamId/restart
POST /api/teams/:teamId/pause
POST /api/teams/:teamId/resume
```

---

## Monitoring

### Get Timeline (Phase 3 Observability)
```http
GET /api/monitoring/timeline?from=...&to=...&limit=100&offset=0
```

Retrieves historical timeline data for agent activity (messages and conversations).

**Query Parameters:**
- `from` - ISO date string (start of time range)
- `to` - ISO date string (end of time range)
- `limit` - Maximum number of entries (default: 1000)
- `offset` - Pagination offset (default: 0)
- `agents` - Comma-separated agent IDs to filter
- `types` - Comma-separated types ('message', 'conversation')

**Response:**
```json
{
  "entries": [
    {
      "id": "entry-123",
      "type": "conversation",
      "timestamp": "2026-01-31T10:00:00.000Z",
      "agent_id": "Alice",
      "thread_id": "thread-456",
      "content": "Please review the latest changes",
      "metadata": {
        "source": "broker",
        "sessionId": "session-789"
      }
    },
    {
      "id": "msg-456",
      "type": "message",
      "timestamp": "2026-01-31T10:01:00.000Z",
      "agent_id": "Bob",
      "target_agent_id": "Alice",
      "thread_id": "thread-456",
      "content": "I'll review them now"
    }
  ],
  "total": 42
}
```

### Get Interactions (Phase 3 Graph Visualization)
```http
GET /api/monitoring/interactions?timeRange=hour
```

Retrieves agent interaction data for graph visualization.

**Query Parameters:**
- `timeRange` - Time range ('hour', 'day', 'week', 'month')

**Response:**
```json
{
  "nodes": [
    {
      "id": "Alice",
      "label": "Alice",
      "type": "agent",
      "metrics": {
        "messagesSent": 15,
        "messagesReceived": 8,
        "conversationTurns": 23
      }
    },
    {
      "id": "Bob",
      "label": "Bob",
      "type": "agent",
      "metrics": {
        "messagesSent": 8,
        "messagesReceived": 15,
        "conversationTurns": 19
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "Alice",
      "target": "Bob",
      "weight": 15,
      "label": "15 messages"
    }
  ],
  "summary": {
    "totalMessages": 23,
    "totalConversations": 42,
    "activeAgents": 2,
    "timeRange": "hour"
  }
}
```

### Get Overview
```http
GET /api/monitoring/overview
```

**Response:**
```json
{
  "activeTeams": 3,
  "activeAgents": 12,
  "alerts": {"active": 2, "acknowledged": 5},
  "fileOperations": {"lastHour": {"reads": 1234, "writes": 567}},
  "violations": {"lastHour": 3, "critical": 1},
  "performance": {"avgCpuUsage": 45.2, "avgMemoryUsage": 512}
}
```

### Get Agent Metrics
```http
GET /api/monitoring/agents/:agentId/metrics?from=...&to=...&interval=5m
```

### Get File Operations
```http
GET /api/monitoring/agents/:agentId/file-operations?operation=write
```

### Get Violations
```http
GET /api/monitoring/violations?severity=critical
```

### Get Alerts
```http
GET /api/monitoring/alerts?status=active
```

### Acknowledge Alert
```http
POST /api/monitoring/alerts/:alertId/acknowledge
```

---

## GitHub Integration

### Exchange OAuth Code
```http
POST /api/github/oauth
```
**Request:** `{code: "github_oauth_code"}`

**Response:** `{access_token: "gho_...", token_type: "bearer"}`

### GitHub Webhook
```http
POST /api/github/webhook
```
Handles: issues, pull_request, issue_comment, push, workflow_run

**Headers:** `X-GitHub-Event`, `X-Hub-Signature-256`

---

## Health & Diagnostics

### Broker Health
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-26T12:00:00Z",
  "uptime": 3600,
  "agents": 2
}
```

### Environment Check
```http
GET /api/health/environment?cli=claude-code
```
Checks: binary, environment vars, auth, disk space, dry-run execution.

**Response:**
```json
{
  "cliType": "claude-code",
  "passed": true,
  "checks": [
    {"name": "binary", "passed": true, "message": "claude found at /usr/local/bin/claude"},
    {"name": "auth", "passed": true, "message": "Auth credentials found"}
  ],
  "warnings": []
}
```

### SLO Status
```http
GET /api/slo/status
```

### Prometheus Metrics
```http
GET /metrics
```
Returns Prometheus exposition format.

### Integrity Check
```http
GET /api/integrity/check
```
Check database consistency (orphaned turns, sequence errors).

### Shadow Mode Metrics
```http
GET /api/shadow-mode/metrics?days=30
```
Compare tmux vs headless reliability.

### Runtime Fallback Status
```http
GET /api/fallback/status
```

### Disable/Enable Headless CLI
```http
POST /api/fallback/cli/disable
POST /api/fallback/cli/enable
```
**Request:** `{cliType: "claude-code", reason: "Auth expired"}`

### Circuit Breaker Status
```http
GET /agents/circuits/status
```

### Reset Circuit Breaker
```http
POST /agents/:agentId/circuit/reset
```

---

## WebSocket API

Connect: `ws://127.0.0.1:5050`

### Terminal Proxy (Legacy)
**Endpoint:** `ws://127.0.0.1:5050/ws/terminal/:agentId`

Provides bidirectional terminal access to tmux sessions.

---

### Monitoring Stream (Phase 3A) ✨ NEW

**Endpoint:** `ws://127.0.0.1:5050/api/monitoring/stream`

Real-time event stream for all agent activity (messages, conversations, status changes).

#### Connection

```javascript
const ws = new WebSocket('ws://127.0.0.1:5050/api/monitoring/stream');

ws.onopen = () => {
  console.log('Connected to monitoring stream');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data);
};
```

#### Events Received

**1. Connection Confirmation**
```json
{
  "type": "connected",
  "clientId": "uuid-v4",
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

**2. Message Sent (Cross-Agent Communication)**
```json
{
  "type": "message.sent",
  "data": {
    "id": "ticket-uuid",
    "fromAgent": "Alice",
    "toAgent": "Bob",
    "payload": "Review this PR",
    "threadId": "thread-123",
    "timestamp": "2026-01-29T12:00:00.000Z"
  },
  "timestamp": 1738156800000
}
```

**3. Conversation Turn (Agent Chat Session)**
```json
{
  "type": "conversation.turn",
  "data": {
    "turnId": 42,
    "conversationId": "conv-abc",
    "agentId": "Alice",
    "role": "user",
    "content": "Implement feature X",
    "timestamp": "2026-01-29T12:00:00.000Z"
  },
  "timestamp": 1738156800000
}
```

**4. Agent Status Change**
```json
{
  "type": "agent.status",
  "data": {
    "agentId": "Alice",
    "oldStatus": "idle",
    "newStatus": "working",
    "timestamp": "2026-01-29T12:00:00.000Z"
  },
  "timestamp": 1738156800000
}
```

#### Client-Sent Messages

**Update Filters**
```json
{
  "type": "filter",
  "agents": ["Alice", "Bob"],
  "types": ["message", "conversation"]
}
```

**Filter Confirmation**
```json
{
  "type": "filter-updated",
  "filters": {
    "agents": ["Alice", "Bob"],
    "types": ["message"]
  },
  "timestamp": "2026-01-29T12:00:00.000Z"
}
```

#### Filtering

- **agents**: Array of agent IDs to watch (null = all)
- **types**: Array of event types to receive (null = all)
  - Base types: `"message"`, `"conversation"`, `"agent"`
  - Full types: `"message.sent"`, `"conversation.turn"`, `"agent.status"`

Example:
```javascript
ws.send(JSON.stringify({
  type: 'filter',
  agents: ['Alice'],          // Only Alice's events
  types: ['message']           // Only message events
}));
```

#### Performance

- Supports 10+ simultaneous clients
- Heartbeat ping every 30 seconds
- Auto-reconnect recommended (server may restart)
- <100ms latency for event delivery
- No events dropped at <100/sec rate

#### Error Handling

WebSocket connection may close for:
- Server shutdown (`code: 1000`)
- Network issues
- Broker restart

**Recommended reconnection logic:**
```javascript
function connectMonitoring() {
  const ws = new WebSocket('ws://127.0.0.1:5050/api/monitoring/stream');

  ws.onclose = () => {
    console.log('Disconnected, reconnecting in 5s...');
    setTimeout(connectMonitoring, 5000);
  };

  return ws;
}
```

---

### Legacy Events (Deprecated)

These events are from the old WebSocket system and will be removed in Phase 7:

**Team Phase:**
```json
{"type": "team.phase", "teamId": "team-123", "phase": "Implementation"}
```

**File Operation:**
```json
{"type": "file.operation", "agentId": "Alice", "operation": "write", "path": "/src/App.js"}
```

**Boundary Violation:**
```json
{"type": "boundary.violation", "agentId": "Alice", "severity": "critical", "path": "/etc/passwd"}
```

**Alert:**
```json
{"type": "alert.triggered", "alertId": "alert-123", "rule": "high_cpu", "severity": "warning"}
```

---

## Error Handling

### Status Codes
- `200` OK
- `201` Created
- `204` No Content
- `400` Bad Request
- `404` Not Found
- `409` Conflict
- `422` Validation Error
- `500` Internal Server Error
- `503` Service Unavailable

### Error Response Format
```json
{
  "error": {
    "code": "AGENT_START_FAILED",
    "message": "Failed to start agent",
    "details": {"agentId": "alice-123", "reason": "Port already in use"}
  }
}
```

### Application Error Codes
- `AGENT_NOT_FOUND` - Agent config/instance not found
- `AGENT_START_FAILED` - Failed to start agent process
- `AGENT_ALREADY_RUNNING` - Agent is running
- `TEAM_NOT_FOUND` - Team not found
- `TEAM_RUNNING` - Cannot modify running team
- `BOOTSTRAP_FAILED` - Bootstrap failed
- `BOOTSTRAP_TIMEOUT` - Bootstrap timeout
- `BOUNDARY_VIOLATION` - Workspace boundary violation
- `COMPACTION_DETECTED` - Agent needs restart
- `CIRCUIT_BREAKER_OPEN` - Too many failures

---

## Best Practices

1. **Always use 127.0.0.1** (not localhost) for WebSocket stability
2. **Store ticket IDs** for tracking message responses
3. **Poll for tickets** every 2-5 seconds
4. **Handle expiry** - tickets expire after 1 hour
5. **Use metadata** for structured data, not content
6. **Implement reconnection** with exponential backoff for WebSocket
7. **Check compaction status** regularly to prevent agent degradation
8. **Monitor circuit breakers** to detect systemic issues

---

## Rate Limiting

- Default: 100 req/min per IP
- Heavy endpoints (start/stop): 10 req/min
- Monitoring: 1000 req/min

**Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Examples

### Node.js
```javascript
const axios = require('axios');
const BASE = 'http://127.0.0.1:5050';

// Register agent
await axios.post(`${BASE}/agents/register`, {
  agentId: 'Alice',
  cwd: process.cwd(),
  capabilities: ['code']
});

// Send message
const {data} = await axios.post(`${BASE}/agents/Bob/send`, {
  from: 'Alice',
  content: 'Please review',
  metadata: {priority: 'high'}
});

console.log('Ticket:', data.ticketId);

// Wait for reply
const reply = await axios.get(`${BASE}/replies/${data.ticketId}/wait`);
console.log('Reply:', reply.data.response);
```

### Python
```python
import requests
BASE = 'http://127.0.0.1:5050'

# Register
requests.post(f'{BASE}/agents/register', json={
    'agentId': 'Alice',
    'cwd': '/workspace',
    'capabilities': ['code']
})

# Send message
r = requests.post(f'{BASE}/agents/Bob/send', json={
    'from': 'Alice',
    'content': 'Please review',
    'metadata': {'priority': 'high'}
})

# Wait for reply
reply = requests.get(f'{BASE}/replies/{r.json()["ticketId"]}/wait')
print(reply.json()['response'])
```

---

## Related Documentation

- [Database Schema](DATABASE.md) - Tables, migrations, queries
- [Architecture](ARCHITECTURE.md) - System design overview
- [Broker Module](../../broker/CLAUDE.md) - Backend implementation details
- [Operations Runbooks](../ops/) - Troubleshooting production issues

---

**Questions? File an issue or check the operational runbooks.**
