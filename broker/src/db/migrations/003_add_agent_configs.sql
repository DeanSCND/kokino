-- Migration: Add agent_configs table for configurable agents
-- Created: 2026-01-25
-- Purpose: Phase 2 - Replace hardcoded agents with configurable templates

-- Create agent_configs table to store agent templates
CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  cli_type TEXT NOT NULL DEFAULT 'claude-code',
  system_prompt TEXT,
  working_directory TEXT,
  bootstrap_mode TEXT DEFAULT 'auto' CHECK(bootstrap_mode IN ('none', 'auto', 'manual', 'custom')),
  bootstrap_script TEXT,
  capabilities JSON,
  metadata JSON,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_agent_configs_project ON agent_configs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_role ON agent_configs(role);
CREATE INDEX IF NOT EXISTS idx_agent_configs_cli_type ON agent_configs(cli_type);
CREATE INDEX IF NOT EXISTS idx_agent_configs_created ON agent_configs(created_at);

-- Migrate hardcoded templates to database as default configs
-- These are the templates from prebuiltTemplates.js
INSERT OR IGNORE INTO agent_configs (id, project_id, name, role, cli_type, system_prompt, capabilities, metadata)
VALUES
  -- Feature Development Team agents
  ('pm-default', 'default', 'Product Manager', 'Product Manager', 'claude-code',
   'You are a Product Manager focused on requirements gathering, user stories, and acceptance criteria.',
   '["requirements", "planning", "communication"]',
   '{"responsibilities": ["Requirements", "User Stories", "Acceptance Criteria"]}'),

  ('designer-default', 'default', 'Designer', 'Designer', 'claude-code',
   'You are a UI/UX Designer focused on creating intuitive user interfaces and maintaining design systems.',
   '["design", "wireframes", "ui-ux"]',
   '{"responsibilities": ["UI/UX", "Wireframes", "Design System"]}'),

  ('frontend-default', 'default', 'Frontend Engineer', 'Frontend Engineer', 'claude-code',
   'You are a Frontend Engineer specializing in React and modern web development.',
   '["code", "test", "review"]',
   '{"responsibilities": ["React", "Components", "State Management"]}'),

  ('backend-default', 'default', 'Backend Engineer', 'Backend Engineer', 'claude-code',
   'You are a Backend Engineer focused on API development and business logic implementation.',
   '["code", "test", "api"]',
   '{"responsibilities": ["API", "Business Logic", "Services"]}'),

  ('database-default', 'default', 'Database Engineer', 'Database Engineer', 'claude-code',
   'You are a Database Engineer specializing in schema design and query optimization.',
   '["database", "migrations", "optimization"]',
   '{"responsibilities": ["Schema", "Migrations", "Queries"]}'),

  ('qa-default', 'default', 'QA Engineer', 'QA Engineer', 'claude-code',
   'You are a QA Engineer focused on test planning, automation, and quality assurance.',
   '["test", "automation", "quality"]',
   '{"responsibilities": ["Test Plans", "Automation", "Bug Reports"]}'),

  ('reviewer-default', 'default', 'Code Reviewer', 'Code Reviewer', 'claude-code',
   'You are a Code Reviewer ensuring code quality, best practices, and security.',
   '["review", "security", "quality"]',
   '{"responsibilities": ["Code Quality", "Best Practices", "Security"]}'),

  -- Hotfix Team agents
  ('incident-default', 'default', 'Incident Commander', 'Incident Commander', 'claude-code',
   'You are an Incident Commander coordinating emergency response and decision making.',
   '["triage", "communication", "coordination"]',
   '{"responsibilities": ["Triage", "Communication", "Decision Making"]}'),

  ('debugger-default', 'default', 'Debugger', 'Debugger', 'claude-code',
   'You are a Debugger specializing in root cause analysis and issue reproduction.',
   '["debugging", "analysis", "investigation"]',
   '{"responsibilities": ["Root Cause Analysis", "Log Analysis", "Reproduction"]}'),

  ('fixer-default', 'default', 'Fixer', 'Fixer', 'claude-code',
   'You are a Fixer focused on rapid patch development and deployment.',
   '["code", "hotfix", "deployment"]',
   '{"responsibilities": ["Patch Development", "Code Fix", "Deployment"]}'),

  ('tester-default', 'default', 'Tester', 'Tester', 'claude-code',
   'You are a Tester focused on verification and regression testing.',
   '["test", "verification", "regression"]',
   '{"responsibilities": ["Verification", "Regression Testing", "Validation"]}');

-- Add config_id column to agents table to link runtime agents to their configs
-- This allows tracking which configuration an agent was spawned from
-- SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so migrator handles errors
ALTER TABLE agents ADD COLUMN config_id TEXT REFERENCES agent_configs(id) ON DELETE SET NULL;

-- Create index for agent config lookups
CREATE INDEX IF NOT EXISTS idx_agents_config_id ON agents(config_id);