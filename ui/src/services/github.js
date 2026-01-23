/**
 * GitHub API Service (Phase 9)
 * Handles GitHub authentication and API operations
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || 'your-client-id';
const GITHUB_REDIRECT_URI = import.meta.env.VITE_GITHUB_REDIRECT_URI || 'http://localhost:5173/auth/github/callback';

class GitHubService {
  constructor() {
    this.token = localStorage.getItem('github_token');
    this.user = JSON.parse(localStorage.getItem('github_user') || 'null');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Get current user
   */
  getUser() {
    return this.user;
  }

  /**
   * Initiate GitHub OAuth flow
   */
  initiateOAuth() {
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('github_oauth_state', state);

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: GITHUB_REDIRECT_URI,
      scope: 'repo,read:user,write:repo_hook',
      state
    });

    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code, state) {
    const savedState = localStorage.getItem('github_oauth_state');
    if (state !== savedState) {
      throw new Error('Invalid OAuth state');
    }

    // Exchange code for token via backend proxy (to keep client secret secure)
    const response = await fetch('http://127.0.0.1:5050/api/github/oauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      throw new Error('Failed to exchange OAuth code');
    }

    const { access_token } = await response.json();
    this.token = access_token;
    localStorage.setItem('github_token', access_token);
    localStorage.removeItem('github_oauth_state');

    // Fetch user info
    await this.fetchUser();

    return this.user;
  }

  /**
   * Fetch current user from GitHub
   */
  async fetchUser() {
    const response = await this.apiRequest('/user');
    this.user = response;
    localStorage.setItem('github_user', JSON.stringify(response));
    return response;
  }

  /**
   * Disconnect / Logout
   */
  disconnect() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('github_token');
    localStorage.removeItem('github_user');
  }

  // Alias for backwards compatibility
  logout() {
    return this.disconnect();
  }

  /**
   * Generic API request
   */
  async apiRequest(endpoint, options = {}) {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || 'GitHub API request failed');
    }

    // Handle 204 No Content (e.g., DELETE requests)
    if (response.status === 204) {
      return null;
    }

    // Check if response has content
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    return null;
  }

  /**
   * List user's repositories
   */
  async listRepositories(options = {}) {
    const params = new URLSearchParams({
      sort: 'updated',
      per_page: 50,
      ...options
    });

    return this.apiRequest(`/user/repos?${params}`);
  }

  /**
   * Get repository
   */
  async getRepository(owner, repo) {
    return this.apiRequest(`/repos/${owner}/${repo}`);
  }

  /**
   * List issues for a repository
   */
  async listIssues(owner, repo, options = {}) {
    const params = new URLSearchParams({
      state: 'open',
      per_page: 50,
      ...options
    });

    return this.apiRequest(`/repos/${owner}/${repo}/issues?${params}`);
  }

  /**
   * Get a single issue
   */
  async getIssue(owner, repo, issueNumber) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  }

  /**
   * Create issue comment
   */
  async createIssueComment(owner, repo, issueNumber, body) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  }

  /**
   * Update issue
   */
  async updateIssue(owner, repo, issueNumber, updates) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * Create pull request
   */
  async createPullRequest(owner, repo, data) {
    return this.apiRequest(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * List pull requests
   */
  async listPullRequests(owner, repo, options = {}) {
    const params = new URLSearchParams({
      state: 'open',
      per_page: 50,
      ...options
    });

    return this.apiRequest(`/repos/${owner}/${repo}/pulls?${params}`);
  }

  /**
   * Get branch
   */
  async getBranch(owner, repo, branchName) {
    return this.apiRequest(`/repos/${owner}/${repo}/branches/${branchName}`);
  }

  /**
   * Create a new branch
   */
  async createBranch(owner, repo, branchName, sha) {
    return this.apiRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha
      })
    });
  }

  /**
   * Get default branch SHA
   */
  async getDefaultBranchSHA(owner, repo) {
    const repoData = await this.getRepository(owner, repo);
    const defaultBranch = repoData.default_branch;
    const branchData = await this.apiRequest(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`);
    return branchData.object.sha;
  }

  /**
   * Create or update file content
   */
  async createOrUpdateFile(owner, repo, path, content, message, branch = 'main', sha = null) {
    const body = {
      message,
      content: btoa(content), // Base64 encode
      branch
    };

    if (sha) {
      body.sha = sha; // Required for updates
    }

    return this.apiRequest(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  /**
   * Get file content
   */
  async getFileContent(owner, repo, path, ref = 'main') {
    const params = new URLSearchParams({ ref });
    return this.apiRequest(`/repos/${owner}/${repo}/contents/${path}?${params}`);
  }

  /**
   * Create webhook
   */
  async createWebhook(owner, repo, config) {
    return this.apiRequest(`/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: config.events || ['issues', 'pull_request', 'issue_comment'],
        config: {
          url: config.url,
          content_type: 'json',
          secret: config.secret,
          insecure_ssl: '0'
        }
      })
    });
  }

  /**
   * List webhooks
   */
  async listWebhooks(owner, repo) {
    return this.apiRequest(`/repos/${owner}/${repo}/hooks`);
  }

  /**
   * Post comment on issue or PR
   */
  async createComment(owner, repo, issueNumber, body) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    });
  }

  /**
   * List comments on issue or PR
   */
  async listComments(owner, repo, issueNumber) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
  }

  /**
   * Update comment
   */
  async updateComment(owner, repo, commentId, body) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body })
    });
  }

  /**
   * Delete comment
   */
  async deleteComment(owner, repo, commentId) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Add labels to issue
   */
  async addLabels(owner, repo, issueNumber, labels) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels })
    });
  }

  /**
   * Update issue
   */
  async updateIssue(owner, repo, issueNumber, updates) {
    return this.apiRequest(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * Get commit
   */
  async getCommit(owner, repo, sha) {
    return this.apiRequest(`/repos/${owner}/${repo}/commits/${sha}`);
  }

  /**
   * List commits
   */
  async listCommits(owner, repo, options = {}) {
    const params = new URLSearchParams({
      per_page: 30,
      ...options
    });
    return this.apiRequest(`/repos/${owner}/${repo}/commits?${params}`);
  }

  /**
   * Compare commits
   */
  async compareCommits(owner, repo, base, head) {
    return this.apiRequest(`/repos/${owner}/${repo}/compare/${base}...${head}`);
  }
}

export default new GitHubService();
