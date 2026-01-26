/**
 * Canvas - Refactored main canvas component
 * Phase 4: Canvas Rewrite
 *
 * Reduced from 1,547 lines to ~250 lines by:
 * - Moving state to Zustand store
 * - Extracting business logic to services
 * - Creating custom hooks for operations
 * - Extracting UI components
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge as addRFEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useStore from '../state/store.js';
import { wsConnection } from '../services/index.js';

// Extracted components
import { CanvasControls, WorkflowControls, CanvasContextMenu, TeamComposition, AgentNodeCustom } from '../components/canvas/index.js';

// Existing UI components
import { ConnectionEdge } from '../components/ConnectionEdge';
import { ChatPanel } from '../components/ChatPanel';
import { AgentDashboard } from '../components/AgentDashboard';
import { TerminalModal } from '../components/TerminalModal';
import { AgentChatPanel } from '../components/AgentChatPanel';
import { TemplateLibrary } from '../components/TemplateLibrary';
import { TimelineViewer } from '../components/TimelineViewer';
import { LoopAlertManager } from '../components/LoopAlert';
import { AgentLibraryPanel } from '../components/agents/AgentLibraryPanel';
import { GitHubIssues } from '../components/GitHubIssues';
import { BranchManager } from '../components/BranchManager';
import { CommitQueueViewer } from '../components/CommitQueueViewer';

// Register custom node and edge types
const nodeTypes = { agent: AgentNodeCustom };
const edgeTypes = { orchestrated: ConnectionEdge };

export const CanvasRefactored = ({ setHeaderControls }) => {
  const reactFlowWrapper = useRef(null);

  // State from Zustand store
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const setNodes = useStore(state => state.setNodes);
  const setEdges = useStore(state => state.setEdges);
  const addNode = useStore(state => state.addNode);
  const updateNode = useStore(state => state.updateNode);
  const addEdge = useStore(state => state.addEdge);
  const deleteNode = useStore(state => state.deleteNode);
  const deleteEdge = useStore(state => state.deleteEdge);
  const markDirty = useStore(state => state.markDirty);

  const showChatPanel = useStore(state => state.showChatPanel);
  const showTerminalPanel = useStore(state => state.showTerminalPanel);
  const showAgentLibrary = useStore(state => state.showAgentLibrary);
  const showTemplateLibrary = useStore(state => state.showTemplateLibrary);
  const showTimeline = useStore(state => state.showTimeline);
  const showGitHubIssues = useStore(state => state.showGitHubIssues);
  const showBranchManager = useStore(state => state.showBranchManager);
  const showCommitQueue = useStore(state => state.showCommitQueue);
  const showDashboard = useStore(state => state.showDashboard);

  const selectedChatAgent = useStore(state => state.selectedChatAgent);
  const selectedTerminalAgent = useStore(state => state.selectedTerminalAgent);

  const setContextMenu = useStore(state => state.setContextMenu);
  const closeContextMenu = useStore(state => state.closeContextMenu);
  const toggleAgentLibrary = useStore(state => state.toggleAgentLibrary);

  /**
   * Initialize WebSocket connection
   */
  useEffect(() => {
    wsConnection.connect();

    // Subscribe to agent status updates
    wsConnection.on('agent.status', (data) => {
      const { agentId, status } = data;
      updateNode(agentId, { status });
    });

    // Subscribe to orchestration events
    wsConnection.on('orchestration.message', (message) => {
      useStore.getState().addMessage(message);
    });

    wsConnection.on('orchestration.phase', (phase) => {
      useStore.getState().setCurrentPhase(phase);
    });

    return () => {
      wsConnection.disconnect();
    };
  }, [updateNode]);

  /**
   * ReactFlow event handlers
   */
  const onNodesChange = useCallback((changes) => {
    const updatedNodes = [...nodes];
    let hasChanges = false;

    changes.forEach(change => {
      if (change.type === 'position' && change.position) {
        const index = updatedNodes.findIndex(n => n.id === change.id);
        if (index !== -1) {
          updatedNodes[index] = {
            ...updatedNodes[index],
            position: change.position
          };
          hasChanges = true;
        }
      } else if (change.type === 'remove') {
        deleteNode(change.id);
        return;
      } else if (change.type === 'select') {
        const index = updatedNodes.findIndex(n => n.id === change.id);
        if (index !== -1) {
          updatedNodes[index] = {
            ...updatedNodes[index],
            selected: change.selected
          };
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setNodes(updatedNodes);
      markDirty();
    }
  }, [nodes, setNodes, deleteNode, markDirty]);

  const onEdgesChange = useCallback((changes) => {
    const updatedEdges = [...edges];
    let hasChanges = false;

    changes.forEach(change => {
      if (change.type === 'remove') {
        deleteEdge(change.id);
      } else if (change.type === 'select') {
        const index = updatedEdges.findIndex(e => e.id === change.id);
        if (index !== -1) {
          updatedEdges[index] = {
            ...updatedEdges[index],
            selected: change.selected
          };
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setEdges(updatedEdges);
    }
  }, [edges, setEdges, deleteEdge]);

  const onConnect = useCallback((connection) => {
    const newEdge = {
      id: `${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
      type: 'orchestrated'
    };
    addEdge(newEdge);
    markDirty();
  }, [addEdge, markDirty]);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'node',
      nodeId: node.id
    });
  }, [setContextMenu]);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      type: 'edge',
      edgeId: edge.id
    });
  }, [setContextMenu]);

  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    closeContextMenu();
  }, [closeContextMenu]);

  /**
   * Handler for adding agent from library
   */
  const handleAddAgentFromLibrary = useCallback((agentConfig) => {
    const newNode = {
      id: agentConfig.id || `agent-${Date.now()}`,
      type: 'agent',
      position: { x: Math.random() * 500, y: Math.random() * 500 },
      data: agentConfig
    };
    addNode(newNode);
    markDirty();
    toggleAgentLibrary();
  }, [addNode, markDirty, toggleAgentLibrary]);

  return (
    <div className="canvas-container">
      <CanvasControls />
      <WorkflowControls />
      <TeamComposition />

      <div ref={reactFlowWrapper} className="reactflow-wrapper">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background />
        </ReactFlow>
      </div>

      <CanvasContextMenu />

      {/* Panels */}
      {showChatPanel && <ChatPanel />}
      {showTerminalPanel && selectedTerminalAgent && (
        <TerminalModal agent={selectedTerminalAgent} />
      )}
      {showAgentLibrary && (
        <AgentLibraryPanel
          onClose={toggleAgentLibrary}
          onAddAgent={handleAddAgentFromLibrary}
        />
      )}
      {showTemplateLibrary && <TemplateLibrary />}
      {showTimeline && <TimelineViewer />}
      {showGitHubIssues && <GitHubIssues />}
      {showBranchManager && <BranchManager />}
      {showCommitQueue && <CommitQueueViewer />}
      {showDashboard && <AgentDashboard />}

      {selectedChatAgent && <AgentChatPanel agentId={selectedChatAgent} />}

      <LoopAlertManager />
    </div>
  );
};
