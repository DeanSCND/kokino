-- Migration 008: Add Monitoring Tables
-- Phase 6: Practical Monitoring System
-- Created: 2026-01-26

-- Agent metrics: Time-series performance data
CREATE TABLE IF NOT EXISTS agent_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cpu_percent REAL DEFAULT 0,
  memory_mb INTEGER DEFAULT 0,
  status TEXT,
  error_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Agent events: Lifecycle and operational events
CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- started, stopped, error, warning, info
  message TEXT,
  metadata TEXT,  -- JSON blob for additional context
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Error logs: Detailed error tracking
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  error_type TEXT,
  message TEXT NOT NULL,
  stack_trace TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Indexes for performance optimization

-- Time-based queries for metrics (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_time
  ON agent_metrics(agent_id, timestamp DESC);

-- Quick lookup of latest metrics per agent
CREATE INDEX IF NOT EXISTS idx_agent_metrics_timestamp
  ON agent_metrics(timestamp DESC);

-- Event type filtering and agent lookup
CREATE INDEX IF NOT EXISTS idx_agent_events_agent_type
  ON agent_events(agent_id, event_type);

-- Recent events queries
CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp
  ON agent_events(timestamp DESC);

-- Unresolved errors lookup (for dashboard)
CREATE INDEX IF NOT EXISTS idx_error_logs_agent_resolved
  ON error_logs(agent_id, resolved);

-- Error timestamp queries
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp
  ON error_logs(timestamp DESC);

-- Agent-specific error lookup
CREATE INDEX IF NOT EXISTS idx_error_logs_agent_time
  ON error_logs(agent_id, timestamp DESC);
