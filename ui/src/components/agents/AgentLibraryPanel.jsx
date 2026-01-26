import React, { useState, useEffect } from 'react';
import { X, Plus, Search, Loader2 } from 'lucide-react';
import { AgentCard } from './AgentCard';
import { CreateAgentDialog } from './CreateAgentDialog';
import { EditAgentDialog } from './EditAgentDialog';
import apiClient from '../../services/api-client';

export const AgentLibraryPanel = ({ onClose, onAddAgent }) => {
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    project: 'all',
    type: 'all'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState(null);

  const LIMIT = 12;

  // Load agents
  const loadAgents = async (reset = false) => {
    setIsLoading(true);
    try {
      const queryParams = {};
      if (filters.project !== 'all') queryParams.projectId = filters.project;
      if (filters.type !== 'all') queryParams.cliType = filters.type;
      if (filters.search) queryParams.search = filters.search;
      queryParams.limit = LIMIT;
      queryParams.offset = reset ? 0 : offset;

      const configs = await apiClient.listAgentConfigs(queryParams);

      if (reset) {
        setAgents(configs);
        setOffset(LIMIT);
      } else {
        setAgents(prev => [...prev, ...configs]);
        setOffset(prev => prev + LIMIT);
      }

      setHasMore(configs.length === LIMIT);
      console.log(`[AgentLibraryPanel] Loaded ${configs.length} configs`);
    } catch (error) {
      console.error('[AgentLibraryPanel] Failed to load configs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load on mount and when filters change
  useEffect(() => {
    loadAgents(true);
  }, [filters]);

  const handleSearchChange = (e) => {
    setFilters(prev => ({ ...prev, search: e.target.value }));
  };

  const handleProjectChange = (e) => {
    setFilters(prev => ({ ...prev, project: e.target.value }));
  };

  const handleTypeChange = (e) => {
    setFilters(prev => ({ ...prev, type: e.target.value }));
  };

  const handleAdd = async (config) => {
    console.log('[AgentLibraryPanel] Adding agent:', config.name);
    onAddAgent(config.id);
  };

  const handleEdit = (agentId) => {
    setEditingAgentId(agentId);
  };

  const handleDelete = async (agentId) => {
    try {
      await apiClient.deleteAgentConfig(agentId);
      console.log('[AgentLibraryPanel] Deleted agent config:', agentId);
      // Reload agents
      await loadAgents(true);
    } catch (error) {
      console.error('[AgentLibraryPanel] Failed to delete config:', error);
      alert(`Failed to delete: ${error.message}`);
    }
  };

  const handleCreateSuccess = () => {
    loadAgents(true);
  };

  const handleEditSuccess = () => {
    loadAgents(true);
  };

  const handleLoadMore = () => {
    loadAgents(false);
  };

  return (
    <>
      {/* Panel Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed left-0 top-0 bottom-0 z-50 w-96 bg-surface border-r border-border shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="h-14 bg-surface-hover border-b border-border flex items-center justify-between px-4 flex-shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Agent Library</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close panel"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-border space-y-3 flex-shrink-0">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              placeholder="Search agents..."
              value={filters.search}
              onChange={handleSearchChange}
              className="w-full bg-background border border-border rounded pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={filters.project}
              onChange={handleProjectChange}
              className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value="all">All Projects</option>
              <option value="default">Default</option>
            </select>
            <select
              value={filters.type}
              onChange={handleTypeChange}
              className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="claude-code">Claude Code</option>
              <option value="codex">Codex</option>
              <option value="generic">Generic</option>
            </select>
          </div>

          {/* New Agent Button */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="w-full px-3 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            New Agent
          </button>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && agents.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin text-accent-purple mx-auto mb-3" />
                <p className="text-sm text-text-secondary">Loading agents...</p>
              </div>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-sm text-text-secondary mb-2">No agents found</p>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="text-xs text-accent-purple hover:underline"
                >
                  Create your first agent
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  config={agent}
                  onAdd={handleAdd}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}

              {/* Load More */}
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-border px-4 flex items-center justify-between bg-surface-hover flex-shrink-0">
          <p className="text-xs text-text-secondary">
            {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
          </p>
          <button
            onClick={onClose}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Dialogs */}
      {showCreateDialog && (
        <CreateAgentDialog
          onClose={() => setShowCreateDialog(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {editingAgentId && (
        <EditAgentDialog
          agentId={editingAgentId}
          onClose={() => setEditingAgentId(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </>
  );
};
