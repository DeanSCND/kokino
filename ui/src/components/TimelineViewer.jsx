import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Play, Pause, SkipBack, SkipForward, Filter, Download } from 'lucide-react';

/**
 * Thread Timeline Viewer
 *
 * Displays chronological message history with:
 * - Thread grouping
 * - Search and filter
 * - Replay scrubber
 * - Export functionality
 */
export const TimelineViewer = ({ onClose }) => {
  const [messages, setMessages] = useState([]);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const timelineRef = useRef(null);
  const playbackTimerRef = useRef(null);

  // Fetch message history from broker
  useEffect(() => {
    fetchMessageHistory();
    const interval = setInterval(fetchMessageHistory, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchMessageHistory = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5050/api/messages/history');
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('[timeline] Failed to fetch message history:', error);
    }
  };

  // Filter messages
  useEffect(() => {
    let filtered = messages;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(msg =>
        msg.payload?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.to?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Agent filter
    if (filterAgent !== 'all') {
      filtered = filtered.filter(msg =>
        msg.from === filterAgent || msg.to === filterAgent
      );
    }

    setFilteredMessages(filtered);
  }, [messages, searchQuery, filterAgent]);

  // Playback controls
  useEffect(() => {
    if (isPlaying && playbackPosition < filteredMessages.length) {
      playbackTimerRef.current = setTimeout(() => {
        setPlaybackPosition(prev => prev + 1);
      }, 1000 / playbackSpeed);
    } else if (playbackPosition >= filteredMessages.length) {
      setIsPlaying(false);
      setPlaybackPosition(0);
    }

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
      }
    };
  }, [isPlaying, playbackPosition, filteredMessages.length, playbackSpeed]);

  // Get unique agents for filter
  const agents = ['all', ...new Set(messages.flatMap(m => [m.from, m.to]).filter(Boolean))];

  // Export timeline
  const handleExport = () => {
    const data = JSON.stringify(filteredMessages, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timeline-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get message status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered': return 'text-green-400';
      case 'pending': return 'text-yellow-400';
      case 'failed': return 'text-red-400';
      default: return 'text-text-secondary';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeline-viewer-title"
    >
      {/* Modal */}
      <div
        className="w-[1200px] h-[800px] bg-surface rounded-xl shadow-2xl border border-border flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 bg-surface-hover border-b border-border flex items-center justify-between px-6">
          <h2 id="timeline-viewer-title" className="text-lg font-semibold text-text-primary">
            Thread Timeline
          </h2>
          <div className="flex items-center gap-2">
            {/* Export */}
            <button
              onClick={handleExport}
              className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-sm font-medium transition-colors flex items-center gap-1.5"
              title="Export Timeline"
            >
              <Download size={16} />
              Export
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="p-4 border-b border-border bg-surface-hover">
          <div className="flex gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-border rounded pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
              />
            </div>

            {/* Agent Filter */}
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-text-secondary" />
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
              >
                {agents.map(agent => (
                  <option key={agent} value={agent}>
                    {agent === 'all' ? 'All Agents' : agent}
                  </option>
                ))}
              </select>
            </div>

            {/* Speed Control */}
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </div>
        </div>

        {/* Timeline Messages */}
        <div ref={timelineRef} className="flex-1 overflow-y-auto p-6">
          {filteredMessages.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              No messages in timeline
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMessages.slice(0, isPlaying ? playbackPosition : filteredMessages.length).map((msg, index) => (
                <div
                  key={msg.id || index}
                  className={`flex gap-4 p-4 rounded-lg border transition-all ${
                    index === playbackPosition - 1 && isPlaying
                      ? 'bg-accent-purple/10 border-accent-purple'
                      : 'bg-surface-hover border-border'
                  }`}
                >
                  {/* Timestamp */}
                  <div className="w-24 flex-shrink-0">
                    <div className="text-xs text-text-secondary">
                      {formatTime(msg.timestamp)}
                    </div>
                    <div className={`text-xs mt-1 ${getStatusColor(msg.status)}`}>
                      {msg.status || 'sent'}
                    </div>
                  </div>

                  {/* Flow: From → To */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-accent-blue/10 text-accent-blue text-xs font-medium rounded">
                        {msg.from || 'System'}
                      </span>
                      <span className="text-text-secondary">→</span>
                      <span className="px-2 py-1 bg-accent-purple/10 text-accent-purple text-xs font-medium rounded">
                        {msg.to || 'Broadcast'}
                      </span>
                      {msg.threadId && (
                        <span className="text-xs text-text-secondary">
                          Thread: {msg.threadId}
                        </span>
                      )}
                    </div>

                    {/* Message Content */}
                    <div className="text-sm text-text-primary">
                      {typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)}
                    </div>

                    {/* Metadata */}
                    {msg.metadata && Object.keys(msg.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-text-secondary">
                        {Object.entries(msg.metadata).map(([key, value]) => (
                          <span key={key} className="mr-3">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Latency */}
                  {msg.latency && (
                    <div className="w-20 flex-shrink-0 text-right">
                      <div className="text-xs text-text-secondary">Latency</div>
                      <div className={`text-sm font-medium ${
                        msg.latency < 100 ? 'text-green-400' :
                        msg.latency < 500 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {msg.latency}ms
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Playback Controls */}
        <div className="h-20 border-t border-border bg-surface-hover px-6 py-3">
          {/* Scrubber */}
          <div className="mb-3">
            <input
              type="range"
              min={0}
              max={filteredMessages.length}
              value={playbackPosition}
              onChange={(e) => setPlaybackPosition(Number(e.target.value))}
              className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-accent-purple"
            />
            <div className="flex justify-between text-xs text-text-secondary mt-1">
              <span>{playbackPosition} / {filteredMessages.length}</span>
              <span>{playbackSpeed}x speed</span>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPlaybackPosition(0)}
              className="p-2 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded transition-colors"
              title="Reset to start"
            >
              <SkipBack size={20} />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 bg-accent-purple hover:bg-purple-600 text-white rounded transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>

            <button
              onClick={() => setPlaybackPosition(filteredMessages.length)}
              className="p-2 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded transition-colors"
              title="Skip to end"
            >
              <SkipForward size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
