/**
 * Agent Configuration API Routes
 *
 * Phase 2: Configurable Agents
 * Provides CRUD operations for agent templates and configurations.
 */

import { jsonResponse } from '../../utils/response.js';
import { AgentConfig } from '../../models/AgentConfig.js';

/**
 * Create agent configuration route handlers
 */
export function createAgentConfigRoutes(registry) {
  const handlers = {
    /**
     * List all agent configurations
     * GET /api/agents
     */
    listAgents: (req, res) => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const projectId = url.searchParams.get('project_id');
        const role = url.searchParams.get('role');
        const capability = url.searchParams.get('capability');

        let configs;

        if (capability) {
          configs = AgentConfig.findByCapability(capability, projectId);
        } else if (role) {
          configs = AgentConfig.findByRole(role, projectId);
        } else {
          configs = AgentConfig.listAll(projectId);
        }

        const response = configs.map(config => config.toJSON());

        jsonResponse(res, 200, response);
      } catch (error) {
        console.error('[api/agents] Failed to list agents:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Create new agent configuration
     * POST /api/agents
     */
    createAgent: (req, res) => {
      try {
        const data = req.body || {};

        // Create and validate new config
        const config = new AgentConfig({
          projectId: data.projectId || 'default',
          name: data.name,
          role: data.role,
          cliType: data.cliType || 'claude-code',
          systemPrompt: data.systemPrompt,
          workingDirectory: data.workingDirectory,
          bootstrapMode: data.bootstrapMode || 'auto',
          bootstrapScript: data.bootstrapScript,
          capabilities: data.capabilities || [],
          metadata: data.metadata || {}
        });

        // Validate
        const errors = config.validate();
        if (errors.length > 0) {
          return jsonResponse(res, 400, {
            error: 'Validation failed',
            details: errors
          });
        }

        // Save to database
        config.save();

        console.log(`[api/agents] Created agent config: ${config.name} (${config.id})`);

        jsonResponse(res, 201, {
          success: true,
          agent: config.toJSON()
        });
      } catch (error) {
        console.error('[api/agents] Failed to create agent:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Get specific agent configuration
     * GET /api/agents/:id
     */
    getAgent: (req, res, params) => {
      try {
        const config = AgentConfig.findById(params.id);

        if (!config) {
          return jsonResponse(res, 404, { error: 'Agent configuration not found' });
        }

        jsonResponse(res, 200, config.toJSON());
      } catch (error) {
        console.error('[api/agents] Failed to get agent:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Update agent configuration
     * PUT /api/agents/:id
     */
    updateAgent: (req, res, params) => {
      try {
        const data = req.body || {};

        // Find existing config
        const config = AgentConfig.findById(params.id);
        if (!config) {
          return jsonResponse(res, 404, { error: 'Agent configuration not found' });
        }

        // Update fields
        if (data.name !== undefined) config.name = data.name;
        if (data.role !== undefined) config.role = data.role;
        if (data.cliType !== undefined) config.cliType = data.cliType;
        if (data.systemPrompt !== undefined) config.systemPrompt = data.systemPrompt;
        if (data.workingDirectory !== undefined) config.workingDirectory = data.workingDirectory;
        if (data.bootstrapMode !== undefined) config.bootstrapMode = data.bootstrapMode;
        if (data.bootstrapScript !== undefined) config.bootstrapScript = data.bootstrapScript;
        if (data.capabilities !== undefined) config.capabilities = data.capabilities;
        if (data.metadata !== undefined) config.metadata = data.metadata;

        // Validate
        const errors = config.validate();
        if (errors.length > 0) {
          return jsonResponse(res, 400, {
            error: 'Validation failed',
            details: errors
          });
        }

        // Save changes
        config.save();

        console.log(`[api/agents] Updated agent config: ${config.name} (${config.id})`);

        jsonResponse(res, 200, {
          success: true,
          agent: config.toJSON()
        });
      } catch (error) {
        console.error('[api/agents] Failed to update agent:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Delete agent configuration
     * DELETE /api/agents/:id
     */
    deleteAgent: (req, res, params) => {
      try {
        const config = AgentConfig.findById(params.id);

        if (!config) {
          return jsonResponse(res, 404, { error: 'Agent configuration not found' });
        }

        const deleted = config.delete();

        if (!deleted) {
          return jsonResponse(res, 500, { error: 'Failed to delete agent configuration' });
        }

        console.log(`[api/agents] Deleted agent config: ${config.name} (${config.id})`);

        jsonResponse(res, 200, {
          success: true,
          message: `Agent configuration ${config.name} deleted`
        });
      } catch (error) {
        console.error('[api/agents] Failed to delete agent:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Clone agent configuration
     * POST /api/agents/:id/clone
     */
    cloneAgent: (req, res, params) => {
      try {
        const data = req.body || {};

        // Find original config
        const original = AgentConfig.findById(params.id);
        if (!original) {
          return jsonResponse(res, 404, { error: 'Agent configuration not found' });
        }

        // Clone with optional new name
        const clone = original.clone(data.name);

        console.log(`[api/agents] Cloned agent config: ${original.name} -> ${clone.name}`);

        jsonResponse(res, 201, {
          success: true,
          agent: clone.toJSON()
        });
      } catch (error) {
        console.error('[api/agents] Failed to clone agent:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Instantiate agent from configuration
     * POST /api/agents/:id/instantiate
     *
     * Creates a runtime agent from a configuration template
     */
    instantiateAgent: (req, res, params) => {
      try {
        const data = req.body || {};

        // Find config
        const config = AgentConfig.findById(params.id);
        if (!config) {
          return jsonResponse(res, 404, { error: 'Agent configuration not found' });
        }

        // Generate runtime agent data
        const agentData = config.instantiate(data.name);

        // Register the agent with correct options object
        const agent = registry.register(agentData.agentId, {
          type: agentData.type,
          metadata: {
            ...agentData.metadata,
            configId: config.id,
            commMode: agentData.commMode,
            projectId: config.projectId
          }
        });

        console.log(`[api/agents] Instantiated agent ${agent.agentId} from config ${config.name}`);

        jsonResponse(res, 201, {
          success: true,
          agent: {
            agentId: agent.agentId,
            configId: config.id,
            projectId: config.projectId,
            type: agent.type,
            status: agent.status,
            metadata: agent.metadata
          }
        });
      } catch (error) {
        console.error('[api/agents] Failed to instantiate agent:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Get agent configurations for a project
     * GET /api/projects/:id/agent-configs
     */
    getProjectAgents: (req, res, params) => {
      try {
        const configs = AgentConfig.findByProject(params.id);
        const response = configs.map(config => config.toJSON());

        jsonResponse(res, 200, response);
      } catch (error) {
        console.error('[api/agents] Failed to get project agents:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };

  return handlers;
}

/**
 * Register agent configuration routes on router
 * @param {APIRouter} router - Router instance
 * @param {object} deps - Dependencies (registry, etc.)
 */
export function registerAgentConfigRoutes(router, deps) {
  const handlers = createAgentConfigRoutes(deps.registry);

  // Agent configuration endpoints
  router.get('/agents', handlers.listAgents);
  router.post('/agents', handlers.createAgent);
  router.get('/agents/:id', handlers.getAgent);
  router.put('/agents/:id', handlers.updateAgent);
  router.delete('/agents/:id', handlers.deleteAgent);

  // Special operations
  router.post('/agents/:id/clone', handlers.cloneAgent);
  router.post('/agents/:id/instantiate', handlers.instantiateAgent);

  // Project-specific listing
  router.get('/projects/:id/agent-configs', handlers.getProjectAgents);

  console.log('[api/agents] ✓ Agent configuration routes registered');
}

export default createAgentConfigRoutes;