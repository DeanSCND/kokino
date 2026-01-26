import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { AgentFormFields } from './AgentFormFields';
import apiClient from '../../services/api-client';

export const EditAgentDialog = ({ agentId, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    projectId: 'default',
    cliType: 'claude-code',
    workingDirectory: './',
    systemPrompt: '',
    bootstrapMode: 'auto',
    bootstrapScript: '',
    capabilities: ['code']
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastModified, setLastModified] = useState(null);

  useEffect(() => {
    const loadConfig = async () => {
      setIsLoading(true);
      try {
        const config = await apiClient.getAgentConfig(agentId);
        setFormData({
          name: config.name || '',
          role: config.role || '',
          projectId: config.projectId || 'default',
          cliType: config.cliType || 'claude-code',
          workingDirectory: config.workingDirectory || './',
          systemPrompt: config.systemPrompt || '',
          bootstrapMode: config.bootstrapMode || 'auto',
          bootstrapScript: config.bootstrapScript || '',
          capabilities: config.capabilities || ['code']
        });
        setLastModified(config.updatedAt || config.createdAt);
        console.log('[EditAgentDialog] Loaded config:', config);
      } catch (error) {
        console.error('[EditAgentDialog] Failed to load config:', error);
        setErrors({ load: error.message || 'Failed to load agent configuration' });
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, [agentId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      capabilities: checked
        ? [...prev.capabilities, name]
        : prev.capabilities.filter(c => c !== name)
    }));
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name || formData.name.trim().length === 0) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > 50) {
      newErrors.name = 'Name must be 50 characters or less';
    }

    if (!formData.role || formData.role.trim().length === 0) {
      newErrors.role = 'Role is required';
    } else if (formData.role.length > 100) {
      newErrors.role = 'Role must be 100 characters or less';
    }

    if (!formData.projectId || formData.projectId.trim().length === 0) {
      newErrors.projectId = 'Project is required';
    }

    if (formData.systemPrompt && formData.systemPrompt.length > 2000) {
      newErrors.systemPrompt = 'System prompt must be 2000 characters or less';
    }

    if (formData.bootstrapMode === 'manual' && !formData.bootstrapScript) {
      newErrors.bootstrapScript = 'Bootstrap script is required for manual mode';
    }

    if (formData.bootstrapScript && formData.bootstrapScript.length > 5000) {
      newErrors.bootstrapScript = 'Bootstrap script must be 5000 characters or less';
    }

    if (formData.capabilities.length === 0) {
      newErrors.capabilities = 'At least one capability must be selected';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const config = await apiClient.updateAgentConfig(agentId, formData);
      console.log('[EditAgentDialog] Updated agent config:', config);
      onSuccess?.(config);
      onClose();
    } catch (error) {
      console.error('[EditAgentDialog] Failed to update agent:', error);
      setErrors({
        submit: error.message || 'Failed to update agent configuration'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-[600px] h-[400px] bg-surface rounded-xl shadow-2xl border border-border flex items-center justify-center">
          <div className="text-center">
            <Loader2 size={40} className="animate-spin text-accent-purple mx-auto mb-4" />
            <p className="text-sm text-text-secondary">Loading agent configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-agent-title"
    >
      <div
        className="w-[600px] max-h-[90vh] bg-surface rounded-xl shadow-2xl border border-border flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 bg-surface-hover border-b border-border flex items-center justify-between px-6 flex-shrink-0">
          <h2 id="edit-agent-title" className="text-lg font-semibold text-text-primary">
            Edit Agent
          </h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {errors.load && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{errors.load}</p>
            </div>
          )}

          {errors.submit && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{errors.submit}</p>
            </div>
          )}

          <AgentFormFields
            formData={formData}
            errors={errors}
            onChange={handleChange}
            onCheckboxChange={handleCheckboxChange}
          />

          {lastModified && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-text-secondary">
                Last modified: {new Date(lastModified).toLocaleString()}
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="h-14 border-t border-border px-6 flex items-center justify-end gap-3 bg-surface-hover flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || !!errors.load}
            className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
