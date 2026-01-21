import React, { useState, useEffect } from 'react';
import { Github, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import github from '../services/github';
import { useToast } from '../contexts/ToastContext';

/**
 * GitHub Connection Component (Phase 9)
 * Displays authentication status and provides OAuth login button
 */
export const GitHubConnection = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { success, error: showError } = useToast();

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setIsLoading(true);
        const authenticated = github.isAuthenticated();
        setIsAuthenticated(authenticated);

        if (authenticated) {
          setUser(github.getUser());
        }
      } catch (err) {
        console.error('[GitHubConnection] Error checking auth:', err);
        setError(err.message);
        showError('Failed to check GitHub authentication');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [showError]);

  const handleConnect = () => {
    try {
      github.initiateOAuth();
    } catch (err) {
      console.error('[GitHubConnection] OAuth initiation failed:', err);
      setError(err.message);
      showError('Failed to initiate GitHub OAuth');
    }
  };

  const handleDisconnect = () => {
    github.disconnect();
    setIsAuthenticated(false);
    setUser(null);
    success('Disconnected from GitHub');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg">
        <Loader2 size={16} className="animate-spin text-text-secondary" />
        <span className="text-xs text-text-secondary">Loading...</span>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg group relative">
        <CheckCircle2 size={16} className="text-accent-green" />
        <span className="text-xs text-text-primary font-medium">{user.login}</span>

        {/* Hover dropdown */}
        <div className="absolute top-full right-0 mt-2 bg-surface border border-border rounded-lg shadow-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 min-w-[200px]">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <img
              src={user.avatar_url}
              alt={user.name || user.login}
              className="w-10 h-10 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user.name || user.login}
              </p>
              <p className="text-xs text-text-secondary truncate">
                {user.email || user.login}
              </p>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full mt-3 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors group"
    >
      <Github size={16} className="text-text-secondary group-hover:text-text-primary transition-colors" />
      <span className="text-xs text-text-secondary group-hover:text-text-primary font-medium transition-colors">
        Connect GitHub
      </span>

      {error && (
        <div className="absolute top-full right-0 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg p-2 min-w-[200px]">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        </div>
      )}
    </button>
  );
};
