-- Phase 3: Bootstrap System
-- Add bootstrap fields to agent_configs (templates) and agents (runtime)
-- Create history and metrics tables for tracking bootstrap operations

-- Add bootstrap tracking to agent_configs table (template level)
ALTER TABLE agent_configs ADD COLUMN last_bootstrap TEXT;
ALTER TABLE agent_configs ADD COLUMN bootstrap_count INTEGER DEFAULT 0;

-- Add bootstrap context storage to agents table (runtime instances)
ALTER TABLE agents ADD COLUMN bootstrap_context TEXT;
ALTER TABLE agents ADD COLUMN bootstrap_status TEXT DEFAULT 'pending';

-- Create bootstrap history table
CREATE TABLE bootstrap_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(agent_id),
  mode TEXT NOT NULL CHECK(mode IN ('none', 'auto', 'manual', 'custom')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  success BOOLEAN,
  files_loaded JSON,
  context_size INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TEXT NOT NULL
);

-- Create compaction metrics table
CREATE TABLE compaction_metrics (
  agent_id TEXT REFERENCES agents(agent_id),
  conversation_turns INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  confusion_count INTEGER DEFAULT 0,
  avg_response_time REAL,
  measured_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, measured_at)
);

-- Create indexes for performance
CREATE INDEX idx_bootstrap_history_agent ON bootstrap_history(agent_id, started_at);
CREATE INDEX idx_compaction_metrics_agent ON compaction_metrics(agent_id, measured_at);
