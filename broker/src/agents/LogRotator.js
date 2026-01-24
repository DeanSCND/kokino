/**
 * LogRotator - Rotating log capture for headless CLI output
 *
 * Prevents disk exhaustion by:
 * - Rotating logs at size threshold (default 50MB)
 * - Compressing old logs (gzip)
 * - Auto-cleanup of archives (default 7 days retention)
 * - Per-agent log files
 *
 * Related: Issue #90 - Subprocess Sandboxing & Resource Limits
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export class LogRotator {
  constructor(options = {}) {
    this.basePath = options.basePath || path.join(process.cwd(), 'data', 'logs', 'headless');
    this.maxSizeMB = options.maxSizeMB || 50;
    this.retentionDays = options.retentionDays || 7;

    // Ensure log directory exists
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }

    console.log(`[LogRotator] Initialized: basePath=${this.basePath}, maxSize=${this.maxSizeMB}MB, retention=${this.retentionDays}d`);
  }

  /**
   * Write log entry for agent
   *
   * @param {string} agentId - Agent identifier
   * @param {string} data - Log data to write
   * @param {string} stream - Stream type (stdout/stderr)
   */
  write(agentId, data, stream = 'stdout') {
    const logPath = this.getLogPath(agentId);

    // Check if rotation needed
    this.checkRotation(logPath);

    // Append to log with timestamp and stream prefix
    const timestamp = new Date().toISOString();
    const prefix = stream === 'stderr' ? 'ERR' : 'OUT';
    const entry = `[${timestamp}] [${prefix}] ${data}\n`;

    try {
      fs.appendFileSync(logPath, entry, 'utf8');
    } catch (error) {
      console.error(`[LogRotator] Failed to write log for ${agentId}:`, error.message);
    }
  }

  /**
   * Write process lifecycle event
   *
   * @param {string} agentId - Agent identifier
   * @param {string} event - Event type (started/exited/killed)
   * @param {object} metadata - Event metadata
   */
  writeEvent(agentId, event, metadata = {}) {
    const logPath = this.getLogPath(agentId);
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [EVENT] ${event} ${JSON.stringify(metadata)}\n`;

    try {
      fs.appendFileSync(logPath, entry, 'utf8');
    } catch (error) {
      console.error(`[LogRotator] Failed to write event for ${agentId}:`, error.message);
    }
  }

  /**
   * Check if log rotation needed and perform rotation
   *
   * @param {string} logPath - Path to log file
   */
  checkRotation(logPath) {
    if (!fs.existsSync(logPath)) {
      return; // No rotation needed for new file
    }

    try {
      const stats = fs.statSync(logPath);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB >= this.maxSizeMB) {
        console.log(`[LogRotator] Rotating log ${path.basename(logPath)} (${sizeMB.toFixed(2)}MB)`);
        this.rotate(logPath);
      }
    } catch (error) {
      console.error(`[LogRotator] Failed to check rotation for ${logPath}:`, error.message);
    }
  }

  /**
   * Rotate log file (rename + compress)
   *
   * @param {string} logPath - Path to log file
   */
  rotate(logPath) {
    try {
      const timestamp = Date.now();
      const archivePath = `${logPath}.${timestamp}`;

      // Rename current log
      fs.renameSync(logPath, archivePath);

      // Compress in background (don't block)
      setImmediate(() => {
        try {
          execSync(`gzip ${archivePath}`, { timeout: 30000 });
          console.log(`[LogRotator] Compressed ${path.basename(archivePath)}.gz`);
        } catch (error) {
          console.error(`[LogRotator] Failed to compress ${archivePath}:`, error.message);
        }
      });

    } catch (error) {
      console.error(`[LogRotator] Failed to rotate ${logPath}:`, error.message);
    }
  }

  /**
   * Clean up old log archives
   *
   * @returns {number} Number of files deleted
   */
  cleanup() {
    const cutoffTime = Date.now() - (this.retentionDays * 86400000);
    let deletedCount = 0;

    try {
      const files = fs.readdirSync(this.basePath);

      for (const file of files) {
        // Only process archived logs (*.log.TIMESTAMP or *.log.TIMESTAMP.gz)
        if (!file.match(/\.log\.\d+(\.gz)?$/)) {
          continue;
        }

        const filePath = path.join(this.basePath, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoffTime) {
          console.log(`[LogRotator] Deleting old archive: ${file}`);
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`[LogRotator] Cleaned up ${deletedCount} old log archives`);
      }

    } catch (error) {
      console.error(`[LogRotator] Cleanup failed:`, error.message);
    }

    return deletedCount;
  }

  /**
   * Get log file path for agent
   *
   * @param {string} agentId - Agent identifier
   * @returns {string} Log file path
   */
  getLogPath(agentId) {
    return path.join(this.basePath, `${agentId}.log`);
  }

  /**
   * Read recent log entries for agent
   *
   * @param {string} agentId - Agent identifier
   * @param {number} lines - Number of lines to read (default: 100)
   * @returns {string} Log content
   */
  read(agentId, lines = 100) {
    const logPath = this.getLogPath(agentId);

    if (!fs.existsSync(logPath)) {
      return '';
    }

    try {
      // Use tail to get last N lines efficiently
      const output = execSync(`tail -n ${lines} ${logPath}`, {
        encoding: 'utf8',
        timeout: 5000
      });

      return output;
    } catch (error) {
      console.error(`[LogRotator] Failed to read log for ${agentId}:`, error.message);
      return '';
    }
  }

  /**
   * Get log file stats for all agents
   *
   * @returns {Array<object>} Log stats list
   */
  getStats() {
    const stats = [];

    try {
      const files = fs.readdirSync(this.basePath);

      for (const file of files) {
        // Only process active logs (*.log, not archives)
        if (!file.endsWith('.log')) {
          continue;
        }

        const filePath = path.join(this.basePath, file);
        const fileStats = fs.statSync(filePath);
        const agentId = file.replace('.log', '');

        stats.push({
          agentId,
          sizeMB: (fileStats.size / (1024 * 1024)).toFixed(2),
          lastModified: fileStats.mtime,
          path: filePath
        });
      }

    } catch (error) {
      console.error(`[LogRotator] Failed to get stats:`, error.message);
    }

    return stats;
  }
}
