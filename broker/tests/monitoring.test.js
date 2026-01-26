/**
 * MonitoringService Tests
 * Phase 6: Practical Monitoring System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MonitoringService } from '../src/services/MonitoringService.js';
import db from '../src/db/schema.js';

describe('MonitoringService', () => {
  let monitoringService;
  let mockRegistry;

  beforeEach(() => {
    // Create mock agent registry
    mockRegistry = {
      list: vi.fn(() => [
        {
          agentId: 'test-agent-1',
          status: 'online',
          metadata: { pid: 12345 }
        },
        {
          agentId: 'test-agent-2',
          status: 'online',
          metadata: {}
        }
      ]),
      get: vi.fn((agentId) => ({
        agentId,
        status: 'online',
        metadata: { pid: 12345 }
      }))
    };

    monitoringService = new MonitoringService(mockRegistry);

    // Delete test agents first (CASCADE will delete related data)
    db.prepare('DELETE FROM agents WHERE agent_id LIKE ?').run('test-agent-%');

    // Insert test agents to satisfy foreign key constraints
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO agents (agent_id, type, status, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('test-agent-1', 'test', 'online', now, now, now);
    db.prepare(`
      INSERT OR IGNORE INTO agents (agent_id, type, status, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('test-agent-2', 'test', 'online', now, now, now);
  });

  afterEach(() => {
    monitoringService.stop();
  });

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      expect(monitoringService.isRunning).toBe(false);
      expect(monitoringService.COLLECTION_INTERVAL_MS).toBe(30000);
      expect(monitoringService.DATA_RETENTION_DAYS).toBe(7);
    });

    it('should have alert thresholds configured', () => {
      expect(monitoringService.THRESHOLDS.CPU_WARNING).toBe(80);
      expect(monitoringService.THRESHOLDS.MEMORY_WARNING_MB).toBe(1024);
    });
  });

  describe('Service Lifecycle', () => {
    it('should start and stop', () => {
      monitoringService.start();
      expect(monitoringService.isRunning).toBe(true);

      monitoringService.stop();
      expect(monitoringService.isRunning).toBe(false);
    });

    it('should not start if already running', () => {
      monitoringService.start();
      const consoleSpy = vi.spyOn(console, 'log');

      monitoringService.start();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Already running'));

      consoleSpy.mockRestore();
    });
  });

  describe('Metrics Collection', () => {
    it('should save metrics to database', () => {
      const metrics = {
        cpuPercent: 25.5,
        memoryMb: 512,
        status: 'online',
        errorCount: 0,
        messageCount: 5
      };

      monitoringService.saveMetrics('test-agent-1', metrics);

      const saved = db.prepare('SELECT * FROM agent_metrics WHERE agent_id = ?').get('test-agent-1');
      expect(saved).toBeDefined();
      expect(saved.cpu_percent).toBe(25.5);
      expect(saved.memory_mb).toBe(512);
      expect(saved.status).toBe('online');
    });

    it('should emit metrics event', () => {
      return new Promise((resolve) => {
        const metrics = {
          cpuPercent: 25.5,
          memoryMb: 512,
          status: 'online',
          errorCount: 0,
          messageCount: 5
        };

        monitoringService.on('metrics', (data) => {
          expect(data.agentId).toBe('test-agent-1');
          expect(data.cpuPercent).toBe(25.5);
          resolve();
        });

        monitoringService.saveMetrics('test-agent-1', metrics);
      });
    });

    it('should handle missing process metrics gracefully', async () => {
      mockRegistry.get.mockReturnValue({
        agentId: 'test-agent-no-pid',
        status: 'online',
        metadata: {}
      });

      const metrics = await monitoringService.getAgentMetrics('test-agent-no-pid');

      expect(metrics.cpuPercent).toBe(0);
      expect(metrics.memoryMb).toBe(0);
      expect(metrics.status).toBe('online');
    });
  });

  describe('Event Logging', () => {
    it('should log events to database', () => {
      monitoringService.logEvent('test-agent-1', 'started', 'Agent started successfully', {
        pid: 12345
      });

      const event = db.prepare('SELECT * FROM agent_events WHERE agent_id = ?').get('test-agent-1');
      expect(event).toBeDefined();
      expect(event.event_type).toBe('started');
      expect(event.message).toBe('Agent started successfully');
      expect(JSON.parse(event.metadata).pid).toBe(12345);
    });

    it('should emit event', () => {
      return new Promise((resolve) => {
        monitoringService.on('event', (data) => {
          expect(data.agentId).toBe('test-agent-1');
          expect(data.eventType).toBe('info');
          expect(data.message).toBe('Test event');
          resolve();
        });

        monitoringService.logEvent('test-agent-1', 'info', 'Test event');
      });
    });
  });

  describe('Error Tracking', () => {
    beforeEach(() => {
      // Add error event handler to prevent unhandled error exceptions
      monitoringService.on('error', () => {});
    });

    it('should log errors to database', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10';

      monitoringService.logError('test-agent-1', error);

      const logged = db.prepare('SELECT * FROM error_logs WHERE agent_id = ?').get('test-agent-1');
      expect(logged).toBeDefined();
      expect(logged.error_type).toBe('Error');
      expect(logged.message).toBe('Test error');
      expect(logged.resolved).toBe(0);
    });

    it('should handle plain object errors', () => {
      const error = {
        type: 'CustomError',
        message: 'Something went wrong'
      };

      monitoringService.logError('test-agent-1', error);

      const logged = db.prepare('SELECT * FROM error_logs WHERE agent_id = ?').get('test-agent-1');
      expect(logged).toBeDefined();
      expect(logged.error_type).toBe('CustomError');
      expect(logged.message).toBe('Something went wrong');
    });

    it('should resolve errors', () => {
      const error = new Error('Test error');
      monitoringService.logError('test-agent-1', error);

      const errorLog = db.prepare('SELECT * FROM error_logs WHERE agent_id = ?').get('test-agent-1');
      expect(errorLog.resolved).toBe(0);

      monitoringService.resolveError(errorLog.id, 'admin');

      const resolved = db.prepare('SELECT * FROM error_logs WHERE id = ?').get(errorLog.id);
      expect(resolved.resolved).toBe(1);
      expect(resolved.resolved_by).toBe('admin');
      expect(resolved.resolved_at).toBeDefined();
    });

    it('should emit error event', () => {
      return new Promise((resolve) => {
        const error = new Error('Test error');

        // Remove the default handler and add specific one for this test
        monitoringService.removeAllListeners('error');
        monitoringService.on('error', (data) => {
          expect(data.agentId).toBe('test-agent-1');
          expect(data.error.message).toBe('Test error');
          resolve();
        });

        monitoringService.logError('test-agent-1', error);
      });
    });
  });

  describe('Alerting', () => {
    beforeEach(() => {
      // Insert test metrics with high values
      db.prepare(`
        INSERT INTO agent_metrics (agent_id, cpu_percent, memory_mb, status, error_count, message_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-agent-1', 90, 1500, 'online', 15, 10);
    });

    it('should emit CPU alert for high usage', () => {
      return new Promise((resolve) => {
        monitoringService.on('alert', (alert) => {
          if (alert.type === 'high_cpu') {
            expect(alert.severity).toBe('warning'); // 90% is >= 80 but < 95
            expect(alert.agentId).toBe('test-agent-1');
            expect(alert.message).toContain('90');
            resolve();
          }
        });

        monitoringService.checkAlerts();
      });
    });

    it('should emit memory alert for high usage', () => {
      return new Promise((resolve) => {
        monitoringService.on('alert', (alert) => {
          if (alert.type === 'high_memory') {
            expect(alert.severity).toBe('warning');
            expect(alert.agentId).toBe('test-agent-1');
            resolve();
          }
        });

        monitoringService.checkAlerts();
      });
    });

    it('should emit error count alert', () => {
      return new Promise((resolve) => {
        monitoringService.on('alert', (alert) => {
          if (alert.type === 'high_errors') {
            expect(alert.severity).toBe('critical');
            expect(alert.agentId).toBe('test-agent-1');
            resolve();
          }
        });

        monitoringService.checkAlerts();
      });
    });
  });

  describe('Dashboard Data', () => {
    beforeEach(() => {
      // Add error event handler to prevent unhandled error exceptions
      monitoringService.on('error', () => {});

      // Insert test data
      db.prepare(`
        INSERT INTO agent_metrics (agent_id, cpu_percent, memory_mb, status, error_count, message_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-agent-1', 25, 512, 'online', 0, 5);

      monitoringService.logEvent('test-agent-1', 'started', 'Agent started');
      monitoringService.logError('test-agent-1', new Error('Test error'));
    });

    it('should get dashboard data', async () => {
      const data = await monitoringService.getDashboardData();

      expect(data.agents).toHaveLength(2);
      expect(data.agents[0].agentId).toBe('test-agent-1');
      expect(data.agents[0].metrics).toBeDefined();
      expect(data.recentEvents).toBeDefined();
      expect(data.activeErrors).toBeDefined();
      expect(data.systemMetrics).toBeDefined();
    });

    it('should get agent-specific dashboard', async () => {
      const data = await monitoringService.getAgentDashboard('test-agent-1');

      expect(data.agent).toBeDefined();
      expect(data.agent.agentId).toBe('test-agent-1');
      expect(data.metrics).toBeDefined();
      expect(data.events).toBeDefined();
      expect(data.errors).toBeDefined();
      expect(data.summary).toBeDefined();
      expect(data.summary.dataPoints).toBeGreaterThan(0);
    });

    it('should throw error for non-existent agent', async () => {
      mockRegistry.get.mockReturnValue(null);

      await expect(monitoringService.getAgentDashboard('non-existent'))
        .rejects.toThrow('Agent non-existent not found');
    });
  });

  describe('Data Cleanup', () => {
    beforeEach(() => {
      // Insert old data
      db.prepare(`
        INSERT INTO agent_metrics (agent_id, cpu_percent, memory_mb, status, timestamp)
        VALUES (?, ?, ?, ?, datetime('now', '-10 days'))
      `).run('test-agent-1', 25, 512, 'online');

      db.prepare(`
        INSERT INTO agent_events (agent_id, event_type, message, timestamp)
        VALUES (?, ?, ?, datetime('now', '-10 days'))
      `).run('test-agent-1', 'info', 'Old event');

      // Insert resolved error (old)
      db.prepare(`
        INSERT INTO error_logs (agent_id, error_type, message, resolved, timestamp)
        VALUES (?, ?, ?, ?, datetime('now', '-10 days'))
      `).run('test-agent-1', 'Error', 'Old resolved error', 1);

      // Insert unresolved error (old) - should NOT be deleted
      db.prepare(`
        INSERT INTO error_logs (agent_id, error_type, message, resolved, timestamp)
        VALUES (?, ?, ?, ?, datetime('now', '-10 days'))
      `).run('test-agent-1', 'Error', 'Old unresolved error', 0);
    });

    it('should clean up old data', async () => {
      const result = await monitoringService.cleanup(7);

      expect(result.metricsDeleted).toBe(1);
      expect(result.eventsDeleted).toBe(1);
      expect(result.errorsDeleted).toBe(1); // Only resolved error

      // Verify unresolved error still exists
      const unresolvedError = db.prepare(
        'SELECT * FROM error_logs WHERE resolved = 0 AND agent_id = ?'
      ).get('test-agent-1');
      expect(unresolvedError).toBeDefined();
    });
  });
});
