import { jsonResponse, parseJson } from '../utils/response.js';
import crypto from 'node:crypto';

/**
 * GitHub Integration Routes (Phase 9)
 * Handles OAuth proxy and webhook endpoints
 */

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'kokino-webhook-secret';

export function createGitHubRoutes() {
  return {
    /**
     * POST /api/github/oauth
     * Exchange OAuth code for access token
     */
    async exchangeOAuthCode(req, res) {
      try {
        const body = await parseJson(req);
        const { code } = body;

        if (!code) {
          return jsonResponse(res, 400, { error: 'code required' });
        }

        if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
          return jsonResponse(res, 500, {
            error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.'
          });
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code
          })
        });

        if (!tokenResponse.ok) {
          const error = await tokenResponse.text();
          console.error('[github/oauth] Token exchange failed:', error);
          return jsonResponse(res, 500, { error: 'Failed to exchange code for token' });
        }

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          console.error('[github/oauth] GitHub error:', tokenData);
          return jsonResponse(res, 400, { error: tokenData.error_description || tokenData.error });
        }

        jsonResponse(res, 200, {
          access_token: tokenData.access_token,
          token_type: tokenData.token_type,
          scope: tokenData.scope
        });

      } catch (error) {
        console.error('[github/oauth] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Verify GitHub webhook signature
     * @param {string|Buffer} rawBody - Raw request body (before JSON parsing)
     * @param {string} signature - GitHub signature from x-hub-signature-256 header
     */
    verifyWebhookSignature(rawBody, signature) {
      if (!signature) {
        return false;
      }

      const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
      hmac.update(rawBody);
      const expectedSignature = `sha256=${hmac.digest('hex')}`;

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    },

    /**
     * POST /api/github/webhook
     * Handle GitHub webhook events
     */
    async handleWebhook(req, res) {
      try {
        // Parse with raw body for signature verification
        const { data: body, raw: rawBody } = await parseJson(req, true);
        const event = req.headers['x-github-event'];
        const signature = req.headers['x-hub-signature-256'];
        const delivery = req.headers['x-github-delivery'];

        console.log(`[github/webhook] Received ${event} event (${delivery})`);

        // Verify webhook signature using raw body
        if (!this.verifyWebhookSignature(rawBody, signature)) {
          console.warn('[github/webhook] Invalid signature');
          return jsonResponse(res, 401, { error: 'Invalid signature' });
        }

        // Process webhook events
        let result = { received: true, event, delivery };

        switch (event) {
          case 'issues':
            result = await this.handleIssueEvent(body);
            break;

          case 'pull_request':
            result = await this.handlePullRequestEvent(body);
            break;

          case 'issue_comment':
            result = await this.handleIssueCommentEvent(body);
            break;

          case 'push':
            result = await this.handlePushEvent(body);
            break;

          case 'workflow_run':
            result = await this.handleWorkflowRunEvent(body);
            break;

          default:
            console.log(`[github/webhook] Unhandled event type: ${event}`);
            result.handled = false;
        }

        jsonResponse(res, 200, result);

      } catch (error) {
        console.error('[github/webhook] Error:', error);
        jsonResponse(res, 500, { error: error.message });
      }
    },

    /**
     * Handle 'issues' event
     */
    async handleIssueEvent(payload) {
      const action = payload.action; // opened, closed, edited, etc.
      const issue = payload.issue;

      console.log(`[github/webhook] Issue ${action}: #${issue.number} - ${issue.title}`);

      if (action === 'opened' || action === 'reopened') {
        // Auto-spawn team based on labels
        console.log(`[github/webhook] Issue opened with labels:`, issue.labels.map(l => l.name));

        // TODO: Trigger team spawning in UI
        // For now, just log the event
        return {
          handled: true,
          action: 'issue_opened',
          issue: {
            number: issue.number,
            title: issue.title,
            labels: issue.labels.map(l => l.name),
            url: issue.html_url
          }
        };
      }

      if (action === 'closed') {
        console.log(`[github/webhook] Issue closed: #${issue.number}`);
        return {
          handled: true,
          action: 'issue_closed',
          issue: { number: issue.number }
        };
      }

      return { handled: true, action };
    },

    /**
     * Handle 'pull_request' event
     */
    async handlePullRequestEvent(payload) {
      const action = payload.action; // opened, closed, synchronize, etc.
      const pr = payload.pull_request;

      console.log(`[github/webhook] PR ${action}: #${pr.number} - ${pr.title}`);

      if (action === 'opened') {
        console.log(`[github/webhook] New PR from ${pr.user.login}`);
        return {
          handled: true,
          action: 'pr_opened',
          pr: {
            number: pr.number,
            title: pr.title,
            author: pr.user.login,
            url: pr.html_url
          }
        };
      }

      if (action === 'review_requested') {
        console.log(`[github/webhook] Review requested on PR #${pr.number}`);
        // TODO: Notify QA agent
        return {
          handled: true,
          action: 'pr_review_requested',
          pr: { number: pr.number }
        };
      }

      if (action === 'closed' && pr.merged) {
        console.log(`[github/webhook] PR merged: #${pr.number}`);
        return {
          handled: true,
          action: 'pr_merged',
          pr: { number: pr.number }
        };
      }

      return { handled: true, action };
    },

    /**
     * Handle 'issue_comment' event
     */
    async handleIssueCommentEvent(payload) {
      const action = payload.action; // created, edited, deleted
      const comment = payload.comment;
      const issue = payload.issue;

      console.log(`[github/webhook] Comment ${action} on issue #${issue.number}`);

      if (action === 'created') {
        // Route comment to relevant agent team
        console.log(`[github/webhook] New comment from ${comment.user.login}`);
        return {
          handled: true,
          action: 'comment_created',
          issue: { number: issue.number },
          comment: {
            author: comment.user.login,
            body: comment.body.substring(0, 100) + '...'
          }
        };
      }

      return { handled: true, action };
    },

    /**
     * Handle 'push' event
     */
    async handlePushEvent(payload) {
      const ref = payload.ref; // e.g., refs/heads/main
      const commits = payload.commits || [];

      console.log(`[github/webhook] Push to ${ref} (${commits.length} commits)`);

      return {
        handled: true,
        action: 'push',
        ref,
        commits: commits.length
      };
    },

    /**
     * Handle 'workflow_run' event
     */
    async handleWorkflowRunEvent(payload) {
      const workflow = payload.workflow_run;
      const status = workflow.status; // completed, in_progress, etc.
      const conclusion = workflow.conclusion; // success, failure, etc.

      console.log(`[github/webhook] Workflow ${workflow.name}: ${status} (${conclusion || 'pending'})`);

      if (status === 'completed') {
        return {
          handled: true,
          action: 'workflow_completed',
          workflow: {
            name: workflow.name,
            conclusion
          }
        };
      }

      return { handled: true, action: status };
    }
  };
}
