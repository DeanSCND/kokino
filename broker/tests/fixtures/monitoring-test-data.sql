-- Test data for monitoring tables
-- Run this manually for development/testing: sqlite3 data/kokino.db < tests/fixtures/monitoring-test-data.sql

-- Sample metrics for a few agents over time
INSERT INTO agent_metrics (agent_id, timestamp, cpu_percent, memory_mb, status, error_count, message_count)
VALUES
  -- Agent 1: Normal operation
  ('test-agent-1', datetime('now', '-1 hour'), 15.3, 256, 'online', 0, 5),
  ('test-agent-1', datetime('now', '-45 minutes'), 18.7, 264, 'online', 0, 8),
  ('test-agent-1', datetime('now', '-30 minutes'), 22.1, 278, 'online', 0, 12),
  ('test-agent-1', datetime('now', '-15 minutes'), 19.5, 270, 'online', 0, 15),
  ('test-agent-1', datetime('now', '-5 minutes'), 16.2, 260, 'online', 0, 18),

  -- Agent 2: High CPU usage
  ('test-agent-2', datetime('now', '-1 hour'), 45.2, 512, 'online', 0, 3),
  ('test-agent-2', datetime('now', '-45 minutes'), 68.5, 548, 'online', 1, 7),
  ('test-agent-2', datetime('now', '-30 minutes'), 85.3, 580, 'online', 1, 10),
  ('test-agent-2', datetime('now', '-15 minutes'), 92.7, 612, 'online', 2, 14),
  ('test-agent-2', datetime('now', '-5 minutes'), 88.1, 598, 'online', 2, 17),

  -- Agent 3: Memory issues
  ('test-agent-3', datetime('now', '-1 hour'), 12.5, 768, 'online', 0, 2),
  ('test-agent-3', datetime('now', '-45 minutes'), 14.2, 892, 'online', 0, 4),
  ('test-agent-3', datetime('now', '-30 minutes'), 13.8, 1024, 'online', 1, 6),
  ('test-agent-3', datetime('now', '-15 minutes'), 15.1, 1156, 'online', 1, 8),
  ('test-agent-3', datetime('now', '-5 minutes'), 14.9, 1200, 'online', 2, 10);

-- Sample events
INSERT INTO agent_events (agent_id, event_type, message, metadata, timestamp)
VALUES
  ('test-agent-1', 'started', 'Agent started successfully', '{"pid": 12345, "mode": "headless"}', datetime('now', '-2 hours')),
  ('test-agent-1', 'info', 'Bootstrap completed', '{"files_loaded": 3, "duration_ms": 1250}', datetime('now', '-2 hours', '+5 seconds')),
  ('test-agent-1', 'info', 'Execution completed', '{"prompt_tokens": 1200, "completion_tokens": 450}', datetime('now', '-1 hour')),

  ('test-agent-2', 'started', 'Agent started successfully', '{"pid": 12346, "mode": "headless"}', datetime('now', '-90 minutes')),
  ('test-agent-2', 'warning', 'High CPU usage detected', '{"cpu_percent": 85.3}', datetime('now', '-30 minutes')),
  ('test-agent-2', 'error', 'Task execution timeout', '{"timeout_ms": 120000}', datetime('now', '-20 minutes')),

  ('test-agent-3', 'started', 'Agent started successfully', '{"pid": 12347, "mode": "headless"}', datetime('now', '-90 minutes')),
  ('test-agent-3', 'warning', 'High memory usage detected', '{"memory_mb": 1024}', datetime('now', '-30 minutes')),
  ('test-agent-3', 'warning', 'Memory threshold exceeded', '{"memory_mb": 1200, "threshold_mb": 1000}', datetime('now', '-5 minutes'));

-- Sample errors
INSERT INTO error_logs (agent_id, error_type, message, stack_trace, timestamp, resolved)
VALUES
  ('test-agent-2', 'TimeoutError', 'Task execution exceeded 2 minute timeout', 'TimeoutError: Task execution exceeded 2 minute timeout\n    at AgentRunner.execute (agent-runner.js:234)\n    at async executeTask (routes.js:156)', datetime('now', '-20 minutes'), FALSE),

  ('test-agent-3', 'MemoryError', 'Agent exceeded memory limit', 'MemoryError: Agent exceeded memory limit of 1000MB\n    at MonitoringService.checkAlerts (monitoring.js:345)\n    at Timeout._onTimeout (monitoring.js:98)', datetime('now', '-15 minutes'), FALSE),

  ('test-agent-1', 'NetworkError', 'Failed to connect to external API', 'NetworkError: ECONNREFUSED\n    at TCPConnectWrap.afterConnect (net.js:1148)\n    at executeTask (agent.js:89)', datetime('now', '-3 hours'), TRUE);

-- Add resolved timestamp for resolved error
UPDATE error_logs
SET resolved_at = datetime('now', '-2 hours', '+30 minutes'),
    resolved_by = 'admin'
WHERE resolved = TRUE;
