/**
 * Conversations API Routes
 * Phase 6: Team Monitoring & Visibility
 *
 * Endpoints for reading agent conversation logs
 */

import { ConversationLogReader } from '../../services/ConversationLogReader.js';
import { Team } from '../../models/Team.js';
import { jsonResponse } from '../../utils/response.js';

/**
 * Register conversation routes on the API router
 * @param {Object} router - API router instance
 */
export function registerConversationRoutes(router) {
  /**
   * GET /api/conversations/agents
   * List all agents with available conversation logs
   */
  router.get('/conversations/agents', async (req, res) => {
    try {
      const agents = await ConversationLogReader.listAvailableLogs();
      jsonResponse(res, 200, { agents, count: agents.length });
    } catch (error) {
      console.error('[Conversations API] Error listing agents:', error);
      jsonResponse(res, 500, { error: error.message });
    }
  });

  /**
   * GET /api/conversations/agent/:agentId
   * Get conversation log for a specific agent
   *
   * Query params:
   * - offset: Starting index (default: 0)
   * - limit: Max entries to return (default: 100)
   * - includeSystem: Include system messages (default: false)
   */
  router.get('/conversations/agent/:agentId', async (req, res) => {
    try {
      const { agentId } = req.params;
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 100;
      const includeSystem = req.query.includeSystem === 'true';

      const conversation = await ConversationLogReader.readAgentConversation(agentId, {
        offset,
        limit,
        includeSystem
      });

      jsonResponse(res, 200, {
        agentId,
        entries: conversation,
        count: conversation.length,
        pagination: { offset, limit }
      });
    } catch (error) {
      console.error(`[Conversations API] Error reading agent ${req.params.agentId}:`, error);
      jsonResponse(res, 500, { error: error.message });
    }
  });

  /**
   * GET /api/conversations/agent/:agentId/stats
   * Get statistics for an agent's conversation log
   */
  router.get('/conversations/agent/:agentId/stats', async (req, res) => {
    try {
      const { agentId } = req.params;
      const stats = await ConversationLogReader.getStats(agentId);

      jsonResponse(res, 200, { agentId, ...stats });
    } catch (error) {
      console.error(`[Conversations API] Error getting stats for ${req.params.agentId}:`, error);
      jsonResponse(res, 500, { error: error.message });
    }
  });

  /**
   * GET /api/conversations/team/:teamId
   * Get merged conversation log for all agents in a team
   *
   * Query params:
   * - offset: Starting index (default: 0)
   * - limit: Max entries to return (default: 100)
   * - includeSystem: Include system messages (default: false)
   */
  router.get('/conversations/team/:teamId', async (req, res) => {
    try {
      const { teamId } = req.params;
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 100;
      const includeSystem = req.query.includeSystem === 'true';

      // Get team configuration
      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, { error: 'Team not found' });
      }

      // Get agent configs to extract agent names
      const configs = team.getAgentConfigs();
      const agentIds = configs.map(c => c.name);

      // Read and merge conversations
      const conversation = await ConversationLogReader.readTeamConversation(agentIds, {
        offset,
        limit,
        includeSystem
      });

      jsonResponse(res, 200, {
        teamId,
        teamName: team.name,
        agents: agentIds,
        entries: conversation,
        count: conversation.length,
        pagination: { offset, limit }
      });
    } catch (error) {
      console.error(`[Conversations API] Error reading team ${req.params.teamId}:`, error);
      jsonResponse(res, 500, { error: error.message });
    }
  });

  /**
   * GET /api/conversations/team/:teamId/summary
   * Get summary statistics for a team's conversation
   */
  router.get('/conversations/team/:teamId/summary', async (req, res) => {
    try {
      const { teamId } = req.params;

      // Get team configuration
      const team = Team.findById(teamId);
      if (!team) {
        return jsonResponse(res, 404, { error: 'Team not found' });
      }

      // Get agent configs
      const configs = team.getAgentConfigs();
      const agentIds = configs.map(c => c.name);

      // Get stats for each agent
      const agentStats = await Promise.all(
        agentIds.map(async (agentId) => {
          const stats = await ConversationLogReader.getStats(agentId);
          return { agentId, ...stats };
        })
      );

      // Calculate totals
      const totalMessages = agentStats.reduce((sum, s) => sum + (s.messagesSent || 0) + (s.messagesReceived || 0), 0);
      const totalEntries = agentStats.reduce((sum, s) => sum + (s.totalEntries || 0), 0);

      jsonResponse(res, 200, {
        teamId,
        teamName: team.name,
        agents: agentStats,
        summary: {
          totalMessages,
          totalEntries,
          agentCount: agentIds.length
        }
      });
    } catch (error) {
      console.error(`[Conversations API] Error getting team summary ${req.params.teamId}:`, error);
      jsonResponse(res, 500, { error: error.message });
    }
  });
}
