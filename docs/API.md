# Kokino API Documentation

## Broker REST API

Base URL: `http://127.0.0.1:5050`

All endpoints return JSON responses with appropriate HTTP status codes.

---

## Agent Management

### List All Agents

```http
GET /agents
```

**Response:**
```json
[
  {
    "agentId": "Alice",
    "cwd": "/path/to/workspace",
    "capabilities": ["code", "test"],
    "registeredAt": "2026-01-21T12:00:00.000Z",
    "lastSeen": "2026-01-21T12:05:00.000Z"
  }
]
```

### Register Agent

```http
POST /agents/register
Content-Type: application/json

{
  "agentId": "Alice",
  "cwd": "/path/to/workspace",
  "capabilities": ["code", "test"]
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "Alice",
  "message": "Agent registered successfully"
}
```

### Unregister Agent

```http
DELETE /agents/:agentId
```

**Response:**
```json
{
  "success": true,
  "message": "Agent Alice unregistered"
}
```

---

## Messaging

### Send Message

```http
POST /agents/:agentId/send
Content-Type: application/json

{
  "from": "Alice",
  "content": "Please review the code",
  "metadata": {
    "priority": "high",
    "type": "task"
  }
}
```

**Response:**
```json
{
  "ticketId": "abc123",
  "status": "pending",
  "expiresAt": "2026-01-21T13:00:00.000Z"
}
```

**Note:** The `agentId` in the URL is the recipient (to), and `from` is in the request body.

### Get Message History

```http
GET /api/messages/history?limit=50&offset=0
```

**Query Parameters:**
- `limit` (optional): Number of messages to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "fromAgent": "Alice",
      "toAgent": "Bob",
      "content": "Please review the code",
      "metadata": "{\"priority\":\"high\"}",
      "timestamp": "2026-01-21T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

### Get Agent Messages

```http
GET /api/messages/agent/:agentId?limit=50&offset=0
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "fromAgent": "Alice",
      "toAgent": "Bob",
      "content": "Please review the code",
      "metadata": "{\"priority\":\"high\"}",
      "timestamp": "2026-01-21T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

## Tickets

### Get Pending Tickets

```http
GET /agents/:agentId/tickets/pending
```

**Response:**
```json
[
  {
    "ticketId": "abc123",
    "from": "Alice",
    "to": "Bob",
    "content": "Please review the code",
    "metadata": {
      "priority": "high"
    },
    "status": "pending",
    "createdAt": "2026-01-21T12:00:00.000Z",
    "expiresAt": "2026-01-21T13:00:00.000Z"
  }
]
```

### Reply to Ticket

```http
POST /replies
Content-Type: application/json

{
  "ticketId": "abc123",
  "agentId": "Bob",
  "response": "Code review complete. Looks good!"
}
```

**Response:**
```json
{
  "success": true,
  "ticketId": "abc123"
}
```

### Get Reply Status

```http
GET /replies/:ticketId
```

**Response:**
```json
{
  "ticketId": "abc123",
  "status": "resolved",
  "response": "Code review complete. Looks good!",
  "respondedAt": "2026-01-21T12:05:00.000Z"
}
```

### Wait for Reply (Long-Poll)

```http
GET /replies/:ticketId/wait?timeout=30000
```

Blocks until reply is available or timeout expires.

**Query Parameters:**
- `timeout` (optional): Maximum wait time in milliseconds (default: 30000)

---

## GitHub Integration

### Exchange OAuth Code

```http
POST /api/github/oauth
Content-Type: application/json

{
  "code": "github_oauth_code"
}
```

**Response:**
```json
{
  "access_token": "gho_...",
  "token_type": "bearer",
  "scope": "repo,read:user"
}
```

**Error Response:**
```json
{
  "error": "Failed to exchange code for token"
}
```

### GitHub Webhook

```http
POST /api/github/webhook
Content-Type: application/json
X-GitHub-Event: issues
X-Hub-Signature-256: sha256=...
X-GitHub-Delivery: ...

{
  "action": "opened",
  "issue": {
    "number": 42,
    "title": "Bug in authentication",
    "labels": [{"name": "bug"}, {"name": "backend"}]
  }
}
```

**Supported Events:**
- `issues` - Issue created, closed, edited
- `pull_request` - PR opened, closed, synchronized
- `issue_comment` - Comment created on issue/PR
- `push` - Code pushed to repository
- `workflow_run` - GitHub Actions workflow completed

**Response:**
```json
{
  "received": true,
  "event": "issues",
  "handled": true,
  "action": "issue_opened",
  "issue": {
    "number": 42,
    "title": "Bug in authentication",
    "labels": ["bug", "backend"],
    "url": "https://github.com/owner/repo/issues/42"
  }
}
```

---

## Health Check

### Broker Health

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-21T12:00:00.000Z",
  "uptime": 3600,
  "agents": 2
}
```

---

## WebSocket API

Connect to: `ws://127.0.0.1:5050`

### Events

**Connection Established:**
```json
{
  "type": "connected",
  "clientId": "ws-abc123"
}
```

**Agent Status Update:**
```json
{
  "type": "agent-status",
  "agentId": "Alice",
  "status": "online"
}
```

**New Message:**
```json
{
  "type": "message",
  "from": "Alice",
  "to": "Bob",
  "content": "Task completed",
  "timestamp": "2026-01-21T12:00:00.000Z"
}
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 409 | Conflict (e.g., agent already registered) |
| 500 | Internal Server Error |

**Error Response Format:**
```json
{
  "error": "Error message here"
}
```

---

## Rate Limiting

Currently no rate limiting is enforced. Future versions may implement:
- 100 requests per minute per client
- 1000 messages per hour per agent

---

## Authentication

### GitHub Integration

GitHub API requests require a valid OAuth token obtained through the `/api/github/oauth` endpoint.

**Header Format:**
```http
Authorization: Bearer gho_...
```

---

## Best Practices

1. **Store Ticket IDs**: Always save the `ticketId` from message sends to track responses
2. **Poll for Tickets**: Agents should poll `/agents/:agentId/tickets/pending` every 2-5 seconds
3. **Handle Expiry**: Tickets expire after 1 hour by default. Check `expiresAt` timestamps
4. **WebSocket Reconnection**: Implement exponential backoff for WebSocket reconnections
5. **Error Handling**: Always handle 5xx errors with retry logic
6. **Metadata**: Use the `metadata` field for structured data, not the `content` field

---

## Examples

### Node.js Example

```javascript
const axios = require('axios');

// Register agent
await axios.post('http://127.0.0.1:5050/agents/register', {
  agentId: 'Alice',
  cwd: process.cwd(),
  capabilities: ['code', 'test']
});

// Send message to Bob
const response = await axios.post('http://127.0.0.1:5050/agents/Bob/send', {
  from: 'Alice',
  content: 'Please review the code',
  metadata: { priority: 'high' }
});

console.log('Ticket ID:', response.data.ticketId);

// Wait for response (long-poll)
const reply = await axios.get(`http://127.0.0.1:5050/replies/${response.data.ticketId}/wait`);
console.log('Reply:', reply.data.response);

// Or poll for all pending tickets
const tickets = await axios.get('http://127.0.0.1:5050/agents/Alice/tickets/pending');
console.log('Pending tickets:', tickets.data);
```

### Python Example

```python
import requests

# Register agent
requests.post('http://127.0.0.1:5050/agents/register', json={
    'agentId': 'Alice',
    'cwd': '/path/to/workspace',
    'capabilities': ['code', 'test']
})

# Send message to Bob
response = requests.post('http://127.0.0.1:5050/agents/Bob/send', json={
    'from': 'Alice',
    'content': 'Please review the code',
    'metadata': {'priority': 'high'}
})

ticket_id = response.json()['ticketId']
print('Ticket ID:', ticket_id)

# Wait for reply
reply = requests.get(f'http://127.0.0.1:5050/replies/{ticket_id}/wait')
print('Reply:', reply.json()['response'])
```

---

## Changelog

### v1.0.0 (2026-01-21)
- Initial API release
- Agent management
- Message routing
- GitHub integration
- WebSocket support

---

## Headless Execution Endpoints (Phase 2)

### Execute Headless Agent

```http
POST /agents/:agentId/execute
Content-Type: application/json

{
  "prompt": "string",
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
  "sessionId": "string",
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

**Response:**
```json
[
  {
    "agentId": "frontend-mary",
    "sessionId": "frontend-mary",
    "hasSession": true,
    "locked": false,
    "executing": false,
    "executionStartedAt": null,
    "queueLength": 0
  }
]
```

### Get Agent Conversations

```http
GET /agents/:agentId/conversations
```

### Get Conversation Details

```http
GET /conversations/:conversationId
```

**Response:**
```json
{
  "conversationId": "uuid",
  "agentId": "frontend-mary",
  "cliType": "claude-code",
  "sessionId": "frontend-mary",
  "status": "active",
  "createdAt": "2025-01-24T...",
  "updatedAt": "2025-01-24T...",
  "turns": [
    {
      "turnId": "uuid",
      "direction": "inbound",
      "content": "Please review the code",
      "metadata": {},
      "createdAt": "2025-01-24T..."
    }
  ]
}
```

### Delete Conversation

```http
DELETE /conversations/:conversationId
```

---

## Process & Resource Management

### Get Process Status

```http
GET /agents/processes/status
```

### Get Circuit Breaker Status

```http
GET /agents/circuits/status
```

**Response:**
```json
{
  "circuits": [
    {
      "agentId": "frontend-mary",
      "state": "closed",
      "failureCount": 0,
      "lastFailure": null
    }
  ]
}
```

### Reset Circuit Breaker

```http
POST /agents/:agentId/circuit/reset
```

### Get Log Rotator Status

```http
GET /agents/logs/status
```

### Get Agent Logs

```http
GET /agents/:agentId/logs?lines=100
```

**Response:**
```json
{
  "agentId": "frontend-mary",
  "lines": 100,
  "content": "log content here"
}
```

---

## Data Integrity

### Run Integrity Check

```http
GET /api/integrity/check
```

**Response:**
```json
{
  "passed": true,
  "orphanedTurns": 0,
  "conversationsWithIssues": 0,
  "details": {
    "orphanCheck": { "passed": true, "count": 0 },
    "sequenceChecks": []
  }
}
```

### Cleanup Orphaned Data

```http
POST /api/integrity/cleanup
```

### Get Integrity Stats

```http
GET /api/integrity/stats
```

---

## Shadow Mode Testing

### Get Shadow Metrics

```http
GET /api/shadow-mode/metrics?days=30
```

**Response:**
```json
{
  "totalTests": 1250,
  "successRates": {
    "tmux": 0.996,
    "headless": 0.998
  },
  "outputMatchRate": 0.957,
  "avgLatencyDelta": -2350,
  "headlessFaster": 0.892
}
```

### Get Shadow Mismatches

```http
GET /api/shadow-mode/mismatches?limit=20
```

### Get Shadow Failures

```http
GET /api/shadow-mode/failures?mode=headless
```

---

## Runtime Fallback Control

### Get Fallback Status

```http
GET /api/fallback/status
```

**Response:**
```json
{
  "disabledCLIs": [
    {
      "cli": "claude-code",
      "disabled": true,
      "reason": "Auth token expired",
      "since": "2025-01-24T..."
    }
  ],
  "forcedFallbacks": []
}
```

### Disable CLI Headless Mode

```http
POST /api/fallback/cli/disable
Content-Type: application/json

{
  "cliType": "claude-code",
  "reason": "Production incident"
}
```

### Enable CLI Headless Mode

```http
POST /api/fallback/cli/enable
Content-Type: application/json

{
  "cliType": "claude-code"
}
```

### Force Agent to Tmux

```http
POST /api/fallback/agent/:agentId/force
Content-Type: application/json

{
  "reason": "Agent degraded"
}
```

### Clear Agent Fallback

```http
DELETE /api/fallback/agent/:agentId
```

---

## Environment Health

### Check Environment

```http
GET /api/health/environment?cli=claude-code
```

**Response:**
```json
{
  "cliType": "claude-code",
  "passed": true,
  "checks": [
    {
      "name": "binary",
      "passed": true,
      "message": "claude found at /usr/local/bin/claude"
    },
    {
      "name": "environment",
      "passed": true,
      "message": "Environment variables correct"
    },
    {
      "name": "auth",
      "passed": true,
      "message": "Auth credentials found"
    },
    {
      "name": "disk",
      "passed": true,
      "message": "Disk 45% full - 120Gi available"
    },
    {
      "name": "dryrun",
      "passed": true,
      "message": "CLI responds to --version"
    }
  ],
  "warnings": []
}
```

---

## Telemetry & Metrics

### Get SLO Status

```http
GET /api/metrics/slo
```

**Response:**
```json
{
  "availability": {
    "current": 0.998,
    "target": 0.995,
    "breached": false,
    "errorBudgetRemaining": 0.85
  },
  "latency": {
    "p95Ms": 28500,
    "target": 30000,
    "breached": false
  }
}
```

### Get Prometheus Metrics

```http
GET /api/metrics/prometheus
```

**Response:** (Prometheus exposition format)
```
# HELP headless_availability_ratio Headless execution availability
# TYPE headless_availability_ratio gauge
headless_availability_ratio 0.998

# HELP headless_latency_p95_ms P95 execution latency in milliseconds
# TYPE headless_latency_p95_ms gauge
headless_latency_p95_ms 28500
```

### Get Error Budget

```http
GET /api/metrics/error-budget
```

---

## Bootstrap System (Phase 3)

### Manually Trigger Bootstrap

```http
POST /api/agents/:agentId/bootstrap
Content-Type: application/json

{
  "files": ["README.md", "docs/architecture.md"],
  "additionalContext": "Focus on the authentication module",
  "variables": {
    "sprint": "Sprint 23",
    "priority": "security"
  }
}
```

**Response:**
```json
{
  "success": true,
  "filesLoaded": ["README.md", "docs/architecture.md"],
  "contextSize": 4523,
  "status": "ready",
  "bootstrapTime": 1.23,
  "mode": "manual",
  "duration": 2.34
}
```

### Get Bootstrap Status

```http
GET /api/agents/:agentId/bootstrap/status
```

**Response:**
```json
{
  "agentId": "Alice",
  "status": "ready",
  "lastBootstrap": "2026-01-26T12:30:00Z",
  "history": [
    {
      "mode": "auto",
      "success": true,
      "filesLoaded": ["CLAUDE.md", ".kokino/context.md"],
      "contextSize": 3245,
      "duration": 1200,
      "startedAt": "2026-01-26T12:30:00Z",
      "completedAt": "2026-01-26T12:30:01Z",
      "error": null
    }
  ]
}
```

### Reload Bootstrap Context

```http
POST /api/agents/:agentId/bootstrap/reload
```

Reloads bootstrap context using the agent's configured bootstrap mode.

**Response:**
```json
{
  "success": true,
  "mode": "auto",
  "filesLoaded": ["CLAUDE.md"],
  "contextSize": 2150,
  "duration": 0.85
}
```

### Update Bootstrap Mode

```http
PUT /api/agents/:agentId/bootstrap/mode
Content-Type: application/json

{
  "mode": "auto",
  "config": {}
}
```

**Valid Modes:**
- `none` - No bootstrap, system prompt only
- `auto` - Automatically load CLAUDE.md and .kokino files
- `manual` - User-triggered via API
- `custom` - Run custom bootstrap script

**Response:**
```json
{
  "success": true,
  "agentId": "Alice",
  "mode": "auto",
  "message": "Bootstrap mode updated"
}
```

### Get Compaction Status

```http
GET /api/agents/:agentId/compaction-status
```

**Response:**
```json
{
  "agentId": "Alice",
  "conversationTurns": 67,
  "totalTokens": 125000,
  "errorCount": 3,
  "avgResponseTime": 2.3,
  "lastMeasured": "2026-01-26T12:35:00Z",
  "compactionStatus": {
    "isCompacted": true,
    "severity": "warning",
    "recommendation": "Consider restarting agent soon",
    "reasons": [
      "Conversation has 67 turns (warning threshold: 50)",
      "Total tokens: 125000 (warning threshold: 100000)"
    ],
    "metrics": {
      "conversationTurns": 67,
      "totalTokens": 125000,
      "errorCount": 3
    }
  }
}
```

### Track Conversation Turn

```http
POST /api/agents/:agentId/compaction/track
Content-Type: application/json

{
  "tokens": 1500,
  "error": false,
  "responseTime": 2.4,
  "confusionCount": 0
}
```

Automatically called by the broker during agent execution. Used for compaction monitoring.

### Reset Compaction Metrics

```http
POST /api/agents/:agentId/compaction/reset
```

Resets compaction metrics after agent restart.

**Response:**
```json
{
  "success": true,
  "agentId": "Alice",
  "message": "Compaction metrics reset"
}
```

### Get Compaction History

```http
GET /api/agents/:agentId/compaction/history?limit=20
```

**Response:**
```json
{
  "agentId": "Alice",
  "history": [
    {
      "conversationTurns": 67,
      "totalTokens": 125000,
      "errorCount": 3,
      "avgResponseTime": 2.3,
      "measuredAt": "2026-01-26T12:35:00Z"
    }
  ]
}
```

---

## Bootstrap Integration with Agent Startup

When starting an agent via `POST /agents/:agentId/start`, the broker will automatically:

1. Load agent configuration from `agent_configs` table
2. Determine bootstrap mode (default: `auto`)
3. Run bootstrap if mode is not `none`
4. Reset compaction metrics
5. Load context files based on mode
6. Execute agent warmup

**Example Start Response with Bootstrap:**
```json
{
  "status": "ready",
  "sessionId": "alice-session-123",
  "bootstrapTime": 3245,
  "bootstrap": {
    "mode": "auto",
    "filesLoaded": ["CLAUDE.md", ".kokino/context.md"],
    "contextSize": 4523,
    "duration": 1.23
  },
  "response": "Hello! I'm ready to assist you."
}
```

---

For more information, see the [README](../README.md), [HEADLESS-ROADMAP.md](HEADLESS-ROADMAP.md), or visit the [GitHub repository](https://github.com/yourusername/kokino).
