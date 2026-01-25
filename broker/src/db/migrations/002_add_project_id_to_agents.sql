-- Migration: Add project_id to agents table
-- Created: 2026-01-25
-- Purpose: Link agents to projects

-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- So we need to check if the column exists first
-- The migrator will handle this gracefully

-- Add project_id column to agents table
ALTER TABLE agents ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;

-- Update existing agents to belong to default project
UPDATE agents
SET project_id = 'default'
WHERE project_id IS NULL;

-- Create index for efficient project lookups
CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);