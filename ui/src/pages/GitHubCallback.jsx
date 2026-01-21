import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import github from '../services/github';

/**
 * GitHub OAuth Callback Page (Phase 9)
 * Handles the OAuth redirect and token exchange
 */
export const GitHubCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing'); // processing | success | error
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Extract code and state from URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        if (!code) {
          throw new Error('No authorization code received');
        }

        // Exchange code for token
        setStatus('processing');
        await github.handleCallback(code, state);

        setStatus('success');

        // Redirect to canvas after 1 second
        setTimeout(() => {
          navigate('/');
        }, 1000);

      } catch (err) {
        console.error('[GitHubCallback] OAuth error:', err);
        setError(err.message);
        setStatus('error');
      }
    };

    handleOAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-lg p-8 text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="mx-auto mb-4 text-accent-purple animate-spin" size={48} />
            <h2 className="text-xl font-semibold text-text mb-2">Connecting to GitHub</h2>
            <p className="text-text-secondary text-sm">
              Authenticating your account...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 text-accent-green" size={48} />
            <h2 className="text-xl font-semibold text-text mb-2">Successfully Connected!</h2>
            <p className="text-text-secondary text-sm">
              Redirecting to canvas...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="mx-auto mb-4 text-accent-red" size={48} />
            <h2 className="text-xl font-semibold text-text mb-2">Authentication Failed</h2>
            <p className="text-text-secondary text-sm mb-4">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded-lg transition-colors"
            >
              Return to Canvas
            </button>
          </>
        )}
      </div>
    </div>
  );
};
