# Kokino API v2 Documentation

## Overview

Complete REST API documentation for Kokino orchestration platform, covering all endpoints from Phases 2-6.

**Base URL:** `http://localhost:5050/api`

**Authentication:** Currently none (TODO: Add in Phase 7)

**Content Type:** `application/json`

---

## Table of Contents

1. [Agent Configuration](#agent-configuration) - Phase 2
2. [Bootstrap System](#bootstrap-system) - Phase 3
3. [Team Management](#team-management) - Phase 5
4. [Monitoring](#monitoring) - Phase 6
5. [Projects](#projects) - Supporting
6. [WebSocket Events](#websocket-events)
7. [Error Codes](#error-codes)

---

## Agent Configuration

### List Agent Configurations

```http
GET /api/agents
```

**Query Parameters:**
- `projectId` (string) - Filter by project (use "global" for global agents, or project ID for project-specific)
- `includeGlobal` (boolean) - When filtering by projectId, also include global agents (default: false)
- `cliType` (string) - Filter by CLI type: `claude-code` | `factory-droid` | `gemini` (Note: only `claude-code` is currently implemented)
- `search` (string) - Search in name, role, system prompt
- `limit` (number) - Results per page (default: 10)
- `offset` (number) - Pagination offset

**Response:**
```json
[
  {
    "id": "agent-config-123",
    "projectId": "project-456",
    "name": "Alice",
    "role": "Frontend Engineer",
    "cliType": "claude-code",
    "workingDirectory": "./frontend",
    "systemPrompt": "You are a React expert...",
    "bootstrapMode": "auto",
    "bootstrapScript": null,
    "capabilities": ["code", "test", "ui"],
    "metadata": {
      "createdBy": "user-789",
      "createdAt": "2026-01-25T10:00:00Z",
      "updatedAt": "2026-01-25T10:00:00Z"
    }
  },
  {
    "id": "global-backend-01",
    "projectId": null,  // Global agent - available to all projects
    "name": "Standard Backend Developer",
    "role": "Backend Engineer",
    "cliType": "claude-code",
    "workingDirectory": "./backend",
    "systemPrompt": "You are a Node.js API expert...",
    "bootstrapMode": "auto",
    "bootstrapScript": null,
    "capabilities": ["code", "test", "api"],
    "metadata": {
      "createdBy": "admin",
      "createdAt": "2026-01-20T10:00:00Z",
      "updatedAt": "2026-01-20T10:00:00Z"
    }
  }
]
```

### Create Agent Configuration

```http
POST /api/agents
```

**Request Body:**
```json
{
  "name": "Alice",
  "role": "Frontend Engineer",
  "projectId": "project-456",  // Use null for global agents
  "cliType": "claude-code",    // Only claude-code is currently working
  "workingDirectory": "./frontend",
  "systemPrompt": "You are a React expert focused on component design",
  "bootstrapMode": "auto",      // Options: none, auto, manual, custom
  "bootstrapScript": "",        // Required if bootstrapMode is 'manual'
  "capabilities": ["code", "test", "ui"]  // Reserved for future use
}
```

**Response:** `201 Created`
```json
{
  "id": "agent-config-123",
  "name": "Alice",
  "role": "Frontend Engineer",
  "createdAt": "2026-01-25T10:00:00Z"
}
```

### Get Agent Configuration

```http
GET /api/agents/:id
```

**Response:** Agent configuration object

### Update Agent Configuration

```http
PUT /api/agents/:id
```

**Request Body:** Same as create, all fields optional

**Response:** Updated agent configuration

### Delete Agent Configuration

```http
DELETE /api/agents/:id
```

**Response:** `204 No Content`

### Clone Agent Configuration

```http
POST /api/agents/:id/clone
```

**Request Body:**
```json
{
  "name": "Alice Clone",
  "projectId": "project-789"
}
```

**Response:** New agent configuration

### Instantiate Agent from Configuration

```http
POST /api/agents/:id/instantiate
```

**Request Body:**
```json
{
  "position": { "x": 100, "y": 200 },
  "teamId": "team-123",
  "overrides": {
    "workingDirectory": "./custom-dir"
  }
}
```

**Response:**
```json
{
  "agentId": "alice-instance-456",
  "configId": "agent-config-123",
  "status": "starting",
  "pid": 12345
}
```

---

## Bootstrap System

### Trigger Manual Bootstrap

```http
POST /api/agents/:agentId/bootstrap
```

**Request Body:**
```json
{
  "files": ["README.md", "docs/architecture.md"],
  "additionalContext": "Focus on authentication module",
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
  "bootstrapTime": 1.23
}
```

### Get Bootstrap Status

```http
GET /api/agents/:agentId/bootstrap/status
```

**Response:**
```json
{
  "agentId": "alice-123",
  "mode": "auto",
  "status": "completed",
  "lastBootstrap": "2026-01-25T10:00:00Z",
  "bootstrapCount": 3,
  "filesLoaded": ["CLAUDE.md", ".kokino/context.md"],
  "contextSize": 8192,
  "performance": {
    "duration": 4.5,
    "phases": {
      "fileLoad": 2.1,
      "contextInject": 2.4
    }
  }
}
```

### Reload Bootstrap

```http
POST /api/agents/:agentId/bootstrap/reload
```

Force agent to reload bootstrap (fresh context)

**Response:** Same as manual bootstrap

### Get Bootstrap Configuration

```http
GET /api/agents/:agentId/bootstrap/config
```

**Response:**
```json
{
  "mode": "auto",
  "workingDirectory": "./frontend",
  "autoLoadPaths": ["CLAUDE.md", ".kokino/context.md"],
  "bootstrapScript": null,
  "bootstrapEnv": {},
  "bootstrapTimeout": 30000
}
```

### Update Bootstrap Mode

```http
PUT /api/agents/:agentId/bootstrap/mode
```

**Request Body:**
```json
{
  "mode": "manual",
  "config": {
    "bootstrapTimeout": 60000
  }
}
```

### Get Compaction Status

```http
GET /api/agents/:agentId/compaction-status
```

**Response:**
```json
{
  "agentId": "alice-123",
  "conversationTurns": 67,
  "totalTokens": 125000,
  "avgResponseTime": 2.3,
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
GET /api/teams
```

**Query Parameters:**
- `projectId` - Filter by project
- `category` - Filter by category
- `tags` - Comma-separated tags
- `search` - Search in name/description

**Response:**
```json
[
  {
    "id": "team-123",
    "name": "Feature Team Alpha",
    "description": "Full-stack development team",
    "projectId": "project-456",
    "category": "development",
    "agentCount": 5,
    "createdAt": "2026-01-25T10:00:00Z",
    "updatedAt": "2026-01-25T14:00:00Z"
  }
]
```

### Create Team

```http
POST /api/teams
```

**Request Body:**
```json
{
  "name": "Feature Team Alpha",
  "description": "Agile development team",
  "projectId": "project-123",
  "configuration": {
    "agents": [...],
    "connections": [...],
    "workflow": {...}
  }
}
```

**Response:** `201 Created` with team object

### Get Team Configuration

```http
GET /api/teams/:teamId
```

**Response:** Complete team configuration (see Team Lifecycle Spec for schema)

### Update Team

```http
PUT /api/teams/:teamId
```

**Request Body:** Partial team configuration

### Delete Team

```http
DELETE /api/teams/:teamId
```

**Response:** `204 No Content` (fails if team is running)

### Start Team

```http
POST /api/teams/:teamId/start
```

**Request Body:**
```json
{
  "environment": {
    "PROJECT_NAME": "MyProject",
    "API_VERSION": "v2"
  },
  "initialPrompt": "Build user authentication feature",
  "options": {
    "parallel": true,
    "timeout": 3600000
  }
}
```

**Response:**
```json
{
  "sessionId": "session-456",
  "teamId": "team-123",
  "status": "starting",
  "agents": [
    {
      "agentId": "alice-123",
      "status": "starting",
      "pid": 12345
    }
  ]
}
```

### Stop Team

```http
POST /api/teams/:teamId/stop
```

**Request Body:**
```json
{
  "force": false,
  "saveState": true
}
```

### Get Team Status

```http
GET /api/teams/:teamId/status
```

**Response:**
```json
{
  "teamId": "team-123",
  "sessionId": "session-456",
  "status": "running",
  "phase": "Implementation",
  "agents": [
    {
      "agentId": "alice-123",
      "status": "working",
      "currentTask": "Building components"
    }
  ],
  "metrics": {
    "uptime": 3600000,
    "messagesExchanged": 234,
    "tasksCompleted": 12
  }
}
```

### Restart Team

```http
POST /api/teams/:teamId/restart
```

Stop then start the team with same configuration

### Pause Team

```http
POST /api/teams/:teamId/pause
```

Pause all agents in team

### Resume Team

```http
POST /api/teams/:teamId/resume
```

Resume paused team

### Get Team Templates

```http
GET /api/teams/templates
```

List available team templates

### Create Team from Template

```http
POST /api/teams/from-template
```

**Request Body:**
```json
{
  "templateId": "template-fullstack",
  "projectId": "project-123",
  "customizations": {
    "name": "My Custom Team"
  }
}
```

---

## Monitoring

### Get Monitoring Overview

```http
GET /api/monitoring/overview
```

**Response:**
```json
{
  "activeTeams": 3,
  "activeAgents": 12,
  "alerts": {
    "active": 2,
    "acknowledged": 5
  },
  "fileOperations": {
    "lastHour": {
      "reads": 1234,
      "writes": 567,
      "deletes": 12
    }
  },
  "violations": {
    "lastHour": 3,
    "critical": 1
  },
  "performance": {
    "avgCpuUsage": 45.2,
    "avgMemoryUsage": 512,
    "totalDiskIO": 124
  }
}
```

### Get Agent Metrics

```http
GET /api/monitoring/agents/:agentId/metrics
```

**Query Parameters:**
- `from` - Start timestamp
- `to` - End timestamp
- `interval` - Aggregation interval: `1m` | `5m` | `1h`

**Response:**
```json
{
  "agentId": "alice-123",
  "metrics": [
    {
      "timestamp": "2026-01-25T10:00:00Z",
      "cpu": 25.5,
      "memory": 256,
      "io": {
        "reads": 45,
        "writes": 12
      }
    }
  ]
}
```

### Get File Operations

```http
GET /api/monitoring/agents/:agentId/file-operations
```

**Query Parameters:**
- `from` - Start timestamp
- `to` - End timestamp
- `operation` - Filter by: `read` | `write` | `delete`
- `path` - Filter by path pattern

**Response:**
```json
{
  "operations": [
    {
      "id": "op-123",
      "operation": "read",
      "path": "/project/src/App.js",
      "timestamp": "2026-01-25T10:00:00Z",
      "duration": 15,
      "bytesRead": 2048,
      "success": true
    }
  ]
}
```

### Get Boundary Violations

```http
GET /api/monitoring/violations
```

**Query Parameters:**
- `agentId` - Filter by agent
- `severity` - Filter by: `warning` | `critical`
- `from` - Start timestamp
- `to` - End timestamp

**Response:**
```json
{
  "violations": [
    {
      "id": "violation-123",
      "agentId": "alice-123",
      "timestamp": "2026-01-25T10:00:00Z",
      "type": "file_access",
      "path": "/etc/passwd",
      "severity": "critical",
      "action": "blocked"
    }
  ]
}
```

### Get Alerts

```http
GET /api/monitoring/alerts
```

**Query Parameters:**
- `status` - Filter by: `active` | `acknowledged` | `resolved`
- `severity` - Filter by: `info` | `warning` | `critical`

**Response:**
```json
{
  "alerts": [
    {
      "id": "alert-123",
      "rule": "high_cpu_usage",
      "agentId": "alice-123",
      "severity": "warning",
      "status": "active",
      "triggeredAt": "2026-01-25T10:00:00Z",
      "message": "CPU usage above 90% for 5 minutes"
    }
  ]
}
```

### Acknowledge Alert

```http
POST /api/monitoring/alerts/:alertId/acknowledge
```

**Request Body:**
```json
{
  "acknowledgedBy": "user-123",
  "notes": "Investigating high CPU usage"
}
```

### Get Summary Report

```http
GET /api/monitoring/reports/summary
```

**Query Parameters:**
- `from` - Start date
- `to` - End date
- `groupBy` - Group by: `hour` | `day` | `week`

---

## Projects

### List Projects

```http
GET /api/projects
```

### Create Project

```http
POST /api/projects
```

**Request Body:**
```json
{
  "name": "E-commerce Platform",
  "workspacePath": "/projects/ecommerce",
  "description": "Main e-commerce platform"
}
```

### Get Project

```http
GET /api/projects/:id
```

### Update Project

```http
PUT /api/projects/:id
```

### Delete Project

```http
DELETE /api/projects/:id
```

### Get Project Agents

```http
GET /api/projects/:id/agents
```

List all agent configurations for a project

### Get Project Teams

```http
GET /api/projects/:id/teams
```

List all teams for a project

---

## WebSocket Events

Connect to WebSocket for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:5050/ws');
```

### Event Types

#### Agent Status Update
```json
{
  "type": "agent.status",
  "agentId": "alice-123",
  "status": "working",
  "task": "Building components"
}
```

#### Team Phase Change
```json
{
  "type": "team.phase",
  "teamId": "team-123",
  "phase": "Implementation",
  "agents": ["alice-123", "bob-456"]
}
```

#### File Operation
```json
{
  "type": "file.operation",
  "agentId": "alice-123",
  "operation": "write",
  "path": "/project/src/App.js"
}
```

#### Boundary Violation
```json
{
  "type": "boundary.violation",
  "agentId": "alice-123",
  "severity": "warning",
  "path": "/etc/hosts"
}
```

#### Alert Triggered
```json
{
  "type": "alert.triggered",
  "alertId": "alert-123",
  "rule": "high_cpu_usage",
  "severity": "warning"
}
```

#### Message Exchange
```json
{
  "type": "message.sent",
  "from": "alice-123",
  "to": "bob-456",
  "content": "API design complete"
}
```

---

## Error Codes

### Standard HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `204 No Content` - Success with no response body
- `400 Bad Request` - Invalid request
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict
- `422 Unprocessable Entity` - Validation error
- `429 Too Many Requests` - Rate limited
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Service down

### Application Error Codes

```json
{
  "error": {
    "code": "AGENT_START_FAILED",
    "message": "Failed to start agent",
    "details": {
      "agentId": "alice-123",
      "reason": "Port 5173 already in use"
    }
  }
}
```

**Error Codes:**

| Code | Description |
|------|-------------|
| `AGENT_NOT_FOUND` | Agent configuration or instance not found |
| `AGENT_START_FAILED` | Failed to start agent process |
| `AGENT_ALREADY_RUNNING` | Agent is already running |
| `TEAM_NOT_FOUND` | Team configuration not found |
| `TEAM_RUNNING` | Cannot modify/delete running team |
| `BOOTSTRAP_FAILED` | Bootstrap process failed |
| `BOOTSTRAP_TIMEOUT` | Bootstrap exceeded timeout |
| `WORKSPACE_CONFLICT` | Workspace directory conflict |
| `BOUNDARY_VIOLATION` | Agent violated workspace boundary |
| `COMPACTION_DETECTED` | Agent needs restart due to compaction |
| `INVALID_CONFIGURATION` | Invalid agent/team configuration |
| `PROJECT_NOT_FOUND` | Project not found |
| `QUOTA_EXCEEDED` | Resource quota exceeded |
| `RATE_LIMITED` | Too many requests |

---

## Rate Limiting

API endpoints are rate limited:

- **Default:** 100 requests per minute per IP
- **Heavy endpoints** (start/stop): 10 requests per minute
- **Monitoring endpoints:** 1000 requests per minute

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706180460
```

---

## Pagination

List endpoints support pagination:

```http
GET /api/agents?limit=10&offset=20
```

**Response Headers:**
```
X-Total-Count: 156
X-Page-Size: 10
X-Page-Number: 3
Link: </api/agents?limit=10&offset=30>; rel="next",
      </api/agents?limit=10&offset=10>; rel="prev",
      </api/agents?limit=10&offset=0>; rel="first",
      </api/agents?limit=10&offset=150>; rel="last"
```

---

## Versioning

API version is included in response headers:

```
X-API-Version: 2.0.0
```

Future versions may use URL versioning:
```
/api/v3/agents
```

---

## CORS

CORS is enabled for local development:

```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

Production CORS configuration should be restricted to specific domains.