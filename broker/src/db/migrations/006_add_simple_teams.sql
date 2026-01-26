-- Phase 5: Team Lifecycle Management
-- Simple team management without workflow orchestration

-- Teams table for storing team configurations
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  project_id TEXT,
  agents JSON NOT NULL,  -- Array of agent config IDs
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Team runs table for tracking team execution
CREATE TABLE IF NOT EXISTS team_runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'running', 'stopped', 'error')),
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  agent_pids JSON,  -- Map of agentId to process ID
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_teams_project ON teams(project_id);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_team_runs_team ON team_runs(team_id);
CREATE INDEX IF NOT EXISTS idx_team_runs_status ON team_runs(status);
CREATE INDEX IF NOT EXISTS idx_team_runs_created ON team_runs(created_at DESC);