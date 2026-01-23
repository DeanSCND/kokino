import { useState, useEffect, useCallback } from 'react';
import broker from '../services/broker';

/**
 * Hook for fetching and polling conversation history
 *
 * Usage:
 *   const { conversation, turns, loading, refresh } = useConversation(conversationId, { polling: true });
 */
export const useConversation = (conversationId, options = {}) => {
  const { polling = false, pollingInterval = 3000 } = options;

  const [conversation, setConversation] = useState(null);
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConversation = useCallback(async () => {
    if (!conversationId) {
      // Reset state when conversationId is null
      setConversation(null);
      setTurns([]);
      setLoading(false);
      return;
    }

    try {
      const data = await broker.getConversation(conversationId);
      setConversation(data);
      setTurns(data.turns || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Initial fetch
  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  // Polling
  useEffect(() => {
    if (!polling || !conversationId) return;

    const interval = setInterval(() => {
      fetchConversation();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [polling, conversationId, pollingInterval, fetchConversation]);

  return {
    conversation,
    turns,
    loading,
    error,
    refresh: fetchConversation
  };
};
