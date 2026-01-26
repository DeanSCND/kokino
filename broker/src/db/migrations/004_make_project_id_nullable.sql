-- Migration: Make project_id nullable for global agents
-- Date: 2026-01-25
-- Purpose: Support global agents that are available across all projects

-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table

-- 1. Create a new table with the updated schema
CREATE TABLE agent_configs_new (
  id TEXT PRIMARY KEY,
  project_id TEXT,  -- Now nullable for global agents
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  cli_type TEXT DEFAULT 'claude-code',
  system_prompt TEXT,
  working_directory TEXT DEFAULT '.',
  bootstrap_mode TEXT DEFAULT 'auto' CHECK(bootstrap_mode IN ('none', 'auto', 'manual', 'custom')),
  bootstrap_script TEXT,
  capabilities TEXT DEFAULT '[]',  -- JSON array of capabilities (reserved for future)
  metadata TEXT DEFAULT '{}',       -- JSON object for additional metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key is optional now (can be NULL for global agents)
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 2. Copy existing data to the new table
INSERT INTO agent_configs_new
SELECT * FROM agent_configs;

-- 3. Drop the old table
DROP TABLE agent_configs;

-- 4. Rename the new table to the original name
ALTER TABLE agent_configs_new RENAME TO agent_configs;

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_configs_project ON agent_configs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_name ON agent_configs(name);
CREATE INDEX IF NOT EXISTS idx_agent_configs_role ON agent_configs(role);

-- 6. Add a few example global agents (optional - can be commented out in production)
-- INSERT INTO agent_configs (
--   id, project_id, name, role, cli_type, system_prompt, bootstrap_mode
-- ) VALUES
-- (
--   'global-frontend-01',
--   NULL,  -- Global agent
--   'Standard Frontend Developer',
--   'Frontend Engineer',
--   'claude-code',
--   'You are an expert in React, TypeScript, and modern frontend development. Follow best practices for component design, state management, and testing.',
--   'auto'
-- ),
-- (
--   'global-backend-01',
--   NULL,  -- Global agent
--   'Standard Backend Developer',
--   'Backend Engineer',
--   'claude-code',
--   'You are an expert in Node.js, Express, and REST API development. Focus on security, performance, and maintainability.',
--   'auto'
-- );