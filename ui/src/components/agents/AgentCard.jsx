import React from 'react';
import { Plus, Edit, Trash2, Globe, Folder } from 'lucide-react';

export const AgentCard = ({ config, onAdd, onEdit, onDelete }) => {
  const handleAdd = (e) => {
    e.stopPropagation();
    onAdd(config);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit(config.id);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${config.name}"?`)) {
      onDelete(config.id);
    }
  };

  const isGlobal = config.projectId === null;

  return (
    <div className="bg-surface-hover border border-border rounded-lg p-4 hover:border-accent-purple transition-colors">
      {/* Header */}
      <div className="mb-3">
        <h3 className="font-medium text-text-primary mb-1">{config.name}</h3>
        <p className="text-sm text-text-secondary">{config.role}</p>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 rounded text-xs border bg-purple-500/10 text-purple-400 border-purple-500/20">
          claude-code
        </span>
        {isGlobal ? (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <Globe size={12} />
            Global
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-text-secondary">
            <Folder size={12} />
            {config.projectId}
          </span>
        )}
      </div>

      {/* System Prompt Preview */}
      {config.systemPrompt && (
        <p className="text-xs text-text-secondary mb-3 line-clamp-2">
          {config.systemPrompt}
        </p>
      )}

      {/* Capabilities */}
      {config.capabilities && config.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {config.capabilities.slice(0, 4).map(cap => (
            <span
              key={cap}
              className="px-1.5 py-0.5 bg-surface rounded text-xs text-text-secondary"
            >
              {cap}
            </span>
          ))}
          {config.capabilities.length > 4 && (
            <span className="px-1.5 py-0.5 text-xs text-text-secondary">
              +{config.capabilities.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <button
          onClick={handleAdd}
          className="flex-1 px-3 py-1.5 bg-accent-purple hover:bg-purple-600 text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
          title="Add agent to canvas"
        >
          <Plus size={14} />
          Add
        </button>
        <button
          onClick={handleEdit}
          className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-xs font-medium transition-colors flex items-center gap-1"
          title="Edit configuration"
        >
          <Edit size={14} />
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded text-xs font-medium transition-colors flex items-center gap-1"
          title="Delete configuration"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
};
