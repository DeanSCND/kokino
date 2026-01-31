/**
 * TeamObservabilityDashboard Component
 * Issue #172: Main dashboard container integrating all observability components
 *
 * Provides unified interface for monitoring agent teams with:
 * - Message flow graph
 * - Live timeline
 * - Agent details
 * - Resizable panels
 * - WebSocket integration
 */

import React, { useEffect, useState } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  Maximize2,
  Minimize2,
  Download,
  Settings,
  Activity,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useObservabilityStore } from '../../stores';
import { MessageFlowGraph } from './MessageFlowGraph';
import { ConversationTimeline } from './ConversationTimeline';

/**
 * TeamObservabilityDashboard
 */
export const TeamObservabilityDashboard = ({
  teamId,
  agents: agentFilter = [],
  defaultLayout = 'split'
}) => {
  const [layout, setLayout] = useState(defaultLayout);
  const [fullscreen, setFullscreen] = useState(false);

  // Store state
  const {
    timeline,
    selectedAgent,
    timeRange,
    filters,
    isLoadingHistory,
    isConnected,
    applyFilter,
    stats
  } = useObservabilityStore();

  // Initialize: apply filters if needed
  useEffect(() => {
    // Apply agent filter if provided
    if (agentFilter.length > 0) {
      applyFilter({ agents: agentFilter });
    }
  }, [agentFilter]);

  // Export all data
  const handleExport = () => {
    const exportData = {
      teamId,
      exportedAt: new Date().toISOString(),
      timeRange,
      filters,
      stats,
      timeline
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `observability-${teamId || 'all'}-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">
            Observability Dashboard
          </h1>

          {teamId && (
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
              Team: {teamId}
            </span>
          )}

          {/* Connection Status */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">Offline</span>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              <span>{stats.activeAgents} agents</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{stats.totalMessages} messages</span>
            </div>
          </div>

          {isLoadingHistory && (
            <span className="text-sm text-gray-500">Loading...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Layout Switcher */}
          <div className="flex items-center gap-1 bg-gray-100 rounded p-1">
            <button
              onClick={() => setLayout('graph')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                layout === 'graph'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setLayout('timeline')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                layout === 'timeline'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setLayout('split')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                layout === 'split'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Split
            </button>
          </div>

          {/* Actions */}
          <button
            onClick={handleExport}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Export data"
          >
            <Download className="w-5 h-5 text-gray-600" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-gray-100 transition-colors"
            title="Toggle fullscreen"
          >
            {fullscreen ? (
              <Minimize2 className="w-5 h-5 text-gray-600" />
            ) : (
              <Maximize2 className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 overflow-hidden">
        {layout === 'graph' && (
          <div className="h-full">
            <MessageFlowGraph timeRange="hour" />
          </div>
        )}

        {layout === 'timeline' && (
          <div className="h-full">
            <ConversationTimeline autoScroll={isConnected} />
          </div>
        )}

        {layout === 'split' && (
          <PanelGroup direction="horizontal" className="h-full">
            {/* Message Flow Graph */}
            <Panel defaultSize={40} minSize={20}>
              <div className="h-full pr-2">
                <MessageFlowGraph timeRange="hour" />
              </div>
            </Panel>

            <PanelResizeHandle className="w-2 bg-gray-200 hover:bg-gray-300 transition-colors rounded" />

            {/* Timeline */}
            <Panel defaultSize={60} minSize={30}>
              <div className="h-full pl-2">
                <ConversationTimeline autoScroll={isConnected} />
              </div>
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* Selected Agent Detail (if any) */}
      {selectedAgent && (
        <div className="border-t border-gray-200 bg-white p-4 shadow-lg">
          <AgentDetailPanel agentId={selectedAgent} />
        </div>
      )}
    </div>
  );
};

/**
 * Agent Detail Panel
 * Shows detailed information about selected agent
 */
const AgentDetailPanel = ({ agentId }) => {
  const { getAgentMetrics, selectAgent } = useObservabilityStore();
  const metrics = getAgentMetrics(agentId);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div>
          <div className="text-sm text-gray-500">Selected Agent</div>
          <div className="text-lg font-semibold text-gray-900">{agentId}</div>
        </div>

        <div className="h-8 w-px bg-gray-300" />

        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-gray-500">Sent:</span>{' '}
            <span className="font-medium text-gray-900">{metrics.sentMessages}</span>
          </div>
          <div>
            <span className="text-gray-500">Received:</span>{' '}
            <span className="font-medium text-gray-900">{metrics.receivedMessages}</span>
          </div>
          <div>
            <span className="text-gray-500">Conversations:</span>{' '}
            <span className="font-medium text-gray-900">{metrics.conversationTurns}</span>
          </div>
          <div>
            <span className="text-gray-500">Threads:</span>{' '}
            <span className="font-medium text-gray-900">{metrics.activeThreads}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => selectAgent(null)}
        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
      >
        Clear Selection
      </button>
    </div>
  );
};
