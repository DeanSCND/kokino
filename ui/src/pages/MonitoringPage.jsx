/**
 * MonitoringPage - Tabbed Interface
 * Issue #182: Integrates Phase 6 metrics with Phase 3 observability components
 *
 * Provides unified access to:
 * - System Metrics (Phase 6) - CPU, memory, errors, agent health
 * - Conversations (Phase 3) - Timeline of all agent activity
 * - Message Flow (Phase 3) - Interactive graph of agent interactions
 * - Teams (Phase 3) - Team observability dashboard
 */

import React, { useState, useEffect } from 'react';
import { Activity, MessageSquare, GitBranch, Users } from 'lucide-react';
import { MonitoringDashboard } from '../components/MonitoringDashboard';
import { ConversationTimeline } from '../components/monitoring/ConversationTimeline';
import { MessageFlowGraph } from '../components/monitoring/MessageFlowGraph';
import { TeamObservabilityDashboard } from '../components/monitoring/TeamObservabilityDashboard';
import { useObservabilityStore } from '../stores';

const TABS = [
  {
    id: 'metrics',
    label: 'System Metrics',
    icon: Activity,
    description: 'Agent health, CPU, memory, errors'
  },
  {
    id: 'conversations',
    label: 'Conversations',
    icon: MessageSquare,
    description: 'Timeline of all agent activity'
  },
  {
    id: 'flow',
    label: 'Message Flow',
    icon: GitBranch,
    description: 'Interactive graph of agent interactions'
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: Users,
    description: 'Team observability dashboard'
  }
];

export const MonitoringPage = () => {
  const [activeTab, setActiveTab] = useState('metrics');
  const { loadHistory, connectWebSocket, disconnectWebSocket } = useObservabilityStore();

  // Load data on mount
  useEffect(() => {
    loadHistory();
    connectWebSocket();

    return () => {
      disconnectWebSocket();
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 pt-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Monitoring</h1>
          <p className="text-sm text-gray-600 mb-4">
            Real-time visibility into agent activity and system health
          </p>
        </div>

        <div className="flex items-center px-6 gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
                  ${isActive
                    ? 'border-blue-500 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }
                `}
                title={tab.description}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden p-6">
        {activeTab === 'metrics' && <MonitoringDashboard />}
        {activeTab === 'conversations' && (
          <div className="h-full">
            <ConversationTimeline autoScroll={false} showFilters={true} />
          </div>
        )}
        {activeTab === 'flow' && (
          <div className="h-full">
            <MessageFlowGraph timeRange="hour" autoLayout={true} />
          </div>
        )}
        {activeTab === 'teams' && (
          <div className="h-full">
            <TeamObservabilityDashboard defaultLayout="split" />
          </div>
        )}
      </div>
    </div>
  );
};
