/**
 * ConversationTimeline Component
 * Issue #170: Unified timeline with virtual scrolling
 *
 * Displays all agent activity (messages + conversations) in a performant
 * virtualized list with search, filtering, and auto-scroll support.
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Search, Filter, Download, Play, Pause, MessageSquare, Users } from 'lucide-react';
import { useObservabilityStore } from '../../stores';

export const ConversationTimeline = ({
  autoScroll = false,
  showFilters = true
}) => {
  const listRef = useRef();
  const [searchTerm, setSearchTerm] = useState('');
  const [isLive, setIsLive] = useState(autoScroll);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'message' | 'conversation'

  // Sync isLive with autoScroll prop changes (e.g., when WebSocket connects/disconnects)
  useEffect(() => {
    setIsLive(autoScroll);
  }, [autoScroll]);

  // Get data from store
  const {
    timeline,
    selectedAgent,
    selectedThread,
    selectAgent,
    selectThread,
    filters,
    applyFilter
  } = useObservabilityStore();

  // Filter entries based on search and type
  const filteredEntries = useMemo(() => {
    let result = timeline;

    // Apply search filter
    if (searchTerm) {
      result = result.filter(entry =>
        entry.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.agent_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.target_agent_id?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter(entry => entry.type === typeFilter);
    }

    return result;
  }, [timeline, searchTerm, typeFilter]);

  // Fixed row height for virtualized list
  const ROW_HEIGHT = 120;

  // Auto-scroll to bottom on new entries (when live mode enabled)
  useEffect(() => {
    if (isLive && listRef.current && filteredEntries.length > 0) {
      listRef.current.scrollToItem(filteredEntries.length - 1, 'end');
    }
  }, [filteredEntries.length, isLive]);

  // Export timeline data
  const handleExport = () => {
    const dataStr = JSON.stringify(filteredEntries, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timeline-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Row renderer for virtualized list
  const Row = ({ index, style }) => {
    const entry = filteredEntries[index];
    if (!entry) return null;

    const isSelected = entry.agent_id === selectedAgent ||
                      entry.thread_id === selectedThread;

    return (
      <div
        style={style}
        className={`
          px-4 py-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer
          transition-colors
          ${isSelected ? 'bg-blue-50 border-blue-300' : ''}
        `}
        onClick={() => {
          if (entry.agent_id) selectAgent(entry.agent_id);
          if (entry.thread_id) selectThread(entry.thread_id);
        }}
      >
        <TimelineEntry entry={entry} />
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>

        <div className="flex items-center gap-2">
          {/* Live/Pause Toggle */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`
              p-2 rounded transition-colors
              ${isLive ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
            `}
            title={isLive ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            {isLive ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="p-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            title="Export timeline data"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search timeline..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="message">Messages Only</option>
            <option value="conversation">Conversations Only</option>
          </select>

          {/* Entry Count */}
          <div className="text-sm text-gray-600 whitespace-nowrap">
            {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>
      )}

      {/* Timeline List */}
      <div className="flex-1">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MessageSquare className="w-12 h-12 mb-3 text-gray-400" />
            <p className="text-lg font-medium">No timeline entries</p>
            <p className="text-sm">Try adjusting your filters or time range</p>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              <List
                ref={listRef}
                height={height}
                width={width}
                itemCount={filteredEntries.length}
                itemSize={ROW_HEIGHT}
                overscanCount={5}
              >
                {Row}
              </List>
            )}
          </AutoSizer>
        )}
      </div>
    </div>
  );
};

/**
 * Individual timeline entry component
 */
const TimelineEntry = ({ entry }) => {
  const timestamp = new Date(entry.timestamp);
  const timeStr = timestamp.toLocaleTimeString();
  const dateStr = timestamp.toLocaleDateString();

  // Format content (truncate if too long)
  const content = entry.content || '';
  const displayContent = content.length > 200
    ? `${content.substring(0, 200)}...`
    : content;

  return (
    <div className="flex gap-4">
      {/* Timestamp */}
      <div className="flex-shrink-0 w-24 text-right">
        <div className="text-sm font-medium text-gray-900">{timeStr}</div>
        <div className="text-xs text-gray-500">{dateStr}</div>
      </div>

      {/* Type Badge */}
      <div className="flex-shrink-0">
        {entry.type === 'message' ? (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700">
            <MessageSquare className="w-4 h-4" />
          </div>
        ) : (
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700">
            <Users className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Agent Info */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">
            {entry.agent_id}
          </span>

          {entry.type === 'message' && entry.target_agent_id && (
            <>
              <span className="text-gray-400">→</span>
              <span className="text-sm font-medium text-gray-900">
                {entry.target_agent_id}
              </span>
            </>
          )}

          {entry.thread_id && (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
              Thread: {entry.thread_id.substring(0, 8)}
            </span>
          )}
        </div>

        {/* Message Content */}
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
          {displayContent}
        </p>
      </div>
    </div>
  );
};
