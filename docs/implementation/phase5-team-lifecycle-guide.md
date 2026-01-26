# Phase 5: Team Lifecycle Implementation Guide

## ⚠️ REALITY CHECK: Teams Don't Exist Yet

### The Brutal Truth

Looking at the codebase:
- **NO team models** exist (`broker/src/models/` has no Team.js)
- **NO team tables** in database (sqlite3 shows nothing)
- **NO team API routes** implemented (`/api/teams` returns 404)
- **NO workspace management** code
- **NO root agent logic**

The spec describes a beautiful orchestration system, but **NOTHING has been built**.

## What the Spec Promises vs Reality

### Spec Says:
- Teams with root agents coordinating work
- Workflow phases with parallel execution
- Workspace isolation modes
- Team templates
- Environment variables and secrets
- Pause/resume functionality
- 15+ API endpoints

### Reality Is:
- Agents exist as independent entities
- No concept of teams in the codebase
- No workspace management
- No coordination mechanisms
- No workflow engine

## Critical Missing Pieces

### 1. **Database Schema Doesn't Exist**

We need:
```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_id TEXT,
  configuration JSON NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE team_sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  status TEXT DEFAULT 'created',
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  phase TEXT,
  metadata JSON,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE team_agents (
  team_id TEXT,
  agent_id TEXT,
  is_root BOOLEAN DEFAULT FALSE,
  working_directory TEXT,
  position_x INTEGER,
  position_y INTEGER,
  PRIMARY KEY (team_id, agent_id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);
```

### 2. **Workflow Engine Doesn't Exist**

The spec describes phases, parallel execution, dependencies - but there's NO workflow engine:
- No phase tracking
- No dependency resolution
- No parallel execution logic
- No escalation handling

### 3. **Root Agent Concept Not Implemented**

The spec talks about root agents coordinating, but:
- No way to designate root agent
- No coordination protocol
- No delegation mechanism
- No escalation paths

### 4. **Workspace Management Missing**

Each agent needs its working directory, but:
- No directory creation code
- No isolation mechanisms
- No file synchronization
- No conflict resolution

## Actual Implementation Plan

### Day 1-2: Database Foundation

#### Create Migration

`broker/src/db/migrations/006_add_team_tables.sql`:
```sql
-- Team configuration storage
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  project_id TEXT,
  configuration JSON NOT NULL,  -- Stores agents, connections, workflow
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Track team execution sessions
CREATE TABLE team_sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  status TEXT DEFAULT 'created' CHECK(status IN ('created', 'starting', 'running', 'paused', 'stopping', 'stopped', 'error')),
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  current_phase TEXT,
  phase_started_at TIMESTAMP,
  error_message TEXT,
  metrics JSON,  -- messages exchanged, tasks completed, etc.
  environment JSON,  -- environment variables for session
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Map agents to team sessions
CREATE TABLE session_agents (
  session_id TEXT,
  agent_id TEXT,
  agent_config_id TEXT,
  is_root BOOLEAN DEFAULT FALSE,
  working_directory TEXT,
  status TEXT DEFAULT 'offline',
  pid INTEGER,
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  PRIMARY KEY (session_id, agent_id),
  FOREIGN KEY (session_id) REFERENCES team_sessions(id) ON DELETE CASCADE
);

-- Workflow execution tracking
CREATE TABLE workflow_phases (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  phase_name TEXT,
  phase_order INTEGER,
  status TEXT DEFAULT 'pending',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  agents JSON,  -- Array of agent IDs in this phase
  parallel BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (session_id) REFERENCES team_sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_teams_project ON teams(project_id);
CREATE INDEX idx_team_sessions_team ON team_sessions(team_id);
CREATE INDEX idx_team_sessions_status ON team_sessions(status);
CREATE INDEX idx_session_agents_session ON session_agents(session_id);
CREATE INDEX idx_workflow_phases_session ON workflow_phases(session_id);
```

### Day 3-4: Team Model

`broker/src/models/Team.js`:
```javascript
import { randomUUID } from 'crypto';
import db from '../db/schema.js';

export class Team {
  constructor(data) {
    this.id = data.id || randomUUID();
    this.name = data.name;
    this.description = data.description;
    this.projectId = data.projectId;
    this.configuration = data.configuration || {};
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.createdBy = data.createdBy;
  }

  validate() {
    const errors = [];

    if (!this.name) {
      errors.push('Team name is required');
    }

    if (!this.configuration.agents || this.configuration.agents.length === 0) {
      errors.push('Team must have at least one agent');
    }

    // Validate exactly one root agent
    const rootAgents = this.configuration.agents.filter(a => a.isRoot);
    if (rootAgents.length === 0) {
      errors.push('Team must have a root agent');
    } else if (rootAgents.length > 1) {
      errors.push('Team can only have one root agent');
    }

    // Validate agent references in connections
    const agentIds = new Set(this.configuration.agents.map(a => a.id));
    const connections = this.configuration.connections || [];

    for (const conn of connections) {
      if (!agentIds.has(conn.source)) {
        errors.push(`Connection references unknown agent: ${conn.source}`);
      }
      if (!agentIds.has(conn.target)) {
        errors.push(`Connection references unknown agent: ${conn.target}`);
      }
    }

    // Validate workflow phases
    if (this.configuration.workflow?.phases) {
      for (const phase of this.configuration.workflow.phases) {
        for (const agentId of phase.agents) {
          if (!agentIds.has(agentId)) {
            errors.push(`Phase '${phase.name}' references unknown agent: ${agentId}`);
          }
        }
      }
    }

    return errors;
  }

  save() {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Team validation failed: ${errors.join(', ')}`);
    }

    const existing = db.prepare('SELECT id FROM teams WHERE id = ?').get(this.id);

    if (existing) {
      // Update
      db.prepare(`
        UPDATE teams
        SET name = ?, description = ?, project_id = ?, configuration = ?,
            metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        this.name,
        this.description,
        this.projectId,
        JSON.stringify(this.configuration),
        JSON.stringify(this.metadata),
        this.id
      );
    } else {
      // Insert
      db.prepare(`
        INSERT INTO teams (id, name, description, project_id, configuration, metadata, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.id,
        this.name,
        this.description,
        this.projectId,
        JSON.stringify(this.configuration),
        JSON.stringify(this.metadata),
        this.createdBy
      );
    }

    return this;
  }

  static findById(id) {
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    if (!row) return null;

    return new Team({
      ...row,
      configuration: JSON.parse(row.configuration),
      metadata: JSON.parse(row.metadata || '{}')
    });
  }

  static findByProject(projectId) {
    const rows = db.prepare('SELECT * FROM teams WHERE project_id = ?').all(projectId);
    return rows.map(row => new Team({
      ...row,
      configuration: JSON.parse(row.configuration),
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }

  async createSession() {
    const sessionId = `session-${randomUUID()}`;

    // Create session record
    db.prepare(`
      INSERT INTO team_sessions (id, team_id, status)
      VALUES (?, ?, 'created')
    `).run(sessionId, this.id);

    // Create session agents
    for (const agent of this.configuration.agents) {
      db.prepare(`
        INSERT INTO session_agents (session_id, agent_id, agent_config_id, is_root, working_directory)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        sessionId,
        agent.id,
        agent.configId,
        agent.isRoot || false,
        agent.workingDirectory || './'
      );
    }

    // Create workflow phases
    if (this.configuration.workflow?.phases) {
      for (let i = 0; i < this.configuration.workflow.phases.length; i++) {
        const phase = this.configuration.workflow.phases[i];
        db.prepare(`
          INSERT INTO workflow_phases (id, session_id, phase_name, phase_order, agents, parallel)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `${sessionId}-phase-${i}`,
          sessionId,
          phase.name,
          i,
          JSON.stringify(phase.agents),
          phase.parallel || false
        );
      }
    }

    return sessionId;
  }

  delete() {
    // Check if team has active sessions
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count FROM team_sessions
      WHERE team_id = ? AND status IN ('running', 'starting', 'paused')
    `).get(this.id);

    if (activeSessions.count > 0) {
      throw new Error('Cannot delete team with active sessions');
    }

    db.prepare('DELETE FROM teams WHERE id = ?').run(this.id);
    return true;
  }
}
```

### Day 5-6: Team Lifecycle Manager

`broker/src/services/TeamLifecycleManager.js`:
```javascript
import { Team } from '../models/Team.js';
import { AgentRunner } from '../agents/AgentRunner.js';
import db from '../db/schema.js';
import { EventEmitter } from 'events';

export class TeamLifecycleManager extends EventEmitter {
  constructor(agentRegistry, bootstrapManager) {
    super();
    this.agentRegistry = agentRegistry;
    this.bootstrapManager = bootstrapManager;
    this.activeSessions = new Map();
  }

  async startTeam(teamId, options = {}) {
    const team = Team.findById(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Check for existing active session
    const activeSession = db.prepare(`
      SELECT id FROM team_sessions
      WHERE team_id = ? AND status IN ('running', 'starting', 'paused')
    `).get(teamId);

    if (activeSession) {
      throw new Error(`Team already has active session: ${activeSession.id}`);
    }

    // Create new session
    const sessionId = await team.createSession();

    // Update session status
    db.prepare(`
      UPDATE team_sessions
      SET status = 'starting', started_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sessionId);

    try {
      // Start agents in dependency order
      await this.startAgentsInOrder(sessionId, team, options);

      // Update session status
      db.prepare(`
        UPDATE team_sessions
        SET status = 'running'
        WHERE id = ?
      `).run(sessionId);

      // Start workflow execution if defined
      if (team.configuration.workflow) {
        this.executeWorkflow(sessionId, team.configuration.workflow);
      }

      this.emit('team:started', { teamId, sessionId });

      return {
        sessionId,
        teamId,
        status: 'running',
        agents: await this.getSessionAgents(sessionId)
      };

    } catch (error) {
      // Cleanup on failure
      await this.cleanupFailedStart(sessionId);
      throw error;
    }
  }

  async startAgentsInOrder(sessionId, team, options) {
    const agents = team.configuration.agents;
    const started = new Set();
    const errors = [];

    // Start root agent first
    const rootAgent = agents.find(a => a.isRoot);
    if (rootAgent) {
      try {
        await this.startAgent(sessionId, rootAgent, options);
        started.add(rootAgent.id);
      } catch (error) {
        errors.push({ agent: rootAgent.id, error: error.message });
      }
    }

    // Start other agents
    for (const agent of agents) {
      if (started.has(agent.id)) continue;

      try {
        await this.startAgent(sessionId, agent, options);
        started.add(agent.id);
      } catch (error) {
        errors.push({ agent: agent.id, error: error.message });
      }
    }

    if (errors.length > 0) {
      throw new Error(`Failed to start agents: ${JSON.stringify(errors)}`);
    }
  }

  async startAgent(sessionId, agentConfig, options) {
    // Create working directory if needed
    const workDir = await this.setupWorkspace(sessionId, agentConfig);

    // Register agent
    const agentId = `${agentConfig.id}-${sessionId}`;
    await this.agentRegistry.register({
      agentId,
      type: agentConfig.cliType || 'claude-code',
      metadata: {
        ...agentConfig,
        sessionId,
        workingDirectory: workDir
      }
    });

    // Bootstrap agent
    if (options.bootstrap !== false) {
      await this.bootstrapManager.bootstrapAgent(agentId, {
        mode: agentConfig.bootstrapMode || 'auto',
        additionalContext: options.initialPrompt
      });
    }

    // Start agent process
    const runner = new AgentRunner(agentId, {
      workingDirectory: workDir,
      systemPrompt: agentConfig.systemPrompt,
      environment: options.environment
    });

    const pid = await runner.start();

    // Update session agent record
    db.prepare(`
      UPDATE session_agents
      SET status = 'online', pid = ?, started_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND agent_id = ?
    `).run(pid, sessionId, agentConfig.id);

    this.emit('agent:started', { sessionId, agentId, pid });

    return { agentId, pid, status: 'online' };
  }

  async setupWorkspace(sessionId, agentConfig) {
    const baseDir = process.env.KOKINO_WORKSPACE || './workspace';
    const sessionDir = `${baseDir}/sessions/${sessionId}`;
    const agentDir = `${sessionDir}/${agentConfig.id}`;

    // Create directories
    const fs = require('fs').promises;
    await fs.mkdir(agentDir, { recursive: true });

    // Copy or link project files based on isolation mode
    const isolationMode = agentConfig.isolationMode || 'shared';

    if (isolationMode === 'shared') {
      // Symlink to actual project directory
      const projectDir = agentConfig.workingDirectory || './';
      await fs.symlink(projectDir, `${agentDir}/project`, 'dir');
      return `${agentDir}/project`;
    } else if (isolationMode === 'isolated') {
      // Copy project files
      const projectDir = agentConfig.workingDirectory || './';
      await this.copyDirectory(projectDir, `${agentDir}/project`);
      return `${agentDir}/project`;
    }

    return agentDir;
  }

  async stopTeam(teamId, options = {}) {
    const activeSession = db.prepare(`
      SELECT id FROM team_sessions
      WHERE team_id = ? AND status IN ('running', 'starting', 'paused')
      ORDER BY started_at DESC
      LIMIT 1
    `).get(teamId);

    if (!activeSession) {
      throw new Error(`No active session for team ${teamId}`);
    }

    return this.stopSession(activeSession.id, options);
  }

  async stopSession(sessionId, options = {}) {
    // Update session status
    db.prepare(`
      UPDATE team_sessions
      SET status = 'stopping'
      WHERE id = ?
    `).run(sessionId);

    // Get all session agents
    const agents = db.prepare(`
      SELECT * FROM session_agents
      WHERE session_id = ? AND status != 'offline'
    `).all(sessionId);

    const errors = [];

    // Stop agents in reverse order (non-root first)
    const sortedAgents = agents.sort((a, b) => a.is_root ? 1 : -1);

    for (const agent of sortedAgents) {
      try {
        await this.stopAgent(sessionId, agent.agent_id, options);
      } catch (error) {
        errors.push({ agent: agent.agent_id, error: error.message });
      }
    }

    // Update session status
    db.prepare(`
      UPDATE team_sessions
      SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sessionId);

    // Clean up workspace if requested
    if (options.cleanupWorkspace) {
      await this.cleanupWorkspace(sessionId);
    }

    this.emit('team:stopped', { sessionId });

    if (errors.length > 0 && !options.force) {
      throw new Error(`Failed to stop some agents: ${JSON.stringify(errors)}`);
    }

    return { sessionId, status: 'stopped', errors };
  }

  async stopAgent(sessionId, agentId, options) {
    const fullAgentId = `${agentId}-${sessionId}`;

    // Stop via registry
    await this.agentRegistry.stop(fullAgentId, options);

    // Update session agent record
    db.prepare(`
      UPDATE session_agents
      SET status = 'offline', stopped_at = CURRENT_TIMESTAMP
      WHERE session_id = ? AND agent_id = ?
    `).run(sessionId, agentId);

    this.emit('agent:stopped', { sessionId, agentId });
  }

  async executeWorkflow(sessionId, workflow) {
    // This would be a complex workflow engine
    // For now, just track phases

    const phases = workflow.phases || [];

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];

      // Update current phase
      db.prepare(`
        UPDATE team_sessions
        SET current_phase = ?, phase_started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(phase.name, sessionId);

      // Update workflow phase status
      db.prepare(`
        UPDATE workflow_phases
        SET status = 'running', started_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND phase_order = ?
      `).run(sessionId, i);

      // Execute phase (this would coordinate agents)
      await this.executePhase(sessionId, phase);

      // Mark phase complete
      db.prepare(`
        UPDATE workflow_phases
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND phase_order = ?
      `).run(sessionId, i);
    }
  }

  async executePhase(sessionId, phase) {
    // Simplified phase execution
    // Real implementation would coordinate agent messages

    this.emit('phase:started', { sessionId, phase: phase.name });

    // Wait for phase duration if specified
    if (phase.duration) {
      const durationMs = this.parseDuration(phase.duration);
      await new Promise(resolve => setTimeout(resolve, durationMs));
    }

    this.emit('phase:completed', { sessionId, phase: phase.name });
  }

  parseDuration(duration) {
    // Parse "10m", "1h", etc to milliseconds
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) return 60000; // Default 1 minute

    const [, value, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000 };
    return parseInt(value) * multipliers[unit];
  }

  async getTeamStatus(teamId) {
    const team = Team.findById(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const session = db.prepare(`
      SELECT * FROM team_sessions
      WHERE team_id = ?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(teamId);

    if (!session) {
      return { teamId, status: 'no_sessions' };
    }

    const agents = await this.getSessionAgents(session.id);
    const metrics = JSON.parse(session.metrics || '{}');

    return {
      teamId,
      sessionId: session.id,
      status: session.status,
      currentPhase: session.current_phase,
      startedAt: session.started_at,
      stoppedAt: session.stopped_at,
      agents,
      metrics
    };
  }

  async getSessionAgents(sessionId) {
    const agents = db.prepare(`
      SELECT * FROM session_agents
      WHERE session_id = ?
    `).all(sessionId);

    return agents.map(a => ({
      agentId: a.agent_id,
      isRoot: a.is_root,
      status: a.status,
      pid: a.pid,
      workingDirectory: a.working_directory,
      startedAt: a.started_at,
      stoppedAt: a.stopped_at
    }));
  }

  async cleanupWorkspace(sessionId) {
    const baseDir = process.env.KOKINO_WORKSPACE || './workspace';
    const sessionDir = `${baseDir}/sessions/${sessionId}`;

    const fs = require('fs').promises;
    await fs.rm(sessionDir, { recursive: true, force: true });
  }

  async cleanupFailedStart(sessionId) {
    // Stop any started agents
    try {
      await this.stopSession(sessionId, { force: true });
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    // Mark session as error
    db.prepare(`
      UPDATE team_sessions
      SET status = 'error', stopped_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sessionId);
  }

  async copyDirectory(src, dest) {
    const fs = require('fs').promises;
    const path = require('path');

    await fs.mkdir(dest, { recursive: true });

    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Skip .git and node_modules
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
```

### Day 7-8: API Routes

`broker/src/api/routes/teams.js`:
```javascript
import { Team } from '../../models/Team.js';
import { TeamLifecycleManager } from '../../services/TeamLifecycleManager.js';

export function createTeamRoutes(agentRegistry, bootstrapManager) {
  const lifecycleManager = new TeamLifecycleManager(agentRegistry, bootstrapManager);

  return {
    // GET /api/teams
    async listTeams(req, res) {
      try {
        const { projectId, search, tags } = req.query;

        let query = 'SELECT * FROM teams WHERE 1=1';
        const params = [];

        if (projectId) {
          query += ' AND project_id = ?';
          params.push(projectId);
        }

        if (search) {
          query += ' AND (name LIKE ? OR description LIKE ?)';
          params.push(`%${search}%`, `%${search}%`);
        }

        const rows = db.prepare(query).all(...params);
        const teams = rows.map(row => ({
          ...row,
          configuration: JSON.parse(row.configuration),
          metadata: JSON.parse(row.metadata || '{}')
        }));

        res.json({ teams });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    // POST /api/teams
    async createTeam(req, res) {
      try {
        const team = new Team(req.body);
        await team.save();
        res.status(201).json(team);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // GET /api/teams/:teamId
    async getTeam(req, res) {
      try {
        const team = Team.findById(req.params.teamId);
        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }
        res.json(team);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    // PUT /api/teams/:teamId
    async updateTeam(req, res) {
      try {
        const team = Team.findById(req.params.teamId);
        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }

        Object.assign(team, req.body);
        await team.save();
        res.json(team);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // DELETE /api/teams/:teamId
    async deleteTeam(req, res) {
      try {
        const team = Team.findById(req.params.teamId);
        if (!team) {
          return res.status(404).json({ error: 'Team not found' });
        }

        await team.delete();
        res.status(204).send();
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // POST /api/teams/:teamId/start
    async startTeam(req, res) {
      try {
        const result = await lifecycleManager.startTeam(
          req.params.teamId,
          req.body
        );
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // POST /api/teams/:teamId/stop
    async stopTeam(req, res) {
      try {
        const result = await lifecycleManager.stopTeam(
          req.params.teamId,
          req.body
        );
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // GET /api/teams/:teamId/status
    async getTeamStatus(req, res) {
      try {
        const status = await lifecycleManager.getTeamStatus(req.params.teamId);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
}
```

## Critical Problems with the Spec

### 1. **Workflow Engine Complexity**

The spec promises:
- Parallel phase execution
- Dependency resolution
- Escalation conditions
- Timeout handling

**Reality:** This needs a full workflow engine like Temporal or Bull Queue. Building from scratch is 2-4 weeks alone.

### 2. **Workspace Isolation**

The spec describes 3 modes:
- Shared (risky for conflicts)
- Isolated (needs git branching)
- Hybrid (complex merging)

**Reality:** Just implementing shared mode properly is complex. Isolated mode needs git integration, conflict resolution, merge strategies.

### 3. **Root Agent Coordination**

The spec says root agents coordinate work, but:
- How do they delegate?
- What's the protocol?
- How do they track progress?
- What about failures?

**Reality:** This needs a complete inter-agent communication protocol.

### 4. **Environment & Secrets**

The spec mentions environment variables and secrets but:
- No secure storage mechanism
- No injection strategy
- No isolation between teams

**Reality:** Needs integration with secret management (Vault, etc).

## Realistic Timeline

### Current Estimate: 1 Week
### Realistic Estimate: 3-4 Weeks

**Week 1: Foundation**
- Database schema and migrations
- Team model with validation
- Basic CRUD operations
- Simple workspace creation

**Week 2: Lifecycle Management**
- Start/stop teams
- Agent coordination
- Session tracking
- Error handling

**Week 3: Workflow Engine**
- Phase execution
- Dependency resolution
- Parallel execution
- Timeout handling

**Week 4: Advanced Features**
- Workspace isolation modes
- Root agent coordination
- Metrics and monitoring
- Team templates

## Simplified MVP Approach

### What We Can Build in 1 Week

1. **Basic Team CRUD**
   - Create/read/update/delete teams
   - Store configuration as JSON
   - No complex validation

2. **Simple Start/Stop**
   - Start all agents at once
   - Stop all agents at once
   - No phases or workflow

3. **Shared Workspace Only**
   - All agents in same directory
   - No isolation or copying
   - Risk of conflicts

4. **No Root Agent Logic**
   - All agents equal
   - No coordination
   - Manual orchestration

5. **No Workflow Engine**
   - No phases
   - No dependencies
   - No automation

## The Hard Questions

1. **Do we really need teams?** Or can agents self-organize?
2. **Is workflow automation necessary?** Or is manual coordination OK?
3. **Do we need workspace isolation?** Or accept conflict risks?
4. **Should we use existing workflow engines?** (Temporal, Airflow, etc)
5. **Can we defer root agent coordination?** Focus on peer-to-peer?

## Recommendation

**Split Phase 5 into sub-phases:**

### Phase 5a: Basic Teams (1 week)
- Team CRUD operations
- Simple start/stop all agents
- Shared workspace only
- Manual coordination

### Phase 5b: Workflow Engine (2 weeks)
- Phase execution
- Dependencies
- Parallel execution
- Basic orchestration

### Phase 5c: Advanced Features (2 weeks)
- Workspace isolation
- Root agent protocol
- Team templates
- Metrics and monitoring

This allows incremental delivery while acknowledging the real complexity.

---

*The Team Lifecycle specification is ambitious but lacks implementation reality. The above plan provides a path forward, but expect 3-4 weeks for full implementation, not 1 week.*