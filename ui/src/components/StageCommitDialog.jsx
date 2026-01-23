import React, { useState } from 'react';
import { X, FileCode, GitCommit, AlertCircle } from 'lucide-react';
import commitQueue from '../utils/commitAggregator';

/**
 * Stage Commit Dialog
 * Allows agents to stage commits to the queue
 */
export const StageCommitDialog = ({ onClose, agentName }) => {
  const [formData, setFormData] = useState({
    path: '',
    content: '',
    message: ''
  });
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.path || !formData.content) {
      setError('File path and content are required');
      return;
    }

    try {
      // Add commit to queue
      commitQueue.addCommit(agentName, {
        path: formData.path,
        content: formData.content,
        message: formData.message || `Update ${formData.path}`
      });

      console.log('[StageCommitDialog] Commit staged:', formData.path);
      onClose();
    } catch (err) {
      console.error('[StageCommitDialog] Failed to stage commit:', err);
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <GitCommit size={20} className="text-accent-purple" />
            <h2 className="text-lg font-semibold text-text-primary">Stage Commit</h2>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* File Path */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              File Path
            </label>
            <div className="relative">
              <FileCode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                value={formData.path}
                onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                placeholder="src/components/MyComponent.jsx"
                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
                required
              />
            </div>
          </div>

          {/* Commit Message */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Commit Message
            </label>
            <input
              type="text"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Add new feature..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple"
            />
          </div>

          {/* File Content */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              File Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={12}
              placeholder="// File content here..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple resize-none font-mono"
              required
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <GitCommit size={16} />
              Stage Commit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
