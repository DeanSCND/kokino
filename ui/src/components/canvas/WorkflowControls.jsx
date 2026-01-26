/**
 * WorkflowControls - Orchestration control panel
 * Phase 4: Canvas Rewrite
 */

import React from 'react';
import useStore from '../../state/store.js';
import useOrchestration from '../../hooks/useOrchestration.js';
import { selectIsTeamValid } from '../../state/selectors.js';

export default function WorkflowControls() {
  const isTeamValid = useStore(selectIsTeamValid);

  const {
    isOrchestrating,
    isPaused,
    currentPhase,
    error,
    start,
    stop,
    pause,
    resume
  } = useOrchestration();

  const handleStart = async () => {
    try {
      await start();
    } catch (err) {
      console.error('Failed to start orchestration:', err);
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch (err) {
      console.error('Failed to stop orchestration:', err);
    }
  };

  const handlePause = async () => {
    try {
      await pause();
    } catch (err) {
      console.error('Failed to pause orchestration:', err);
    }
  };

  const handleResume = async () => {
    try {
      await resume();
    } catch (err) {
      console.error('Failed to resume orchestration:', err);
    }
  };

  return (
    <div className="workflow-controls">
      <div className="workflow-status">
        {isOrchestrating && (
          <div className={`status-badge ${isPaused ? 'paused' : 'running'}`}>
            {isPaused ? '⏸ Paused' : '▶ Running'}
          </div>
        )}
        {currentPhase && (
          <div className="phase-indicator">
            Phase: {currentPhase}
          </div>
        )}
        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}
      </div>

      <div className="workflow-actions">
        {!isOrchestrating ? (
          <button
            onClick={handleStart}
            disabled={!isTeamValid}
            className="btn-primary"
            title={!isTeamValid ? 'Team must have a root agent' : 'Start orchestration'}
          >
            ▶ Start
          </button>
        ) : (
          <>
            {isPaused ? (
              <button onClick={handleResume} className="btn-primary">
                ▶ Resume
              </button>
            ) : (
              <button onClick={handlePause} className="btn-secondary">
                ⏸ Pause
              </button>
            )}
            <button onClick={handleStop} className="btn-danger">
              ⏹ Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
