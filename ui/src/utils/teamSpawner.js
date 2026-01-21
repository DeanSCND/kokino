/**
 * Team Spawning Utilities (Phase 9)
 * Maps GitHub issue labels to agent teams and generates team configurations
 */

/**
 * Label-to-Role Mapping
 * Maps common GitHub issue labels to agent roles
 */
const LABEL_TO_ROLE_MAP = {
  // Frontend labels
  'frontend': 'Frontend',
  'ui': 'Frontend',
  'react': 'Frontend',
  'vue': 'Frontend',
  'angular': 'Frontend',

  // Backend labels
  'backend': 'Backend',
  'api': 'Backend',
  'server': 'Backend',
  'database': 'Backend',

  // DevOps labels
  'devops': 'DevOps',
  'infrastructure': 'DevOps',
  'deployment': 'DevOps',
  'ci/cd': 'DevOps',

  // QA labels
  'testing': 'QA',
  'qa': 'QA',
  'bug': 'QA',
  'quality': 'QA',

  // Documentation labels
  'documentation': 'Tech Writer',
  'docs': 'Tech Writer',

  // Design labels
  'design': 'Designer',
  'ux': 'Designer',
  'ui/ux': 'Designer',

  // Management labels
  'planning': 'Product Manager',
  'product': 'Product Manager',
  'feature': 'Product Manager',
  'enhancement': 'Product Manager',

  // Technical leadership
  'architecture': 'Tech Lead',
  'refactor': 'Tech Lead',
  'tech-debt': 'Tech Lead'
};

/**
 * Default team configuration for issues without specific labels
 */
const DEFAULT_TEAM = [
  { role: 'Product Manager', position: { x: 100, y: 100 } },
  { role: 'Tech Lead', position: { x: 450, y: 100 } },
  { role: 'Backend', position: { x: 100, y: 400 } },
  { role: 'Frontend', position: { x: 450, y: 400 } }
];

/**
 * Parse GitHub issue labels and map them to agent roles
 * @param {Array} labels - GitHub issue labels
 * @returns {Array} Array of unique agent roles
 */
export function parseLabelsToRoles(labels) {
  if (!labels || labels.length === 0) {
    return DEFAULT_TEAM.map(agent => agent.role);
  }

  const roles = new Set();

  for (const label of labels) {
    const labelName = label.name.toLowerCase();
    const role = LABEL_TO_ROLE_MAP[labelName];

    if (role) {
      roles.add(role);
    }
  }

  // If no matching labels, use default team
  if (roles.size === 0) {
    return DEFAULT_TEAM.map(agent => agent.role);
  }

  // Always include Product Manager for coordination
  roles.add('Product Manager');

  // If we have implementation roles, add Tech Lead
  if (roles.has('Frontend') || roles.has('Backend')) {
    roles.add('Tech Lead');
  }

  return Array.from(roles);
}

/**
 * Generate team template from GitHub issue
 * @param {Object} issue - GitHub issue object
 * @returns {Object} Team template compatible with TemplateLibrary format
 */
export function generateTeamFromIssue(issue) {
  const roles = parseLabelsToRoles(issue.labels);

  // Create agents with grid positioning
  const agents = roles.map((role, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const gridSpacing = 350;

    return {
      role,
      type: 'claude-code',
      position: {
        x: 100 + (col * gridSpacing),
        y: 100 + (row * gridSpacing)
      },
      metadata: {
        issueNumber: issue.number,
        issueTitle: issue.title,
        repository: issue.repository_url,
        labels: issue.labels.map(l => l.name)
      }
    };
  });

  // Create connections: Product Manager → Tech Lead → Implementation
  const connections = [];

  const pmIndex = agents.findIndex(a => a.role === 'Product Manager');
  const tlIndex = agents.findIndex(a => a.role === 'Tech Lead');

  if (pmIndex !== -1 && tlIndex !== -1) {
    connections.push({
      source: 'Product Manager',
      target: 'Tech Lead',
      purpose: 'requirements'
    });
  }

  // Tech Lead → Implementation roles
  if (tlIndex !== -1) {
    const implementationRoles = ['Frontend', 'Backend', 'DevOps'];
    agents.forEach(agent => {
      if (implementationRoles.includes(agent.role)) {
        connections.push({
          source: 'Tech Lead',
          target: agent.role,
          purpose: 'implementation'
        });
      }
    });
  }

  // Add QA connections if QA role exists
  const qaIndex = agents.findIndex(a => a.role === 'QA');
  if (qaIndex !== -1) {
    // Frontend/Backend → QA
    agents.forEach(agent => {
      if (['Frontend', 'Backend'].includes(agent.role)) {
        connections.push({
          source: agent.role,
          target: 'QA',
          purpose: 'testing'
        });
      }
    });
  }

  return {
    name: `Issue #${issue.number}: ${issue.title}`,
    description: issue.body ? issue.body.substring(0, 200) + '...' : 'Auto-generated from GitHub issue',
    category: 'GitHub',
    agents,
    connections,
    metadata: {
      source: 'github-issue',
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      createdAt: new Date().toISOString()
    }
  };
}

/**
 * Estimate team size from issue complexity
 * Uses issue labels, description length, and comments count
 * @param {Object} issue - GitHub issue object
 * @returns {string} Size estimate: 'small' | 'medium' | 'large'
 */
export function estimateTeamSize(issue) {
  let score = 0;

  // Label-based scoring
  const complexityLabels = ['architecture', 'refactor', 'tech-debt', 'feature'];
  if (issue.labels.some(l => complexityLabels.includes(l.name.toLowerCase()))) {
    score += 2;
  }

  // Description length
  if (issue.body && issue.body.length > 500) {
    score += 1;
  }

  // Comments count (if available)
  if (issue.comments > 5) {
    score += 1;
  }

  // Multiple labels = more complex
  if (issue.labels.length > 3) {
    score += 1;
  }

  if (score <= 2) return 'small';
  if (score <= 4) return 'medium';
  return 'large';
}

/**
 * Generate suggested labels based on issue content
 * Uses simple keyword matching
 * @param {Object} issue - GitHub issue object
 * @returns {Array} Suggested label names
 */
export function suggestLabels(issue) {
  const suggestions = [];
  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();

  const patterns = {
    'frontend': /\b(ui|frontend|react|vue|component|interface)\b/,
    'backend': /\b(api|backend|server|database|endpoint)\b/,
    'bug': /\b(bug|error|crash|issue|problem|broken)\b/,
    'testing': /\b(test|qa|quality|coverage)\b/,
    'documentation': /\b(docs|documentation|readme|guide)\b/,
    'enhancement': /\b(feature|enhancement|improvement|add)\b/,
    'devops': /\b(deploy|ci|cd|docker|kubernetes|infrastructure)\b/
  };

  for (const [label, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      suggestions.push(label);
    }
  }

  return suggestions;
}
