/**
 * Bootstrap Integration Tests
 * Phase 3: Test bootstrap system integration with agent lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BootstrapManager } from '../src/bootstrap/BootstrapManager.js';
import { CompactionMonitor } from '../src/bootstrap/CompactionMonitor.js';
import { FileLoader } from '../src/bootstrap/FileLoader.js';
import { BootstrapMode } from '../src/bootstrap/BootstrapModes.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import db from '../src/db/schema.js';

describe('Bootstrap Integration', () => {
  let testDir;
  let registry;
  let bootstrapManager;
  let compactionMonitor;
  const testAgentId = 'test-agent-integration';

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kokino-test-'));

    // Mock agent registry
    registry = {
      get: vi.fn(() => ({
        agentId: testAgentId,
        type: 'claude-code',
        status: 'idle',
        metadata: {
          workingDirectory: testDir
        },
        workingDirectory: testDir
      })),
      register: vi.fn(),
      updateStatus: vi.fn()
    };

    bootstrapManager = new BootstrapManager(registry);
    compactionMonitor = new CompactionMonitor();

    // Clean up database for test agent
    db.prepare('DELETE FROM bootstrap_history WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM compaction_metrics WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM agents WHERE agent_id = ?').run(testAgentId);

    // Insert test agent
    db.prepare(`
      INSERT INTO agents (agent_id, type, status, metadata, last_heartbeat, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(testAgentId, 'claude-code', 'idle', '{}');
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }

    // Clean up database
    db.prepare('DELETE FROM bootstrap_history WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM compaction_metrics WHERE agent_id = ?').run(testAgentId);
    db.prepare('DELETE FROM agents WHERE agent_id = ?').run(testAgentId);
  });

  describe('Bootstrap Mode: None', () => {
    it('should complete immediately with no context loaded', async () => {
      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.NONE
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('none');
      expect(result.filesLoaded).toEqual([]);
      expect(result.contextSize).toBe(0);
      expect(result.duration).toBeLessThan(1); // Should be near-instant
    });

    it('should record bootstrap history', async () => {
      await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.NONE
      });

      const history = db.prepare(`
        SELECT * FROM bootstrap_history
        WHERE agent_id = ? AND mode = 'none'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(testAgentId);

      expect(history).toBeDefined();
      expect(history.success).toBe(1); // SQLite stores boolean as integer
      expect(history.mode).toBe('none');
    });
  });

  describe('Bootstrap Mode: Auto', () => {
    it('should load CLAUDE.md when it exists', async () => {
      // Create CLAUDE.md in test directory
      const claudeMdContent = '# Test Project\n\nThis is a test workspace context.';
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), claudeMdContent, 'utf-8');

      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.AUTO,
        autoLoadPaths: ['CLAUDE.md']
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('auto');
      expect(result.filesLoaded).toContain('CLAUDE.md');
      expect(result.contextSize).toBeGreaterThan(0);
    });

    it('should handle missing files gracefully', async () => {
      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.AUTO,
        autoLoadPaths: ['CLAUDE.md', '.kokino/context.md']
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('auto');
      expect(result.filesLoaded).toEqual([]); // No files exist
      expect(result.contextSize).toBe(0);
    });

    it('should load multiple files in order', async () => {
      // Create multiple files
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), '# Workspace\n', 'utf-8');
      await fs.mkdir(path.join(testDir, '.kokino'), { recursive: true });
      await fs.writeFile(path.join(testDir, '.kokino/context.md'), '# Context\n', 'utf-8');

      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.AUTO,
        autoLoadPaths: ['CLAUDE.md', '.kokino/context.md']
      });

      expect(result.success).toBe(true);
      expect(result.filesLoaded).toHaveLength(2);
      expect(result.filesLoaded[0]).toBe('CLAUDE.md');
      expect(result.filesLoaded[1]).toBe('.kokino/context.md');
    });

    it('should inject context into agent', async () => {
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), '# Test\n', 'utf-8');

      await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.AUTO,
        autoLoadPaths: ['CLAUDE.md']
      });

      // Check that context was stored in database
      const agent = db.prepare('SELECT bootstrap_context, bootstrap_status FROM agents WHERE agent_id = ?')
        .get(testAgentId);

      expect(agent.bootstrap_context).toBeDefined();
      expect(agent.bootstrap_context).toContain('# Test');
      expect(agent.bootstrap_status).toBe('ready');
    });
  });

  describe('Bootstrap Mode: Manual', () => {
    it('should load specified files', async () => {
      await fs.writeFile(path.join(testDir, 'README.md'), '# README\n', 'utf-8');
      await fs.writeFile(path.join(testDir, 'NOTES.md'), '# Notes\n', 'utf-8');

      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.MANUAL,
        files: ['README.md', 'NOTES.md']
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('manual');
      expect(result.filesLoaded).toHaveLength(2);
      expect(result.filesLoaded).toContain('README.md');
      expect(result.filesLoaded).toContain('NOTES.md');
    });

    it('should include additional context', async () => {
      const additionalContext = 'Focus on authentication module';

      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.MANUAL,
        files: [],
        additionalContext
      });

      expect(result.success).toBe(true);

      const agent = db.prepare('SELECT bootstrap_context FROM agents WHERE agent_id = ?')
        .get(testAgentId);

      expect(agent.bootstrap_context).toContain(additionalContext);
    });
  });

  describe('Bootstrap Mode: Custom', () => {
    it('should execute custom script and capture output', async () => {
      const scriptPath = path.join(testDir, 'bootstrap.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Custom bootstrap context"', 'utf-8');
      await fs.chmod(scriptPath, 0o755);

      const result = await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.CUSTOM,
        bootstrapScript: scriptPath
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('custom');
      expect(result.contextSize).toBeGreaterThan(0);
    });

    it('should timeout long-running scripts', async () => {
      const scriptPath = path.join(testDir, 'slow.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\nsleep 10\necho "done"', 'utf-8');
      await fs.chmod(scriptPath, 0o755);

      await expect(
        bootstrapManager.bootstrapAgent(testAgentId, {
          mode: BootstrapMode.CUSTOM,
          bootstrapScript: scriptPath,
          bootstrapTimeout: 100 // 100ms timeout
        })
      ).rejects.toThrow();
    });

    it('should reject dangerous scripts', async () => {
      await expect(
        bootstrapManager.bootstrapAgent(testAgentId, {
          mode: BootstrapMode.CUSTOM,
          bootstrapScript: 'rm -rf /'
        })
      ).rejects.toThrow('forbidden command');
    });
  });

  describe('Compaction Monitoring Integration', () => {
    it('should reset metrics on agent start', async () => {
      // Track some turns
      await compactionMonitor.trackTurn(testAgentId, { tokens: 1000 });
      await compactionMonitor.trackTurn(testAgentId, { tokens: 1000 });

      let status = await compactionMonitor.getStatus(testAgentId);
      expect(status.conversationTurns).toBe(2);

      // Reset metrics
      await compactionMonitor.resetMetrics(testAgentId);

      status = await compactionMonitor.getStatus(testAgentId);
      expect(status.conversationTurns).toBe(0);
    });

    it('should track conversation turns', async () => {
      for (let i = 0; i < 55; i++) {
        await compactionMonitor.trackTurn(testAgentId, { tokens: 1000 });
      }

      const status = await compactionMonitor.getStatus(testAgentId);

      expect(status.conversationTurns).toBe(55);
      expect(status.compactionStatus.isCompacted).toBe(true);
      expect(status.compactionStatus.severity).toBe('warning');
    });

    it('should detect critical compaction', async () => {
      for (let i = 0; i < 100; i++) {
        await compactionMonitor.trackTurn(testAgentId, { tokens: 2000 });
      }

      const status = await compactionMonitor.getStatus(testAgentId);

      expect(status.compactionStatus.severity).toBe('critical');
      expect(status.compactionStatus.recommendation).toContain('Restart agent immediately');
    });
  });

  describe('Bootstrap Status and History', () => {
    it('should retrieve bootstrap status', async () => {
      await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.AUTO,
        autoLoadPaths: []
      });

      const status = await bootstrapManager.getBootstrapStatus(testAgentId);

      expect(status.agentId).toBe(testAgentId);
      expect(status.status).toBe('ready');
      expect(status.history).toHaveLength(1);
      expect(status.history[0].mode).toBe('auto');
      expect(status.history[0].success).toBe(true);
    });

    it('should maintain bootstrap history', async () => {
      // Run bootstrap 3 times
      for (let i = 0; i < 3; i++) {
        await bootstrapManager.bootstrapAgent(testAgentId, {
          mode: BootstrapMode.NONE
        });
      }

      const status = await bootstrapManager.getBootstrapStatus(testAgentId);

      expect(status.history).toHaveLength(3);
      expect(status.history.every(h => h.success)).toBe(true);
    });

    it('should record failures in history', async () => {
      // Attempt bootstrap with invalid script
      try {
        await bootstrapManager.bootstrapAgent(testAgentId, {
          mode: BootstrapMode.CUSTOM,
          bootstrapScript: 'rm -rf /' // Will be rejected
        });
      } catch (error) {
        // Expected to fail
      }

      const status = await bootstrapManager.getBootstrapStatus(testAgentId);

      expect(status.status).toBe('failed');
      expect(status.history).toHaveLength(1);
      expect(status.history[0].success).toBe(false);
      expect(status.history[0].error).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should complete NONE mode in < 1s', async () => {
      const start = Date.now();
      await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.NONE
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it('should complete AUTO mode in < 5s', async () => {
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), '# Test\n', 'utf-8');

      const start = Date.now();
      await bootstrapManager.bootstrapAgent(testAgentId, {
        mode: BootstrapMode.AUTO,
        autoLoadPaths: ['CLAUDE.md']
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
    });
  });
});
