/**
 * Monitoring Routes Tests
 * Phase 6: API endpoint tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MonitoringService } from '../src/services/MonitoringService.js';
import { createMonitoringRoutes } from '../src/api/routes/monitoring.js';
import db from '../src/db/schema.js';

function createMockResponse() {
  const headers = {};
  return {
    statusCode: 0,
    headers,
    setHeader: vi.fn((key, value) => {
      headers[key] = value;
    }),
    end: vi.fn()
  };
}

describe('Monitoring Routes', () => {
  let monitoringService;
  let routes;
  let mockRegistry;

  beforeEach(() => {
    // Create mock agent registry
    mockRegistry = {
      list: vi.fn(() => [
        {
          agentId: 'route-test-1',
          status: 'online',
          metadata: { pid: 12345 }
        }
      ]),
      get: vi.fn((agentId) => ({
        agentId,
        status: 'online',
        metadata: { pid: 12345 }
      }))
    };

    monitoringService = new MonitoringService(mockRegistry);

    // Clean up test data
    db.prepare('DELETE FROM agents WHERE agent_id LIKE ?').run('route-test-%');

    // Insert test agent
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO agents (agent_id, type, status, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('route-test-1', 'test', 'online', now, now, now);

    // Insert test data
    monitoringService.saveMetrics('route-test-1', {
      cpuPercent: 25,
      memoryMb: 512,
      status: 'online',
      errorCount: 0,
      messageCount: 5
    });

    monitoringService.logEvent('route-test-1', 'started', 'Test started');
    monitoringService.on('error', () => {}); // Prevent unhandled errors
    monitoringService.logError('route-test-1', new Error('Test error'));

    routes = createMonitoringRoutes(monitoringService);
  });

  afterEach(() => {
    monitoringService.stop();
  });

  describe('GET /monitoring/dashboard', () => {
    it('should return dashboard data', async () => {
      const mockRes = createMockResponse();

      await routes.getDashboard({}, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.agents).toBeDefined();
      expect(response.recentEvents).toBeDefined();
      expect(response.systemMetrics).toBeDefined();
    });
  });

  describe('GET /monitoring/agents/:agentId', () => {
    it('should return agent-specific dashboard', async () => {
      const mockReq = {
        params: { agentId: 'route-test-1' },
        query: { hours: '1' }
      };
      const mockRes = createMockResponse();

      await routes.getAgentDashboard(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.agent).toBeDefined();
      expect(response.agent.agentId).toBe('route-test-1');
      expect(response.metrics).toBeDefined();
      expect(response.events).toBeDefined();
      expect(response.errors).toBeDefined();
    });

    it('should return 404 for non-existent agent', async () => {
      mockRegistry.get.mockReturnValue(null);

      const mockReq = {
        params: { agentId: 'non-existent' },
        query: { hours: '1' }
      };
      const mockRes = createMockResponse();

      await routes.getAgentDashboard(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(404);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error).toContain('not found');
    });
  });

  describe('GET /monitoring/metrics', () => {
    it('should return metrics list', async () => {
      const mockReq = {
        query: { limit: '100' }
      };
      const mockRes = createMockResponse();

      await routes.getMetrics(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.metrics).toBeDefined();
      expect(response.count).toBeGreaterThan(0);
    });

    it('should filter metrics by agentId', async () => {
      const mockReq = {
        query: { agentId: 'route-test-1', limit: '100' }
      };
      const mockRes = createMockResponse();

      await routes.getMetrics(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.metrics.every(m => m.agent_id === 'route-test-1')).toBe(true);
    });
  });

  describe('GET /monitoring/events', () => {
    it('should return events list', async () => {
      const mockReq = {
        query: { limit: '50' }
      };
      const mockRes = createMockResponse();

      await routes.getEvents(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.events).toBeDefined();
      expect(response.count).toBeGreaterThan(0);
    });
  });

  describe('GET /monitoring/errors', () => {
    it('should return errors list', async () => {
      const mockReq = {
        query: { limit: '50' }
      };
      const mockRes = createMockResponse();

      await routes.getErrors(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.errors).toBeDefined();
      expect(response.count).toBeGreaterThan(0);
    });

    it('should filter by resolved status', async () => {
      const mockReq = {
        query: { resolved: 'false', limit: '50' }
      };
      const mockRes = createMockResponse();

      await routes.getErrors(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.errors.every(e => e.resolved === 0)).toBe(true);
    });
  });

  describe('PATCH /monitoring/errors/:errorId/resolve', () => {
    it('should resolve an error', async () => {
      // Get an error ID first
      const error = db.prepare('SELECT * FROM error_logs WHERE agent_id = ?').get('route-test-1');

      const mockReq = {
        params: { errorId: error.id.toString() },
        body: { resolvedBy: 'admin' }
      };
      const mockRes = createMockResponse();

      await routes.resolveError(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.message).toContain('resolved successfully');

      // Verify in DB
      const resolved = db.prepare('SELECT * FROM error_logs WHERE id = ?').get(error.id);
      expect(resolved.resolved).toBe(1);
      expect(resolved.resolved_by).toBe('admin');
    });

    it('should return 400 if resolvedBy is missing', async () => {
      const mockReq = {
        params: { errorId: '1' },
        body: {}
      };
      const mockRes = createMockResponse();

      await routes.resolveError(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(400);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error).toContain('resolvedBy is required');
    });
  });

  describe('POST /monitoring/cleanup', () => {
    it('should trigger cleanup', async () => {
      const mockReq = {
        body: { daysToKeep: 7 }
      };
      const mockRes = createMockResponse();

      await routes.cleanup(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.message).toContain('cleanup completed');
      expect(response.metricsDeleted).toBeDefined();
      expect(response.eventsDeleted).toBeDefined();
      expect(response.errorsDeleted).toBeDefined();
    });
  });

  describe('GET /monitoring/status', () => {
    it('should return service status', async () => {
      const mockRes = createMockResponse();

      await routes.getStatus({}, mockRes);

      expect(mockRes.statusCode).toBe(200);
      expect(mockRes.headers['Content-Type']).toBe('application/json');
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.running).toBeDefined();
      expect(response.config).toBeDefined();
      expect(response.thresholds).toBeDefined();
      expect(response.thresholds.CPU_WARNING).toBe(80);
    });
  });
});
