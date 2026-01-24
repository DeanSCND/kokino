/**
 * ProcessSupervisor - Resource monitoring and limits for headless CLI subprocesses
 *
 * Prevents runaway processes by:
 * - Monitoring CPU/memory usage
 * - Enforcing resource limits
 * - Killing processes that exceed thresholds
 * - Emitting telemetry events
 * - Cleaning up zombie processes
 *
 * Related: Issue #90 - Subprocess Sandboxing & Resource Limits
 */

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { getMetricsCollector } from '../telemetry/MetricsCollector.js';

export class ProcessSupervisor extends EventEmitter {
  constructor() {
    super();
    this.metrics = getMetricsCollector();
    this.activeProcesses = new Map(); // pid -> { process, monitor, startTime, agentId }

    console.log('[ProcessSupervisor] Initialized');
  }

  /**
   * Spawn a supervised CLI subprocess with resource monitoring
   *
   * @param {string} command - Command to execute
   * @param {Array<string>} args - Command arguments
   * @param {object} options - Spawn options + resource limits
   * @returns {ChildProcess} Spawned process
   */
  spawn(command, args, options = {}) {
    const {
      agentId = 'unknown',
      maxMemoryMB = 2048,
      maxCPUPercent = 200,
      timeoutMs = 300000,
      ...spawnOptions
    } = options;

    const limits = { maxMemoryMB, maxCPUPercent, timeoutMs };

    // Spawn process
    const process = spawn(command, args, {
      ...spawnOptions,
      stdio: spawnOptions.stdio || ['pipe', 'pipe', 'pipe']
    });

    const startTime = Date.now();

    // Track process
    this.activeProcesses.set(process.pid, {
      process,
      startTime,
      agentId,
      limits
    });

    // Start resource monitoring
    const monitor = this.monitorResources(process, limits, agentId);

    // Emit telemetry
    this.metrics.record('PROCESS_STARTED', agentId, {
      metadata: {
        pid: process.pid,
        command,
        args: args.slice(0, 3), // First 3 args only (avoid logging sensitive data)
        limits
      }
    });

    console.log(`[ProcessSupervisor] Spawned ${command} (PID: ${process.pid}) for ${agentId} with limits:`, limits);

    // Cleanup on exit
    process.on('close', (code, signal) => {
      const durationMs = Date.now() - startTime;

      // Stop monitoring
      if (monitor) {
        clearInterval(monitor);
      }

      // Remove from tracking
      this.activeProcesses.delete(process.pid);

      // Emit telemetry
      const eventType = code === 0 ? 'PROCESS_EXITED' : 'PROCESS_FAILED';
      this.metrics.record(eventType, agentId, {
        durationMs,
        success: code === 0,
        metadata: {
          pid: process.pid,
          exitCode: code,
          signal,
          durationMs
        }
      });

      console.log(`[ProcessSupervisor] Process ${process.pid} exited (code: ${code}, signal: ${signal}) after ${durationMs}ms`);
    });

    return process;
  }

  /**
   * Monitor process resource usage and enforce limits
   *
   * @param {ChildProcess} process - Process to monitor
   * @param {object} limits - Resource limits { maxMemoryMB, maxCPUPercent }
   * @param {string} agentId - Agent identifier for telemetry
   * @returns {NodeJS.Timeout} Monitoring interval
   */
  monitorResources(process, limits, agentId) {
    const interval = setInterval(async () => {
      try {
        const usage = await this.getProcessUsage(process.pid);

        if (!usage) {
          // Process already exited
          clearInterval(interval);
          return;
        }

        // Check memory limit
        if (usage.memoryMB > limits.maxMemoryMB) {
          console.warn(`[ProcessSupervisor] Process ${process.pid} exceeded memory limit (${usage.memoryMB}MB > ${limits.maxMemoryMB}MB) - sending SIGTERM`);

          this.metrics.record('PROCESS_LIMIT_EXCEEDED', agentId, {
            metadata: {
              pid: process.pid,
              limitType: 'memory',
              usage: usage.memoryMB,
              limit: limits.maxMemoryMB
            }
          });

          process.kill('SIGTERM');
          clearInterval(interval);
        }

        // Check CPU limit (warning only, don't kill)
        if (usage.cpuPercent > limits.maxCPUPercent) {
          console.warn(`[ProcessSupervisor] Process ${process.pid} exceeds CPU limit (${usage.cpuPercent}% > ${limits.maxCPUPercent}%)`);

          this.metrics.record('PROCESS_HIGH_CPU', agentId, {
            metadata: {
              pid: process.pid,
              usage: usage.cpuPercent,
              limit: limits.maxCPUPercent
            }
          });
        }

      } catch (error) {
        // Process likely exited, stop monitoring
        clearInterval(interval);
      }
    }, 2000); // Check every 2s

    return interval;
  }

  /**
   * Get process resource usage via ps command
   *
   * @param {number} pid - Process ID
   * @returns {Promise<object|null>} Usage stats or null if process not found
   */
  async getProcessUsage(pid) {
    try {
      // Use ps to get memory (RSS in KB) and CPU usage
      const output = execSync(`ps -p ${pid} -o rss=,pcpu=`, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 1000
      }).trim();

      if (!output) return null;

      const parts = output.split(/\s+/);
      const rssKB = parseInt(parts[0]) || 0;
      const cpuPercent = parseFloat(parts[1]) || 0;

      return {
        memoryMB: Math.round(rssKB / 1024),
        cpuPercent: Math.round(cpuPercent)
      };
    } catch (error) {
      // Process not found or ps failed
      return null;
    }
  }

  /**
   * Clean up zombie processes for all agents
   *
   * @returns {number} Number of zombies killed
   */
  cleanupZombies() {
    let killedCount = 0;

    for (const [pid, info] of this.activeProcesses.entries()) {
      const { process, startTime, agentId, limits } = info;

      // Check if process is still alive
      try {
        process.kill(0); // Signal 0 = check existence without killing
      } catch (error) {
        // Process is dead, remove from tracking
        console.log(`[ProcessSupervisor] Cleaning up zombie process ${pid} for ${agentId}`);
        this.activeProcesses.delete(pid);
        killedCount++;
        continue;
      }

      // Check if process exceeded absolute timeout (2x configured timeout)
      const age = Date.now() - startTime;
      const absoluteTimeout = limits.timeoutMs * 2;

      if (age > absoluteTimeout) {
        console.warn(`[ProcessSupervisor] Process ${pid} exceeded absolute timeout (${age}ms > ${absoluteTimeout}ms) - force killing`);

        this.metrics.record('PROCESS_ZOMBIE_KILLED', agentId, {
          metadata: {
            pid,
            age,
            timeout: absoluteTimeout
          }
        });

        process.kill('SIGKILL');
        this.activeProcesses.delete(pid);
        killedCount++;
      }
    }

    if (killedCount > 0) {
      console.log(`[ProcessSupervisor] Cleaned up ${killedCount} zombie processes`);
    }

    return killedCount;
  }

  /**
   * Get status of all active processes
   *
   * @returns {Array<object>} Process status list
   */
  getStatus() {
    const now = Date.now();

    return Array.from(this.activeProcesses.entries()).map(([pid, info]) => ({
      pid,
      agentId: info.agentId,
      ageMs: now - info.startTime,
      limits: info.limits
    }));
  }
}
