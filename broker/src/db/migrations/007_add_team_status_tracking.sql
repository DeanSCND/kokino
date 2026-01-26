-- Migration: 007_add_team_status_tracking.sql
-- Phase 6: Team Monitoring & Visibility
-- Add status tracking and completion detection for team runs

-- Add status and activity tracking to team_runs table
ALTER TABLE team_runs ADD COLUMN last_activity_at TEXT DEFAULT NULL;
ALTER TABLE team_runs ADD COLUMN completed_at TEXT DEFAULT NULL;

-- Update status column to support more states
-- Existing values: 'running', 'stopped'
-- New values: 'starting', 'idle', 'completed'

-- Add index for querying active teams
CREATE INDEX IF NOT EXISTS idx_team_runs_status ON team_runs(status);
CREATE INDEX IF NOT EXISTS idx_team_runs_last_activity ON team_runs(last_activity_at);
