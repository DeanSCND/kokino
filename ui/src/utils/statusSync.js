/**
 * Status Sync Utility (Phase 9)
 * Syncs agent activity to GitHub issues and projects
 */

import github from '../services/github';

/**
 * Format agent status update for GitHub comment
 */
function formatStatusUpdate(agent, event, details = {}) {
  const timestamp = new Date().toISOString();
  const emoji = {
    'team_spawned': '🚀',
    'agent_started': '▶️',
    'agent_working': '⚙️',
    'agent_completed': '✅',
    'agent_error': '❌',
    'pr_created': '🔀',
    'tests_passed': '✔️',
    'tests_failed': '❌'
  }[event] || '📝';

  let message = `${emoji} **${agent}** - ${event.replace(/_/g, ' ')}\n`;
  message += `_${timestamp}_\n\n`;

  if (details.task) {
    message += `**Task:** ${details.task}\n`;
  }

  if (details.result) {
    message += `**Result:** ${details.result}\n`;
  }

  if (details.message) {
    message += `\n${details.message}\n`;
  }

  if (details.pr_url) {
    message += `\n[View Pull Request](${details.pr_url})\n`;
  }

  return message;
}

/**
 * StatusSync class - manages GitHub status updates
 */
export class StatusSync {
  constructor() {
    this.enabled = false;
    this.currentIssue = null; // { owner, repo, number }
    this.updateQueue = [];
    this.lastCommentId = null;
    this.useAggregation = true; // Combine multiple updates into one comment
  }

  /**
   * Enable status sync for a specific GitHub issue
   */
  enable(owner, repo, issueNumber) {
    this.enabled = true;
    this.currentIssue = { owner, repo, number: issueNumber };
    console.log(`[StatusSync] Enabled for ${owner}/${repo}#${issueNumber}`);
  }

  /**
   * Disable status sync
   */
  disable() {
    this.enabled = false;
    this.currentIssue = null;
    this.updateQueue = [];
    this.lastCommentId = null;
    console.log('[StatusSync] Disabled');
  }

  /**
   * Post status update to GitHub
   */
  async postUpdate(agent, event, details = {}) {
    if (!this.enabled || !this.currentIssue) {
      console.log('[StatusSync] Not enabled, skipping update');
      return;
    }

    if (!github.isAuthenticated()) {
      console.warn('[StatusSync] Not authenticated, skipping update');
      return;
    }

    try {
      const { owner, repo, number } = this.currentIssue;
      const body = formatStatusUpdate(agent, event, details);

      if (this.useAggregation && this.lastCommentId) {
        // Append to existing comment
        const existingComments = await github.listComments(owner, repo, number);
        const lastComment = existingComments.find(c => c.id === this.lastCommentId);

        if (lastComment && lastComment.user.login === github.getUser()?.login) {
          const updatedBody = `${lastComment.body}\n\n---\n\n${body}`;
          await github.updateComment(owner, repo, this.lastCommentId, updatedBody);
          console.log(`[StatusSync] Updated comment #${this.lastCommentId}`);
          return;
        }
      }

      // Create new comment
      const comment = await github.createComment(owner, repo, number, body);
      this.lastCommentId = comment.id;
      console.log(`[StatusSync] Created comment #${comment.id}`);

    } catch (error) {
      console.error('[StatusSync] Failed to post update:', error);
    }
  }

  /**
   * Post team spawn notification
   */
  async notifyTeamSpawned(teamName, agents, issueNumber) {
    const agentList = agents.map(a => `- ${a.role}`).join('\n');
    await this.postUpdate('System', 'team_spawned', {
      task: `Spawned team: ${teamName}`,
      message: `**Team Members:**\n${agentList}\n\nTeam is ready to work on this issue.`
    });
  }

  /**
   * Post agent start notification
   */
  async notifyAgentStarted(agentName, task) {
    await this.postUpdate(agentName, 'agent_started', {
      task,
      message: 'Agent has begun work.'
    });
  }

  /**
   * Post agent completion notification
   */
  async notifyAgentCompleted(agentName, result) {
    await this.postUpdate(agentName, 'agent_completed', {
      result,
      message: 'Agent has completed its work.'
    });
  }

  /**
   * Post PR creation notification
   */
  async notifyPRCreated(agentName, prNumber, prUrl) {
    await this.postUpdate(agentName, 'pr_created', {
      result: `Created PR #${prNumber}`,
      pr_url: prUrl,
      message: 'Pull request created and ready for review.'
    });
  }

  /**
   * Post error notification
   */
  async notifyError(agentName, error) {
    await this.postUpdate(agentName, 'agent_error', {
      message: `**Error:** ${error}`
    });
  }

  /**
   * Add label to issue (e.g., "in-progress", "completed")
   */
  async updateIssueLabel(label) {
    if (!this.enabled || !this.currentIssue) return;

    try {
      const { owner, repo, number } = this.currentIssue;
      await github.addLabels(owner, repo, number, [label]);
      console.log(`[StatusSync] Added label: ${label}`);
    } catch (error) {
      console.error('[StatusSync] Failed to add label:', error);
    }
  }

  /**
   * Close issue when work is complete
   */
  async closeIssue(resolution) {
    if (!this.enabled || !this.currentIssue) return;

    try {
      const { owner, repo, number } = this.currentIssue;

      // Post final comment
      await this.postUpdate('System', 'agent_completed', {
        result: resolution,
        message: 'All agents have completed their work. Closing issue.'
      });

      // Close the issue
      await github.updateIssue(owner, repo, number, {
        state: 'closed'
      });

      console.log(`[StatusSync] Closed issue #${number}`);
    } catch (error) {
      console.error('[StatusSync] Failed to close issue:', error);
    }
  }
}

// Singleton instance
const statusSync = new StatusSync();

export default statusSync;
