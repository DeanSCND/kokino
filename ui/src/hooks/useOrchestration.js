/**
 * useOrchestration - Custom hook for workflow execution
 * Phase 4c: Component Extraction
 */

import { useEffect, useCallback } from 'react';
import useStore from '../state/store.js';
import { orchestrationService } from '../services/index.js';
import { selectIsTeamValid, selectRootAgent } from '../state/selectors.js';

export default function useOrchestration() {
  const isOrchestrating = useStore(state => state.isOrchestrating);
  const isPaused = useStore(state => state.isPaused);
  const executionId = useStore(state => state.executionId);
  const currentPhase = useStore(state => state.currentPhase);
  const messages = useStore(state => state.messages);
  const error = useStore(state => state.error);

  const startOrchestration = useStore(state => state.startOrchestration);
  const stopOrchestration = useStore(state => state.stopOrchestration);
  const pauseOrchestration = useStore(state => state.pauseOrchestration);
  const resumeOrchestration = useStore(state => state.resumeOrchestration);
  const setCurrentPhase = useStore(state => state.setCurrentPhase);
  const addMessage = useStore(state => state.addMessage);
  const setError = useStore(state => state.setError);

  /**
   * Start orchestration with validation
   */
  const start = useCallback(async (config = {}) => {
    const state = useStore.getState();
    const isValid = selectIsTeamValid(state);

    if (!isValid) {
      const errorMsg = 'Cannot start orchestration: Team must have a root agent';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      const rootAgent = selectRootAgent(state);
      const response = await orchestrationService.start(state.teamData.id, {
        rootAgentId: rootAgent.id,
        ...config
      });

      startOrchestration(response.executionId);
      return response;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [startOrchestration, setError]);

  /**
   * Stop orchestration
   */
  const stop = useCallback(async () => {
    if (!executionId) return;

    try {
      await orchestrationService.stop(executionId);
      stopOrchestration();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [executionId, stopOrchestration, setError]);

  /**
   * Pause orchestration
   */
  const pause = useCallback(async () => {
    if (!executionId) return;

    try {
      await orchestrationService.pause(executionId);
      pauseOrchestration();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [executionId, pauseOrchestration, setError]);

  /**
   * Resume orchestration
   */
  const resume = useCallback(async () => {
    if (!executionId) return;

    try {
      await orchestrationService.resume(executionId);
      resumeOrchestration();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [executionId, resumeOrchestration, setError]);

  /**
   * Poll orchestration status
   */
  useEffect(() => {
    if (!isOrchestrating || !executionId || isPaused) return;

    const interval = setInterval(async () => {
      try {
        const status = await orchestrationService.getStatus(executionId);

        setCurrentPhase(status.currentPhase);

        // Add new messages
        if (status.messages && status.messages.length > 0) {
          status.messages.forEach(msg => addMessage(msg));
        }

        // Check if completed
        if (status.completed) {
          stopOrchestration();
        }
      } catch (err) {
        console.error('Failed to poll orchestration status:', err);
        setError(err.message);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [isOrchestrating, executionId, isPaused, setCurrentPhase, addMessage, stopOrchestration, setError]);

  return {
    isOrchestrating,
    isPaused,
    executionId,
    currentPhase,
    messages,
    error,
    start,
    stop,
    pause,
    resume
  };
}
