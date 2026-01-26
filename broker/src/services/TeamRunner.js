/**
 * TeamRunner Service
 * Phase 5: Team Lifecycle Management
 *
 * Manages starting and stopping teams of agents.
 * Integrates with AgentRunner for process spawning.
 * No workflow orchestration - just simple group process management.
 */

import { randomUUID } from 'crypto';
import db from '../db/schema.js';
import { Team } from '../models/Team.js';
import { AgentConfig } from '../models/AgentConfig.js';

export class TeamRunner {
  constructor(agentRegistry, agentRunner) {
    this.registry = agentRegistry;
    this.agentRunner = agentRunner;
    this.activeRuns = new Map(); // runId -> { teamId, agents: Map<agentId, process> }
  }

  /**
   * Start all agents in a team
   * @param {string} teamId - Team ID to start
   * @returns {Promise<Object>} Run information
   */
  async startTeam(teamId) {
    const team = Team.findById(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Check for existing active run
    const existingRun = db.prepare(
      'SELECT id FROM team_runs WHERE team_id = ? AND status = ?'
    ).get(teamId, 'running');

    if (existingRun) {
      throw new Error(`Team "${team.name}" is already running (run ID: ${existingRun.id})`);
    }

    const runId = `run-${randomUUID()}`;
    const agentPids = {};
    const startedAgents = new Map();

    console.log(`[TeamRunner] Starting team "${team.name}" (${team.agents.length} agents)`);

    // Create run record
    db.prepare(`
      INSERT INTO team_runs (id, team_id, status, started_at)
      VALUES (?, ?, ?, ?)
    `).run(runId, teamId, 'running', new Date().toISOString());

    try {
      // Get agent configurations
      const configs = team.getAgentConfigs();

      // Start each agent
      for (const config of configs) {
        console.log(`[TeamRunner] Starting agent: ${config.name} (${config.id})`);

        // Create unique agent ID for this run
        const agentId = `${config.name}-${runId.substring(0, 8)}`;

        // Register agent with the registry in headless mode for AgentRunner
        await this.registry.register(agentId, {
          type: config.cli_type || 'claude-code',
          metadata: {
            commMode: 'headless',  // CRITICAL: Must be in metadata for registry to pick it up
            configId: config.id,
            teamId: teamId,
            runId: runId,
            role: config.role,
            projectId: config.project_id,
            systemPrompt: config.system_prompt,
            // Runtime context - essential for AgentRunner
            cwd: config.working_directory || process.cwd(),  // Working directory for agent execution
            workingDirectory: config.working_directory || process.cwd(),
            environmentVariables: config.environmentVariables || {},
            capabilities: config.capabilities || [],
            // Bootstrap configuration
            bootstrapMode: config.bootstrap_mode || 'none',
            bootstrapInstructions: config.bootstrap_instructions,
            bootstrapCommands: config.bootstrapCommands || []
          }
        });

        // For team agents, we just register them in headless mode
        // The actual process spawning happens when they receive their first prompt
        // This is a simplified approach that avoids complex process management

        try {
          // Mark agent as started in registry
          await this.registry.start(agentId);

          // Bootstrap the agent if needed
          if (config.bootstrap_mode && config.bootstrap_mode !== 'none') {
            console.log(`[TeamRunner] Bootstrapping agent ${config.name} with mode: ${config.bootstrap_mode}`);
            // Note: Bootstrap would happen on first prompt execution
            // We're just marking it as ready here
          }

          // Track the started agent
          // Since we're using headless mode, AgentRunner will manage the process
          agentPids[agentId] = 'headless';
          startedAgents.set(agentId, {
            configId: config.id,
            processId: 'headless',
            name: config.name
          });

          console.log(`[TeamRunner] Agent ${config.name} registered and ready (headless mode)`);
        } catch (error) {
          console.error(`[TeamRunner] Failed to start agent ${config.name}:`, error);
          throw new Error(`Failed to start agent ${config.name}: ${error.message}`);
        }
      }

      // Update run with PIDs
      db.prepare(`
        UPDATE team_runs
        SET agent_pids = ?
        WHERE id = ?
      `).run(JSON.stringify(agentPids), runId);

      // Store active run in memory
      this.activeRuns.set(runId, {
        teamId,
        agents: startedAgents
      });

      console.log(`[TeamRunner] Team "${team.name}" started successfully with ${startedAgents.size} agents`);

      return {
        runId,
        teamId,
        teamName: team.name,
        status: 'running',
        agentCount: startedAgents.size,
        agents: Array.from(startedAgents.entries()).map(([id, info]) => ({
          id,
          name: info.name,
          processId: info.processId
        }))
      };

    } catch (error) {
      // Cleanup on failure
      console.error(`[TeamRunner] Failed to start team "${team.name}":`, error);
      await this.stopRun(runId, true, error.message);
      throw error;
    }
  }

  /**
   * Stop the active run for a team
   * @param {string} teamId - Team ID
   * @returns {Promise<Object>} Stop result
   */
  async stopTeam(teamId) {
    const run = db.prepare(`
      SELECT id FROM team_runs
      WHERE team_id = ? AND status = ?
      ORDER BY started_at DESC
      LIMIT 1
    `).get(teamId, 'running');

    if (!run) {
      throw new Error(`No active run found for team ${teamId}`);
    }

    return this.stopRun(run.id);
  }

  /**
   * Stop a specific team run
   * @param {string} runId - Run ID to stop
   * @param {boolean} isError - Whether this is an error stop
   * @param {string} errorMessage - Optional error message
   * @returns {Promise<Object>} Stop result
   */
  async stopRun(runId, isError = false, errorMessage = null) {
    const runInfo = this.activeRuns.get(runId);

    if (!runInfo) {
      // Try to get from database
      const dbRun = db.prepare(`
        SELECT * FROM team_runs WHERE id = ?
      `).get(runId);

      if (!dbRun || dbRun.status !== 'running') {
        throw new Error(`Run ${runId} is not active`);
      }

      // Reconstruct agent info from database
      const agentPids = JSON.parse(dbRun.agent_pids || '{}');
      const stoppedCount = await this.stopAgentsFromPids(agentPids);

      // Update run status
      db.prepare(`
        UPDATE team_runs
        SET status = ?, stopped_at = ?, error_message = ?
        WHERE id = ?
      `).run(
        isError ? 'error' : 'stopped',
        new Date().toISOString(),
        errorMessage,
        runId
      );

      return {
        runId,
        status: isError ? 'error' : 'stopped',
        stoppedAgents: stoppedCount,
        errorMessage
      };
    }

    // Stop all agents in the run
    let stoppedCount = 0;
    for (const [agentId, agentInfo] of runInfo.agents) {
      try {
        console.log(`[TeamRunner] Stopping agent ${agentId}`);

        // Mark as stopped in registry
        await this.registry.stop(agentId);

        // For headless agents, AgentRunner will handle cleanup when session ends
        if (agentInfo.processId === 'headless') {
          // End any active sessions
          try {
            await this.agentRunner.endSession(agentId);
          } catch (error) {
            // Session might not exist, which is fine
            console.log(`[TeamRunner] No active session for ${agentId}`);
          }
        }

        // Remove from registry
        await this.registry.delete(agentId);

        stoppedCount++;
      } catch (error) {
        console.error(`[TeamRunner] Failed to stop agent ${agentId}:`, error);
      }
    }

    // Remove from active runs
    this.activeRuns.delete(runId);

    // Update run status in database
    db.prepare(`
      UPDATE team_runs
      SET status = ?, stopped_at = ?, error_message = ?
      WHERE id = ?
    `).run(
      isError ? 'error' : 'stopped',
      new Date().toISOString(),
      errorMessage,
      runId
    );

    const team = Team.findById(runInfo.teamId);
    console.log(`[TeamRunner] Team "${team?.name}" stopped (${stoppedCount} agents)`);

    return {
      runId,
      teamId: runInfo.teamId,
      teamName: team?.name,
      status: isError ? 'error' : 'stopped',
      stoppedAgents: stoppedCount,
      errorMessage
    };
  }

  /**
   * Stop agents from PID map (database recovery)
   * @param {Object} agentPids - Map of agentId to PID
   * @returns {Promise<number>} Number of stopped agents
   */
  async stopAgentsFromPids(agentPids) {
    let stoppedCount = 0;

    for (const [agentId, pid] of Object.entries(agentPids)) {
      try {
        // Mark as stopped in registry
        await this.registry.stop(agentId);

        // If it's a headless agent, try to end session
        if (pid === 'headless') {
          try {
            await this.agentRunner.endSession(agentId);
          } catch (error) {
            // Session might not exist, which is fine
            console.log(`[TeamRunner] No active session for ${agentId}`);
          }
        }

        // Remove from registry
        await this.registry.delete(agentId);

        stoppedCount++;
      } catch (error) {
        console.error(`[TeamRunner] Failed to stop agent ${agentId} (PID: ${pid}):`, error);
      }
    }

    return stoppedCount;
  }

  /**
   * Get status of a team
   * @param {string} teamId - Team ID
   * @returns {Object} Team status information
   */
  getTeamStatus(teamId) {
    const team = Team.findById(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    return team.getStatus();
  }

  /**
   * Get all active runs
   * @returns {Array<Object>} List of active runs
   */
  getActiveRuns() {
    const runs = db.prepare(`
      SELECT tr.*, t.name as team_name
      FROM team_runs tr
      JOIN teams t ON tr.team_id = t.id
      WHERE tr.status = 'running'
      ORDER BY tr.started_at DESC
    `).all();

    return runs.map(run => ({
      runId: run.id,
      teamId: run.team_id,
      teamName: run.team_name,
      status: run.status,
      startedAt: run.started_at,
      agentPids: JSON.parse(run.agent_pids || '{}')
    }));
  }

  /**
   * Get run history for a team
   * @param {string} teamId - Team ID
   * @param {number} limit - Number of runs to return
   * @returns {Array<Object>} Run history
   */
  getTeamRunHistory(teamId, limit = 10) {
    const runs = db.prepare(`
      SELECT * FROM team_runs
      WHERE team_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(teamId, limit);

    return runs.map(run => ({
      runId: run.id,
      status: run.status,
      startedAt: run.started_at,
      stoppedAt: run.stopped_at,
      errorMessage: run.error_message,
      agentCount: Object.keys(JSON.parse(run.agent_pids || '{}')).length
    }));
  }

  /**
   * Clean up orphaned runs (runs that are marked running but have no active agents)
   */
  async cleanupOrphanedRuns() {
    const runningRuns = db.prepare(`
      SELECT id, team_id FROM team_runs
      WHERE status = 'running'
    `).all();

    let cleanedCount = 0;

    for (const run of runningRuns) {
      if (!this.activeRuns.has(run.id)) {
        console.log(`[TeamRunner] Cleaning up orphaned run ${run.id}`);

        try {
          await this.stopRun(run.id, true, 'Run orphaned - cleaned up on restart');
          cleanedCount++;
        } catch (error) {
          console.error(`[TeamRunner] Failed to cleanup run ${run.id}:`, error);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TeamRunner] Cleaned up ${cleanedCount} orphaned runs`);
    }

    return cleanedCount;
  }

  /**
   * Stop all active teams (for shutdown)
   */
  async stopAllTeams() {
    const activeRuns = Array.from(this.activeRuns.keys());
    console.log(`[TeamRunner] Stopping ${activeRuns.length} active team runs`);

    const results = [];
    for (const runId of activeRuns) {
      try {
        const result = await this.stopRun(runId);
        results.push(result);
      } catch (error) {
        console.error(`[TeamRunner] Error stopping run ${runId}:`, error);
      }
    }

    return results;
  }
}

export default TeamRunner;