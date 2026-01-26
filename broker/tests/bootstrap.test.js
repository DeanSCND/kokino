/**
 * Bootstrap System Unit Tests
 * Phase 3: Bootstrap System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileLoader } from '../src/bootstrap/FileLoader.js';
import { CompactionMonitor } from '../src/bootstrap/CompactionMonitor.js';
import { BootstrapMode, BootstrapStatus } from '../src/bootstrap/BootstrapModes.js';

describe('FileLoader', () => {
  describe('validatePath', () => {
    it('should accept valid relative paths', () => {
      const loader = new FileLoader('/project');
      expect(() => loader.validatePath('CLAUDE.md')).not.toThrow();
      expect(() => loader.validatePath('.kokino/context.md')).not.toThrow();
      expect(() => loader.validatePath('docs/api.md')).not.toThrow();
    });

    it('should reject directory traversal attempts', () => {
      const loader = new FileLoader('/project');
      expect(() => loader.validatePath('../etc/passwd')).toThrow('Path traversal not allowed');
      expect(() => loader.validatePath('../../etc/hosts')).toThrow('Path traversal not allowed');
    });

    it('should reject absolute paths', () => {
      const loader = new FileLoader('/project');
      expect(() => loader.validatePath('/etc/passwd')).toThrow('Path traversal not allowed');
    });

    it('should reject null byte attacks', () => {
      const loader = new FileLoader('/project');
      expect(() => loader.validatePath('file\0.txt')).toThrow('Null bytes not allowed');
    });
  });

  describe('loadFile', () => {
    it('should handle missing files gracefully', async () => {
      const loader = new FileLoader('/tmp');
      const result = await loader.loadFile('nonexistent.md');

      expect(result.loaded).toBe(false);
      expect(result.error).toBe('File not found');
    });
  });
});

describe('CompactionMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new CompactionMonitor();
  });

  describe('checkCompaction', () => {
    it('should return normal for low turn count', () => {
      const result = monitor.checkCompaction('agent-1', 10, 1000, 0);

      expect(result.isCompacted).toBe(false);
      expect(result.severity).toBe('normal');
      expect(result.recommendation).toContain('operating normally');
    });

    it('should return warning at threshold', () => {
      const result = monitor.checkCompaction('agent-1', 50, 10000, 0);

      expect(result.isCompacted).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.recommendation).toContain('Consider restarting');
    });

    it('should return critical at high turn count', () => {
      const result = monitor.checkCompaction('agent-1', 100, 150000, 0);

      expect(result.isCompacted).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.recommendation).toContain('Restart agent immediately');
    });

    it('should detect high error rate', () => {
      const result = monitor.checkCompaction('agent-1', 20, 5000, 10);

      expect(result.isCompacted).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.reasons.some(r => r.includes('Error rate'))).toBe(true);
    });

    it('should detect high token count', () => {
      const result = monitor.checkCompaction('agent-1', 30, 200000, 0);

      expect(result.isCompacted).toBe(true);
      expect(result.severity).toBe('critical');
      expect(result.reasons.some(r => r.includes('Total tokens'))).toBe(true);
    });
  });

  describe('getRecommendation', () => {
    it('should provide correct recommendations', () => {
      expect(monitor.getRecommendation('normal')).toContain('operating normally');
      expect(monitor.getRecommendation('warning')).toContain('Consider restarting');
      expect(monitor.getRecommendation('critical')).toContain('Restart agent immediately');
    });
  });
});

describe('BootstrapModes', () => {
  it('should export correct bootstrap modes', () => {
    expect(BootstrapMode.NONE).toBe('none');
    expect(BootstrapMode.AUTO).toBe('auto');
    expect(BootstrapMode.MANUAL).toBe('manual');
    expect(BootstrapMode.CUSTOM).toBe('custom');
  });

  it('should export correct bootstrap statuses', () => {
    expect(BootstrapStatus.PENDING).toBe('pending');
    expect(BootstrapStatus.IN_PROGRESS).toBe('in_progress');
    expect(BootstrapStatus.COMPLETED).toBe('completed');
    expect(BootstrapStatus.FAILED).toBe('failed');
    expect(BootstrapStatus.READY).toBe('ready');
  });
});
