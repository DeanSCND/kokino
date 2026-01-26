/**
 * AgentNode - Individual agent node component
 * Phase 4c: Component Extraction
 */

import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import useStore from '../../state/store.js';

const AgentNode = memo(({ id, data, selected }) => {
  const agentStatus = useStore(state => state.agentStatuses[id]);
  const setContextMenu = useStore(state => state.setContextMenu);

  const handleContextMenu = (event) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'node',
      nodeId: id
    });
  };

  const statusColor = {
    online: '#4ade80',
    offline: '#94a3b8',
    error: '#ef4444',
    busy: '#fbbf24'
  }[agentStatus?.status] || '#94a3b8';

  return (
    <div
      className={`agent-node ${selected ? 'selected' : ''} ${data.isRoot ? 'root' : ''}`}
      onContextMenu={handleContextMenu}
    >
      <Handle type="target" position={Position.Top} />

      <div className="node-header">
        <div className="status-indicator" style={{ backgroundColor: statusColor }} />
        <div className="node-title">
          {data.isRoot && <span className="root-badge">👑</span>}
          {data.name || 'Unnamed Agent'}
        </div>
      </div>

      {data.role && (
        <div className="node-role">{data.role}</div>
      )}

      {agentStatus?.lastSeen && (
        <div className="node-footer">
          Last seen: {new Date(agentStatus.lastSeen).toLocaleTimeString()}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
});

AgentNode.displayName = 'AgentNode';

export default AgentNode;
