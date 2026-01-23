# UI-First Design Document

## Overview

This document captures the user interface design philosophy and user journey for Agent-Collab. We're taking a UI-first approach to validate the orchestration model before building complex infrastructure.

## Core Philosophy

**"Mock it before you plumb it"** - The UI helps us understand if the plumbing is right. By visualizing agent teams and workflows first, we can validate our architecture before committing to implementation details.

## User Journey

### 1. Welcome & Onboarding

**First Launch:**
- Clean welcome screen with project creation
- No complex setup - just "New Project" button
- Optional GitHub repo connection
- Project name and description

**Key Principle:** Zero friction startup. Users should be building teams within 30 seconds.

### 2. Team Builder Canvas

**Visual Team Composition:**
- Split-screen interface:
  - Left: Communication panels (Terminal, Chat, Code viewer)
  - Right: Canvas for team design
- Drag-and-drop agent nodes from library
- Connect agents with visual workflow arrows
- Real-time status indicators on each node

**Agent Library:**
- Pre-configured role templates (PM, Architect, Frontend, Backend, QA)
- Custom agent creator with capability selection
- Agent "personalities" and communication styles
- Tool/MCP server assignments per agent

### 3. Workflow Design

**Connection Types:**
- **Sequential:** Agent B waits for Agent A to complete
- **Parallel:** Multiple agents work simultaneously
- **Conditional:** Branching based on outcomes
- **Iterative:** Loops for refinement cycles
- **Event-driven:** Triggered by external events (git push, PR, etc.)

**Visual Feedback:**
- Active connections glow/pulse during communication
- Message flow animation along connection lines
- Color coding for different message types
- Queue depth indicators on busy connections

### 4. Live Orchestration View

**Runtime Monitoring:**
- See agents come online/offline in real-time
- Message bubbles appear on connections as they communicate
- Terminal output streams from selected agents
- Chat panel shows inter-agent conversations
- Performance metrics (messages/sec, queue depth, latency)

**Interaction Controls:**
- Pause/resume individual agents
- Inject manual messages into flows
- Override automatic decisions
- Save/load team configurations

### 5. Development Workflow

**Typical User Flow:**

```
1. User creates new project → "E-commerce Site"
2. Drags PM agent onto canvas
3. Adds Frontend, Backend, and Database agents
4. Connects PM → Frontend & Backend (parallel)
5. Connects Backend → Database (sequential)
6. Clicks "Start Team"
7. Types in PM chat: "Build user registration"
8. Watches agents coordinate in real-time
9. Reviews generated code in left panel
10. Commits results via UI
```

## Interface Components

### Canvas Area (Right Panel)

**Node Types:**
- **Agent Node:** Rounded rectangle with icon, name, status LED
- **Team Node:** Dashed border containing multiple agents
- **Gateway Node:** Diamond shape for conditionals/routing
- **Event Node:** Circle for triggers (webhooks, git events)

**Node States (with State Machine):**

```typescript
enum AgentState {
  IDLE = 'idle',        // No current task, available
  PROCESSING = 'processing',  // Actively working on task
  BLOCKED = 'blocked',   // Waiting on dependency/input
  ERROR = 'error',      // Task failed, needs intervention
  OFFLINE = 'offline'   // Disconnected from broker
}
```

**Visual State Indicators (Dual Cue System):**
- **Idle** (⚪ gray) - Static, no animation - conserves attention
- **Processing** (🟢 green) - Pulsing border (2s cycle) + activity spinner
- **Blocked** (🟡 yellow) - Slow breathing effect (4s cycle) + hourglass
- **Error** (🔴 red) - Initial flash (0.5s) then solid + alert icon
- **Offline** (dimmed) - 50% opacity + disconnected icon

This dual-cue approach (color + motion) ensures state is recognizable at a glance even in peripheral vision.

### Communication Panel (Left Panel)

**Tab System:**
- **Chat:** Real-time agent conversations with sender tags
- **Terminal:** Selected agent's terminal output
- **Code:** Generated/modified files with syntax highlighting
- **Logs:** System-level debugging information
- **Metrics:** Performance graphs and statistics

### Control Bar (Top)

**Project Controls:**
- Project selector dropdown
- Save/Load configuration
- Export as template
- GitHub integration status

**Team Controls:**
- Start/Stop all agents
- Clear message queues
- Reset to checkpoint
- Performance mode toggle

### Status Bar (Bottom)

**System Health:**
- Broker connection status
- Total agents online
- Messages per second
- Average latency
- Error count

## Interaction Patterns

### Creating Agents

**Quick Create:**
1. Right-click canvas → "Add Agent"
2. Select from template library
3. Agent appears at cursor position
4. Auto-connects to nearby agents

**Custom Agent:**
1. Click "+" in agent library
2. Configure name, role, capabilities
3. Assign MCP servers and tools
4. Set communication preferences
5. Drag onto canvas

### Agent Control (Implementation-Proven Pattern)

**Context Menu Pattern:**
Right-click on any agent node reveals:
- **Connect Terminal** (🟢 green indicator) - Opens XTerm.js terminal
- **Stop Agent** (🔴 red indicator) - Gracefully terminates tmux session
- **View Logs** - Historical output
- **Restart** - Stop and restart agent

**Terminal Integration (XTerm.js):**
- Full PTY emulation in modal window
- Custom control bar with:
  - Command input field (separate from terminal)
  - "Write" button - Send text without executing
  - "Enter" button - Execute command
- WebSocket connection to `ws://127.0.0.1:5050/ws/terminal/{agentId}`
- Automatic reconnection on network issues

### Connecting Agents

**Visual Connection:**
- Drag from output port to input port
- Connection line follows cursor
- Valid targets highlight green
- Invalid targets show red X
- Release to create connection

**Connection Configuration:**
- Right-click connection line
- Set message filters
- Configure retry policies
- Add transformation rules
- Set priority levels

### Managing Workflows

**Save/Load:**
- Workflows saved as JSON
- Version control friendly
- Shareable via GitHub
- Template marketplace integration

**Runtime Control:**
- Pause button per agent
- Step-through debugging mode
- Breakpoints on connections
- Message inspection tooltips

## Progressive Disclosure

### Beginner Mode
- Simple agent templates
- Basic connections only
- Guided tutorials
- Suggested team compositions

### Advanced Mode
- Full agent customization
- Complex routing rules
- Custom MCP servers
- Performance tuning
- Multi-team orchestration

### Developer Mode
- Raw message inspection
- Direct broker interaction
- Custom node types
- Plugin development
- API access

## Visual Design System

### Color Palette
- **Primary Blue:** #3B82F6 (Actions, CTAs)
- **Success Green:** #10B981 (Active, working)
- **Warning Yellow:** #F59E0B (Blocked, waiting)
- **Error Red:** #EF4444 (Failures, offline)
- **Neutral Grays:** #F3F4F6 to #111827 (UI elements)

### Typography
- **Headers:** Inter or System UI font
- **Body:** Inter or System UI font
- **Code:** JetBrains Mono or Fira Code
- **Terminal:** Monaco or Consolas

### Spacing System
- 4px base unit
- 8px grid for alignment
- 16px minimum touch targets
- 24px standard button height
- 48px header height

## Mockup Implementation Strategy

### Phase 1: Static Mockup
- React + Tailwind for rapid iteration
- React Flow for canvas functionality
- Static data for agent states
- Hardcoded message flows

### Phase 2: Interactive Prototype
- Local state management
- Drag-and-drop functionality
- Dynamic connections
- Simulated agent responses

### Phase 3: Backend Integration
- WebSocket for real-time updates
- Actual broker connection
- Real agent processes
- Persistent storage

## Real-Time Requirements

### Connection Architecture

**Primary: WebSocket Connection**
```javascript
// UI connects to broker via WebSocket
const ws = new WebSocket('ws://localhost:5050/ws');
ws.on('agent.status', updateAgentCard);
ws.on('message.sent', animateMessageFlow);
ws.on('ticket.created', showNewTicket);
```

**Fallback: Server-Sent Events**
```javascript
// If WebSocket fails, use SSE
const eventSource = new EventSource('/events/stream');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateUI(data);
};
```

### Performance Targets

**Latency Requirements:**
- Agent status updates: <50ms visual update
- Message flow animation: <100ms to start
- Node state changes: Immediate (<16ms for 60fps)
- Terminal output streaming: <200ms delay

**Update Frequency:**
- Agent heartbeats: Every 30s (background)
- Active message flow: Real-time streaming
- Metrics dashboard: 1s aggregation window
- Queue depth: 500ms update cycle

### Visual Feedback

**Real-Time Indicators:**
```css
/* Pulse animation for active agents */
@keyframes thinking {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}

.agent-thinking {
  animation: thinking 2s ease-in-out infinite;
}

/* Message flow along connections */
.message-flow {
  animation: flow 1s linear;
}
```

**State Transitions:**
- Idle → Thinking: Fade to blue with pulse
- Thinking → Working: Solid green glow
- Working → Blocked: Fade to yellow
- Any → Error: Immediate red flash

### Data Flow

**Subscription Model:**
```javascript
// UI subscribes to specific agent updates
subscribe('agent:mary', (update) => {
  updateAgentNode('mary', update);
});

// Bulk updates for efficiency
subscribeToAll('agents', (updates) => {
  batchUpdateNodes(updates);
});
```

**Optimistic Updates:**
- Show UI changes immediately
- Confirm with server response
- Rollback on failure
- Queue indicators for pending operations

### Connection Management

**Auto-Reconnection:**
1. Detect connection loss
2. Show reconnecting indicator
3. Exponential backoff (1s, 2s, 4s, 8s...)
4. Restore subscriptions on reconnect
5. Request missed updates

**Offline Mode:**
- Cache last known state
- Queue user actions
- Show offline indicator
- Sync on reconnection

## Key User Scenarios

### Scenario 1: Quick Feature Addition
User drags PM and Frontend agents, connects them, types "Add dark mode toggle", watches implementation happen.

### Scenario 2: Complex Refactor
User builds team of Architect, Senior Dev, and QA agents with iterative connections for code review cycles.

### Scenario 3: Bug Hunt
User creates Detective and Fixer agents with conditional routing based on bug severity.

### Scenario 4: Learning Mode
New user follows tutorial to build first "Hello World" team with guided agent placement.

## Success Metrics

- Time to first working team: < 2 minutes
- Clicks to create agent: < 3
- Visual clarity: Can understand team structure at a glance
- Real-time feedback: < 100ms visual updates
- Error recovery: Clear visual indication of problems

## Future UI Enhancements

### Immediate Enhancements (from Droid)

**1. Attention Heatmap Overlay**
- Shade nodes/edges based on message volume or latency
- Instantly highlights bottlenecks for intervention
- Color gradient: Cool (low activity) → Hot (high activity)

**2. Timeline Scrubber**
- Replay last 30 minutes of agent interactions
- Scrub through team activity like video playback
- Perfect for post-mortems without log diving

**3. Task Kanban View**
- Parallel view to canvas showing agent task queues
- Drag-and-drop task reassignment between agents
- Active/idle badges on each card

**4. Agent Stories**
- Instagram-style story cards when agents complete tasks
- "Mary completed Frontend Build in 6m, tests ✅"
- Builds narrative and trust around the automated team

**5. Focus Mode**
- Click agent to expand mini control room
- Live terminal, recent messages, upcoming tasks
- Makes hand-offs intuitive when jumping between agents

**6. Fog-Busting Wizard**
- Guided flow: "What are you trying to accomplish?"
- Auto-suggests team templates and workflows
- Shows canvas preview before spawning agents
- Reduces the "where do I start?" friction

### AI-Assisted Design
- Suggest optimal team compositions
- Auto-arrange nodes for clarity
- Predict connection needs
- Recommend agent configurations

### Collaboration Features
- Multi-user canvas editing
- Shared team templates
- Real-time cursor tracking
- Comments on workflows

### Advanced Visualizations
- 3D workflow view
- Time-travel debugging
- Heatmaps of communication
- Performance bottleneck highlighting

## Conclusion

The UI-first approach allows us to:
1. Validate the mental model before building infrastructure
2. Get user feedback early in development
3. Iterate quickly on interaction patterns
4. Build excitement with visual progress
5. Ensure the system is approachable for newcomers

By mocking the experience first, we ensure the plumbing we build actually serves the user's needs.