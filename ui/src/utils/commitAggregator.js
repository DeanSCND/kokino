/**
 * Commit Aggregation System (Phase 9)
 * Collects commits from multiple agents and batches them for PR submission
 */

/**
 * CommitQueue class - manages staged commits from agents
 */
export class CommitQueue {
  constructor() {
    this.commits = []; // Array of { agentName, file, content, message, timestamp }
    this.listeners = [];
  }

  /**
   * Add commit to queue
   */
  addCommit(agentName, file) {
    const commit = {
      id: `commit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentName,
      file,
      timestamp: Date.now(),
      status: 'pending' // pending | included | excluded
    };

    this.commits.push(commit);
    this.notifyListeners();

    console.log('[CommitQueue] Added commit:', commit);
    return commit.id;
  }

  /**
   * Remove commit from queue
   */
  removeCommit(commitId) {
    this.commits = this.commits.filter(c => c.id !== commitId);
    this.notifyListeners();
    console.log('[CommitQueue] Removed commit:', commitId);
  }

  /**
   * Update commit status
   */
  updateCommitStatus(commitId, status) {
    const commit = this.commits.find(c => c.id === commitId);
    if (commit) {
      commit.status = status;
      this.notifyListeners();
    }
  }

  /**
   * Get all commits
   */
  getCommits() {
    return [...this.commits];
  }

  /**
   * Get commits by agent
   */
  getCommitsByAgent(agentName) {
    return this.commits.filter(c => c.agentName === agentName);
  }

  /**
   * Get commits with status
   */
  getCommitsByStatus(status) {
    return this.commits.filter(c => c.status === status);
  }

  /**
   * Clear all commits
   */
  clear() {
    this.commits = [];
    this.notifyListeners();
    console.log('[CommitQueue] Cleared all commits');
  }

  /**
   * Group commits by file path
   */
  groupByFile() {
    const grouped = {};

    for (const commit of this.commits) {
      if (!grouped[commit.file.path]) {
        grouped[commit.file.path] = [];
      }
      grouped[commit.file.path].push(commit);
    }

    return grouped;
  }

  /**
   * Generate aggregated PR description
   */
  generatePRDescription() {
    const byAgent = {};

    // Group by agent
    for (const commit of this.commits.filter(c => c.status === 'included')) {
      if (!byAgent[commit.agentName]) {
        byAgent[commit.agentName] = [];
      }
      byAgent[commit.agentName].push(commit);
    }

    // Generate description
    let description = '## Changes Summary\n\n';
    description += 'This PR contains coordinated changes from multiple agents:\n\n';

    for (const [agent, commits] of Object.entries(byAgent)) {
      description += `### ${agent}\n`;
      commits.forEach(c => {
        description += `- ${c.file.message || `Updated ${c.file.path}`}\n`;
      });
      description += '\n';
    }

    description += `\n---\n`;
    description += `**Total files changed:** ${this.getIncludedFiles().length}\n`;
    description += `**Commits aggregated:** ${this.commits.filter(c => c.status === 'included').length}\n`;
    description += `\n🤖 _This PR was created by the Kokino agent orchestration system_\n`;

    return description;
  }

  /**
   * Get unique file list for included commits
   */
  getIncludedFiles() {
    const files = new Map();

    for (const commit of this.commits.filter(c => c.status === 'included')) {
      // If multiple commits to same file, use latest
      if (!files.has(commit.file.path) ||
          commit.timestamp > files.get(commit.file.path).timestamp) {
        files.set(commit.file.path, commit.file);
      }
    }

    return Array.from(files.values());
  }

  /**
   * Subscribe to queue changes
   */
  onChange(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners
   */
  notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.commits);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      total: this.commits.length,
      pending: this.commits.filter(c => c.status === 'pending').length,
      included: this.commits.filter(c => c.status === 'included').length,
      excluded: this.commits.filter(c => c.status === 'excluded').length,
      agents: new Set(this.commits.map(c => c.agentName)).size,
      files: this.getIncludedFiles().length
    };
  }
}

// Singleton instance
const commitQueue = new CommitQueue();

export default commitQueue;


/**
 * Helper function to detect file conflicts
 */
export function detectConflicts(commits) {
  const conflicts = [];
  const fileGroups = {};

  // Group commits by file
  for (const commit of commits) {
    if (!fileGroups[commit.file.path]) {
      fileGroups[commit.file.path] = [];
    }
    fileGroups[commit.file.path].push(commit);
  }

  // Find conflicts (multiple agents editing same file)
  for (const [path, fileCommits] of Object.entries(fileGroups)) {
    if (fileCommits.length > 1) {
      const agents = new Set(fileCommits.map(c => c.agentName));
      if (agents.size > 1) {
        conflicts.push({
          path,
          commits: fileCommits,
          agents: Array.from(agents)
        });
      }
    }
  }

  return conflicts;
}

/**
 * Helper function to merge commit messages
 */
export function mergeCommitMessages(commits) {
  const messages = commits
    .filter(c => c.file.message)
    .map(c => c.file.message);

  if (messages.length === 0) {
    return 'Aggregated changes from team';
  }

  if (messages.length === 1) {
    return messages[0];
  }

  // Combine messages
  return messages.join('; ');
}
