import React, { useState, useRef } from 'react';
import { X, Plus, Trash2, Save, Grid, Move } from 'lucide-react';
import { TemplateStorage, generateTemplateId, validateTemplate } from '../utils/templates.js';

const AGENT_TYPES = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'droid', label: 'Droid' },
  { value: 'custom', label: 'Custom' }
];

const CATEGORIES = [
  { value: 'development', label: 'Development' },
  { value: 'operations', label: 'Operations' },
  { value: 'security', label: 'Security' },
  { value: 'maintenance', label: 'Maintenance' }
];

export const TemplateEditor = ({ onClose, onSave, existingTemplate = null }) => {
  const [name, setName] = useState(existingTemplate?.name || '');
  const [description, setDescription] = useState(existingTemplate?.description || '');
  const [category, setCategory] = useState(existingTemplate?.category || 'development');
  const [tags, setTags] = useState(existingTemplate?.tags?.join(', ') || '');
  const [agents, setAgents] = useState(existingTemplate?.agents || []);
  const [connections, setConnections] = useState(existingTemplate?.connections || []);
  const [errors, setErrors] = useState([]);
  const modalRef = useRef(null);

  // Add new agent with default position
  const handleAddAgent = () => {
    const newAgent = {
      role: `Agent ${agents.length + 1}`,
      type: 'claude-code',
      position: {
        x: 100 + (agents.length % 3) * 250,
        y: 100 + Math.floor(agents.length / 3) * 250
      },
      metadata: { responsibilities: [] }
    };
    setAgents([...agents, newAgent]);
  };

  // Remove agent and its connections
  const handleRemoveAgent = (index) => {
    const agentRole = agents[index].role;
    setAgents(agents.filter((_, i) => i !== index));
    setConnections(connections.filter(
      conn => conn.source !== agentRole && conn.target !== agentRole
    ));
  };

  // Update agent property
  const handleUpdateAgent = (index, field, value) => {
    const updated = [...agents];
    if (field === 'position.x' || field === 'position.y') {
      const coord = field.split('.')[1];
      updated[index].position[coord] = parseInt(value) || 0;
    } else if (field === 'metadata.responsibilities') {
      updated[index].metadata.responsibilities = value.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      updated[index][field] = value;
    }
    setAgents(updated);

    // Update connections if role changed
    if (field === 'role') {
      const oldRole = agents[index].role;
      setConnections(connections.map(conn => ({
        ...conn,
        source: conn.source === oldRole ? value : conn.source,
        target: conn.target === oldRole ? value : conn.target
      })));
    }
  };

  // Add connection
  const handleAddConnection = () => {
    if (agents.length < 2) {
      setErrors(['Need at least 2 agents to create a connection']);
      return;
    }
    const newConnection = {
      source: agents[0].role,
      target: agents[1].role,
      purpose: 'message'
    };
    setConnections([...connections, newConnection]);
  };

  // Remove connection
  const handleRemoveConnection = (index) => {
    setConnections(connections.filter((_, i) => i !== index));
  };

  // Update connection property
  const handleUpdateConnection = (index, field, value) => {
    const updated = [...connections];
    updated[index][field] = value;
    setConnections(updated);
  };

  // Auto-layout agents in grid
  const handleAutoLayout = () => {
    const cols = 3;
    const spacing = 250;
    const startX = 100;
    const startY = 100;

    const updated = agents.map((agent, i) => ({
      ...agent,
      position: {
        x: startX + (i % cols) * spacing,
        y: startY + Math.floor(i / cols) * spacing
      }
    }));
    setAgents(updated);
  };

  // Save template
  const handleSave = () => {
    const template = {
      id: existingTemplate?.id || generateTemplateId(name),
      name,
      description,
      category,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      agents,
      connections,
      workflow: existingTemplate?.workflow || {
        phases: ['planning', 'implementation', 'review'],
        settings: { stepMode: true }
      }
    };

    const validation = validateTemplate(template);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    try {
      TemplateStorage.save(template);
      onSave?.(template);
      onClose();
    } catch (error) {
      setErrors([error.message || 'Failed to save template']);
    }
  };

  // Get available agent roles for connection dropdowns
  const agentRoles = agents.map(a => a.role);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-editor-title"
    >
      {/* Modal */}
      <div
        ref={modalRef}
        className="w-[1000px] h-[800px] bg-surface rounded-xl shadow-2xl border border-border flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 bg-surface-hover border-b border-border flex items-center justify-between px-6">
          <h2 id="template-editor-title" className="text-lg font-semibold text-text-primary">
            {existingTemplate ? 'Edit Template' : 'Create Template'}
          </h2>
          <div className="flex items-center gap-2">
            {/* Save button */}
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-accent-purple hover:bg-purple-600 text-white border border-border rounded text-sm font-medium transition-colors flex items-center gap-1.5"
              disabled={!name || agents.length === 0}
            >
              <Save size={16} />
              Save Template
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error display */}
          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm font-medium text-red-400 mb-1">Validation Errors:</p>
              <ul className="text-xs text-red-300 list-disc list-inside">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Basic Info */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Template Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Custom Team"
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-text-secondary mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this team does..."
                  rows={2}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none resize-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-text-secondary mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="feature, full-stack, agile"
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Agents */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Agents ({agents.length})
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleAutoLayout}
                  className="px-2 py-1 text-xs bg-surface hover:bg-surface-hover text-text-primary border border-border rounded transition-colors flex items-center gap-1"
                  disabled={agents.length === 0}
                >
                  <Grid size={14} />
                  Auto Layout
                </button>
                <button
                  onClick={handleAddAgent}
                  className="px-2 py-1 text-xs bg-accent-purple hover:bg-purple-600 text-white rounded transition-colors flex items-center gap-1"
                >
                  <Plus size={14} />
                  Add Agent
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {agents.map((agent, index) => (
                <div key={index} className="bg-surface-hover border border-border rounded-lg p-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Role *</label>
                      <input
                        type="text"
                        value={agent.role}
                        onChange={(e) => handleUpdateAgent(index, 'role', e.target.value)}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Type</label>
                      <select
                        value={agent.type}
                        onChange={(e) => handleUpdateAgent(index, 'type', e.target.value)}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
                      >
                        {AGENT_TYPES.map(type => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Position X</label>
                      <input
                        type="number"
                        value={agent.position.x}
                        onChange={(e) => handleUpdateAgent(index, 'position.x', e.target.value)}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Position Y</label>
                      <input
                        type="number"
                        value={agent.position.y}
                        onChange={(e) => handleUpdateAgent(index, 'position.y', e.target.value)}
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-text-secondary mb-1">Responsibilities (comma-separated)</label>
                      <input
                        type="text"
                        value={agent.metadata?.responsibilities?.join(', ') || ''}
                        onChange={(e) => handleUpdateAgent(index, 'metadata.responsibilities', e.target.value)}
                        placeholder="API Design, Code Review, Testing"
                        className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => handleRemoveAgent(index)}
                        className="w-full px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {agents.length === 0 && (
                <div className="text-center py-8 text-text-secondary text-sm">
                  No agents yet. Click "Add Agent" to get started.
                </div>
              )}
            </div>
          </div>

          {/* Connections */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">
                Connections ({connections.length})
              </h3>
              <button
                onClick={handleAddConnection}
                className="px-2 py-1 text-xs bg-accent-purple hover:bg-purple-600 text-white rounded transition-colors flex items-center gap-1"
                disabled={agents.length < 2}
              >
                <Plus size={14} />
                Add Connection
              </button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {connections.map((conn, index) => (
                <div key={index} className="bg-surface-hover border border-border rounded-lg p-2 flex items-center gap-2">
                  <select
                    value={conn.source}
                    onChange={(e) => handleUpdateConnection(index, 'source', e.target.value)}
                    className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
                  >
                    {agentRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <span className="text-text-secondary text-xs">→</span>
                  <select
                    value={conn.target}
                    onChange={(e) => handleUpdateConnection(index, 'target', e.target.value)}
                    className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent-purple focus:outline-none"
                  >
                    {agentRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={conn.purpose || ''}
                    onChange={(e) => handleUpdateConnection(index, 'purpose', e.target.value)}
                    placeholder="Purpose"
                    className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
                  />
                  <button
                    onClick={() => handleRemoveConnection(index)}
                    className="px-2 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {connections.length === 0 && (
                <div className="text-center py-6 text-text-secondary text-sm">
                  No connections yet. Click "Add Connection" to link agents.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-border px-6 flex items-center justify-between bg-surface-hover">
          <p className="text-sm text-text-secondary">
            * Required fields
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
              disabled={!name || agents.length === 0}
            >
              <Save size={16} />
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
