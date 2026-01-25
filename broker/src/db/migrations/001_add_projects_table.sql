-- Migration: Add projects table
-- Created: 2024-01-25
-- Purpose: Introduce project concept as container for agents

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add project_id to agents table (nullable for backward compatibility)
-- SQLite doesn't support conditional ALTER TABLE, so we'll just try to add it
-- and handle any errors in the migrator
-- ALTER TABLE agents ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

-- Seed with default project based on current working directory
INSERT OR IGNORE INTO projects (id, name, workspace_path, description)
VALUES (
  'default',
  'Default Project',
  '/Users/deanskelton/Devlopment/agent-collab/kokino',
  'Default project for initial Kokino setup - migrated from hardcoded configuration'
);

-- Update existing agents to belong to default project
-- Commented out as project_id doesn't exist yet
-- UPDATE agents
-- SET project_id = 'default'
-- WHERE project_id IS NULL;

-- Create index for project lookups
-- CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);