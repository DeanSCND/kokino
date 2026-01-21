import React, { useState, useEffect } from 'react';
import { X, GitCommit, FileCode, Users, AlertTriangle, CheckSquare, Square, GitPullRequest } from 'lucide-react';
import commitQueue, { detectConflicts } from '../utils/commitAggregator';
import { CreatePRDialog } from './CreatePRDialog';

/**
 * Commit Queue Viewer (Phase 9)
 * Shows all staged commits from agents and allows aggregation into PR
 */
export const CommitQueueViewer = ({ onClose }) => {
  const [commits, setCommits] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [selectedCommits, setSelectedCommits] = useState(new Set());

  // Subscribe to queue changes
  useEffect(() => {
    const updateCommits = (newCommits) => {
      setCommits(newCommits);
      setConflicts(detectConflicts(newCommits));

      // Auto-select all pending commits
      const pendingIds = newCommits
        .filter(c => c.status === 'pending')
        .map(c => c.id);
      setSelectedCommits(new Set(pendingIds));
    };

    // Initial load
    updateCommits(commitQueue.getCommits());

    // Subscribe to changes
    const unsubscribe = commitQueue.onChange(updateCommits);

    return unsubscribe;
  }, []);

  const handleToggleCommit = (commitId) => {
    const newSelected = new Set(selectedCommits);
    if (newSelected.has(commitId)) {
      newSelected.delete(commitId);
      commitQueue.updateCommitStatus(commitId, 'excluded');
    } else {
      newSelected.add(commitId);
      commitQueue.updateCommitStatus(commitId, 'included');
    }
    setSelectedCommits(newSelected);
  };

  const handleSelectAll = () => {
    const allIds = commits.map(c => c.id);
    setSelectedCommits(new Set(allIds));
    allIds.forEach(id => commitQueue.updateCommitStatus(id, 'included'));
  };

  const handleDeselectAll = () => {
    setSelectedCommits(new Set());
    commits.forEach(c => commitQueue.updateCommitStatus(c.id, 'excluded'));
  };

  const handleRemoveCommit = (commitId) => {
    commitQueue.removeCommit(commitId);
  };

  const handleClearQueue = () => {
    if (window.confirm('Are you sure you want to clear all commits?')) {
      commitQueue.clear();
      setSelectedCommits(new Set());
    }
  };

  const handleCreatePR = () => {
    // Ensure selected commits are marked as included
    commits.forEach(c => {
      if (selectedCommits.has(c.id)) {
        commitQueue.updateCommitStatus(c.id, 'included');
      } else {
        commitQueue.updateCommitStatus(c.id, 'excluded');
      }
    });

    setShowCreatePR(true);
  };

  const stats = commitQueue.getStats();
  const groupedByAgent = {};
  commits.forEach(c => {
    if (!groupedByAgent[c.agentName]) {
      groupedByAgent[c.agentName] = [];
    }
    groupedByAgent[c.agentName].push(c);
  });

  if (showCreatePR) {
    return (
      <CreatePRDialog
        onClose={() => {
          setShowCreatePR(false);
          onClose();
        }}
        agentName="Team"
        initialFiles={commitQueue.getIncludedFiles()}
        initialDescription={commitQueue.generatePRDescription()}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitCommit size={20} className="text-accent-purple" />
            <h2 className="text-lg font-semibold text-text-primary">Commit Queue</h2>
            <span className="px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded text-xs font-medium">
              {stats.total} {stats.total === 1 ? 'commit' : 'commits'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="p-4 border-b border-border bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-text-secondary" />
                <span className="text-text-primary">{stats.agents} agents</span>
              </div>
              <div className="flex items-center gap-2">
                <FileCode size={14} className="text-text-secondary" />
                <span className="text-text-primary">{stats.files} files</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckSquare size={14} className="text-accent-green" />
                <span className="text-text-primary">{selectedCommits.size} selected</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
              >
                Deselect All
              </button>
              <button
                onClick={handleClearQueue}
                className="px-2 py-1 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                Clear Queue
              </button>
            </div>
          </div>

          {/* Conflicts Warning */}
          {conflicts.length > 0 && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-400">
                  {conflicts.length} file {conflicts.length === 1 ? 'conflict' : 'conflicts'} detected
                </p>
                <p className="text-xs text-yellow-300 mt-1">
                  Multiple agents modified the same files. Review carefully before creating PR.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Commit List */}
        <div className="flex-1 overflow-y-auto p-4">
          {commits.length === 0 ? (
            <div className="text-center py-12">
              <GitCommit size={48} className="mx-auto mb-3 text-text-muted" />
              <p className="text-sm text-text-secondary">No commits in queue</p>
              <p className="text-xs text-text-muted mt-1">
                Commits from agents will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedByAgent).map(([agent, agentCommits]) => (
                <div key={agent}>
                  <h3 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-2">
                    <Users size={14} />
                    {agent}
                    <span className="text-xs text-text-muted">
                      ({agentCommits.length})
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {agentCommits.map(commit => (
                      <CommitCard
                        key={commit.id}
                        commit={commit}
                        isSelected={selectedCommits.has(commit.id)}
                        onToggle={() => handleToggleCommit(commit.id)}
                        onRemove={() => handleRemoveCommit(commit.id)}
                        hasConflict={conflicts.some(c =>
                          c.commits.some(cc => cc.id === commit.id)
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {commits.length > 0 && (
          <div className="p-4 border-t border-border bg-background flex items-center justify-between">
            <p className="text-xs text-text-muted">
              {selectedCommits.size} of {commits.length} commits will be included in PR
            </p>
            <button
              onClick={handleCreatePR}
              disabled={selectedCommits.size === 0}
              className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <GitPullRequest size={16} />
              Create Aggregated PR
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Individual Commit Card
 */
const CommitCard = ({ commit, isSelected, onToggle, onRemove, hasConflict }) => {
  return (
    <div className={`p-3 rounded-lg border transition-colors ${
      isSelected
        ? 'bg-accent-purple/5 border-accent-purple/30'
        : 'bg-surface border-border hover:border-text-secondary'
    } ${hasConflict ? 'ring-2 ring-yellow-500/30' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggle}
          className="mt-0.5 flex-shrink-0"
        >
          {isSelected ? (
            <CheckSquare size={18} className="text-accent-purple" />
          ) : (
            <Square size={18} className="text-text-secondary" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <FileCode size={14} className="text-text-secondary flex-shrink-0" />
                <span className="text-sm font-mono text-text-primary truncate">
                  {commit.file.path}
                </span>
                {hasConflict && (
                  <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-[10px] font-medium flex-shrink-0">
                    CONFLICT
                  </span>
                )}
              </div>
              {commit.file.message && (
                <p className="text-xs text-text-secondary mt-1">
                  {commit.file.message}
                </p>
              )}
            </div>

            {/* Remove button */}
            <button
              onClick={onRemove}
              className="p-1 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded transition-colors"
              title="Remove from queue"
            >
              <X size={14} />
            </button>
          </div>

          {/* Timestamp */}
          <p className="text-[10px] text-text-muted mt-2">
            {new Date(commit.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};
