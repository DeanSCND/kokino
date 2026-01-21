import React, { useState, useEffect } from 'react';
import { X, GitBranch, GitPullRequest, AlertCircle, Loader2, FileCode, CheckCircle2 } from 'lucide-react';
import github from '../services/github';
import statusSync from '../utils/statusSync';
import { useToast } from '../contexts/ToastContext';

/**
 * Create Pull Request Dialog (Phase 9)
 * Allows agents/users to create PRs from their work
 */
export const CreatePRDialog = ({ onClose, agentName, initialRepo, initialFiles = [], initialDescription = '' }) => {
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(initialRepo || null);
  const [formData, setFormData] = useState({
    branchName: '',
    baseBranch: 'main',
    prTitle: '',
    prDescription: initialDescription,
    files: initialFiles // Array of { path, content, message }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('form'); // 'form' | 'creating' | 'success'
  const [createdPR, setCreatedPR] = useState(null);
  const { success, error: showError } = useToast();

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
        console.error('[CreatePRDialog] Failed to load repositories:', err);
        setError(err.message);
      }
    };

    loadRepos();
  }, []);

  // Auto-generate branch name from agent name and timestamp
  useEffect(() => {
    if (agentName && !formData.branchName) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const sanitizedAgentName = agentName.toLowerCase().replace(/\s+/g, '-');
      setFormData(prev => ({
        ...prev,
        branchName: `${sanitizedAgentName}/${timestamp}`
      }));
    }
  }, [agentName]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedRepo) {
      setError('Please select a repository');
      return;
    }

    if (!formData.branchName || !formData.prTitle) {
      setError('Branch name and PR title are required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setStep('creating');

      const [owner, repo] = selectedRepo.full_name.split('/');

      // Step 1: Get base branch ref
      const baseBranch = await github.getBranch(owner, repo, formData.baseBranch);
      const baseSha = baseBranch.commit.sha;

      // Step 2: Create new branch
      await github.createBranch(owner, repo, formData.branchName, baseSha);
      console.log('[CreatePRDialog] Created branch:', formData.branchName);

      // Step 3: Create/update files if provided
      if (formData.files && formData.files.length > 0) {
        for (const file of formData.files) {
          await github.createOrUpdateFile(
            owner,
            repo,
            file.path,
            file.content,
            file.message || `Update ${file.path}`,
            formData.branchName,
            null // sha (null for new files)
          );
          console.log('[CreatePRDialog] Created/updated file:', file.path);
        }
      }

      // Step 4: Create pull request
      const pr = await github.createPullRequest(owner, repo, {
        title: formData.prTitle,
        body: formData.prDescription || `Automated PR created by agent: ${agentName}`,
        head: formData.branchName,
        base: formData.baseBranch
      });

      console.log('[CreatePRDialog] Created PR:', pr);
      setCreatedPR(pr);
      setStep('success');
      success(`Pull request #${pr.number} created successfully!`);

      // Notify status sync
      await statusSync.notifyPRCreated(agentName, pr.number, pr.html_url);

    } catch (err) {
      console.error('[CreatePRDialog] Failed to create PR:', err);
      setError(err.message);
      showError(`Failed to create pull request: ${err.message}`);
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFile = () => {
    setFormData(prev => ({
      ...prev,
      files: [...prev.files, { path: '', content: '', message: '' }]
    }));
  };

  const handleFileChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.map((file, i) =>
        i === index ? { ...file, [field]: value } : file
      )
    }));
  };

  const handleRemoveFile = (index) => {
    setFormData(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitPullRequest size={20} className="text-accent-purple" />
            <h2 className="text-lg font-semibold text-text-primary">Create Pull Request</h2>
            {agentName && (
              <span className="text-xs text-text-muted">from {agentName}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'success' && createdPR ? (
            <div className="text-center py-8">
              <CheckCircle2 size={64} className="mx-auto mb-4 text-accent-green" />
              <h3 className="text-xl font-semibold text-text-primary mb-2">
                Pull Request Created!
              </h3>
              <p className="text-sm text-text-secondary mb-6">
                PR #{createdPR.number}: {createdPR.title}
              </p>
              <a
                href={createdPR.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                View on GitHub →
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400">Error</p>
                    <p className="text-xs text-red-300 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Repository Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Repository
                </label>
                <select
                  value={selectedRepo?.full_name || ''}
                  onChange={(e) => {
                    const repo = repositories.find(r => r.full_name === e.target.value);
                    setSelectedRepo(repo);
                  }}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
                  required
                >
                  <option value="">Select repository...</option>
                  {repositories.map(repo => (
                    <option key={repo.id} value={repo.full_name}>
                      {repo.full_name} {repo.private ? '🔒' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch Configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Base Branch
                  </label>
                  <input
                    type="text"
                    value={formData.baseBranch}
                    onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
                    placeholder="main"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    New Branch Name
                  </label>
                  <div className="relative">
                    <GitBranch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="text"
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
                      placeholder="feature/my-changes"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* PR Details */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Pull Request Title
                </label>
                <input
                  type="text"
                  value={formData.prTitle}
                  onChange={(e) => setFormData({ ...formData, prTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
                  placeholder="Add new feature..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Description
                </label>
                <textarea
                  value={formData.prDescription}
                  onChange={(e) => setFormData({ ...formData, prDescription: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple resize-none"
                  placeholder="Describe the changes..."
                />
              </div>

              {/* Files (optional) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Files to Commit (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddFile}
                    className="px-2 py-1 bg-accent-purple/10 hover:bg-accent-purple/20 text-accent-purple rounded text-xs font-medium transition-colors"
                  >
                    + Add File
                  </button>
                </div>

                {formData.files.length === 0 ? (
                  <p className="text-xs text-text-muted italic">
                    No files added. Branch will be created without file changes.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {formData.files.map((file, index) => (
                      <div key={index} className="p-3 bg-background border border-border rounded-lg">
                        <div className="flex items-start gap-2 mb-2">
                          <FileCode size={16} className="text-text-secondary mt-0.5 flex-shrink-0" />
                          <input
                            type="text"
                            value={file.path}
                            onChange={(e) => handleFileChange(index, 'path', e.target.value)}
                            placeholder="path/to/file.js"
                            className="flex-1 px-2 py-1 bg-surface border border-border rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-purple"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="p-1 hover:bg-surface-hover rounded text-red-400 hover:text-red-300 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <textarea
                          value={file.content}
                          onChange={(e) => handleFileChange(index, 'content', e.target.value)}
                          placeholder="File content..."
                          rows={3}
                          className="w-full px-2 py-1 bg-surface border border-border rounded text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-purple resize-none font-mono"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !selectedRepo}
                  className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating PR...
                    </>
                  ) : (
                    <>
                      <GitPullRequest size={16} />
                      Create Pull Request
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
