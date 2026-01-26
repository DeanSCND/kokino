import React from 'react';

/**
 * Shared form fields for agent configuration
 * Used by both CreateAgentDialog and EditAgentDialog
 */
export const AgentFormFields = ({ formData, errors, onChange, onCheckboxChange }) => {
  const CLI_TYPES = [
    { value: 'claude-code', label: 'Claude Code' },
    { value: 'codex', label: 'Codex' },
    { value: 'generic', label: 'Generic' }
  ];

  const BOOTSTRAP_MODES = [
    { value: 'auto', label: 'Auto' },
    { value: 'manual', label: 'Manual' },
    { value: 'none', label: 'None' }
  ];

  const CAPABILITIES = [
    { value: 'code', label: 'Code' },
    { value: 'test', label: 'Test' },
    { value: 'api', label: 'API' },
    { value: 'deploy', label: 'Deploy' },
    { value: 'database', label: 'Database' },
    { value: 'ui', label: 'UI' }
  ];

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Basic Information</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={onChange}
              placeholder="Alice"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
            />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="role"
              value={formData.role}
              onChange={onChange}
              placeholder="Frontend Engineer"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
            />
            {errors.role && <p className="text-xs text-red-400 mt-1">{errors.role}</p>}
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Project <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="projectId"
              value={formData.projectId}
              onChange={onChange}
              placeholder="default"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
            />
            {errors.projectId && <p className="text-xs text-red-400 mt-1">{errors.projectId}</p>}
          </div>
        </div>
      </div>

      {/* CLI Configuration */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">CLI Configuration</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-2">CLI Type</label>
            <div className="space-y-2">
              {CLI_TYPES.map(type => (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cliType"
                    value={type.value}
                    checked={formData.cliType === type.value}
                    onChange={onChange}
                    className="text-accent-purple focus:ring-accent-purple"
                  />
                  <span className="text-sm text-text-primary">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-secondary mb-1">Working Directory</label>
            <input
              type="text"
              name="workingDirectory"
              value={formData.workingDirectory}
              onChange={onChange}
              placeholder="./"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
            />
            {errors.workingDirectory && <p className="text-xs text-red-400 mt-1">{errors.workingDirectory}</p>}
          </div>
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">System Prompt</h3>
        <textarea
          name="systemPrompt"
          value={formData.systemPrompt}
          onChange={onChange}
          placeholder="You are a Frontend Engineer specializing in React..."
          rows={4}
          className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none resize-none"
        />
        {errors.systemPrompt && <p className="text-xs text-red-400 mt-1">{errors.systemPrompt}</p>}
      </div>

      {/* Bootstrap Configuration */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Bootstrap Configuration</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Mode</label>
            <select
              name="bootstrapMode"
              value={formData.bootstrapMode}
              onChange={onChange}
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
            >
              {BOOTSTRAP_MODES.map(mode => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
          </div>

          {formData.bootstrapMode === 'manual' && (
            <div>
              <label className="block text-xs text-text-secondary mb-1">Bootstrap Script</label>
              <textarea
                name="bootstrapScript"
                value={formData.bootstrapScript}
                onChange={onChange}
                placeholder="# Custom bootstrap script"
                rows={3}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none resize-none font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Capabilities */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Capabilities</h3>
        <div className="grid grid-cols-3 gap-3">
          {CAPABILITIES.map(cap => (
            <label key={cap.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name={cap.value}
                checked={formData.capabilities.includes(cap.value)}
                onChange={onCheckboxChange}
                className="rounded text-accent-purple focus:ring-accent-purple"
              />
              <span className="text-sm text-text-primary">{cap.label}</span>
            </label>
          ))}
        </div>
        {errors.capabilities && <p className="text-xs text-red-400 mt-1">{errors.capabilities}</p>}
      </div>
    </div>
  );
};
