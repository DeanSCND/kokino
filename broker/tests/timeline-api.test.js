/**
 * Timeline API Tests
 * Tests for GET /api/monitoring/timeline endpoint
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('Timeline API', () => {
  let routes;
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();

  beforeEach(() => {
    // Clean up test data
    db.prepare('DELETE FROM agents WHERE agent_id LIKE ?').run('timeline-test-%');
    db.prepare('DELETE FROM messages WHERE from_agent LIKE ? OR to_agent LIKE ?').run('timeline-test-%', 'timeline-test-%');
    db.prepare('DELETE FROM conversations WHERE agent_id LIKE ?').run('timeline-test-%');

    // Insert test agents
    const insertAgent = db.prepare(`
      INSERT INTO agents (agent_id, type, status, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertAgent.run('timeline-test-alice', 'test', 'online', now, now, now);
    insertAgent.run('timeline-test-bob', 'test', 'online', now, now, now);
    insertAgent.run('timeline-test-charlie', 'test', 'online', now, now, now);

    // Insert test messages
    const insertMessage = db.prepare(`
      INSERT INTO messages (message_id, from_agent, to_agent, thread_id, payload, metadata, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMessage.run('msg-1', 'timeline-test-alice', 'timeline-test-bob', 'thread-1', 'Hello Bob', '{}', 'sent', twoHoursAgo);
    insertMessage.run('msg-2', 'timeline-test-bob', 'timeline-test-charlie', 'thread-2', 'Hi Charlie', '{}', 'sent', oneHourAgo);
    insertMessage.run('msg-3', 'timeline-test-charlie', 'timeline-test-alice', 'thread-1', 'Hey Alice', '{}', 'sent', now);

    // Insert test conversations and turns
    const insertConv = db.prepare(`
      INSERT INTO conversations (conversation_id, agent_id, title, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertTurn = db.prepare(`
      INSERT INTO turns (conversation_id, role, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertConv.run('conv-1', 'timeline-test-alice', 'Test Conversation', '{}', twoHoursAgo, now);
    insertTurn.run('conv-1', 'user', 'What is the weather?', '{}', twoHoursAgo);
    insertTurn.run('conv-1', 'assistant', 'I cannot check the weather.', '{}', oneHourAgo);

    insertConv.run('conv-2', 'timeline-test-bob', 'Another Test', '{}', oneHourAgo, now);
    insertTurn.run('conv-2', 'user', 'Help me code', '{}', oneHourAgo);

    // Mock monitoring service (not used by timeline, but required for routes)
    const mockMonitoringService = {
      isRunning: true,
      COLLECTION_INTERVAL_MS: 60000,
      ALERT_CHECK_INTERVAL_MS: 30000,
      CLEANUP_INTERVAL_MS: 86400000,
      DATA_RETENTION_DAYS: 7,
      THRESHOLDS: {}
    };

    routes = createMonitoringRoutes(mockMonitoringService);
  });

  afterEach(() => {
    // Clean up test data
    db.prepare('DELETE FROM agents WHERE agent_id LIKE ?').run('timeline-test-%');
    db.prepare('DELETE FROM messages WHERE from_agent LIKE ? OR to_agent LIKE ?').run('timeline-test-%', 'timeline-test-%');
    db.prepare('DELETE FROM conversations WHERE agent_id LIKE ?').run('timeline-test-%');
  });

  describe('GET /api/monitoring/timeline', () => {
    it('should return timeline with default parameters', async () => {
      // Use extended time range to capture all test fixtures
      const threeHoursAgo = new Date(Date.now() - 10800000).toISOString();
      const oneHourFromNow = new Date(Date.now() + 3600000).toISOString();

      const mockReq = { query: { from: threeHoursAgo, to: oneHourFromNow } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      expect(mockRes.statusCode).toBe(200);
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      expect(Array.isArray(response.entries)).toBe(true);
      expect(typeof response.total).toBe('number');
      expect(typeof response.hasMore).toBe('boolean');
      expect(response.pagination).toBeDefined();
      expect(response.pagination.limit).toBe(1000);
      expect(response.pagination.offset).toBe(0);

      // Should have at least our test data (3 messages + 3 conversation turns)
      const testEntries = response.entries.filter(e =>
        e.agent_id?.startsWith('timeline-test-') ||
        e.target_agent_id?.startsWith('timeline-test-')
      );
      expect(testEntries.length).toBeGreaterThanOrEqual(6);
    });

    it('should support pagination with limit and offset', async () => {
      const mockReq1 = { query: { limit: '2', offset: '0' } };
      const mockRes1 = createMockResponse();

      await routes.getTimeline(mockReq1, mockRes1);

      const response1 = JSON.parse(mockRes1.end.mock.calls[0][0]);
      expect(response1.entries.length).toBeLessThanOrEqual(2);
      expect(response1.pagination.limit).toBe(2);
      expect(response1.pagination.offset).toBe(0);

      const mockReq2 = { query: { limit: '2', offset: '2' } };
      const mockRes2 = createMockResponse();

      await routes.getTimeline(mockReq2, mockRes2);

      const response2 = JSON.parse(mockRes2.end.mock.calls[0][0]);
      expect(response2.entries.length).toBeLessThanOrEqual(2);
      expect(response2.pagination.offset).toBe(2);

      // Entries should be different
      if (response1.entries.length > 0 && response2.entries.length > 0) {
        expect(response1.entries[0].id).not.toBe(response2.entries[0].id);
      }
    });

    it('should respect max limit of 5000', async () => {
      const mockReq = { query: { limit: '10000' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.pagination.limit).toBe(5000);
    });

    it('should clamp negative limit to minimum 1', async () => {
      const mockReq = { query: { limit: '-100' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.pagination.limit).toBe(1);
    });

    it('should clamp negative offset to 0', async () => {
      const mockReq = { query: { offset: '-100' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.pagination.offset).toBe(0);
    });

    it('should filter by type (messages only)', async () => {
      const threeHoursAgo = new Date(Date.now() - 10800000).toISOString();
      const oneHourFromNow = new Date(Date.now() + 3600000).toISOString();

      const mockReq = { query: { types: 'message', from: threeHoursAgo, to: oneHourFromNow } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      // All entries should be messages
      response.entries.forEach(entry => {
        expect(entry.type).toBe('message');
      });

      // Should have exactly 3 messages from fixtures
      const testMessages = response.entries.filter(e =>
        e.agent_id?.startsWith('timeline-test-')
      );
      expect(testMessages.length).toBe(3);
    });

    it('should filter by type (conversations only)', async () => {
      const threeHoursAgo = new Date(Date.now() - 10800000).toISOString();
      const oneHourFromNow = new Date(Date.now() + 3600000).toISOString();

      const mockReq = { query: { types: 'conversation', from: threeHoursAgo, to: oneHourFromNow } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      // All entries should be conversations
      response.entries.forEach(entry => {
        expect(entry.type).toBe('conversation');
      });

      // Should have exactly 3 conversation turns from fixtures
      const testTurns = response.entries.filter(e =>
        e.agent_id?.startsWith('timeline-test-')
      );
      expect(testTurns.length).toBe(3);
    });

    it('should filter by multiple types', async () => {
      const mockReq = { query: { types: 'message,conversation' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      const types = new Set(response.entries.map(e => e.type));
      types.forEach(type => {
        expect(['message', 'conversation']).toContain(type);
      });
    });

    it('should filter by agent', async () => {
      const mockReq = { query: { agents: 'timeline-test-alice' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      // All entries should involve Alice
      response.entries.forEach(entry => {
        const isAlice = entry.agent_id === 'timeline-test-alice' ||
                       entry.target_agent_id === 'timeline-test-alice';
        expect(isAlice).toBe(true);
      });
    });

    it('should filter by thread', async () => {
      const threeHoursAgo = new Date(Date.now() - 10800000).toISOString();
      const oneHourFromNow = new Date(Date.now() + 3600000).toISOString();

      const mockReq = { query: { threadId: 'thread-1', from: threeHoursAgo, to: oneHourFromNow } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      // All entries should be from thread-1
      response.entries.forEach(entry => {
        expect(entry.thread_id).toBe('thread-1');
      });

      // Should have exactly 2 messages in thread-1
      const testEntries = response.entries.filter(e =>
        e.agent_id?.startsWith('timeline-test-')
      );
      expect(testEntries.length).toBe(2);
    });

    it('should include required fields in timeline entries', async () => {
      const mockReq = { query: { limit: '1' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.entries.length).toBeGreaterThan(0);

      const entry = response.entries[0];
      expect(entry.type).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.agent_id).toBeDefined();
      expect(entry.content).toBeDefined();

      // Type-specific validations
      if (entry.type === 'message') {
        expect(entry.target_agent_id).toBeDefined();
      } else if (entry.type === 'conversation') {
        expect(entry.thread_id).toBeDefined();
      }
    });

    it('should return entries sorted by timestamp DESC (newest first)', async () => {
      const mockReq = { query: { limit: '10' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      // Verify DESC ordering
      for (let i = 0; i < response.entries.length - 1; i++) {
        const current = new Date(response.entries[i].timestamp);
        const next = new Date(response.entries[i + 1].timestamp);

        expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
      }
    });

    it('should handle empty results gracefully', async () => {
      const futureFrom = new Date('2030-01-01').toISOString();
      const futureTo = new Date('2030-12-31').toISOString();

      const mockReq = { query: { from: futureFrom, to: futureTo } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.entries.length).toBe(0);
      expect(response.total).toBe(0);
      expect(response.hasMore).toBe(false);
      expect(response.oldestTimestamp).toBe(null);
      expect(response.newestTimestamp).toBe(null);
    });

    it('should return correct total count with filtering', async () => {
      const mockReq = { query: { agents: 'timeline-test-alice', limit: '1' } };
      const mockRes = createMockResponse();

      await routes.getTimeline(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);

      // Total should reflect count after filtering, not just returned entries
      expect(response.total).toBeGreaterThanOrEqual(response.entries.length);
      expect(response.hasMore).toBe(response.total > response.entries.length);
    });
  });
});
