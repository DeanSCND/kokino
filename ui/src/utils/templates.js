// Team Template Schema and Utilities

/**
 * Template Schema
 *
 * @typedef {Object} AgentDefinition
 * @property {string} role - Agent role/name
 * @property {string} type - Agent type (claude-code, droid, etc)
 * @property {Object} position - Canvas position {x, y}
 * @property {Object} [metadata] - Optional metadata
 *
 * @typedef {Object} ConnectionDefinition
 * @property {string} source - Source agent role
 * @property {string} target - Target agent role
 * @property {string} [purpose] - Connection purpose
 *
 * @typedef {Object} WorkflowDefinition
 * @property {string[]} phases - Workflow phases
 * @property {Object} [settings] - Workflow settings
 *
 * @typedef {Object} VersionHistoryEntry
 * @property {string} version - Version number
 * @property {string} timestamp - ISO timestamp
 * @property {string} changes - Summary of changes
 *
 * @typedef {Object} TeamTemplate
 * @property {string} id - Unique template ID
 * @property {string} name - Template name
 * @property {string} description - Template description
 * @property {string} version - Template version (semantic versioning)
 * @property {string} category - Template category
 * @property {AgentDefinition[]} agents - Agent definitions
 * @property {ConnectionDefinition[]} connections - Connection definitions
 * @property {WorkflowDefinition} [workflow] - Optional workflow definition
 * @property {string[]} [tags] - Search tags
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 * @property {VersionHistoryEntry[]} [versionHistory] - Version history (last 10)
 */

const TEMPLATE_VERSION = '1.0.0';
const STORAGE_KEY = 'kokino_templates';

/**
 * Template Storage Utilities
 */
export const TemplateStorage = {
  /**
   * Get all templates from localStorage
   */
  getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[templates] Failed to load templates:', error);
      return [];
    }
  },

  /**
   * Get template by ID
   */
  getById(id) {
    const templates = this.getAll();
    return templates.find(t => t.id === id);
  },

  /**
   * Save template (create or update)
   */
  save(template) {
    const templates = this.getAll();
    const existingIndex = templates.findIndex(t => t.id === template.id);
    const existing = existingIndex >= 0 ? templates[existingIndex] : null;

    const now = new Date().toISOString();

    // Version control: bump version if updating existing template
    let newVersion = template.version || '1.0.0';
    if (existing && existing.version) {
      newVersion = bumpVersion(existing.version, 'patch');
    }

    const updatedTemplate = {
      ...template,
      version: newVersion,
      updatedAt: now,
      createdAt: template.createdAt || now,
      versionHistory: [
        ...(existing?.versionHistory || []),
        {
          version: newVersion,
          timestamp: now,
          changes: template.changesSummary || (existing ? 'Template updated' : 'Template created')
        }
      ].slice(-10) // Keep last 10 versions
    };

    if (existingIndex >= 0) {
      templates[existingIndex] = updatedTemplate;
    } else {
      templates.push(updatedTemplate);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    return updatedTemplate;
  },

  /**
   * Delete template by ID
   */
  delete(id) {
    const templates = this.getAll();
    const filtered = templates.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered.length < templates.length;
  },

  /**
   * Export template as JSON file
   */
  export(template) {
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Import template from JSON file
   */
  async import(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const template = JSON.parse(e.target.result);
          const validated = validateTemplate(template);
          if (validated.valid) {
            resolve(template);
          } else {
            reject(new Error(`Invalid template: ${validated.errors.join(', ')}`));
          }
        } catch (error) {
          reject(new Error('Failed to parse JSON'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
};

/**
 * Validate template structure
 */
export function validateTemplate(template) {
  const errors = [];

  // Required fields
  if (!template.id) errors.push('Missing template ID');
  if (!template.name) errors.push('Missing template name');
  if (!template.description) errors.push('Missing description');
  if (!Array.isArray(template.agents)) errors.push('Missing agents array');
  if (!Array.isArray(template.connections)) errors.push('Missing connections array');

  // Validate agents
  if (template.agents) {
    template.agents.forEach((agent, i) => {
      if (!agent.role) errors.push(`Agent ${i}: missing role`);
      if (!agent.type) errors.push(`Agent ${i}: missing type`);
      if (!agent.position || typeof agent.position.x !== 'number' || typeof agent.position.y !== 'number') {
        errors.push(`Agent ${i}: invalid position`);
      }
    });
  }

  // Validate connections
  if (template.connections && template.agents) {
    const roles = new Set(template.agents.map(a => a.role));
    template.connections.forEach((conn, i) => {
      if (!conn.source) errors.push(`Connection ${i}: missing source`);
      if (!conn.target) errors.push(`Connection ${i}: missing target`);
      if (conn.source && !roles.has(conn.source)) {
        errors.push(`Connection ${i}: source role '${conn.source}' not found`);
      }
      if (conn.target && !roles.has(conn.target)) {
        errors.push(`Connection ${i}: target role '${conn.target}' not found`);
      }
      if (conn.source === conn.target) {
        errors.push(`Connection ${i}: self-loop not allowed`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate unique template ID
 */
export function generateTemplateId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const timestamp = Date.now().toString(36);
  return `${slug}-${timestamp}`;
}

/**
 * Calculate grid positions for agents
 */
export function autoLayoutAgents(agents, options = {}) {
  const {
    startX = 100,
    startY = 100,
    spacing = 250,
    columns = 3
  } = options;

  return agents.map((agent, i) => ({
    ...agent,
    position: {
      x: startX + (i % columns) * spacing,
      y: startY + Math.floor(i / columns) * spacing
    }
  }));
}

/**
 * Bump semantic version
 * @param {string} version - Current version (e.g., '1.2.3')
 * @param {string} type - Version bump type: 'major', 'minor', or 'patch'
 * @returns {string} New version
 */
export function bumpVersion(version, type = 'patch') {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return '1.0.0'; // Reset to 1.0.0 if invalid
  }

  const [major, minor, patch] = parts;

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}
