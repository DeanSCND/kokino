import React, { useState, useEffect } from 'react';
import { X, GitPullRequest, AlertCircle, Loader2, RefreshCw, Filter, Search, ExternalLink, Users } from 'lucide-react';
import github from '../services/github';

/**
 * GitHub Issues Panel (Phase 9)
 * Displays issues from connected repositories with filtering and team spawning
 */
export const GitHubIssues = ({ onClose, onSpawnTeam }) => {
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({
    state: 'open',
    labels: '',
    search: ''
  });

  // Load user repositories on mount
  useEffect(() => {
    const loadRepositories = async () => {
      if (!github.isAuthenticated()) {
        setError('Not authenticated with GitHub');
        return;
      }

      try {
        setIsLoading(true);
        const repos = await github.listRepositories({
          sort: 'updated',
          per_page: 50
        });
        setRepositories(repos);

        // Auto-select first repo
        if (repos.length > 0) {
          setSelectedRepo(repos[0]);
        }
      } catch (err) {
        console.error('[GitHubIssues] Failed to load repositories:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadRepositories();
  }, []);

  // Load issues when repository changes
  useEffect(() => {
    const loadIssues = async () => {
      if (!selectedRepo) return;

      try {
        setIsLoading(true);
        setError(null);

        const [owner, repo] = selectedRepo.full_name.split('/');
        const options = { state: filter.state };

        if (filter.labels) {
          options.labels = filter.labels;
        }

        const fetchedIssues = await github.listIssues(owner, repo, options);
        setIssues(fetchedIssues);
      } catch (err) {
        console.error('[GitHubIssues] Failed to load issues:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadIssues();
  }, [selectedRepo, filter.state, filter.labels]);

  const handleRefresh = () => {
    // Force reload by toggling selected repo
    const temp = selectedRepo;
    setSelectedRepo(null);
    setTimeout(() => setSelectedRepo(temp), 0);
  };

  const handleSpawnTeam = (issue) => {
    if (onSpawnTeam) {
      onSpawnTeam(issue);
    }
  };

  // Filter issues by search text
  const filteredIssues = issues.filter(issue => {
    if (!filter.search) return true;
    const searchLower = filter.search.toLowerCase();
    return (
      issue.title.toLowerCase().includes(searchLower) ||
      (issue.body || '').toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitPullRequest size={20} className="text-accent-purple" />
            <h2 className="text-lg font-semibold text-text-primary">GitHub Issues</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        {/* Repository Selector */}
        <div className="p-4 border-b border-border bg-background">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <select
                value={selectedRepo?.full_name || ''}
                onChange={(e) => {
                  const repo = repositories.find(r => r.full_name === e.target.value);
                  setSelectedRepo(repo);
                }}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
              >
                <option value="">Select repository...</option>
                {repositories.map(repo => (
                  <option key={repo.id} value={repo.full_name}>
                    {repo.full_name} {repo.private ? '🔒' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleRefresh}
              disabled={!selectedRepo || isLoading}
              className="p-2 bg-surface-hover hover:bg-surface border border-border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Refresh"
            >
              <RefreshCw size={16} className={`text-text-secondary ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-border bg-background space-y-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search issues..."
                value={filter.search}
                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
              />
            </div>

            {/* State Filter */}
            <select
              value={filter.state}
              onChange={(e) => setFilter({ ...filter, state: e.target.value })}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>

            {/* Label Filter */}
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Labels (comma-separated)"
                value={filter.labels}
                onChange={(e) => setFilter({ ...filter, labels: e.target.value })}
                className="w-48 pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
              />
            </div>
          </div>
        </div>

        {/* Issues List */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Error loading issues</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-accent-purple" />
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="text-center py-12">
              <GitPullRequest size={48} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-secondary">
                {selectedRepo ? 'No issues found' : 'Select a repository to view issues'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIssues.map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onSpawnTeam={() => handleSpawnTeam(issue)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer Stats */}
        {selectedRepo && !isLoading && (
          <div className="p-4 border-t border-border bg-background text-xs text-text-secondary">
            Showing {filteredIssues.length} of {issues.length} issues
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Individual Issue Card Component
 */
const IssueCard = ({ issue, onSpawnTeam }) => {
  const [expanded, setExpanded] = useState(false);

  const stateColor = issue.state === 'open' ? 'text-accent-green' : 'text-accent-purple';
  const stateIcon = issue.state === 'open' ? '●' : '✓';

  return (
    <div className="bg-surface border border-border rounded-lg p-4 hover:border-text-secondary transition-colors">
      {/* Issue Header */}
      <div className="flex items-start gap-3">
        <span className={`${stateColor} text-lg font-bold flex-shrink-0 mt-0.5`}>
          {stateIcon}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title and Number */}
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-left flex-1"
            >
              <h3 className="text-sm font-medium text-text-primary hover:text-accent-purple transition-colors">
                {issue.title}
              </h3>
              <p className="text-xs text-text-muted mt-1">
                #{issue.number} opened by {issue.user.login}
              </p>
            </button>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Spawn Team Button */}
              {issue.labels.length > 0 && (
                <button
                  onClick={onSpawnTeam}
                  className="px-2 py-1 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded text-xs font-medium transition-colors flex items-center gap-1"
                  title="Spawn team from issue labels"
                >
                  <Users size={12} />
                  Spawn Team
                </button>
              )}

              {/* Open in GitHub */}
              <a
                href={issue.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 hover:bg-surface-hover rounded transition-colors"
                title="Open in GitHub"
              >
                <ExternalLink size={14} className="text-text-secondary" />
              </a>
            </div>
          </div>

          {/* Labels */}
          {issue.labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {issue.labels.map(label => (
                <span
                  key={label.id}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{
                    backgroundColor: `#${label.color}20`,
                    color: `#${label.color}`,
                    border: `1px solid #${label.color}40`
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          )}

          {/* Expanded Body */}
          {expanded && issue.body && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-text-secondary whitespace-pre-wrap line-clamp-6">
                {issue.body}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
