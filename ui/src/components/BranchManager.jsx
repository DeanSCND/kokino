import React, { useState, useEffect } from 'react';
import { X, GitBranch, Trash2, GitMerge, RefreshCw, Loader2, AlertCircle, CheckCircle2, GitCompare } from 'lucide-react';
import github from '../services/github';

/**
 * Branch Manager Component (Phase 9)
 * Manages Git branches - list, switch, merge, delete
 */
export const BranchManager = ({ onClose, repository }) => {
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRepo, setSelectedRepo] = useState(repository || null);
  const [repositories, setRepositories] = useState([]);
  const [branchComparison, setBranchComparison] = useState({});

  // Load repositories on mount
  useEffect(() => {
    const loadRepos = async () => {
      if (!github.isAuthenticated()) {
        setError('Not authenticated with GitHub');
        return;
      }

      try {
        const repos = await github.listRepositories({
          sort: 'updated',
          per_page: 30
        });
        setRepositories(repos);

        if (!selectedRepo && repos.length > 0) {
          setSelectedRepo(repos[0]);
        }
      } catch (err) {
        console.error('[BranchManager] Failed to load repositories:', err);
        setError(err.message);
      }
    };

    loadRepos();
  }, []);

  // Load branches when repository changes
  useEffect(() => {
    if (!selectedRepo) return;
    loadBranches();
  }, [selectedRepo]);

  const loadBranches = async () => {
    if (!selectedRepo) return;

    try {
      setIsLoading(true);
      setError(null);

      const [owner, repo] = selectedRepo.full_name.split('/');

      // Get all branches
      const branchList = await github.apiRequest(`/repos/${owner}/${repo}/branches`);
      setBranches(branchList);

      // Get default branch as "current"
      const repoData = await github.getRepository(owner, repo);
      setCurrentBranch(repoData.default_branch);

      // Get comparison data for each branch
      const comparisons = {};
      for (const branch of branchList) {
        if (branch.name !== repoData.default_branch) {
          try {
            const comparison = await github.compareCommits(
              owner,
              repo,
              repoData.default_branch,
              branch.name
            );
            comparisons[branch.name] = {
              ahead: comparison.ahead_by,
              behind: comparison.behind_by,
              status: comparison.status
            };
          } catch (err) {
            console.warn(`[BranchManager] Failed to compare ${branch.name}:`, err);
          }
        }
      }
      setBranchComparison(comparisons);

    } catch (err) {
      console.error('[BranchManager] Failed to load branches:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBranch = async (branchName) => {
    if (!window.confirm(`Are you sure you want to delete branch "${branchName}"?`)) {
      return;
    }

    if (branchName === currentBranch) {
      setError('Cannot delete the current branch');
      return;
    }

    try {
      const [owner, repo] = selectedRepo.full_name.split('/');
      await github.apiRequest(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
        method: 'DELETE'
      });

      console.log(`[BranchManager] Deleted branch: ${branchName}`);
      await loadBranches(); // Reload list
    } catch (err) {
      console.error('[BranchManager] Failed to delete branch:', err);
      setError(`Failed to delete branch: ${err.message}`);
    }
  };

  const handleCreateBranch = async () => {
    const branchName = prompt('Enter new branch name:');
    if (!branchName) return;

    try {
      const [owner, repo] = selectedRepo.full_name.split('/');
      const baseBranch = await github.getBranch(owner, repo, currentBranch);
      const baseSha = baseBranch.commit.sha;

      await github.createBranch(owner, repo, branchName, baseSha);
      console.log(`[BranchManager] Created branch: ${branchName}`);
      await loadBranches();
    } catch (err) {
      console.error('[BranchManager] Failed to create branch:', err);
      setError(`Failed to create branch: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitBranch size={20} className="text-accent-purple" />
            <h2 className="text-lg font-semibold text-text-primary">Branch Manager</h2>
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
              onClick={loadBranches}
              disabled={!selectedRepo || isLoading}
              className="p-2 bg-surface-hover hover:bg-surface border border-border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Refresh"
            >
              <RefreshCw size={16} className={`text-text-secondary ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleCreateBranch}
              disabled={!selectedRepo || isLoading}
              className="px-3 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + New Branch
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg mb-4">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="text-xs text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-accent-purple" />
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center py-12">
              <GitBranch size={48} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-secondary">
                {selectedRepo ? 'No branches found' : 'Select a repository to view branches'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {branches.map(branch => (
                <BranchCard
                  key={branch.name}
                  branch={branch}
                  isCurrent={branch.name === currentBranch}
                  comparison={branchComparison[branch.name]}
                  onDelete={() => handleDeleteBranch(branch.name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedRepo && !isLoading && branches.length > 0 && (
          <div className="p-4 border-t border-border bg-background text-xs text-text-secondary">
            {branches.length} {branches.length === 1 ? 'branch' : 'branches'} • Current: {currentBranch}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Individual Branch Card
 */
const BranchCard = ({ branch, isCurrent, comparison, onDelete }) => {
  return (
    <div className={`p-4 rounded-lg border transition-colors ${
      isCurrent
        ? 'bg-accent-purple/10 border-accent-purple'
        : 'bg-surface border-border hover:border-text-secondary'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch size={16} className={isCurrent ? 'text-accent-purple' : 'text-text-secondary'} />
            <span className="text-sm font-medium text-text-primary">{branch.name}</span>
            {isCurrent && (
              <span className="px-2 py-0.5 bg-accent-purple text-white rounded text-[10px] font-medium">
                CURRENT
              </span>
            )}
          </div>

          {/* Comparison Status */}
          {comparison && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              {comparison.ahead > 0 && (
                <span className="text-accent-green flex items-center gap-1">
                  <GitCompare size={12} />
                  {comparison.ahead} ahead
                </span>
              )}
              {comparison.behind > 0 && (
                <span className="text-accent-red flex items-center gap-1">
                  <GitCompare size={12} className="rotate-180" />
                  {comparison.behind} behind
                </span>
              )}
              {comparison.status === 'identical' && (
                <span className="text-text-muted flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  Up to date
                </span>
              )}
            </div>
          )}

          {/* Last commit info */}
          {branch.commit && (
            <p className="text-xs text-text-muted mt-1 truncate">
              Last commit: {branch.commit.sha.substring(0, 7)}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isCurrent && (
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded transition-colors"
              title="Delete branch"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
