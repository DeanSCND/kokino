import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import broker from '../services/broker';

export const SpawnAgentDialog = ({ onClose, onSuccess }) => {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [agentName, setAgentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load templates on mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const data = await broker.getTemplates();
        setTemplates(data);
        // Pre-select first template
        if (data.length > 0) {
          setSelectedTemplate(data[0]);
        }
      } catch (err) {
        setError(`Failed to load templates: ${err.message}`);
      } finally {
        setLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, []);

  // Auto-generate name when template changes
  useEffect(() => {
    if (selectedTemplate) {
      // Generate name from template (e.g., "frontend-engineer" -> "Agent-Frontend")
      const baseName = selectedTemplate.name.split(' ')[0];
      setAgentName(`Agent-${baseName}`);
    }
  }, [selectedTemplate]);

  const handleSpawn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!agentName.trim()) {
        throw new Error('Agent name is required');
      }

      if (!selectedTemplate) {
        throw new Error('Please select a template');
      }

      // Spawn agent
      const result = await broker.spawnAgent({
        agentId: agentName,
        type: selectedTemplate.type,
        role: selectedTemplate.name,
        capabilities: selectedTemplate.capabilities
      });

      console.log('[SpawnAgentDialog] Spawn result:', result);

      setSuccess(true);

      // Call success callback after brief delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(result);
        }
        onClose();
      }, 1500);

    } catch (err) {
      console.error('[SpawnAgentDialog] Spawn failed:', err);
      setError(err.message || 'Failed to spawn agent');
    } finally {
      setLoading(false);
    }
  };

  if (loadingTemplates) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-surface rounded-lg border border-border p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center gap-3">
            <Loader2 className="animate-spin" size={24} />
            <span className="text-text-primary">Loading templates...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-lg border border-border p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-text-primary">Spawn New Agent</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-hover transition-colors"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Success message */}
        {success && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded flex items-center gap-2">
            <CheckCircle size={20} className="text-green-500" />
            <span className="text-green-500">Agent spawned successfully!</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2">
            <AlertCircle size={20} className="text-red-500" />
            <span className="text-red-500">{error}</span>
          </div>
        )}

        <form onSubmit={handleSpawn}>
          {/* Agent Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Agent Name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-purple"
              placeholder="e.g., Agent-Frontend"
              disabled={loading || success}
              required
            />
          </div>

          {/* Template Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-primary mb-2">
              Role Template
            </label>
            <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template)}
                  className={`p-4 rounded border text-left transition-all ${
                    selectedTemplate?.id === template.id
                      ? 'border-accent-purple bg-accent-purple/10'
                      : 'border-border bg-background hover:border-accent-purple/50'
                  }`}
                  disabled={loading || success}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{template.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-text-primary mb-1">{template.name}</div>
                      <div className="text-xs text-text-secondary line-clamp-2">{template.description}</div>
                      <div className="mt-2 text-xs text-text-muted">
                        Type: <span className="font-mono">{template.type}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Selected Template Details */}
          {selectedTemplate && (
            <div className="mb-6 p-4 bg-background border border-border rounded">
              <div className="text-sm font-medium text-text-primary mb-2">
                {selectedTemplate.icon} {selectedTemplate.name}
              </div>
              <div className="text-xs text-text-secondary mb-3">
                {selectedTemplate.description}
              </div>
              <div className="text-xs text-text-muted">
                <strong>Capabilities:</strong> {selectedTemplate.capabilities.join(', ')}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-surface-hover hover:bg-surface-active text-text-primary transition-colors"
              disabled={loading || success}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-accent-purple hover:bg-accent-purple/80 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || success || !selectedTemplate || !agentName.trim()}
            >
              {loading && <Loader2 className="animate-spin" size={16} />}
              {loading ? 'Spawning...' : success ? 'Success!' : 'Spawn Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
