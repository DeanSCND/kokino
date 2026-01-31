/**
 * MessageFlowGraph Component
 * Issue #171: Interactive graph showing message flow between agents
 *
 * Uses React Flow to visualize agent interactions with real-time updates.
 */

import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  MarkerType,
  Position,
  Handle
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { useObservabilityStore } from '../../stores';
import { Activity, Loader } from 'lucide-react';

// Auto-layout using dagre
const getLayoutedElements = (nodes, edges) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 80 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 90,
        y: nodeWithPosition.y - 40
      }
    };
  });

  return { nodes: layoutedNodes, edges };
};

/**
 * Custom Agent Node Component
 */
const AgentNode = ({ data }) => {
  const statusColors = {
    idle: 'bg-gray-100 border-gray-300',
    online: 'bg-green-50 border-green-400',
    offline: 'bg-red-50 border-red-400',
    ready: 'bg-blue-50 border-blue-400',
    executing: 'bg-yellow-50 border-yellow-400',
    error: 'bg-red-100 border-red-500'
  };

  const statusDotColors = {
    idle: 'bg-gray-400',
    online: 'bg-green-500',
    offline: 'bg-red-500',
    ready: 'bg-blue-500',
    executing: 'bg-yellow-500',
    error: 'bg-red-600'
  };

  const bgColor = statusColors[data.status] || statusColors.idle;
  const dotColor = statusDotColors[data.status] || statusDotColors.idle;

  return (
    <div className={`px-4 py-3 rounded-lg border-2 shadow-sm ${bgColor} min-w-[180px]`}>
      {/* Target Handle (for incoming edges) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#555' }}
      />

      {/* Agent Name with Status Indicator */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <div className="font-semibold text-sm text-gray-900 truncate">
          {data.name || data.agentId}
        </div>
      </div>

      {/* Message Stats */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-3">
          <span title="Messages sent">↑ {data.sent || 0}</span>
          <span title="Messages received">↓ {data.received || 0}</span>
        </div>

        {data.pending > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
            {data.pending}
          </span>
        )}
      </div>

      {/* Average Response Time */}
      {data.avgResponseTime > 0 && (
        <div className="mt-1 text-xs text-gray-500">
          ~{Math.round(data.avgResponseTime)}ms
        </div>
      )}

      {/* Source Handle (for outgoing edges) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#555' }}
      />
    </div>
  );
};

// Register custom node type
const nodeTypes = {
  agent: AgentNode
};

/**
 * MessageFlowGraph Component
 */
export const MessageFlowGraph = ({
  timeRange = 'hour',
  autoLayout = true
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLoading, setIsLoading] = useState(true);

  const { selectedAgent, selectAgent } = useObservabilityStore();

  // Fetch interaction data from broker
  useEffect(() => {
    const fetchInteractions = async () => {
      setIsLoading(true);
      try {
        const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';
        const response = await fetch(
          `${BROKER_URL}/api/monitoring/interactions?timeRange=${timeRange}`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Build nodes from agents
        const nodeData = data.agents.map((agent) => ({
          id: agent.agentId,
          type: 'agent',
          data: {
            agentId: agent.agentId,
            name: agent.name,
            status: agent.status,
            sent: agent.messageStats.sent,
            received: agent.messageStats.received,
            pending: agent.messageStats.pending,
            avgResponseTime: agent.messageStats.avgResponseTime
          },
          position: { x: 0, y: 0 } // Will be set by layout
        }));

        // Build edges from interactions
        const edgeData = data.edges.map((edge, index) => ({
          id: `edge-${edge.from}-${edge.to}-${index}`,
          source: edge.from,
          target: edge.to,
          type: 'default',
          animated: edge.isActive,
          label: edge.messageCount > 1 ? `${edge.messageCount}` : undefined,
          style: {
            stroke: edge.isActive ? '#3b82f6' : '#9ca3af',
            strokeWidth: Math.min(2 + Math.log(edge.messageCount), 6)
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.isActive ? '#3b82f6' : '#9ca3af'
          },
          data: {
            messageCount: edge.messageCount,
            isActive: edge.isActive,
            threads: edge.threads
          }
        }));

        // Apply auto-layout
        if (autoLayout && nodeData.length > 0) {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            nodeData,
            edgeData
          );
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        } else {
          setNodes(nodeData);
          setEdges(edgeData);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('[MessageFlowGraph] Failed to fetch interactions:', error);
        setIsLoading(false);
      }
    };

    fetchInteractions();

    // Refresh every 30 seconds
    const interval = setInterval(fetchInteractions, 30000);
    return () => clearInterval(interval);
  }, [timeRange, autoLayout, setNodes, setEdges]);

  // Handle node click
  const onNodeClick = useCallback((event, node) => {
    selectAgent(node.data.agentId);
  }, [selectAgent]);

  // Highlight selected agent
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        style: {
          ...node.style,
          boxShadow: node.data.agentId === selectedAgent
            ? '0 0 0 3px rgba(59, 130, 246, 0.5)'
            : undefined
        }
      }))
    );
  }, [selectedAgent, setNodes]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg shadow">
        <Loader className="w-8 h-8 text-blue-500 animate-spin mb-3" />
        <p className="text-gray-600">Loading message flow graph...</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg shadow">
        <Activity className="w-12 h-12 text-gray-400 mb-3" />
        <p className="text-lg font-medium text-gray-600">No agent interactions</p>
        <p className="text-sm text-gray-500">No messages in the selected time range</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-lg shadow overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'default',
          style: { strokeWidth: 2 }
        }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const status = node.data?.status || 'idle';
            const colors = {
              idle: '#d1d5db',
              online: '#86efac',
              offline: '#fca5a5',
              ready: '#93c5fd',
              executing: '#fde047',
              error: '#f87171'
            };
            return colors[status] || colors.idle;
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      </ReactFlow>
    </div>
  );
};
