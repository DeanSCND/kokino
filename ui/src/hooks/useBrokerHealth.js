import { useState, useEffect } from 'react';
import apiClient from '../services/api-client';

/**
 * Hook to monitor broker connection health
 * Returns: { isConnected, lastCheck, error }
 */
export function useBrokerHealth(intervalMs = 5000) {
  const [isConnected, setIsConnected] = useState(null); // null = unknown, true/false = known state
  const [lastCheck, setLastCheck] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        const response = await apiClient.health();

        if (mounted) {
          setIsConnected(true);
          setLastCheck(new Date());
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setIsConnected(false);
          setLastCheck(new Date());
          setError(err.message || 'Broker unreachable');
        }
      }
    };

    // Initial check
    checkHealth();

    // Periodic health checks
    const interval = setInterval(checkHealth, intervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [intervalMs]);

  return { isConnected, lastCheck, error };
}
