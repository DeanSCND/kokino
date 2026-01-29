/**
 * Timeline API Integration Tests
 * Tests for GET /api/monitoring/timeline endpoint
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import * as fs from 'node:fs';

const TEST_DB_PATH = './data/kokino-timeline-test.db';
const BROKER_URL = 'http://127.0.0.1:5050';

// Helper to make API requests
async function apiRequest(path, options = {}) {
  const response = await fetch(`${BROKER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

describe('Timeline API', () => {
  let db;

  before(async () => {
    // Note: Broker should be running on port 5050
    // This test uses the existing broker instance and database
    console.log('[Timeline Test] Using broker at', BROKER_URL);
  });

  describe('GET /api/monitoring/timeline', () => {
    it('should return timeline with default parameters', async () => {
      const result = await apiRequest('/api/monitoring/timeline');

      assert.ok(result, 'Response should exist');
      assert.ok(Array.isArray(result.entries), 'entries should be an array');
      assert.ok(typeof result.total === 'number', 'total should be a number');
      assert.ok(typeof result.hasMore === 'boolean', 'hasMore should be a boolean');
      assert.ok(result.pagination, 'pagination metadata should exist');
      assert.strictEqual(result.pagination.limit, 1000, 'default limit should be 1000');
      assert.strictEqual(result.pagination.offset, 0, 'default offset should be 0');
    });

    it('should support pagination with limit and offset', async () => {
      const result1 = await apiRequest('/api/monitoring/timeline?limit=10&offset=0');
      const result2 = await apiRequest('/api/monitoring/timeline?limit=10&offset=10');

      assert.ok(result1.entries.length <= 10, 'first page should respect limit');
      assert.ok(result2.entries.length <= 10, 'second page should respect limit');

      if (result1.entries.length > 0 && result2.entries.length > 0) {
        assert.notDeepStrictEqual(
          result1.entries[0].id,
          result2.entries[0].id,
          'pages should contain different entries'
        );
      }
    });

    it('should respect max limit of 5000', async () => {
      const result = await apiRequest('/api/monitoring/timeline?limit=10000');

      assert.strictEqual(
        result.pagination.limit,
        5000,
        'limit should be capped at 5000'
      );
    });

    it('should filter by time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      const from = oneHourAgo.toISOString();
      const to = now.toISOString();

      const result = await apiRequest(
        `/api/monitoring/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );

      assert.ok(result, 'Response should exist');
      assert.ok(result.filters, 'filters should be returned');
      assert.strictEqual(result.filters.from, from, 'from filter should be returned');
      assert.strictEqual(result.filters.to, to, 'to filter should be returned');

      // Verify all entries are within time range
      result.entries.forEach(entry => {
        const entryTime = new Date(entry.timestamp);
        assert.ok(
          entryTime >= oneHourAgo && entryTime <= now,
          `Entry timestamp ${entry.timestamp} should be within range`
        );
      });
    });

    it('should filter by type', async () => {
      const result = await apiRequest('/api/monitoring/timeline?types=message');

      assert.ok(result, 'Response should exist');
      assert.ok(result.filters.types, 'type filter should be returned');
      assert.deepStrictEqual(result.filters.types, ['message'], 'type filter should be message');

      // Verify all entries are messages
      result.entries.forEach(entry => {
        assert.strictEqual(entry.type, 'message', 'All entries should be messages');
      });
    });

    it('should filter by multiple types', async () => {
      const result = await apiRequest('/api/monitoring/timeline?types=message,conversation');

      if (result.entries.length > 0) {
        const types = new Set(result.entries.map(e => e.type));
        types.forEach(type => {
          assert.ok(
            type === 'message' || type === 'conversation',
            `Type ${type} should be message or conversation`
          );
        });
      }
    });

    it('should include required fields in timeline entries', async () => {
      const result = await apiRequest('/api/monitoring/timeline?limit=1');

      if (result.entries.length > 0) {
        const entry = result.entries[0];

        assert.ok(entry.type, 'entry should have type');
        assert.ok(entry.id, 'entry should have id');
        assert.ok(entry.timestamp, 'entry should have timestamp');
        assert.ok(entry.agent_id, 'entry should have agent_id');
        assert.ok(entry.content !== undefined, 'entry should have content');

        // Type-specific validations
        if (entry.type === 'message') {
          assert.ok(entry.target_agent_id, 'message entry should have target_agent_id');
        } else if (entry.type === 'conversation') {
          assert.ok(entry.thread_id, 'conversation entry should have thread_id');
        }
      }
    });

    it('should return entries sorted by timestamp DESC (newest first)', async () => {
      const result = await apiRequest('/api/monitoring/timeline?limit=10');

      if (result.entries.length >= 2) {
        for (let i = 0; i < result.entries.length - 1; i++) {
          const current = new Date(result.entries[i].timestamp);
          const next = new Date(result.entries[i + 1].timestamp);

          assert.ok(
            current >= next,
            `Entry ${i} (${current.toISOString()}) should be >= entry ${i + 1} (${next.toISOString()})`
          );
        }
      }
    });

    it('should handle empty results gracefully', async () => {
      // Query for a time range in the far future
      const futureFrom = new Date('2030-01-01').toISOString();
      const futureTo = new Date('2030-12-31').toISOString();

      const result = await apiRequest(
        `/api/monitoring/timeline?from=${encodeURIComponent(futureFrom)}&to=${encodeURIComponent(futureTo)}`
      );

      assert.ok(result, 'Response should exist');
      assert.strictEqual(result.entries.length, 0, 'entries should be empty');
      assert.strictEqual(result.total, 0, 'total should be 0');
      assert.strictEqual(result.hasMore, false, 'hasMore should be false');
      assert.strictEqual(result.oldestTimestamp, null, 'oldestTimestamp should be null');
      assert.strictEqual(result.newestTimestamp, null, 'newestTimestamp should be null');
    });
  });
});

console.log('\n✓ Timeline API tests completed');
