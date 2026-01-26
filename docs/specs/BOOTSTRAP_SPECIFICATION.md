# Bootstrap System Specification

## Phase 3: Agent Bootstrap & Context Loading

### Overview

The Bootstrap System enables agents to load context and configuration on startup, addressing the Claude Code compaction issue where conversation history becomes too large. Instead of persisting conversations, agents start fresh each session with relevant context loaded from files.

### Problem Statement

Claude Code agents experience degradation after multiple conversation turns due to:
- Context window limitations
- Compaction artifacts where old context interferes with new instructions
- Loss of important project context between sessions
- Inconsistent agent behavior across restarts

### Bootstrap Modes

#### 1. None Mode
**Purpose:** Minimal startup for simple agents

**Behavior:**
- Agent starts with only its system prompt
- No file loading or context injection
- Fastest startup time (<1 second)

**Use Cases:**
- Stateless utility agents
- Simple task executors
- Agents that receive all context via messages

**Configuration:**
```json
{
  "bootstrapMode": "none",
  "systemPrompt": "You are a code reviewer focused on security."
}
```

#### 2. Auto Mode (Default)
**Purpose:** Automatic context loading based on conventions

**Behavior:**
1. Load system prompt from agent config
2. Check for and load files in order:
   - `{workingDirectory}/CLAUDE.md` - Project-specific instructions
   - `{workingDirectory}/.kokino/context.md` - Agent-specific context
   - `{workingDirectory}/.kokino/bootstrap.md` - Session bootstrap info
3. Inject loaded content as initial system context
4. Set agent status to "ready"

**File Loading Priority:**
```
1. System Prompt (always)
2. ../CLAUDE.md (if exists) - Workspace instructions
3. ./CLAUDE.md (if exists) - Project instructions
4. ./.kokino/context.md (if exists) - Agent context
5. ./.kokino/bootstrap.md (if exists) - Bootstrap instructions
```

**Use Cases:**
- Standard development agents
- Project-aware agents
- Agents needing consistent behavior

**Configuration:**
```json
{
  "bootstrapMode": "auto",
  "workingDirectory": "./frontend",
  "systemPrompt": "You are a React expert...",
  "autoLoadPaths": [
    "CLAUDE.md",
    ".kokino/context.md"
  ]
}
```

#### 3. Manual Mode
**Purpose:** User-triggered context loading

**Behavior:**
1. Agent starts with system prompt only
2. Waits in "awaiting-bootstrap" status
3. User calls POST /api/agents/:id/bootstrap
4. Agent loads context and transitions to "ready"

**API Endpoint:**
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
  "bootstrapTime": 1.23
}
```

**Use Cases:**
- Selective context loading
- Dynamic context based on task
- Memory-conscious operations

#### 4. Custom Mode
**Purpose:** Execute custom bootstrap script

**Behavior:**
1. Run specified bootstrap script
2. Script outputs context to stdout
3. Capture output and inject as context
4. Script exit code determines success

**Script Environment:**
```bash
# Available environment variables
AGENT_ID="Alice"
AGENT_ROLE="Frontend Engineer"
WORKING_DIR="/path/to/project"
PROJECT_ID="project-123"

# Script should output context to stdout
# Exit 0 for success, non-zero for failure
```

**Configuration:**
```json
{
  "bootstrapMode": "custom",
  "bootstrapScript": ".kokino/bootstrap.sh",
  "bootstrapTimeout": 30000,
  "bootstrapEnv": {
    "INCLUDE_TESTS": "true",
    "LOAD_HISTORY": "false"
  }
}
```

**Example Bootstrap Script:**
```bash
#!/bin/bash
# .kokino/bootstrap.sh

echo "# Project Context"
echo ""
cat README.md
echo ""
echo "# Recent Changes"
git log --oneline -10
echo ""
echo "# Current Branch"
git branch --show-current
echo ""
echo "# Modified Files"
git status --short
```

**Use Cases:**
- Dynamic context generation
- Git-aware context
- External data integration
- Complex loading logic

### Compaction Monitoring

#### Detection Mechanism

Monitor for compaction symptoms:
```javascript
class CompactionMonitor {
  constructor(agentId) {
    this.agentId = agentId;
    this.metrics = {
      conversationTurns: 0,
      totalTokens: 0,
      responseTime: [],
      errorRate: 0,
      confusionIndicators: 0
    };
  }

  detectCompaction() {
    return {
      isCompacted: this.metrics.conversationTurns > 50,
      severity: this.calculateSeverity(),
      recommendation: this.getRecommendation()
    };
  }

  calculateSeverity() {
    if (this.metrics.conversationTurns > 100) return 'critical';
    if (this.metrics.conversationTurns > 50) return 'warning';
    if (this.metrics.errorRate > 0.3) return 'warning';
    return 'normal';
  }

  getRecommendation() {
    const detection = this.detectCompaction();
    if (detection.severity === 'critical') {
      return 'Restart agent immediately';
    }
    if (detection.severity === 'warning') {
      return 'Consider restarting agent soon';
    }
    return 'Agent operating normally';
  }
}
```

#### Monitoring Endpoints

```http
GET /api/agents/:agentId/compaction-status
```

**Response:**
```json
{
  "agentId": "Alice",
  "conversationTurns": 67,
  "totalTokens": 125000,
  "avgResponseTime": 2.3,
  "compactionStatus": {
    "isCompacted": true,
    "severity": "warning",
    "recommendation": "Consider restarting agent soon"
  },
  "metrics": {
    "lastHourTurns": 12,
    "lastHourTokens": 24000,
    "errorRate": 0.15
  }
}
```

### Performance Requirements

#### Bootstrap Performance Targets

| Mode | Target Time | Max Time | Timeout |
|------|------------|----------|---------|
| None | < 1s | 2s | 5s |
| Auto | < 5s | 10s | 30s |
| Manual | < 5s | 10s | 30s |
| Custom | < 10s | 30s | 60s |

#### Performance Monitoring

```javascript
class BootstrapPerformance {
  async measureBootstrap(agentId, mode) {
    const start = Date.now();
    const checkpoints = {};

    checkpoints.start = start;

    // Load system prompt
    checkpoints.promptLoaded = Date.now();

    // Load files (if auto/manual)
    checkpoints.filesLoaded = Date.now();

    // Execute script (if custom)
    checkpoints.scriptExecuted = Date.now();

    // Inject context
    checkpoints.contextInjected = Date.now();

    const total = Date.now() - start;

    return {
      agentId,
      mode,
      totalTime: total,
      checkpoints,
      phases: {
        promptLoad: checkpoints.promptLoaded - start,
        fileLoad: checkpoints.filesLoaded - checkpoints.promptLoaded,
        scriptExec: checkpoints.scriptExecuted - checkpoints.filesLoaded,
        contextInject: checkpoints.contextInjected - checkpoints.scriptExecuted
      }
    };
  }
}
```

### API Endpoints

#### Bootstrap Control

```http
POST /api/agents/:agentId/bootstrap
```
Manually trigger bootstrap for an agent in manual mode

```http
GET /api/agents/:agentId/bootstrap/status
```
Get current bootstrap status and metrics

```http
POST /api/agents/:agentId/bootstrap/reload
```
Force reload bootstrap (restart agent with fresh context)

```http
PUT /api/agents/:agentId/bootstrap/mode
```
Change bootstrap mode for an agent

#### Bootstrap Configuration

```http
GET /api/agents/:agentId/bootstrap/config
```
Get current bootstrap configuration

```http
PUT /api/agents/:agentId/bootstrap/config
```
Update bootstrap configuration

### Database Schema

```sql
-- Add to agents table
ALTER TABLE agents ADD COLUMN bootstrap_mode TEXT DEFAULT 'auto';
ALTER TABLE agents ADD COLUMN bootstrap_script TEXT;
ALTER TABLE agents ADD COLUMN bootstrap_config JSON;
ALTER TABLE agents ADD COLUMN last_bootstrap TEXT;
ALTER TABLE agents ADD COLUMN bootstrap_count INTEGER DEFAULT 0;

-- Bootstrap history table
CREATE TABLE bootstrap_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(agent_id),
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  success BOOLEAN,
  files_loaded JSON,
  context_size INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- Compaction metrics table
CREATE TABLE compaction_metrics (
  agent_id TEXT REFERENCES agents(agent_id),
  conversation_turns INTEGER,
  total_tokens INTEGER,
  error_count INTEGER,
  confusion_count INTEGER,
  avg_response_time REAL,
  measured_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, measured_at)
);
```

### File Structure

```
project/
├── CLAUDE.md                    # Workspace/project instructions
├── .kokino/
│   ├── context.md               # Agent-specific context
│   ├── bootstrap.md             # Bootstrap instructions
│   ├── bootstrap.sh             # Custom bootstrap script
│   └── templates/
│       ├── frontend.md          # Template contexts
│       ├── backend.md
│       └── devops.md
```

### Implementation Classes

```javascript
// Core bootstrap manager
class BootstrapManager {
  constructor(agentRegistry, fileLoader, scriptRunner) {
    this.registry = agentRegistry;
    this.loader = fileLoader;
    this.runner = scriptRunner;
  }

  async bootstrapAgent(agentId, config) {
    const agent = await this.registry.get(agentId);

    switch(config.bootstrapMode) {
      case 'none':
        return this.bootstrapNone(agent);
      case 'auto':
        return this.bootstrapAuto(agent, config);
      case 'manual':
        return this.bootstrapManual(agent, config);
      case 'custom':
        return this.bootstrapCustom(agent, config);
      default:
        throw new Error(`Unknown bootstrap mode: ${config.bootstrapMode}`);
    }
  }

  async bootstrapAuto(agent, config) {
    const files = await this.findAutoLoadFiles(config.workingDirectory);
    const context = await this.loadFiles(files);
    await this.injectContext(agent, context);
    return { success: true, filesLoaded: files };
  }

  async bootstrapCustom(agent, config) {
    const output = await this.runner.execute(config.bootstrapScript, {
      env: config.bootstrapEnv,
      timeout: config.bootstrapTimeout
    });
    await this.injectContext(agent, output);
    return { success: true, script: config.bootstrapScript };
  }
}
```

### Testing Requirements

#### Unit Tests
- Bootstrap mode selection logic
- File loading with various paths
- Script execution and timeout handling
- Context injection
- Compaction detection algorithms

#### Integration Tests
- Full bootstrap flow for each mode
- Performance under target times
- Error handling and recovery
- API endpoint functionality
- Database operations

#### Load Tests
- Bootstrap 10 agents simultaneously
- Measure resource usage
- Verify no bootstrap conflicts
- Test script execution isolation

### Error Handling

#### Error Scenarios

1. **File Not Found**
   - Log warning, continue with available files
   - Return partial success with loaded files list

2. **Script Timeout**
   - Kill script process
   - Set agent to error state
   - Return timeout error with partial output

3. **Context Too Large**
   - Truncate to max size with warning
   - Log which files were truncated
   - Return warning in response

4. **Script Execution Error**
   - Capture stderr
   - Set agent to error state
   - Return script error details

5. **Compaction Detected**
   - Send alert/notification
   - Recommend restart
   - Track in metrics

### Rollout Plan

1. **Phase 1:** Implement 'none' and 'auto' modes
2. **Phase 2:** Add 'manual' mode with API
3. **Phase 3:** Implement 'custom' mode with scripts
4. **Phase 4:** Add compaction monitoring
5. **Phase 5:** Performance optimization

### Success Criteria

- [ ] All 4 bootstrap modes implemented and tested
- [ ] Auto mode loads context in < 5 seconds
- [ ] Compaction detection accuracy > 90%
- [ ] Bootstrap API endpoints documented and tested
- [ ] Custom scripts execute in isolated environment
- [ ] Performance metrics dashboard available
- [ ] Error recovery handles all scenarios gracefully
- [ ] Documentation includes examples for each mode