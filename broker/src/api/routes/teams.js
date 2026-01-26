/**
 * Team API Routes
 * Phase 5: Team Lifecycle Management
 *
 * REST endpoints for team CRUD and lifecycle operations.
 */

import { Team } from '../../models/Team.js';
import { TeamRunner } from '../../services/TeamRunner.js';

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
  router.get('/api/teams', async (req, res) => {
    try {
      const { projectId, withStatus } = req.query;

      const teams = withStatus === 'true'
        ? Team.listWithStatus(projectId)
        : Team.list(projectId).map(t => t.toJSON());

      res.json({
        teams,
        count: teams.length
      });
    } catch (error) {
      console.error('[Teams API] Error listing teams:', error);
      res.status(500).json({
        error: 'Failed to list teams',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams
   * Create a new team
   */
  router.post('/api/teams', async (req, res) => {
    try {
      const { name, description, projectId, agents } = req.body;

      if (!name || !agents || !Array.isArray(agents) || agents.length === 0) {
        return res.status(400).json({
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
        return res.status(400).json({
          error: 'Validation failed',
          errors
        });
      }

      await team.save();

      res.status(201).json({
        team: team.toJSON(),
        message: `Team "${team.name}" created successfully`
      });
    } catch (error) {
      console.error('[Teams API] Error creating team:', error);
      res.status(500).json({
        error: 'Failed to create team',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/:teamId
   * Get a specific team by ID
   */
  router.get('/api/teams/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { includeConfigs, includeStatus } = req.query;

      const team = Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
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

      res.json(response);
    } catch (error) {
      console.error('[Teams API] Error getting team:', error);
      res.status(500).json({
        error: 'Failed to get team',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/teams/:teamId
   * Update a team
   */
  router.put('/api/teams/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { name, description, agents } = req.body;

      const team = Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      // Check if team is running
      const status = team.getStatus();
      if (status.status === 'running') {
        return res.status(409).json({
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
        return res.status(400).json({
          error: 'Validation failed',
          errors
        });
      }

      await team.save();

      res.json({
        team: team.toJSON(),
        message: `Team "${team.name}" updated successfully`
      });
    } catch (error) {
      console.error('[Teams API] Error updating team:', error);
      res.status(500).json({
        error: 'Failed to update team',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/teams/:teamId
   * Delete a team
   */
  router.delete('/api/teams/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      // Delete will throw if team is running
      await team.delete();

      res.status(204).send();
    } catch (error) {
      console.error('[Teams API] Error deleting team:', error);

      const statusCode = error.message.includes('active run') ? 409 : 500;
      res.status(statusCode).json({
        error: 'Failed to delete team',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams/:teamId/start
   * Start all agents in a team
   */
  router.post('/api/teams/:teamId/start', async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const result = await teamRunner.startTeam(teamId);

      res.json({
        ...result,
        message: `Team "${team.name}" started successfully with ${result.agentCount} agents`
      });
    } catch (error) {
      console.error('[Teams API] Error starting team:', error);

      const statusCode = error.message.includes('already running') ? 409 : 500;
      res.status(statusCode).json({
        error: 'Failed to start team',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams/:teamId/stop
   * Stop all agents in a team
   */
  router.post('/api/teams/:teamId/stop', async (req, res) => {
    try {
      const { teamId } = req.params;

      const team = Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const result = await teamRunner.stopTeam(teamId);

      res.json({
        ...result,
        message: `Team "${team.name}" stopped successfully`
      });
    } catch (error) {
      console.error('[Teams API] Error stopping team:', error);

      const statusCode = error.message.includes('No active run') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to stop team',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/:teamId/status
   * Get current status of a team
   */
  router.get('/api/teams/:teamId/status', async (req, res) => {
    try {
      const { teamId } = req.params;

      const status = teamRunner.getTeamStatus(teamId);

      res.json(status);
    } catch (error) {
      console.error('[Teams API] Error getting team status:', error);

      const statusCode = error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to get team status',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/:teamId/runs
   * Get run history for a team
   */
  router.get('/api/teams/:teamId/runs', async (req, res) => {
    try {
      const { teamId } = req.params;
      const { limit = 10 } = req.query;

      const team = Team.findById(teamId);
      if (!team) {
        return res.status(404).json({
          error: 'Team not found',
          message: `Team with ID ${teamId} does not exist`
        });
      }

      const runs = teamRunner.getTeamRunHistory(teamId, parseInt(limit));

      res.json({
        teamId,
        teamName: team.name,
        runs,
        count: runs.length
      });
    } catch (error) {
      console.error('[Teams API] Error getting team runs:', error);
      res.status(500).json({
        error: 'Failed to get team runs',
        message: error.message
      });
    }
  });

  /**
   * GET /api/teams/runs/active
   * Get all currently active team runs
   */
  router.get('/api/teams/runs/active', async (req, res) => {
    try {
      const activeRuns = teamRunner.getActiveRuns();

      res.json({
        runs: activeRuns,
        count: activeRuns.length
      });
    } catch (error) {
      console.error('[Teams API] Error getting active runs:', error);
      res.status(500).json({
        error: 'Failed to get active runs',
        message: error.message
      });
    }
  });

  /**
   * POST /api/teams/runs/:runId/stop
   * Stop a specific team run
   */
  router.post('/api/teams/runs/:runId/stop', async (req, res) => {
    try {
      const { runId } = req.params;

      const result = await teamRunner.stopRun(runId);

      res.json({
        ...result,
        message: 'Team run stopped successfully'
      });
    } catch (error) {
      console.error('[Teams API] Error stopping run:', error);

      const statusCode = error.message.includes('not active') ? 404 : 500;
      res.status(statusCode).json({
        error: 'Failed to stop run',
        message: error.message
      });
    }
  });

  console.log('[Teams API] ✓ Team management endpoints registered');
}

export default registerTeamRoutes;