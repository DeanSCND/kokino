import React, { useState, useEffect } from 'react';
import { Activity, AlertCircle, Cpu, HardDrive, RefreshCw, Clock, TrendingUp, Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import apiClient from '../services/api-client';
import { useToast } from '../contexts/ToastContext';

/**
 * MonitoringDashboard - Phase 6.4
 * Comprehensive agent monitoring dashboard with real-time metrics
 */
export const MonitoringDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentDetails, setAgentDetails] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastAlertCheck, setLastAlertCheck] = useState(Date.now());
  const toast = useToast();

  // Load dashboard data
  const loadDashboard = async () => {
    try {
      const data = await apiClient.getMonitoringDashboard();
      setDashboard(data);
      setLastUpdate(Date.now());
    } catch (error) {
      console.error('[MonitoringDashboard] Failed to load:', error);
      toast.error('Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  };

  // Load errors
  const loadErrors = async () => {
    try {
      const data = await apiClient.getErrors({ resolved: 'false', limit: 50 });
      setErrors(data.errors || []);
    } catch (error) {
      console.error('[MonitoringDashboard] Failed to load errors:', error);
    }
  };

  // Load agent details
  const loadAgentDetails = async (agentId) => {
    try {
      const data = await apiClient.getAgentDashboard(agentId, 24);
      setAgentDetails(data);
    } catch (error) {
      console.error('[MonitoringDashboard] Failed to load agent details:', error);
      toast.error(`Failed to load agent ${agentId} details`);
    }
  };

  // Initial load
  useEffect(() => {
    loadDashboard();
    loadErrors();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadDashboard();
      loadErrors();
      if (selectedAgent) {
        loadAgentDetails(selectedAgent);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedAgent]);

  // Alert notifications polling (Phase 6.5)
  useEffect(() => {
    const checkForAlerts = async () => {
      try {
        // Poll for warning/error events since last check
        const data = await apiClient.getEvents({
          eventType: 'warning,error',
          limit: 20
        });

        const newAlerts = data.events.filter(event => {
          const eventTime = new Date(event.timestamp).getTime();
          return eventTime > lastAlertCheck &&
                 (event.event_type === 'warning' || event.event_type === 'error');
        });

        // Show toast notifications for new alerts
        newAlerts.forEach(alert => {
          const severity = alert.event_type === 'error' ? 'error' : 'warning';
          toast[severity](`${alert.agent_id}: ${alert.message}`, 8000);
        });

        if (newAlerts.length > 0) {
          setLastAlertCheck(Date.now());
        }
      } catch (error) {
        console.error('[MonitoringDashboard] Alert check failed:', error);
      }
    };

    // Check for alerts every 10 seconds
    const interval = setInterval(checkForAlerts, 10000);

    return () => clearInterval(interval);
  }, [lastAlertCheck, toast]);

  // Handle agent selection
  const handleAgentClick = async (agentId) => {
    setSelectedAgent(agentId);
    await loadAgentDetails(agentId);
  };

  // Handle error resolution
  const handleResolveError = async (errorId) => {
    try {
      await apiClient.resolveError(errorId, 'dashboard-user');
      toast.success('Error marked as resolved');
      loadErrors();
    } catch (error) {
      console.error('[MonitoringDashboard] Failed to resolve error:', error);
      toast.error('Failed to resolve error');
    }
  };

  // Manual refresh
  const handleRefresh = () => {
    loadDashboard();
    loadErrors();
    if (selectedAgent) {
      loadAgentDetails(selectedAgent);
    }
    toast.info('Dashboard refreshed');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="animate-spin text-accent-purple mx-auto mb-2" size={32} />
          <p className="text-text-secondary">Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="text-text-muted mx-auto mb-2" size={32} />
          <p className="text-text-secondary">No monitoring data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Agent Monitoring</h1>
          <p className="text-sm text-text-secondary mt-1">
            Last updated: {new Date(lastUpdate).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-accent-purple text-white rounded hover:bg-accent-purple/80 flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Users}
          label="Active Agents"
          value={dashboard.agents?.length || 0}
          color="text-accent-purple"
        />
        <MetricCard
          icon={Activity}
          label="Total Events"
          value={dashboard.recentEvents?.length || 0}
          color="text-accent-blue"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Active Errors"
          value={dashboard.activeErrors?.reduce((sum, e) => sum + e.count, 0) || 0}
          color="text-orange-500"
        />
        <MetricCard
          icon={Cpu}
          label="Avg CPU"
          value={calculateAvgCpu(dashboard.agents)}
          suffix="%"
          color="text-accent-green"
        />
      </div>

      {/* Agent Health Grid */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text mb-3">Agent Health</h2>
        {dashboard.agents?.length > 0 ? (
          <div className="grid grid-cols-3 gap-4">
            {dashboard.agents.map(agent => (
              <AgentHealthCard
                key={agent.agentId}
                agent={agent}
                onClick={() => handleAgentClick(agent.agentId)}
                isSelected={selectedAgent === agent.agentId}
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-text-secondary">No agents currently online</p>
          </div>
        )}
      </div>

      {/* Error Logs */}
      {errors.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-text mb-3">Unresolved Errors</h2>
          <ErrorLogsViewer errors={errors} onResolve={handleResolveError} />
        </div>
      )}

      {/* Agent Details Modal */}
      {selectedAgent && agentDetails && (
        <AgentDetailModal
          agent={agentDetails}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ icon: Icon, label, value, suffix = '', color = 'text-accent-purple' }) => (
  <div className="bg-surface border border-border rounded-lg p-4 hover:border-text-secondary transition-colors">
    <div className="flex items-center gap-3 mb-2">
      <Icon className={color} size={20} />
      <span className="text-xs text-text-secondary uppercase tracking-wider">{label}</span>
    </div>
    <div className="text-2xl font-bold text-text">
      {value}
      {suffix && <span className="text-sm text-text-secondary ml-1">{suffix}</span>}
    </div>
  </div>
);

// Agent Health Card Component
const AgentHealthCard = ({ agent, onClick, isSelected }) => {
  const status = agent.status;
  const metrics = agent.metrics;

  const statusColors = {
    online: 'text-green-500 border-green-500/30 bg-green-500/10',
    offline: 'text-red-500 border-red-500/30 bg-red-500/10',
    error: 'text-orange-500 border-orange-500/30 bg-orange-500/10'
  };

  const StatusIcon = status === 'online' ? CheckCircle : status === 'offline' ? XCircle : AlertTriangle;

  return (
    <div
      onClick={onClick}
      className={`bg-surface border rounded-lg p-4 cursor-pointer transition-all hover:border-accent-purple ${
        isSelected ? 'border-accent-purple ring-2 ring-accent-purple/20' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-text truncate">{agent.agentId}</h3>
        <div className={`flex items-center gap-1 px-2 py-1 rounded border ${statusColors[status]}`}>
          <StatusIcon size={12} />
          <span className="text-xs capitalize">{status}</span>
        </div>
      </div>

      {metrics ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-text-secondary">
              <Cpu size={14} />
              <span>CPU</span>
            </div>
            <span className="font-mono text-text">{metrics.cpu_percent?.toFixed(1) || 0}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-text-secondary">
              <HardDrive size={14} />
              <span>Memory</span>
            </div>
            <span className="font-mono text-text">{metrics.memory_mb || 0} MB</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-text-secondary">
              <AlertCircle size={14} />
              <span>Errors</span>
            </div>
            <span className="font-mono text-text">{metrics.error_count || 0}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">No metrics available</p>
      )}
    </div>
  );
};

// Error Logs Viewer Component
const ErrorLogsViewer = ({ errors, onResolve }) => (
  <div className="bg-surface border border-border rounded-lg overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-surface-dark border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">Agent</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">Error</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">Timestamp</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {errors.map(error => (
            <tr key={error.id} className="hover:bg-surface-dark transition-colors">
              <td className="px-4 py-3 text-sm text-text font-mono">{error.agent_id}</td>
              <td className="px-4 py-3 text-sm text-text max-w-md truncate" title={error.message}>
                {error.message}
              </td>
              <td className="px-4 py-3 text-sm text-text-secondary">
                {new Date(error.timestamp).toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onResolve(error.id)}
                  className="text-xs px-3 py-1 bg-accent-green text-white rounded hover:bg-accent-green/80"
                >
                  Resolve
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// Agent Detail Modal Component
const AgentDetailModal = ({ agent, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-text">Agent Details: {agent.agent.agentId}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text">
            <XCircle size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Metrics Summary */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard icon={Cpu} label="Avg CPU" value={agent.summary?.avgCpu?.toFixed(1) || 0} suffix="%" color="text-accent-blue" />
            <MetricCard icon={Cpu} label="Max CPU" value={agent.summary?.maxCpu?.toFixed(1) || 0} suffix="%" color="text-orange-500" />
            <MetricCard icon={HardDrive} label="Avg Memory" value={agent.summary?.avgMemory?.toFixed(0) || 0} suffix="MB" color="text-accent-green" />
            <MetricCard icon={HardDrive} label="Max Memory" value={agent.summary?.maxMemory?.toFixed(0) || 0} suffix="MB" color="text-red-500" />
          </div>

          {/* Recent Metrics */}
          {agent.metrics?.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-text mb-3">Recent Metrics (24h)</h3>
              <div className="bg-surface-dark border border-border rounded-lg p-4 overflow-x-auto">
                <div className="min-w-[600px] space-y-1">
                  {agent.metrics.slice(0, 10).map((metric, i) => (
                    <div key={i} className="flex items-center gap-4 text-xs font-mono">
                      <span className="text-text-muted">{new Date(metric.timestamp).toLocaleTimeString()}</span>
                      <span className="text-text-secondary">CPU: <span className="text-text">{metric.cpu_percent?.toFixed(1)}%</span></span>
                      <span className="text-text-secondary">Memory: <span className="text-text">{metric.memory_mb}MB</span></span>
                      <span className="text-text-secondary">Status: <span className="text-text">{metric.status}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Events */}
          {agent.events?.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-text mb-3">Recent Events</h3>
              <div className="bg-surface-dark border border-border rounded-lg p-4 space-y-2">
                {agent.events.slice(0, 10).map((event, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-text-muted text-xs">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      event.event_type === 'error' ? 'bg-red-500/20 text-red-500' :
                      event.event_type === 'warning' ? 'bg-orange-500/20 text-orange-500' :
                      'bg-blue-500/20 text-blue-500'
                    }`}>
                      {event.event_type}
                    </span>
                    <span className="text-text-secondary">{event.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {agent.errors?.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-text mb-3">Error History</h3>
              <div className="bg-surface-dark border border-border rounded-lg p-4 space-y-2">
                {agent.errors.map((error, i) => (
                  <div key={i} className="text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-text-muted text-xs">{new Date(error.timestamp).toLocaleString()}</span>
                      {error.resolved ? (
                        <span className="text-xs text-green-500">Resolved</span>
                      ) : (
                        <span className="text-xs text-red-500">Unresolved</span>
                      )}
                    </div>
                    <p className="text-text-secondary">{error.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper function
const calculateAvgCpu = (agents) => {
  if (!agents || agents.length === 0) return 0;
  const validMetrics = agents.filter(a => a.metrics?.cpu_percent);
  if (validMetrics.length === 0) return 0;
  const sum = validMetrics.reduce((acc, a) => acc + a.metrics.cpu_percent, 0);
  return (sum / validMetrics.length).toFixed(1);
};
