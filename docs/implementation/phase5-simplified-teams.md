# Phase 5: Simplified Team Management

## Realistic Scope (1 Week Implementation)

### What We're Building (MVP)
- Basic team CRUD operations
- Start/stop multiple agents with one command
- Team configuration storage (JSON)
- Simple team status tracking

### What We're NOT Building (Defer)
- ❌ Workflow orchestration
- ❌ Phases and dependencies
- ❌ Workspace isolation
- ❌ Root agent coordination protocol
- ❌ Team templates (initially)

## Database Schema (Simple)

```sql
-- Migration 006_add_simple_teams.sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  project_id TEXT,
  agents JSON NOT NULL,  -- Simple array of agent configs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE team_runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  status TEXT DEFAULT 'created',  -- created, running, stopped, error
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  agent_pids JSON,  -- Map of agentId to process ID
  error_message TEXT,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE INDEX idx_teams_project ON teams(project_id);
CREATE INDEX idx_team_runs_team ON team_runs(team_id);
CREATE INDEX idx_team_runs_status ON team_runs(status);
```

## Simple Team Model

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
    this.agents = data.agents || [];  // Array of agent config IDs
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  validate() {
    const errors = [];

    if (!this.name) {
      errors.push('Team name is required');
    }

    if (!this.agents || this.agents.length === 0) {
      errors.push('Team must have at least one agent');
    }

    // Check that all agent configs exist
    for (const agentConfigId of this.agents) {
      const exists = db.prepare(
        'SELECT id FROM agent_configs WHERE id = ?'
      ).get(agentConfigId);

      if (!exists) {
        errors.push(`Agent config ${agentConfigId} not found`);
      }
    }

    return errors;
  }

  save() {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }

    const existing = db.prepare('SELECT id FROM teams WHERE id = ?').get(this.id);

    if (existing) {
      db.prepare(`
        UPDATE teams
        SET name = ?, description = ?, project_id = ?, agents = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        this.name,
        this.description,
        this.projectId,
        JSON.stringify(this.agents),
        this.id
      );
    } else {
      db.prepare(`
        INSERT INTO teams (id, name, description, project_id, agents)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        this.id,
        this.name,
        this.description,
        this.projectId,
        JSON.stringify(this.agents)
      );
    }

    return this;
  }

  static findById(id) {
    const row = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    if (!row) return null;

    return new Team({
      ...row,
      agents: JSON.parse(row.agents || '[]')
    });
  }

  static list(projectId = null) {
    const query = projectId
      ? 'SELECT * FROM teams WHERE project_id = ? ORDER BY name'
      : 'SELECT * FROM teams ORDER BY name';

    const rows = projectId
      ? db.prepare(query).all(projectId)
      : db.prepare(query).all();

    return rows.map(row => new Team({
      ...row,
      agents: JSON.parse(row.agents || '[]')
    }));
  }

  delete() {
    // Check for active runs
    const activeRun = db.prepare(
      'SELECT id FROM team_runs WHERE team_id = ? AND status = ?'
    ).get(this.id, 'running');

    if (activeRun) {
      throw new Error('Cannot delete team with active run');
    }

    db.prepare('DELETE FROM teams WHERE id = ?').run(this.id);
    return true;
  }
}
```

## Simple Team Runner

`broker/src/services/TeamRunner.js`:
```javascript
import { Team } from '../models/Team.js';
import { AgentConfig } from '../models/AgentConfig.js';
import { spawn } from 'child_process';
import db from '../db/schema.js';

export class TeamRunner {
  constructor(agentRegistry) {
    this.agentRegistry = agentRegistry;
    this.activeRuns = new Map();  // runId -> processes
  }

  async startTeam(teamId) {
    const team = Team.findById(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Check for existing run
    const existingRun = db.prepare(
      'SELECT id FROM team_runs WHERE team_id = ? AND status = ?'
    ).get(teamId, 'running');

    if (existingRun) {
      throw new Error(`Team ${team.name} is already running`);
    }

    const runId = `run-${randomUUID()}`;
    const agentPids = {};
    const processes = [];

    // Create run record
    db.prepare(
      'INSERT INTO team_runs (id, team_id, status, started_at) VALUES (?, ?, ?, ?)'
    ).run(runId, teamId, 'running', new Date().toISOString());

    try {
      // Start each agent
      for (const configId of team.agents) {
        const config = AgentConfig.findById(configId);
        if (!config) {
          console.warn(`Agent config ${configId} not found, skipping`);
          continue;
        }

        // Create unique agent ID for this run
        const agentId = `${config.name}-${runId}`;

        // Register agent
        await this.agentRegistry.register(agentId, {
          type: config.cliType,
          metadata: {
            configId: config.id,
            teamId: teamId,
            runId: runId,
            role: config.role
          }
        });

        // Start agent process (simplified - real impl would use AgentRunner)
        const process = await this.startAgentProcess(agentId, config);

        agentPids[agentId] = process.pid;
        processes.push({ agentId, process });
      }

      // Update run with PIDs
      db.prepare(
        'UPDATE team_runs SET agent_pids = ? WHERE id = ?'
      ).run(JSON.stringify(agentPids), runId);

      // Store active run
      this.activeRuns.set(runId, processes);

      return {
        runId,
        teamId,
        status: 'running',
        agents: Object.keys(agentPids)
      };

    } catch (error) {
      // Cleanup on failure
      await this.stopRun(runId, true);
      throw error;
    }
  }

  async stopTeam(teamId) {
    const run = db.prepare(
      'SELECT id FROM team_runs WHERE team_id = ? AND status = ? ORDER BY started_at DESC LIMIT 1'
    ).get(teamId, 'running');

    if (!run) {
      throw new Error(`No active run for team ${teamId}`);
    }

    return this.stopRun(run.id);
  }

  async stopRun(runId, isError = false) {
    const processes = this.activeRuns.get(runId);

    if (processes) {
      // Stop all processes
      for (const { agentId, process } of processes) {
        try {
          process.kill('SIGTERM');
          await this.agentRegistry.delete(agentId);
        } catch (error) {
          console.error(`Failed to stop agent ${agentId}:`, error);
        }
      }

      this.activeRuns.delete(runId);
    }

    // Update run status
    db.prepare(
      'UPDATE team_runs SET status = ?, stopped_at = ? WHERE id = ?'
    ).run(
      isError ? 'error' : 'stopped',
      new Date().toISOString(),
      runId
    );

    return { runId, status: isError ? 'error' : 'stopped' };
  }

  async getTeamStatus(teamId) {
    const team = Team.findById(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const run = db.prepare(
      'SELECT * FROM team_runs WHERE team_id = ? ORDER BY started_at DESC LIMIT 1'
    ).get(teamId);

    if (!run) {
      return { teamId, status: 'never_run' };
    }

    const agents = run.agent_pids ? JSON.parse(run.agent_pids) : {};

    return {
      teamId,
      runId: run.id,
      status: run.status,
      startedAt: run.started_at,
      stoppedAt: run.stopped_at,
      agents: Object.keys(agents)
    };
  }

  async startAgentProcess(agentId, config) {
    // Simplified - real implementation would use AgentRunner
    const command = 'claude-code'; // or config.cliType
    const args = ['--agent', agentId];

    const process = spawn(command, args, {
      cwd: config.workingDirectory,
      env: {
        ...process.env,
        AGENT_ID: agentId,
        AGENT_ROLE: config.role
      }
    });

    console.log(`Started agent ${agentId} with PID ${process.pid}`);
    return process;
  }
}
```

## Simple API Routes

`broker/src/api/routes/teams.js`:
```javascript
import { Team } from '../../models/Team.js';
import { TeamRunner } from '../../services/TeamRunner.js';

export function createTeamRoutes(agentRegistry) {
  const teamRunner = new TeamRunner(agentRegistry);

  return {
    // GET /api/teams
    async listTeams(req, res) {
      try {
        const teams = Team.list(req.query.projectId);
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
        const result = await teamRunner.startTeam(req.params.teamId);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // POST /api/teams/:teamId/stop
    async stopTeam(req, res) {
      try {
        const result = await teamRunner.stopTeam(req.params.teamId);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    // GET /api/teams/:teamId/status
    async getTeamStatus(req, res) {
      try {
        const status = await teamRunner.getTeamStatus(req.params.teamId);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  };
}
```

## UI Components

### Simple Team Manager

`ui/src/components/TeamManager.jsx`:
```jsx
import React, { useState, useEffect } from 'react';
import { Play, Square, Plus, Trash2 } from 'lucide-react';
import apiClient from '../services/api-client';

export function TeamManager() {
  const [teams, setTeams] = useState([]);
  const [teamStatus, setTeamStatus] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const response = await apiClient.get('/api/teams');
      setTeams(response.data.teams);

      // Load status for each team
      for (const team of response.data.teams) {
        const status = await apiClient.get(`/api/teams/${team.id}/status`);
        setTeamStatus(prev => ({
          ...prev,
          [team.id]: status.data.status
        }));
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
    }
  };

  const startTeam = async (teamId) => {
    setLoading(true);
    try {
      await apiClient.post(`/api/teams/${teamId}/start`);
      await loadTeams();  // Reload to get new status
    } catch (error) {
      alert(`Failed to start team: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const stopTeam = async (teamId) => {
    setLoading(true);
    try {
      await apiClient.post(`/api/teams/${teamId}/stop`);
      await loadTeams();  // Reload to get new status
    } catch (error) {
      alert(`Failed to stop team: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteTeam = async (teamId) => {
    if (!confirm('Delete this team?')) return;

    try {
      await apiClient.delete(`/api/teams/${teamId}`);
      await loadTeams();
    } catch (error) {
      alert(`Failed to delete team: ${error.message}`);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Teams</h2>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Team
        </button>
      </div>

      <div className="space-y-2">
        {teams.map(team => (
          <div key={team.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{team.name}</h3>
              <p className="text-sm text-gray-500">
                {team.agents.length} agents • Status: {teamStatus[team.id] || 'unknown'}
              </p>
            </div>

            <div className="flex gap-2">
              {teamStatus[team.id] === 'running' ? (
                <button
                  onClick={() => stopTeam(team.id)}
                  disabled={loading}
                  className="btn btn-sm btn-danger"
                >
                  <Square size={16} />
                </button>
              ) : (
                <button
                  onClick={() => startTeam(team.id)}
                  disabled={loading}
                  className="btn btn-sm btn-success"
                >
                  <Play size={16} />
                </button>
              )}

              <button
                onClick={() => deleteTeam(team.id)}
                disabled={teamStatus[team.id] === 'running'}
                className="btn btn-sm btn-ghost"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Testing Requirements

### Unit Tests
```javascript
describe('Team', () => {
  it('should create team with agents');
  it('should validate agent configs exist');
  it('should prevent deletion of running team');
});

describe('TeamRunner', () => {
  it('should start all agents in team');
  it('should stop all agents on stop');
  it('should handle agent start failures');
  it('should track run status');
});
```

### Integration Tests
- Create team → Start team → Verify agents running → Stop team
- Start team → Kill agent → Verify error handling
- Multiple teams running simultaneously

## Timeline

### Day 1: Database & Model
- Create migration
- Implement Team model
- Unit tests

### Day 2-3: Team Runner
- Implement TeamRunner service
- Process management
- Error handling

### Day 4: API Routes
- Wire up routes
- Test endpoints
- Error responses

### Day 5: UI Components
- TeamManager component
- Integration with Canvas
- Testing

## Success Criteria

- [ ] Can create/edit/delete teams
- [ ] Can start all agents in a team with one command
- [ ] Can stop all agents in a team
- [ ] Can see team status (running/stopped)
- [ ] Handles errors gracefully
- [ ] No workflow orchestration (manual coordination)

## What This Gives Us

✅ **Multi-agent management** - Start/stop groups
✅ **Team persistence** - Save configurations
✅ **Simple and reliable** - No complex orchestration
✅ **Foundation for future** - Can add workflow later

## What We're Deferring

- Workflow phases and dependencies
- Root agent coordination
- Workspace isolation
- Team templates
- Auto-recovery
- Inter-agent messaging coordination

This simplified approach delivers value quickly while avoiding the complexity trap of workflow orchestration.