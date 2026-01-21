import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Upload, Plus, Search, Trash2, FileJson, Users, Zap, Shield, Wrench, Edit } from 'lucide-react';
import { TemplateStorage } from '../utils/templates.js';
import { PREBUILT_TEMPLATES } from '../data/prebuiltTemplates.js';
import { TemplateEditor } from './TemplateEditor.jsx';

const CATEGORY_ICONS = {
  development: Users,
  operations: Zap,
  security: Shield,
  maintenance: Wrench
};

export const TemplateLibrary = ({ onClose, onSelectTemplate }) => {
  const [templates, setTemplates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const fileInputRef = useRef(null);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    const custom = TemplateStorage.getAll();
    const all = [...PREBUILT_TEMPLATES, ...custom];
    setTemplates(all);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const template = await TemplateStorage.import(file);
      TemplateStorage.save(template);
      loadTemplates();
      alert(`Template "${template.name}" imported successfully!`);
    } catch (error) {
      alert(`Failed to import template: ${error.message}`);
    }
    e.target.value = ''; // Reset input
  };

  const handleExport = (template) => {
    TemplateStorage.export(template);
  };

  const handleDelete = (templateId) => {
    if (confirm('Are you sure you want to delete this template?')) {
      TemplateStorage.delete(templateId);
      loadTemplates();
    }
  };

  const handleSpawn = (template) => {
    onSelectTemplate(template);
    onClose();
  };

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Check if template is pre-built (can't be deleted)
  const isPrebuilt = (id) => PREBUILT_TEMPLATES.some(t => t.id === id);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-library-title"
    >
      {/* Modal */}
      <div
        className="w-[900px] h-[700px] bg-surface rounded-xl shadow-2xl border border-border flex flex-col animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 bg-surface-hover border-b border-border flex items-center justify-between px-6">
          <h2 id="template-library-title" className="text-lg font-semibold text-text-primary">
            Team Templates
          </h2>
          <div className="flex items-center gap-2">
            {/* Create Custom */}
            <button
              onClick={() => setShowEditor(true)}
              className="px-3 py-1.5 bg-accent-purple hover:bg-purple-600 text-white rounded text-sm font-medium transition-colors flex items-center gap-1.5"
              title="Create Custom Template"
            >
              <Plus size={16} />
              Create Custom
            </button>

            {/* Import */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-sm font-medium transition-colors flex items-center gap-1.5"
              title="Import Template"
            >
              <Upload size={16} />
              Import
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
        <div className="p-6 border-b border-border">
          <div className="flex gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface border border-border rounded pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-purple focus:outline-none"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-surface border border-border rounded px-4 py-2 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="development">Development</option>
              <option value="operations">Operations</option>
              <option value="security">Security</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            {filteredTemplates.map(template => {
              const Icon = CATEGORY_ICONS[template.category] || Users;
              const prebuilt = isPrebuilt(template.id);

              return (
                <div
                  key={template.id}
                  className="bg-surface-hover border border-border rounded-lg p-4 hover:border-accent-purple transition-colors cursor-pointer group"
                  onClick={() => handleSpawn(template)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-accent-purple/10 rounded-lg flex items-center justify-center">
                        <Icon size={20} className="text-accent-purple" />
                      </div>
                      <div>
                        <h3 className="font-medium text-text-primary group-hover:text-accent-purple transition-colors">
                          {template.name}
                        </h3>
                        {prebuilt && (
                          <span className="text-xs text-accent-blue">Pre-built</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-text-secondary mb-3 line-clamp-2">
                    {template.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-text-secondary mb-3">
                    <span>{template.agents.length} agents</span>
                    <span>{template.connections.length} connections</span>
                  </div>

                  {/* Tags */}
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {template.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-surface rounded text-xs text-text-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(template);
                      }}
                      className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
                      title="Export Template"
                    >
                      <Download size={14} />
                      Export
                    </button>

                    {!prebuilt && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(template.id);
                        }}
                        className="px-2 py-1 text-xs text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
                        title="Delete Template"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {filteredTemplates.length === 0 && (
              <div className="col-span-2 text-center py-12">
                <FileJson size={48} className="mx-auto mb-4 text-text-secondary opacity-50" />
                <p className="text-text-secondary">No templates found</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-border px-6 flex items-center justify-between bg-surface-hover">
          <p className="text-sm text-text-secondary">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface hover:bg-surface-hover text-text-primary border border-border rounded text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Template Editor Modal */}
      {showEditor && (
        <TemplateEditor
          onClose={() => setShowEditor(false)}
          onSave={() => {
            loadTemplates();
            setShowEditor(false);
          }}
        />
      )}
    </div>
  );
};
