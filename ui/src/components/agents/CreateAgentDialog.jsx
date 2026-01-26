import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { AgentFormFields } from './AgentFormFields';
import apiClient from '../../services/api-client';

export const CreateAgentDialog = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    projectId: null,  // null for global agents
    cliType: 'claude-code',
    workingDirectory: './',
    systemPrompt: '',
    bootstrapMode: 'auto',
    bootstrapScript: '',
    capabilities: ['code']
  });

  const [scope, setScope] = useState('global'); // 'global' | 'project-specific'
  const [projects, setProjects] = useState([]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch projects list
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        // TODO: Implement GET /api/projects endpoint
        // For now, use a default project
        setProjects([{ id: 'default', name: 'Default Project' }]);
      } catch (error) {
        console.error('[CreateAgentDialog] Failed to load projects:', error);
      }
    };
    fetchProjects();
  }, []);

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

  const handleScopeChange = (e) => {
    const newScope = e.target.value;
    setScope(newScope);

    // Set projectId based on scope
    if (newScope === 'global') {
      setFormData(prev => ({ ...prev, projectId: null }));
    } else {
      // Default to first available project if switching to project-specific
      setFormData(prev => ({
        ...prev,
        projectId: projects.length > 0 ? projects[0].id : 'default'
      }));
    }
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

    // projectId validation: required if scope is project-specific
    if (scope === 'project-specific' && (!formData.projectId || formData.projectId.trim().length === 0)) {
      newErrors.projectId = 'Project is required for project-specific agents';
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

    // Capabilities validation removed - reserved for future use

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
      const config = await apiClient.createAgentConfig({
        ...formData,
        metadata: {
          createdBy: 'ui',
          createdAt: new Date().toISOString()
        }
      });

      console.log('[CreateAgentDialog] Created agent config:', config);
      onSuccess?.(config);
      onClose();
    } catch (error) {
      console.error('[CreateAgentDialog] Failed to create agent:', error);
      setErrors({
        submit: error.message || 'Failed to create agent configuration'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-agent-title"
    >
      <div
        className="w-[600px] max-h-[90vh] bg-surface rounded-xl shadow-2xl border border-border flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 bg-surface-hover border-b border-border flex items-center justify-between px-6 flex-shrink-0">
          <h2 id="create-agent-title" className="text-lg font-semibold text-text-primary">
            Create New Agent
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
            projects={projects}
            scope={scope}
            onScopeChange={handleScopeChange}
          />
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
            disabled={isSubmitting}
            className="px-4 py-2 bg-accent-purple hover:bg-purple-600 text-white rounded text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save size={16} />
                Create Agent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
