/**
 * Team API Routes
 * Phase 5: Team Lifecycle Management
 *
 * REST endpoints for team CRUD and lifecycle operations.
 */

import { Team } from '../../models/Team.js';
import { TeamRunner } from '../../services/TeamRunner.js';
import { jsonResponse } from '../../utils/response.js';

/**
 * Register team routes on the API router
 * @param {Object} router - Express router or compatible
 * @param {Object} dependencies - Service dependencies
 */
export function registerTeamRoutes(router, { registry, agentRunner }) {
  const teamRunner = new TeamRunner(registry, agentRunner);

  // On startup, clean up orphaned runs
  (async () => {
    try {
      await teamRunner.cleanupOrphanedRuns();
    } catch (error) {
      console.error('[Teams API] Failed to cleanup orphaned runs:', error);
    }
  })();

  /**
   * GET /api/teams
   * List all teams, optionally filtered by project
   */
  router.get('/teams', async (req, res) => {
    try {
      const { projectId, withStatus } = req.query;

      const teams = withStatus === 'true'
        ? Team.listWithStatus(projectId)
        : Team.list(projectId).map(t => t.toJSON());

      jsonResponse(res, 200, {
        teams,
        count: teams.length
      });
    } catch (error) {
      console.error('[Teams API] Error listing teams:', error);
      jsonResponse(res, 500, {
        error: 'Failed to list teams',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams
   * Create a new team
   */
  router.post('/teams', async (req, res) => {
    try {
      const { name, description, projectId, agents } = req.body;

      if (!name || !agents || !Array.isArray(agents) || agents.length === 0) {
        return jsonResponse(res, 400, {
          error: 'Invalid team data',
          message: 'Name and at least one agent are required'
        });
      }

      const team = new Team({
        name,
        description,
        projectId,
        agents
      });

      const errors = team.validate();
      if (errors.length > 0) {
        return jsonResponse(res, 400, {
          error: 'Validation failed',
          errors
        });
      }

      await team.save();

      jsonResponse(res, 201, {
        team: team.toJSON(),
        message: `Team "${team.name}" created successfully`
      });
    } catch (error) {
      console.error('[Teams API] Error creating team:', error);
      jsonResponse(res, 500, {
        error: 'Failed to create team',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/:teamId
   * Get a specific team by ID
   */
  router.get('/teams/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { includeConfigs, includeStatus } = req.query;

      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, {
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const response = team.toJSON();

      if (includeConfigs === 'true') {
        response.agentConfigs = team.getAgentConfigs();
      }

      if (includeStatus === 'true') {
        response.status = team.getStatus();
      }

      jsonResponse(res, 200, response);
    } catch (error) {
      console.error('[Teams API] Error getting team:', error);
      jsonResponse(res, 500, {
        error: 'Failed to get team',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/teams/:teamId
   * Update a team
   */
  router.put('/teams/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { name, description, agents } = req.body;

      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, {
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      // Check if team is running
      const status = team.getStatus();
      if (status.status === 'running') {
        return jsonResponse(res, 409, {
          error: 'Team is running',
          message: 'Cannot update a running team. Stop it first.'
        });
      }

      // Update fields
      if (name !== undefined) team.name = name;
      if (description !== undefined) team.description = description;
      if (agents !== undefined) team.agents = agents;

      const errors = team.validate();
      if (errors.length > 0) {
        return jsonResponse(res, 400, {
          error: 'Validation failed',
          errors
        });
      }

      await team.save();

      jsonResponse(res, 200, {
        team: team.toJSON(),
        message: `Team "${team.name}" updated successfully`
      });
    } catch (error) {
      console.error('[Teams API] Error updating team:', error);
      jsonResponse(res, 500, {
        error: 'Failed to update team',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/teams/:teamId
   * Delete a team
   */
  router.delete('/teams/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, {
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      // Delete will throw if team is running
      await team.delete();

      jsonResponse(res, 204, {});
    } catch (error) {
      console.error('[Teams API] Error deleting team:', error);

      const statusCode = error.message.includes('active run') ? 409 : 500;
      jsonResponse(res, statusCode, {
        error: 'Failed to delete team',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams/:teamId/start
   * Start all agents in a team
   */
  router.post('/teams/:teamId/start', async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, {
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const result = await teamRunner.startTeam(teamId);

      jsonResponse(res, 200, {
        ...result,
        message: `Team "${team.name}" started successfully with ${result.agentCount} agents`
      });
    } catch (error) {
      console.error('[Teams API] Error starting team:', error);

      const statusCode = error.message.includes('already running') ? 409 : 500;
      jsonResponse(res, statusCode, {
        error: 'Failed to start team',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams/:teamId/stop
   * Stop all agents in a team
   */
  router.post('/teams/:teamId/stop', async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, {
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const result = await teamRunner.stopTeam(teamId);

      jsonResponse(res, 200, {
        ...result,
        message: `Team "${team.name}" stopped successfully`
      });
    } catch (error) {
      console.error('[Teams API] Error stopping team:', error);

      const statusCode = error.message.includes('No active run') ? 404 : 500;
      jsonResponse(res, statusCode, {
        error: 'Failed to stop team',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/:teamId/status
   * Get current status of a team
   */
  router.get('/teams/:teamId/status', async (req, res) => {
    try {
      const { teamId } = req.params;

      const status = teamRunner.getTeamStatus(teamId);

      jsonResponse(res, 200, status);
    } catch (error) {
      console.error('[Teams API] Error getting team status:', error);

      const statusCode = error.message.includes('not found') ? 404 : 500;
      jsonResponse(res, statusCode, {
        error: 'Failed to get team status',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/:teamId/runs
   * Get run history for a team
   */
  router.get('/teams/:teamId/runs', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { limit = 10 } = req.query;

      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, {
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const runs = teamRunner.getTeamRunHistory(teamId, parseInt(limit));

      jsonResponse(res, 200, {
        teamId,
        teamName: team.name,
        runs,
        count: runs.length
      });
    } catch (error) {
      console.error('[Teams API] Error getting team runs:', error);
      jsonResponse(res, 500, {
        error: 'Failed to get team runs',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/runs/active
   * Get all currently active team runs
   */
  router.get('/teams/runs/active', async (req, res) => {
    try {
      const activeRuns = teamRunner.getActiveRuns();

      jsonResponse(res, 200, {
        runs: activeRuns,
        count: activeRuns.length
      });
    } catch (error) {
      console.error('[Teams API] Error getting active runs:', error);
      jsonResponse(res, 500, {
        error: 'Failed to get active runs',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams/runs/:runId/stop
   * Stop a specific team run
   */
  router.post('/teams/runs/:runId/stop', async (req, res) => {
    try {
      const { runId } = req.params;

      const result = await teamRunner.stopRun(runId);

      jsonResponse(res, 200, {
        ...result,
        message: 'Team run stopped successfully'
      });
    } catch (error) {
      console.error('[Teams API] Error stopping run:', error);

      const statusCode = error.message.includes('not active') ? 404 : 500;
      jsonResponse(res, statusCode, {
        error: 'Failed to stop run',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/runs/:runId/status
   * Get detailed status for a specific team run (Phase 6)
   */
  router.get('/teams/runs/:runId/status', async (req, res) => {
    try {
      const { runId } = req.params;

      const status = teamRunner.getRunStatus(runId);

      jsonResponse(res, 200, status);
    } catch (error) {
      console.error('[Teams API] Error getting run status:', error);

      const statusCode = error.message.includes('not found') ? 404 : 500;
      jsonResponse(res, statusCode, {
        error: 'Failed to get run status',
        message: error.message
      });
    }
  });

  console.log('[Teams API] ✓ Team management endpoints registered');
}

export default registerTeamRoutes;