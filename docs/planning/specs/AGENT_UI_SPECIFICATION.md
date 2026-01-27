# Agent Configuration UI Specification

## Overview
This document provides detailed specifications for the missing Agent UI components in Phase 2.

## 1. CreateAgentDialog Component

### Purpose
Modal dialog for creating new agent configurations

### UI Layout
```
┌─────────────────────────────────────────┐
│ Create New Agent            [X]         │
├─────────────────────────────────────────┤
│                                         │
│ Basic Information                       │
│ ┌─────────────────────────────────────┐ │
│ │ Name: [___________] (required)      │ │
│ │ Role: [___________] (required)      │ │
│ │                                     │ │
│ │ Scope:                              │ │
│ │ ( ) Global Agent (all projects)     │ │
│ │ ( ) Project-specific                │ │
│ │     Project: [Dropdown v]           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ CLI Configuration                       │
│ ┌─────────────────────────────────────┐ │
│ │ CLI Type: Claude Code               │ │
│ │ (Factory Droid & Gemini coming soon)│ │
│ │                                     │ │
│ │ Working Directory:                  │ │
│ │ [./________________] [Browse]       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ System Prompt                           │
│ ┌─────────────────────────────────────┐ │
│ │ [Text area for system prompt      ] │ │
│ │ [                                 ] │ │
│ │ [                                 ] │ │
│ │ [                                 ] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Bootstrap Configuration                 │
│ ┌─────────────────────────────────────┐ │
│ │ Mode: [Auto/Manual/None v]         │ │
│ │ □ Custom bootstrap script           │ │
│ │ [Script text area if checked     ] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Capabilities (Reserved for future)      │
│ ┌─────────────────────────────────────┐ │
│ │ ☑ Code  ☑ Test  ☐ Deploy          │ │
│ │ ☑ API   ☐ Database  ☐ UI          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancel]                    [Create]    │
└─────────────────────────────────────────┘
```

### Field Specifications

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| name | string | Yes | 1-50 chars, alphanumeric + spaces | - |
| role | string | Yes | 1-100 chars | - |
| projectScope | enum | Yes | global\|project-specific | global |
| projectId | string | Conditional | Required if scope=project-specific | Current project |
| cliType | enum | Yes | claude-code (others planned) | claude-code |
| workingDirectory | string | No | Valid path | ./ |
| systemPrompt | text | No | Max 2000 chars | - |
| bootstrapMode | enum | Yes | auto\|manual\|none | auto |
| bootstrapScript | text | No | Max 5000 chars, only if mode=manual | - |
| capabilities | array | No | Reserved for future use - stored but not used | [] |

### Validation Rules
- Name must be unique within scope (global names unique globally, project names unique within project)
- Working directory must exist or be creatable
- Bootstrap script required if mode is 'manual'

### API Integration
```javascript
// On form submit
POST /api/agents
{
  name: formData.name,
  role: formData.role,
  projectId: formData.projectScope === 'global' ? null : formData.projectId,
  cliType: formData.cliType,
  workingDirectory: formData.workingDirectory,
  systemPrompt: formData.systemPrompt,
  bootstrapMode: formData.bootstrapMode,
  bootstrapScript: formData.bootstrapScript,
  capabilities: formData.capabilities, // Reserved for future
  metadata: {
    createdBy: 'ui',
    createdAt: new Date().toISOString()
  }
}
```

### Error Handling
- Display API errors below relevant field
- Disable Create button during submission
- Show loading spinner during API call
- On success: Close dialog, refresh agent list, show success toast
- On failure: Keep dialog open, show field-specific errors

---

## 2. AgentLibraryPanel Component

### Purpose
Side panel for browsing, searching, and managing agent configurations

### UI Layout
```
┌──────────────────────────────┐
│ Agent Library                │
├──────────────────────────────┤
│ [🔍 Search agents...]        │
│                              │
│ Filter by:                   │
│ [All Projects v] [All Types v]│
│                              │
│ [+ New Agent]                │
├──────────────────────────────┤
│ ┌────────────────────────┐   │
│ │ Frontend Engineer      │   │
│ │ Role: Frontend Dev     │   │
│ │ Type: claude-code      │   │
│ │ Project: default       │   │
│ │ [Add] [Edit] [Delete]  │   │
│ └────────────────────────┘   │
│                              │
│ ┌────────────────────────┐   │
│ │ Backend Engineer       │   │
│ │ Role: API Developer    │   │
│ │ Type: claude-code      │   │
│ │ Project: default       │   │
│ │ [Add] [Edit] [Delete]  │   │
│ └────────────────────────┘   │
│                              │
│ [Load more...]               │
└──────────────────────────────┘
```

### Features

#### Search
- Real-time filter as user types
- Search in: name, role, system prompt

#### Filters
- Project dropdown: All Projects + list from /api/projects
- Type dropdown: All Types, Claude Code, Codex, Generic

#### Agent Cards
Each card shows:
- Name (bold, primary text)
- Role (secondary text)
- CLI Type (badge)
- Project (small text)
- Actions:
  - Add: Instantiate agent on canvas
  - Edit: Open CreateAgentDialog in edit mode
  - Delete: Confirm then DELETE /api/agents/:id

#### Pagination
- Load 10 agents initially
- "Load more" button fetches next 10
- Virtual scrolling for large lists

### API Integration
```javascript
// On component mount & filter change
GET /api/agents?project={projectId}&type={cliType}&search={searchTerm}&limit=10&offset={offset}

// On Add button click
POST /api/agents/:id/instantiate
{
  position: { x: canvasCenter.x, y: canvasCenter.y }
}

// On Delete button click (after confirmation)
DELETE /api/agents/:id
```

### State Management
```javascript
const [agents, setAgents] = useState([]);
const [filters, setFilters] = useState({
  project: 'all',
  type: 'all',
  search: ''
});
const [isLoading, setIsLoading] = useState(false);
const [hasMore, setHasMore] = useState(true);
const [offset, setOffset] = useState(0);
```

---

## 3. EditAgentDialog Component

Same as CreateAgentDialog but:
- Pre-populate fields from GET /api/agents/:id
- Change title to "Edit Agent"
- Change button to "Save Changes"
- Use PUT /api/agents/:id instead of POST
- Show "Last modified: {date}" at bottom

---

## 4. Integration with Canvas.jsx

### Current State
Canvas currently shows agent configs as buttons in Team Composition panel

### Enhanced Integration
1. Replace button grid with "Open Agent Library" button
2. AgentLibraryPanel slides in from left when opened
3. Drag agents from library onto canvas
4. Double-click agent node to edit configuration
5. Right-click agent node for context menu with "Edit Config" option

### Canvas Modifications
```javascript
// Add to Canvas.jsx
const [showAgentLibrary, setShowAgentLibrary] = useState(false);
const [selectedAgentForEdit, setSelectedAgentForEdit] = useState(null);

// In JSX
{showAgentLibrary && (
  <AgentLibraryPanel
    onClose={() => setShowAgentLibrary(false)}
    onAddAgent={(config) => addAgentToCanvas(config)}
    onEditAgent={(id) => setSelectedAgentForEdit(id)}
  />
)}

{selectedAgentForEdit && (
  <EditAgentDialog
    agentId={selectedAgentForEdit}
    onClose={() => setSelectedAgentForEdit(null)}
    onSave={() => {
      refreshCanvas();
      setSelectedAgentForEdit(null);
    }}
  />
)}
```

---

## 5. Implementation Priority

1. **Phase 1** (Essential - Week 1)
   - CreateAgentDialog with basic fields
   - API integration for create
   - Simple agent list in Canvas

2. **Phase 2** (Enhanced - Week 2)
   - AgentLibraryPanel with search/filter
   - Edit functionality
   - Drag & drop from library

3. **Phase 3** (Polish - Week 3)
   - Advanced fields (custom MCP configs)
   - Bulk operations
   - Import/export configs
   - Agent templates

---

## 6. Technical Implementation Notes

### Component Structure
```
components/
├── agents/
│   ├── CreateAgentDialog.jsx
│   ├── EditAgentDialog.jsx
│   ├── AgentLibraryPanel.jsx
│   ├── AgentCard.jsx
│   └── AgentFormFields.jsx (shared form logic)
```

### Styling
- Use existing Tailwind classes from Canvas.jsx
- Match dark theme: bg-surface, border-border, text-text-primary
- Consistent with existing modal styles (see TerminalModal.jsx)

### Form Library
- Use react-hook-form for form management
- Zod for schema validation
- Match existing form patterns in project

### Testing Requirements
- Unit tests for form validation
- Integration tests for API calls
- E2E test for complete create/edit/delete flow

---

## 7. Acceptance Criteria Checklist

- [ ] User can create new agent configuration via dialog
- [ ] All required fields are validated
- [ ] User can view all agent configurations in library panel
- [ ] User can search agents by name/role
- [ ] User can filter agents by project and type
- [ ] User can edit existing agent configurations
- [ ] User can delete agent configurations with confirmation
- [ ] User can add agent from library to canvas
- [ ] Changes persist to database via API
- [ ] Error states are handled gracefully
- [ ] Loading states shown during API calls
- [ ] UI matches existing dark theme design
- [ ] Components are under 300 lines each
- [ ] API integration uses existing apiClient service