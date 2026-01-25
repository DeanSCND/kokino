/**
 * Projects API Routes
 *
 * Manages projects as containers for agents.
 * Projects provide workspaces with their own context and configuration.
 */

import { randomUUID } from 'node:crypto';
import { jsonResponse } from '../../utils/response.js';
import db from '../../db/schema.js';

/**
 * Create project route handlers
 */
export function createProjectRoutes() {

  // Prepare statements for better performance
  const listProjects = db.prepare(`
    SELECT * FROM projects
    ORDER BY updated_at DESC
  `);

  const getProject = db.prepare(`
    SELECT * FROM projects
    WHERE id = ?
  `);

  const createProject = db.prepare(`
    INSERT INTO projects (id, name, workspace_path, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateProject = db.prepare(`
    UPDATE projects
    SET name = ?, workspace_path = ?, description = ?, updated_at = ?
    WHERE id = ?
  `);

  const deleteProject = db.prepare(`
    DELETE FROM projects
    WHERE id = ?
  `);

  const getProjectAgents = db.prepare(`
    SELECT * FROM agents
    WHERE project_id = ?
    ORDER BY created_at DESC
  `);

  const countProjectAgents = db.prepare(`
    SELECT COUNT(*) as count FROM agents
    WHERE project_id = ?
  `);

  return {
    /**
     * GET /api/projects
     * List all projects
     */
    async listProjects(req, res) {
      try {
        const projects = listProjects.all();

        // Add agent count to each project
        const projectsWithStats = projects.map(project => {
          const agentCount = countProjectAgents.get(project.id);
          return {
            ...project,
            agentCount: agentCount?.count || 0
          };
        });

        jsonResponse(res, 200, projectsWithStats);
      } catch (error) {
        console.error('[Projects] List error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * POST /api/projects
     * Create new project
     */
    async createProject(req, res) {
      try {
        const { name, workspacePath, description } = req.body;

        if (!name) {
          return jsonResponse(res, 400, { error: 'Project name is required' });
        }

        const projectId = randomUUID();
        const now = new Date().toISOString();

        const result = createProject.run(
          projectId,
          name,
          workspacePath || null,
          description || null,
          now,
          now
        );

        if (result.changes === 0) {
          throw new Error('Failed to create project');
        }

        const newProject = getProject.get(projectId);
        jsonResponse(res, 201, newProject);

      } catch (error) {
        console.error('[Projects] Create error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * GET /api/projects/:id
     * Get project details
     */
    async getProject(req, res) {
      try {
        const projectId = req.params.id;

        const project = getProject.get(projectId);
        if (!project) {
          return jsonResponse(res, 404, { error: 'Project not found' });
        }

        // Add agent count
        const agentCount = countProjectAgents.get(projectId);
        project.agentCount = agentCount?.count || 0;

        jsonResponse(res, 200, project);

      } catch (error) {
        console.error('[Projects] Get error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * PUT /api/projects/:id
     * Update project
     */
    async updateProject(req, res) {
      try {
        const projectId = req.params.id;
        const { name, workspacePath, description } = req.body;

        // Check if project exists
        const existing = getProject.get(projectId);
        if (!existing) {
          return jsonResponse(res, 404, { error: 'Project not found' });
        }

        // Prevent updating default project ID
        if (projectId === 'default') {
          return jsonResponse(res, 400, {
            error: 'Cannot modify default project. Create a new project instead.'
          });
        }

        const now = new Date().toISOString();
        const result = updateProject.run(
          name || existing.name,
          workspacePath !== undefined ? workspacePath : existing.workspace_path,
          description !== undefined ? description : existing.description,
          now,
          projectId
        );

        if (result.changes === 0) {
          throw new Error('Failed to update project');
        }

        const updated = getProject.get(projectId);
        jsonResponse(res, 200, updated);

      } catch (error) {
        console.error('[Projects] Update error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * DELETE /api/projects/:id
     * Delete project (and cascade delete agents)
     */
    async deleteProject(req, res) {
      try {
        const projectId = req.params.id;

        // Prevent deleting default project
        if (projectId === 'default') {
          return jsonResponse(res, 400, {
            error: 'Cannot delete default project'
          });
        }

        // Check if project exists
        const existing = getProject.get(projectId);
        if (!existing) {
          return jsonResponse(res, 404, { error: 'Project not found' });
        }

        // Check for agents
        const agentCount = countProjectAgents.get(projectId);
        if (agentCount?.count > 0) {
          return jsonResponse(res, 400, {
            error: `Cannot delete project with ${agentCount.count} active agents. Delete or migrate agents first.`
          });
        }

        const result = deleteProject.run(projectId);
        if (result.changes === 0) {
          throw new Error('Failed to delete project');
        }

        jsonResponse(res, 200, {
          success: true,
          message: `Project ${existing.name} deleted`
        });

      } catch (error) {
        console.error('[Projects] Delete error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * GET /api/projects/:id/agents
     * List agents in project
     */
    async getProjectAgents(req, res) {
      try {
        const projectId = req.params.id;

        // Check if project exists
        const project = getProject.get(projectId);
        if (!project) {
          return jsonResponse(res, 404, { error: 'Project not found' });
        }

        const agents = getProjectAgents.all(projectId);
        jsonResponse(res, 200, {
          project,
          agents
        });

      } catch (error) {
        console.error('[Projects] Get agents error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    }
  };
}

/**
 * Register project routes on router
 */
export function registerProjectRoutes(router) {
  const handlers = createProjectRoutes();

  router.get('/projects', handlers.listProjects);
  router.post('/projects', handlers.createProject);
  router.get('/projects/:id', handlers.getProject);
  router.put('/projects/:id', handlers.updateProject);
  router.delete('/projects/:id', handlers.deleteProject);
  router.get('/projects/:id/agents', handlers.getProjectAgents);

  console.log('[Projects] Registered 6 project endpoints');
}