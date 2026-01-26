/**
 * CanvasControls - Top toolbar for canvas operations
 * Phase 4: Canvas Rewrite
 */

import React from 'react';
import useStore from '../../state/store.js';
import useTeamOperations from '../../hooks/useTeamOperations.js';
import { selectHasUnsavedChanges } from '../../state/selectors.js';

export default function CanvasControls() {
  const teamData = useStore(state => state.teamData);
  const hasUnsavedChanges = useStore(selectHasUnsavedChanges);
  const toggleAgentLibrary = useStore(state => state.toggleAgentLibrary);
  const toggleTemplateLibrary = useStore(state => state.toggleTemplateLibrary);

  const { saveTeam, clearTeam, exportTeam, importTeam } = useTeamOperations();

  const handleSave = async () => {
    try {
      await saveTeam();
    } catch (error) {
      console.error('Failed to save team:', error);
    }
  };

  const handleExport = async () => {
    try {
      const exported = await exportTeam(teamData.id);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${teamData.name || 'team'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export team:', error);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importTeam(data);
    } catch (error) {
      console.error('Failed to import team:', error);
    }
  };

  const handleClear = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Clear anyway?');
      if (!confirmed) return;
    }
    clearTeam();
  };

  return (
    <div className="canvas-controls">
      <div className="controls-left">
        <button onClick={toggleAgentLibrary} className="btn-icon">
          <span>📚</span>
          <span>Agent Library</span>
        </button>
        <button onClick={toggleTemplateLibrary} className="btn-icon">
          <span>📋</span>
          <span>Templates</span>
        </button>
      </div>

      <div className="controls-center">
        <h2>{teamData.name || 'Untitled Team'}</h2>
        {hasUnsavedChanges && <span className="unsaved-indicator">●</span>}
      </div>

      <div className="controls-right">
        <button onClick={handleSave} disabled={!hasUnsavedChanges} className="btn-primary">
          Save
        </button>
        <button onClick={handleExport} className="btn-secondary">
          Export
        </button>
        <label className="btn-secondary">
          Import
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </label>
        <button onClick={handleClear} className="btn-danger">
          Clear
        </button>
      </div>
    </div>
  );
}
