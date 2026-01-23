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

For more information, see the [README](../README.md) or visit the [GitHub repository](https://github.com/yourusername/kokino).
