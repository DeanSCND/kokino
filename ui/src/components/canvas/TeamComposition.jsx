/**
 * TeamComposition - Team stats and composition display
 * Phase 4: Canvas Rewrite
 */

import React from 'react';
import useStore from '../../state/store.js';
import {
  selectTeamSize,
  selectConnectionsCount,
  selectRootAgent,
  selectOnlineAgents
} from '../../state/selectors.js';

export default function TeamComposition() {
  const teamSize = useStore(selectTeamSize);
  const connectionsCount = useStore(selectConnectionsCount);
  const rootAgent = useStore(selectRootAgent);
  const onlineAgents = useStore(selectOnlineAgents);

  return (
    <div className="team-composition">
      <div className="composition-stats">
        <div className="stat">
          <span className="stat-label">Agents</span>
          <span className="stat-value">{teamSize}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Connections</span>
          <span className="stat-value">{connectionsCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Online</span>
          <span className="stat-value">{onlineAgents.length}</span>
        </div>
      </div>

      <div className="composition-info">
        {rootAgent ? (
          <div className="root-agent-info">
            👑 Root: {rootAgent.data?.name || 'Unnamed'}
          </div>
        ) : (
          <div className="warning">
            ⚠️ No root agent assigned
          </div>
        )}
      </div>
    </div>
  );
}
