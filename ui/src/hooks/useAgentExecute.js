import { useState } from 'react';
import broker from '../services/broker';

/**
 * Hook for executing tasks on headless agents
 *
 * Usage:
 *   const { execute, executing, error } = useAgentExecute(agentId);
 *   await execute('Review the latest code changes');
 */
export const useAgentExecute = (agentId) => {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);

  const execute = async (prompt, options = {}) => {
    setExecuting(true);
    setError(null);

    try {
      const result = await broker.executeTask(agentId, {
        prompt,
        timeoutMs: options.timeoutMs || 300000, // 5 min default
        metadata: options.metadata || {}
      });

      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setExecuting(false);
    }
  };

  return {
    execute,
    executing,
    error
  };
};
