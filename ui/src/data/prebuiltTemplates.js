// Pre-built Team Templates

import { generateTemplateId, autoLayoutAgents } from '../utils/templates.js';

/**
 * Feature Development Team
 *
 * Roles: PM, Designer, Frontend, Backend, Database, QA, Reviewer
 */
export const FEATURE_TEAM = {
  id: 'feature-team-v1',
  name: 'Feature Development Team',
  description: 'Full-stack feature development with design, implementation, and quality assurance',
  category: 'development',
  tags: ['feature', 'full-stack', 'agile'],
  agents: autoLayoutAgents([
    { role: 'Product Manager', type: 'claude-code', metadata: { responsibilities: ['Requirements', 'User Stories', 'Acceptance Criteria'] } },
    { role: 'Designer', type: 'claude-code', metadata: { responsibilities: ['UI/UX', 'Wireframes', 'Design System'] } },
    { role: 'Frontend Engineer', type: 'claude-code', metadata: { responsibilities: ['React', 'Components', 'State Management'] } },
    { role: 'Backend Engineer', type: 'claude-code', metadata: { responsibilities: ['API', 'Business Logic', 'Services'] } },
    { role: 'Database Engineer', type: 'claude-code', metadata: { responsibilities: ['Schema', 'Migrations', 'Queries'] } },
    { role: 'QA Engineer', type: 'claude-code', metadata: { responsibilities: ['Test Plans', 'Automation', 'Bug Reports'] } },
    { role: 'Code Reviewer', type: 'claude-code', metadata: { responsibilities: ['Code Quality', 'Best Practices', 'Security'] } }
  ]),
  connections: [
    { source: 'Product Manager', target: 'Designer', purpose: 'requirements' },
    { source: 'Designer', target: 'Frontend Engineer', purpose: 'design-handoff' },
    { source: 'Product Manager', target: 'Backend Engineer', purpose: 'requirements' },
    { source: 'Backend Engineer', target: 'Database Engineer', purpose: 'data-modeling' },
    { source: 'Frontend Engineer', target: 'Backend Engineer', purpose: 'api-contract' },
    { source: 'Frontend Engineer', target: 'QA Engineer', purpose: 'ui-testing' },
    { source: 'Backend Engineer', target: 'QA Engineer', purpose: 'api-testing' },
    { source: 'QA Engineer', target: 'Code Reviewer', purpose: 'test-results' },
    { source: 'Code Reviewer', target: 'Product Manager', purpose: 'sign-off' }
  ],
  workflow: {
    phases: ['planning', 'design', 'implementation', 'testing', 'review', 'deployment'],
    settings: { stepMode: true }
  }
};

/**
 * Hotfix Team
 *
 * Roles: Incident Commander, Debugger, Fixer, Tester
 */
export const HOTFIX_TEAM = {
  id: 'hotfix-team-v1',
  name: 'Hotfix Response Team',
  description: 'Rapid incident response and emergency bug fixes',
  category: 'operations',
  tags: ['hotfix', 'emergency', 'debugging'],
  agents: autoLayoutAgents([
    { role: 'Incident Commander', type: 'claude-code', metadata: { responsibilities: ['Triage', 'Communication', 'Decision Making'] } },
    { role: 'Debugger', type: 'claude-code', metadata: { responsibilities: ['Root Cause Analysis', 'Log Analysis', 'Reproduction'] } },
    { role: 'Fixer', type: 'claude-code', metadata: { responsibilities: ['Patch Development', 'Code Fix', 'Deployment'] } },
    { role: 'Tester', type: 'claude-code', metadata: { responsibilities: ['Verification', 'Regression Testing', 'Validation'] } }
  ], { columns: 2, spacing: 300 }),
  connections: [
    { source: 'Incident Commander', target: 'Debugger', purpose: 'investigation' },
    { source: 'Debugger', target: 'Fixer', purpose: 'findings' },
    { source: 'Fixer', target: 'Tester', purpose: 'patch-verification' },
    { source: 'Tester', target: 'Incident Commander', purpose: 'status-update' }
  ],
  workflow: {
    phases: ['triage', 'investigation', 'fix', 'verify', 'deploy'],
    settings: { stepMode: false }
  }
};

/**
 * Refactoring Team
 *
 * Roles: Architect, Senior Engineer, Performance Analyst, Test Engineer
 */
export const REFACTOR_TEAM = {
  id: 'refactor-team-v1',
  name: 'Code Refactoring Team',
  description: 'Architecture improvements and technical debt reduction',
  category: 'maintenance',
  tags: ['refactor', 'architecture', 'technical-debt'],
  agents: autoLayoutAgents([
    { role: 'Architect', type: 'claude-code', metadata: { responsibilities: ['Design Patterns', 'Architecture Review', 'Standards'] } },
    { role: 'Senior Engineer', type: 'claude-code', metadata: { responsibilities: ['Implementation', 'Code Migration', 'Best Practices'] } },
    { role: 'Performance Analyst', type: 'claude-code', metadata: { responsibilities: ['Profiling', 'Optimization', 'Benchmarking'] } },
    { role: 'Test Engineer', type: 'claude-code', metadata: { responsibilities: ['Test Coverage', 'Integration Tests', 'Safety Net'] } }
  ], { columns: 2, spacing: 300 }),
  connections: [
    { source: 'Architect', target: 'Senior Engineer', purpose: 'architecture-guidance' },
    { source: 'Senior Engineer', target: 'Performance Analyst', purpose: 'performance-review' },
    { source: 'Performance Analyst', target: 'Senior Engineer', purpose: 'optimization-recommendations' },
    { source: 'Senior Engineer', target: 'Test Engineer', purpose: 'refactored-code' },
    { source: 'Test Engineer', target: 'Architect', purpose: 'validation-results' }
  ],
  workflow: {
    phases: ['analysis', 'planning', 'refactoring', 'testing', 'validation'],
    settings: { stepMode: true }
  }
};

/**
 * Security Audit Team
 *
 * Roles: Auditor, Penetration Tester, Compliance Checker
 */
export const SECURITY_TEAM = {
  id: 'security-team-v1',
  name: 'Security Audit Team',
  description: 'Comprehensive security review and vulnerability assessment',
  category: 'security',
  tags: ['security', 'audit', 'compliance'],
  agents: autoLayoutAgents([
    { role: 'Security Auditor', type: 'claude-code', metadata: { responsibilities: ['Code Review', 'Threat Modeling', 'Risk Assessment'] } },
    { role: 'Penetration Tester', type: 'claude-code', metadata: { responsibilities: ['Vulnerability Testing', 'Exploit Analysis', 'Attack Simulation'] } },
    { role: 'Compliance Checker', type: 'claude-code', metadata: { responsibilities: ['OWASP', 'GDPR', 'Security Standards'] } }
  ], { columns: 3, spacing: 300 }),
  connections: [
    { source: 'Security Auditor', target: 'Penetration Tester', purpose: 'findings' },
    { source: 'Penetration Tester', target: 'Compliance Checker', purpose: 'vulnerabilities' },
    { source: 'Compliance Checker', target: 'Security Auditor', purpose: 'compliance-report' }
  ],
  workflow: {
    phases: ['audit', 'penetration-testing', 'compliance-check', 'reporting'],
    settings: { stepMode: true }
  }
};

/**
 * All pre-built templates
 */
export const PREBUILT_TEMPLATES = [
  FEATURE_TEAM,
  HOTFIX_TEAM,
  REFACTOR_TEAM,
  SECURITY_TEAM
];

/**
 * Get template by category
 */
export function getTemplatesByCategory(category) {
  return PREBUILT_TEMPLATES.filter(t => t.category === category);
}

/**
 * Search templates by tag
 */
export function searchTemplatesByTag(tag) {
  return PREBUILT_TEMPLATES.filter(t => t.tags && t.tags.includes(tag));
}
