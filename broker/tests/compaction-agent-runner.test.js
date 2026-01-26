/**
 * Compaction Monitoring - AgentRunner Integration Tests
 * Phase 3: Issue #135 - Test compaction tracking with agent execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRunner } from '../src/agents/AgentRunner.js';
import { CompactionMonitor } from '../src/bootstrap/CompactionMonitor.js';
import db from '../src/db/schema.js';

describe('Compaction Monitoring - AgentRunner Integration', () => {
  let agentRunner;
  let mockRegistry;
  let mockConversationStore;
  const testAgentId = 'test-compaction-agent';

  beforeEach(() => {
    // Mock registry
    mockRegistry = {
      get: vi.fn(() => ({
        agentId: testAgentId,
        type: 'claude-code',
        status: 'idle',
        commMode: 'headless',
        metadata: {
          commMode: 'headless',
          role: 'Developer',
          cwd: '/tmp'
        }
      }))
    };

    // Mock conversation store
    mockConversationStore = {
      createConversation: vi.fn(() => 'test-conv-123'),
      getAgentConversations: vi.fn(() => []),
      addTurn: vi.fn()
    };

    // Create agent runner
    agentRunner = new AgentRunner(mockRegistry, mockConversationStore);

    // Clean up database
    db.prepare('DELETE FROM compaction_metrics WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM bootstrap_history WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM agents WHERE agent_id = ?').run(testAgentId);

    // Insert test agent
    db.prepare(`
      INSERT INTO agents (agent_id, type, status, metadata, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(testAgentId, 'claude-code', 'idle', '{}');
  });

  afterEach(() => {
    // Clean up
    db.prepare('DELETE FROM compaction_metrics WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM bootstrap_history WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM agents WHERE agent_id = ?').run(testAgentId);
  });

  describe('CompactionMonitor initialization', () => {
    it('should initialize compaction monitor in constructor', () => {
      expect(agentRunner.compactionMonitor).toBeDefined();
      expect(agentRunner.compactionMonitor).toBeInstanceOf(CompactionMonitor);
    });
  });

  describe('Turn tracking during execution', () => {
    it('should track successful execution turns', async () => {
      // Mock runClaudeOnce to simulate successful execution
      agentRunner.runClaudeOnce = vi.fn(async () => ({
        response: 'Test response with some content here to estimate tokens',
        code: 0,
        sessionId: 'test-session',
        durationMs: 1500
      }));

      // Mock session manager
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      // Execute
      await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });

      // Verify turn was tracked
      const status = await agentRunner.compactionMonitor.getStatus(testAgentId);
      expect(status.conversationTurns).toBe(1);
      expect(status.compactionStatus.severity).toBe('normal');
    });

    it('should track multiple turns and detect warning threshold', async () => {
      // Mock execution
      agentRunner.runClaudeOnce = vi.fn(async () => ({
        response: 'Response content',
        code: 0,
        sessionId: 'test-session',
        durationMs: 1500
      }));
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      // Execute 55 times to hit warning threshold
      for (let i = 0; i < 55; i++) {
        await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });
      }

      // Verify warning threshold hit
      const status = await agentRunner.compactionMonitor.getStatus(testAgentId);
      expect(status.conversationTurns).toBe(55);
      expect(status.compactionStatus.isCompacted).toBe(true);
      expect(status.compactionStatus.severity).toBe('warning');
      expect(status.compactionStatus.recommendation).toContain('Consider restarting');
    });

    it('should track errors in compaction metrics', async () => {
      // Mock execution failure
      agentRunner.runClaudeOnce = vi.fn(async () => {
        throw new Error('Execution failed');
      });
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      // Execute and expect error
      try {
        await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });
      } catch (error) {
        // Expected to fail
      }

      // Verify error was tracked
      const status = await agentRunner.compactionMonitor.getStatus(testAgentId);
      expect(status.conversationTurns).toBe(1);
      expect(status.errorCount).toBe(1);
    });

    it('should log warnings when hitting warning threshold', async () => {
      // Spy on console.warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock execution
      agentRunner.runClaudeOnce = vi.fn(async () => ({
        response: 'Response',
        code: 0,
        sessionId: 'test-session',
        durationMs: 1500
      }));
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      // Execute 50 times to hit warning threshold
      for (let i = 0; i < 50; i++) {
        await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });
      }

      // Verify warning was logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Compaction warning')
      );

      warnSpy.mockRestore();
    });

    it('should log critical alerts when hitting critical threshold', async () => {
      // Spy on console.error
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock execution
      agentRunner.runClaudeOnce = vi.fn(async () => ({
        response: 'Response',
        code: 0,
        sessionId: 'test-session',
        durationMs: 1500
      }));
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      // Execute 100 times to hit critical threshold
      for (let i = 0; i < 100; i++) {
        await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });
      }

      // Verify critical alert was logged
      const criticalCalls = errorSpy.mock.calls.filter(call =>
        call[0] && call[0].includes('CRITICAL compaction')
      );
      expect(criticalCalls.length).toBeGreaterThan(0);

      errorSpy.mockRestore();
    });
  });

  describe('Token estimation', () => {
    it('should estimate tokens from response length', async () => {
      const longResponse = 'x'.repeat(5000); // ~5000 character response

      agentRunner.runClaudeOnce = vi.fn(async () => ({
        response: longResponse,
        code: 0,
        sessionId: 'test-session',
        durationMs: 1500
      }));
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });

      const status = await agentRunner.compactionMonitor.getStatus(testAgentId);
      expect(status.totalTokens).toBe(5000); // Rough estimate
    });
  });

  describe('Response time tracking', () => {
    it('should track response times in seconds', async () => {
      agentRunner.runClaudeOnce = vi.fn(async () => {
        // Simulate 2.5 second execution
        await new Promise(resolve => setTimeout(resolve, 2500));
        return {
          response: 'Response',
          code: 0,
          sessionId: 'test-session',
          durationMs: 2500
        };
      });
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });

      const status = await agentRunner.compactionMonitor.getStatus(testAgentId);
      expect(status.avgResponseTime).toBeGreaterThan(2); // At least 2 seconds
    });
  });

  describe('Error handling', () => {
    it('should continue execution if compaction tracking fails', async () => {
      // Break compaction monitor
      agentRunner.compactionMonitor.trackTurn = vi.fn(async () => {
        throw new Error('Tracking failed');
      });

      agentRunner.runClaudeOnce = vi.fn(async () => ({
        response: 'Response',
        code: 0,
        sessionId: 'test-session',
        durationMs: 1500
      }));
      agentRunner.sessionManager.acquireLock = vi.fn(async () => ({ agentId: testAgentId }));
      agentRunner.sessionManager.releaseLock = vi.fn();
      agentRunner.sessionManager.markSessionInitialized = vi.fn();
      agentRunner.checkCircuitBreaker = vi.fn(async () => {});

      // Should not throw despite tracking failure
      const result = await agentRunner.execute(testAgentId, 'Test prompt', { timeoutMs: 5000 });
      expect(result.success).toBe(true);
    });
  });
});
