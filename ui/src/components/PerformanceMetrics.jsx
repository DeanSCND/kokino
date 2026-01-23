import React, { useState, useEffect } from 'react';
import { Activity, Clock, AlertTriangle, RefreshCw, TrendingUp, Users } from 'lucide-react';

/**
 * Performance Metrics Dashboard (Phase 8)
 * Displays real-time orchestration performance metrics
 */
export const PerformanceMetrics = ({
  messageHistory = [],
  activeAgents = 0,
  loopDetector = null,
  escalationTracker = null
}) => {
  const [metrics, setMetrics] = useState({
    totalMessages: 0,
    messagesPerMinute: 0,
    averageLatency: 0,
    activeAgents: 0,
    loopsDetected: 0,
    escalations: 0,
    messagesByAgent: {},
    latencyByAgent: {}
  });

  const [refreshInterval, setRefreshInterval] = useState(1000);

  useEffect(() => {
    const updateMetrics = () => {
      // Calculate messages per minute
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      const recentMessages = messageHistory.filter(msg => msg.timestamp >= oneMinuteAgo);

      // Calculate average latency (time between messages)
      let totalLatency = 0;
      let latencyCount = 0;
      for (let i = 1; i < messageHistory.length; i++) {
        const latency = messageHistory[i].timestamp - messageHistory[i - 1].timestamp;
        if (latency > 0 && latency < 60000) { // Ignore gaps > 1 minute
          totalLatency += latency;
          latencyCount++;
        }
      }
      const averageLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

      // Messages by agent
      const messagesByAgent = {};
      const latencyByAgent = {};

      messageHistory.forEach((msg, index) => {
        const agent = msg.from || 'Unknown';
        messagesByAgent[agent] = (messagesByAgent[agent] || 0) + 1;

        // Calculate per-agent latency
        if (index > 0 && messageHistory[index - 1].to === agent) {
          const latency = msg.timestamp - messageHistory[index - 1].timestamp;
          if (!latencyByAgent[agent]) latencyByAgent[agent] = [];
          latencyByAgent[agent].push(latency);
        }
      });

      // Average latency by agent
      Object.keys(latencyByAgent).forEach(agent => {
        const latencies = latencyByAgent[agent];
        latencyByAgent[agent] = Math.round(
          latencies.reduce((a, b) => a + b, 0) / latencies.length
        );
      });

      // Get loop and escalation stats
      const loopStats = loopDetector?.getStats() || { loopsDetected: 0 };
      const escalationStats = escalationTracker?.getStats() || { total: 0 };

      setMetrics({
        totalMessages: messageHistory.length,
        messagesPerMinute: recentMessages.length,
        averageLatency,
        activeAgents,
        loopsDetected: loopStats.loopsDetected || 0,
        escalations: escalationStats.total || 0,
        messagesByAgent,
        latencyByAgent
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, refreshInterval);

    return () => clearInterval(interval);
  }, [messageHistory, activeAgents, loopDetector, escalationTracker, refreshInterval]);

  const MetricCard = ({ icon: Icon, label, value, suffix = '', color = 'text-accent-purple' }) => (
    <div className="bg-surface border border-border rounded-lg p-4 hover:border-text-secondary transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <Icon className={`${color}`} size={20} />
        <span className="text-xs text-text-secondary uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text">
        {value}
        {suffix && <span className="text-sm text-text-secondary ml-1">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Performance Metrics</h2>
        <div className="flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-2 py-1 bg-surface border border-border rounded text-xs text-text focus:outline-none focus:border-accent-purple"
          >
            <option value={500}>0.5s</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
          <RefreshCw size={14} className="text-text-secondary animate-spin-slow" />
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Activity}
          label="Total Messages"
          value={metrics.totalMessages}
          color="text-accent-blue"
        />
        <MetricCard
          icon={TrendingUp}
          label="Messages/Min"
          value={metrics.messagesPerMinute}
          color="text-accent-green"
        />
        <MetricCard
          icon={Clock}
          label="Avg Latency"
          value={metrics.averageLatency}
          suffix="ms"
          color="text-accent-orange"
        />
        <MetricCard
          icon={Users}
          label="Active Agents"
          value={metrics.activeAgents}
          color="text-accent-purple"
        />
      </div>

      {/* Alert Metrics */}
      {(metrics.loopsDetected > 0 || metrics.escalations > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={RefreshCw}
            label="Loops Detected"
            value={metrics.loopsDetected}
            color="text-orange-500"
          />
          <MetricCard
            icon={AlertTriangle}
            label="Escalations"
            value={metrics.escalations}
            color="text-red-500"
          />
        </div>
      )}

      {/* Agent Activity Breakdown */}
      {Object.keys(metrics.messagesByAgent).length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text mb-3">Agent Activity</h3>
          <div className="space-y-2">
            {Object.entries(metrics.messagesByAgent)
              .sort(([, a], [, b]) => b - a)
              .map(([agent, count]) => (
                <div key={agent} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{agent}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-text font-mono">{count} msg</span>
                    {metrics.latencyByAgent[agent] && (
                      <span className="text-text-muted font-mono">
                        {metrics.latencyByAgent[agent]}ms
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Message Rate Chart (Simple Text Visualization) */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-text mb-3">Message Throughput</h3>
        <div className="space-y-1">
          {messageHistory.slice(-10).map((msg, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-purple"></div>
              <span className="text-[10px] text-text-muted font-mono">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-xs text-text-secondary">
                {msg.from} → {msg.to}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
