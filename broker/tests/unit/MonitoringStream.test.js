/**
 * Unit Tests: MonitoringStream Service
 *
 * Tests the MonitoringStream class in isolation without requiring
 * a running broker or real WebSocket connections.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MonitoringStream } from '../../src/services/MonitoringStream.js';
import { EventEmitter } from 'events';

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.sentMessages = [];
  }

  send(data) {
    this.sentMessages.push(JSON.parse(data));
  }

  ping() {
    // No-op for tests
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
}

describe('MonitoringStream', () => {
  let stream;

  beforeEach(() => {
    stream = new MonitoringStream();
  });

  afterEach(() => {
    if (stream) {
      stream.stop();
    }
  });

  describe('Client Management', () => {
    it('should add client and send confirmation', () => {
      const ws = new MockWebSocket();
      const clientId = 'test-client-1';

      stream.addClient(ws, clientId);

      expect(stream.getClientCount()).toBe(1);
      expect(stream.getClientIds()).toContain(clientId);
      expect(ws.sentMessages).toHaveLength(1);
      expect(ws.sentMessages[0].type).toBe('connected');
      expect(ws.sentMessages[0].clientId).toBe(clientId);
    });

    it('should remove client on disconnect', () => {
      const ws = new MockWebSocket();
      const clientId = 'test-client-2';

      stream.addClient(ws, clientId);
      expect(stream.getClientCount()).toBe(1);

      stream.removeClient(clientId);
      expect(stream.getClientCount()).toBe(0);
      expect(stream.getClientIds()).not.toContain(clientId);
    });

    it('should handle multiple clients', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();
      const ws3 = new MockWebSocket();

      stream.addClient(ws1, 'client-1');
      stream.addClient(ws2, 'client-2');
      stream.addClient(ws3, 'client-3');

      expect(stream.getClientCount()).toBe(3);
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast event to all clients', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      stream.addClient(ws1, 'client-1');
      stream.addClient(ws2, 'client-2');

      stream.broadcast('message.sent', {
        fromAgent: 'Alice',
        toAgent: 'Bob',
        payload: 'Test'
      });

      // Both clients should receive (after confirmation message)
      expect(ws1.sentMessages).toHaveLength(2); // confirmation + event
      expect(ws2.sentMessages).toHaveLength(2);

      const event1 = ws1.sentMessages[1];
      const event2 = ws2.sentMessages[1];

      expect(event1.type).toBe('message.sent');
      expect(event1.data.fromAgent).toBe('Alice');
      expect(event2.type).toBe('message.sent');
      expect(event2.data.fromAgent).toBe('Alice');
    });

    it('should not send to closed connections', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      ws.readyState = 3; // CLOSED

      stream.broadcast('test.event', { data: 'test' });

      // Should only have confirmation, no event
      expect(ws.sentMessages).toHaveLength(1);
      expect(stream.getClientCount()).toBe(0); // Should be removed
    });
  });

  describe('Client Filtering', () => {
    it('should filter events by agent ID', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      // Set filter for only Alice
      stream.updateFilters('client-1', { agents: ['Alice'] });

      // Broadcast event from Alice (should receive)
      stream.broadcast('message.sent', {
        fromAgent: 'Alice',
        toAgent: 'Bob',
        payload: 'From Alice'
      });

      // Broadcast event from Charlie (should NOT receive)
      stream.broadcast('message.sent', {
        fromAgent: 'Charlie',
        toAgent: 'Bob',
        payload: 'From Charlie'
      });

      // Should have: confirmation + filter-updated + 1 event
      expect(ws.sentMessages).toHaveLength(3);
      expect(ws.sentMessages[1].type).toBe('filter-updated');
      expect(ws.sentMessages[2].data.fromAgent).toBe('Alice');
    });

    it('should filter events by type', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      // Set filter for only message events
      stream.updateFilters('client-1', { types: ['message'] });

      // Broadcast message event (should receive)
      stream.broadcast('message.sent', {
        fromAgent: 'Alice',
        toAgent: 'Bob'
      });

      // Broadcast agent event (should NOT receive)
      stream.broadcast('agent.status', {
        agentId: 'Alice',
        status: 'online'
      });

      // Should have: confirmation + filter-updated + 1 event
      expect(ws.sentMessages).toHaveLength(3);
      expect(ws.sentMessages[2].type).toBe('message.sent');
    });

    it('should match full event types', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      // Filter for specific full type
      stream.updateFilters('client-1', { types: ['message.sent'] });

      stream.broadcast('message.sent', { data: 'test' });
      stream.broadcast('conversation.turn', { data: 'test' });

      // Should receive message.sent but not conversation.turn
      expect(ws.sentMessages).toHaveLength(3); // confirmation + filter-updated + 1 event
      expect(ws.sentMessages[2].type).toBe('message.sent');
    });

    it('should clear filters when set to null', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      // Set filter
      stream.updateFilters('client-1', { agents: ['Alice'] });

      // Clear filter
      stream.updateFilters('client-1', { agents: null });

      // Broadcast event from anyone
      stream.broadcast('message.sent', {
        fromAgent: 'Charlie',
        toAgent: 'Bob'
      });

      // Should receive (filters cleared)
      expect(ws.sentMessages).toHaveLength(4); // confirmation + 2x filter-updated + event
    });
  });

  describe('Filter Matching', () => {
    it('should match events targeting filtered agents', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      stream.updateFilters('client-1', { agents: ['Alice'] });

      // Event TO Alice (should match)
      stream.broadcast('message.sent', {
        fromAgent: 'Bob',
        toAgent: 'Alice'
      });

      expect(ws.sentMessages).toHaveLength(3); // confirmation + filter-updated + event
    });

    it('should match base types (e.g., "message" matches "message.sent")', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      stream.updateFilters('client-1', { types: ['message'] });

      stream.broadcast('message.sent', { data: 'test' });

      expect(ws.sentMessages).toHaveLength(3);
      expect(ws.sentMessages[2].type).toBe('message.sent');
    });
  });

  describe('Heartbeat', () => {
    it('should start heartbeat interval', () => {
      expect(stream.heartbeatInterval).toBeNull();

      stream.start();

      expect(stream.heartbeatInterval).not.toBeNull();
    });

    it('should stop heartbeat interval', () => {
      stream.start();
      expect(stream.heartbeatInterval).not.toBeNull();

      stream.stop();

      expect(stream.heartbeatInterval).toBeNull();
    });

    it('should remove dead connections during heartbeat', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      // Simulate dead connection
      ws.readyState = 3; // CLOSED

      stream.sendHeartbeats();

      expect(stream.getClientCount()).toBe(0);
    });
  });

  describe('Shutdown', () => {
    it('should close all client connections on shutdown', () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      stream.addClient(ws1, 'client-1');
      stream.addClient(ws2, 'client-2');

      const closeSpy1 = vi.spyOn(ws1, 'close');
      const closeSpy2 = vi.spyOn(ws2, 'close');

      stream.shutdown();

      expect(closeSpy1).toHaveBeenCalled();
      expect(closeSpy2).toHaveBeenCalled();
      expect(stream.getClientCount()).toBe(0);
    });

    it('should send shutdown message before closing', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      stream.shutdown();

      const shutdownMsg = ws.sentMessages.find(m => m.type === 'shutdown');
      expect(shutdownMsg).toBeDefined();
      expect(shutdownMsg.message).toBe('Monitoring stream shutting down');
    });
  });

  describe('Event Emission', () => {
    it('should emit client-connected event', () => {
      return new Promise((resolve) => {
        stream.on('client-connected', (data) => {
          expect(data.clientId).toBe('test-client');
          expect(data.totalClients).toBe(1);
          resolve();
        });

        const ws = new MockWebSocket();
        stream.addClient(ws, 'test-client');
      });
    });

    it('should emit client-disconnected event', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'test-client');

      return new Promise((resolve) => {
        stream.on('client-disconnected', (data) => {
          expect(data.clientId).toBe('test-client');
          expect(data.totalClients).toBe(0);
          resolve();
        });

        stream.removeClient('test-client');
      });
    });

    it('should emit broadcast event when events sent', () => {
      const ws = new MockWebSocket();
      stream.addClient(ws, 'client-1');

      return new Promise((resolve) => {
        stream.on('broadcast', (data) => {
          expect(data.eventType).toBe('test.event');
          expect(data.sentCount).toBe(1);
          expect(data.totalClients).toBe(1);
          resolve();
        });

        stream.broadcast('test.event', { data: 'test' });
      });
    });
  });
});
