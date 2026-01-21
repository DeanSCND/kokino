import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';

/**
 * Loop Alert Component (Phase 8)
 * Displays warnings when message loops are detected in orchestration
 */
export const LoopAlert = ({ loop, onDismiss, onBreakLoop }) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md animate-slide-in">
      <div className="bg-warning border-l-4 border-orange-500 p-4 rounded-lg shadow-2xl">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0">
            <RefreshCw className="text-orange-500 animate-spin-slow" size={24} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-text flex items-center gap-2">
                <AlertTriangle size={18} className="text-orange-500" />
                Message Loop Detected
              </h3>
              <button
                onClick={handleDismiss}
                className="text-text-secondary hover:text-text transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-text-secondary mb-3">
              A circular message pattern has been detected between agents:
            </p>

            {/* Loop Pattern */}
            <div className="bg-surface-secondary p-3 rounded border border-border mb-3">
              <div className="font-mono text-xs text-text-secondary mb-2">
                Pattern (repeated {loop.repeatCount}x):
              </div>
              <div className="font-mono text-sm text-accent-purple">
                {loop.pattern.join(' → ')}
              </div>
            </div>

            {/* Affected Agents */}
            <div className="mb-3">
              <div className="text-xs text-text-secondary mb-1">
                Affected agents:
              </div>
              <div className="flex flex-wrap gap-1">
                {loop.affectedAgents.map(agent => (
                  <span
                    key={agent}
                    className="px-2 py-1 bg-surface-secondary text-text text-xs rounded border border-border"
                  >
                    {agent}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => onBreakLoop && onBreakLoop(loop)}
                className="flex-1 px-3 py-2 bg-accent-orange hover:bg-orange-600 text-white text-sm font-medium rounded transition-colors"
              >
                Break Loop
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 bg-surface-secondary hover:bg-border text-text text-sm font-medium rounded transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Loop Alert Manager Component
 * Manages multiple loop alerts
 */
export const LoopAlertManager = ({ loops = [], onDismiss, onBreakLoop }) => {
  const [visibleLoops, setVisibleLoops] = useState([]);

  useEffect(() => {
    setVisibleLoops(loops);
  }, [loops]);

  const handleDismiss = (loopIndex) => {
    setVisibleLoops(prev => prev.filter((_, i) => i !== loopIndex));
    if (onDismiss) onDismiss(loopIndex);
  };

  return (
    <div className="loop-alert-container">
      {visibleLoops.map((loop, index) => (
        <LoopAlert
          key={`${loop.patternString}-${loop.detectedAt}`}
          loop={loop}
          onDismiss={() => handleDismiss(index)}
          onBreakLoop={onBreakLoop}
        />
      ))}
    </div>
  );
};

/**
 * Loop Statistics Panel (for debugging/monitoring)
 */
export const LoopStatsPanel = ({ loopDetector }) => {
  const [stats, setStats] = useState(null);
  const [currentPath, setCurrentPath] = useState('');

  useEffect(() => {
    if (!loopDetector) return;

    const updateStats = () => {
      setStats(loopDetector.getStats());
      setCurrentPath(loopDetector.getCurrentPath());
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);

    return () => clearInterval(interval);
  }, [loopDetector]);

  if (!stats) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-text mb-3">
        Loop Detection Stats
      </h3>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-text-secondary">Total Messages:</span>
          <span className="text-text font-mono">{stats.totalMessages}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Unique Agents:</span>
          <span className="text-text font-mono">{stats.uniqueAgents}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Loops Detected:</span>
          <span className="text-text font-mono text-orange-500">
            {stats.loopsDetected}
          </span>
        </div>
        {stats.mostActiveAgent && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Most Active:</span>
            <span className="text-text font-mono">{stats.mostActiveAgent}</span>
          </div>
        )}
      </div>

      {currentPath && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs text-text-secondary mb-1">Current Path:</div>
          <div className="text-xs font-mono text-accent-purple break-all">
            {currentPath || 'No messages yet'}
          </div>
        </div>
      )}
    </div>
  );
};
