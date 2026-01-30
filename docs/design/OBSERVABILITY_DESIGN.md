# Agent Observability System Design

**Status:** Proposed
**Date:** 2026-01-26
**Author:** System Architect
**Implementation Tracking:** See linked GitHub issues

---

## Executive Summary

Design a comprehensive observability system for Kokino that provides real-time visibility into agent conversations, cross-agent messaging, and team-level interactions. The system must support drilling down from team-level overview to individual message details without losing context or missing any activity.

**Core Requirements:**
1. Never miss any conversation activity (persistent storage + real-time updates)
2. Support multiple zoom levels (team → timeline → agent)
3. Show cross-agent message flow visually
4. Maintain context when switching between agents
5. Provide search and filtering capabilities

---

## Problem Statement

### Current Issues

1. **Lost Conversation History**
   - `AgentChatPanel` loads conversations but state is lost when panel closes
   - No persistence in Zustand store for conversation data
   - Uses incorrect API (`broker.getConversations` instead of `apiClient`)

2. **No Cross-Agent Visibility**
   - `messages` table exists with agent-to-agent messages but no UI consumes it
   - No way to see who is talking to whom
   - No thread correlation between related messages

3. **Fragmented Data Sources**
   - `conversations` table: Individual agent chat sessions
   - `turns` table: Messages within conversations
   - `messages` table: Cross-agent messages
   - `tickets` table: Message routing metadata
   - No unified view of all activity

4. **Missing Real-Time Updates**
   - WebSocket events exist but aren't used for global monitoring
   - Each agent panel has its own polling/subscription
   - No centralized activity stream

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Data Sources                          │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ conversations│    turns     │   messages   │    tickets    │
│   (agent     │  (chat msgs) │ (cross-agent)│  (routing)    │
│   sessions)  │              │              │               │
└──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────┘
       │              │              │               │
       └──────────────┼──────────────┼───────────────┘
                      ▼              ▼
              ┌───────────────────────────────┐
              │   Unified Timeline API        │
              │  /api/monitoring/timeline     │
              └───────────────┬───────────────┘
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              ┌──────────┬──────────┬──────────┐
              │ HTTP Get │ WebSocket│ Polling  │
              │ (initial)│ (updates)│ (fallback)│
              └──────────┴──────────┴──────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  ObservabilityStore (Zustand) │
              │  - Persistent conversation data│
              │  - Message history             │
              │  - Thread correlations         │
              │  - Real-time updates           │
              └───────────────┬───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐ ┌───────────────────┐ ┌─────────────────┐
│MessageFlowGraph│ │ConversationTimeline│ │AgentDetailPanel │
│ (React Flow)   │ │  (Virtual Scroll)   │ │  (Chat View)    │
└───────────────┘ └───────────────────┘ └─────────────────┘
```

---

## Component Design

### 1. TeamObservabilityDashboard

**Purpose:** Container component managing the three-panel layout

**State Management:**
```typescript
interface ObservabilityState {
  // View configuration
  layout: 'split' | 'timeline' | 'graph' | 'agent';
  panelSizes: [number, number, number];  // Percentage widths

  // Focus management
  selectedAgent: string | null;
  selectedThread: string | null;
  selectedTimeRange: [Date, Date];

  // Data
  conversations: Map<string, Conversation[]>;  // By agent
  messages: Message[];  // All cross-agent messages
  threads: Map<string, Message[]>;  // Thread correlations

  // UI State
  isLoading: boolean;
  autoScroll: boolean;
  filters: FilterConfig;
}
```

**Props:**
```typescript
interface TeamObservabilityDashboardProps {
  teamId?: string;  // Optional team filter
  agents?: string[];  // Optional agent list filter
}
```

---

### 2. MessageFlowGraph

**Purpose:** Visual representation of agent interactions using React Flow

**Node Structure:**
```typescript
interface AgentNode {
  id: string;
  type: 'agent';
  position: { x: number; y: number };
  data: {
    agentId: string;
    name: string;
    status: 'idle' | 'working' | 'waiting' | 'error';
    pendingMessages: number;
    lastActivity: Date;
    metrics: {
      messagesReceived: number;
      messagesSent: number;
      avgResponseTime: number;
    };
  };
}
```

**Edge Structure:**
```typescript
interface MessageEdge {
  id: string;
  source: string;  // From agent
  target: string;  // To agent
  type: 'message';
  animated: boolean;
  data: {
    threadId?: string;
    messageCount: number;
    lastMessage: Date;
    isActive: boolean;  // Currently flowing
  };
}
```

**Features:**
- Auto-layout using dagre or elk.js
- Animate message flow on new messages
- Click node → select agent in timeline
- Click edge → filter timeline to thread
- Drag to reposition nodes (persist positions)

---

### 3. ConversationTimeline

**Purpose:** Unified timeline showing all activity across agents

**Data Structure:**
```typescript
interface TimelineEntry {
  id: string;
  timestamp: Date;
  type: 'message' | 'conversation' | 'file_op' | 'violation';
  agentId: string;  // Primary agent
  targetAgentId?: string;  // For cross-agent messages
  threadId?: string;
  content: string;
  metadata: Record<string, any>;
  severity?: 'info' | 'warning' | 'error';
}
```

**Implementation Requirements:**
1. **Virtual Scrolling** - Use react-window for 10k+ messages
2. **Swimlanes** - One lane per agent
3. **Thread Lines** - Visual connection between related messages
4. **Live Tail Mode** - Auto-scroll to bottom on new messages
5. **Search** - Full-text search across content
6. **Filters** - By agent, type, time range, thread

---

### 4. AgentDetailPanel

**Purpose:** Deep dive into single agent's activity

**Sections:**
1. **Conversation History** - All turns from `conversations` table
2. **Message Queue** - Pending tickets from `tickets` table
3. **Performance Metrics** - CPU, memory, response times
4. **File Operations** - Recent reads/writes
5. **Active Chat** - Direct chat interface (existing AgentChatPanel)

---

## Backend API Design

### 1. GET /api/monitoring/timeline

**Purpose:** Get unified timeline of all activity

**Query Parameters:**
```typescript
interface TimelineQuery {
  from?: string;  // ISO timestamp
  to?: string;    // ISO timestamp
  agents?: string[];  // Filter by agents
  types?: ('message' | 'conversation' | 'file_op' | 'violation')[];
  threadId?: string;  // Filter by thread
  limit?: number;  // Default 1000
  offset?: number;  // For pagination
}
```

**Response:**
```typescript
interface TimelineResponse {
  entries: TimelineEntry[];
  total: number;
  hasMore: boolean;
  oldestTimestamp: string;
  newestTimestamp: string;
}
```

**Implementation:**
```sql
-- Unified query combining all sources
SELECT * FROM (
  -- Cross-agent messages
  SELECT
    'message' as type,
    message_id as id,
    timestamp,
    from_agent as agent_id,
    to_agent as target_agent_id,
    thread_id,
    payload as content,
    metadata
  FROM messages

  UNION ALL

  -- Conversation turns
  SELECT
    'conversation' as type,
    turn_id as id,
    created_at as timestamp,
    c.agent_id,
    NULL as target_agent_id,
    c.conversation_id as thread_id,
    t.content,
    t.metadata
  FROM turns t
  JOIN conversations c ON t.conversation_id = c.conversation_id

  -- Add file_operations and violations when those tables exist
) timeline
WHERE timestamp >= ? AND timestamp <= ?
ORDER BY timestamp DESC
LIMIT ? OFFSET ?
```

---

### 2. GET /api/monitoring/interactions

**Purpose:** Get agent interaction matrix for graph visualization

**Response:**
```typescript
interface InteractionsResponse {
  agents: Array<{
    agentId: string;
    status: string;
    messageStats: {
      sent: number;
      received: number;
      pending: number;
    };
  }>;
  edges: Array<{
    from: string;
    to: string;
    messageCount: number;
    threads: string[];
    lastActivity: string;
  }>;
}
```

**Implementation:**
```sql
-- Get agent interactions
SELECT
  from_agent,
  to_agent,
  COUNT(*) as message_count,
  GROUP_CONCAT(DISTINCT thread_id) as threads,
  MAX(timestamp) as last_activity
FROM messages
WHERE timestamp > datetime('now', '-1 hour')
GROUP BY from_agent, to_agent
```

---

### 3. WebSocket: /api/monitoring/stream [IMPLEMENTED ✅]

**Status:** Phase 3A Complete (2026-01-29)

**Purpose:** Real-time stream of all activity

**Event Types:**
```typescript
type MonitoringEvent =
  | { type: 'message.sent'; data: Message }
  | { type: 'conversation.turn'; data: Turn }
  | { type: 'agent.status'; data: AgentStatus }
  | { type: 'violation'; data: Violation }           // Future
  | { type: 'thread.created'; data: Thread };        // Future
```

**Implementation:**
- `MonitoringStream` service (`broker/src/services/MonitoringStream.js`)
- WebSocket endpoint at `/api/monitoring/stream`
- Event emission hooked into: TicketStore, ConversationStore, AgentRegistry
- Client filtering support (agents, types)
- Heartbeat every 30s
- Supports 10+ simultaneous clients
- <100ms latency, handles 100 events/sec

**Client Connection:**
```javascript
const ws = new WebSocket('ws://127.0.0.1:5050/api/monitoring/stream');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  observabilityStore.handleRealtimeUpdate(data);
};
```

**See:** `docs/reference/API.md#websocket-api` for complete documentation

---

## State Management (Zustand)

### ObservabilityStore

```typescript
interface ObservabilityStore {
  // Data
  conversations: Map<string, Conversation[]>;
  messages: Message[];
  threads: Map<string, Thread>;
  timeline: TimelineEntry[];

  // UI State
  selectedAgent: string | null;
  selectedThread: string | null;
  timeRange: [Date, Date];
  filters: FilterConfig;

  // Loading states
  isLoadingHistory: boolean;
  isConnected: boolean;

  // Actions
  loadHistory: (query: TimelineQuery) => Promise<void>;
  selectAgent: (agentId: string) => void;
  selectThread: (threadId: string) => void;
  applyFilter: (filter: Partial<FilterConfig>) => void;
  handleRealtimeUpdate: (event: MonitoringEvent) => void;

  // Computed
  getAgentConversations: (agentId: string) => Conversation[];
  getThreadMessages: (threadId: string) => Message[];
  getFilteredTimeline: () => TimelineEntry[];
}
```

**Implementation:**
```javascript
export const useObservabilityStore = create(
  subscribeWithSelector((set, get) => ({
    // Initial state
    conversations: new Map(),
    messages: [],
    threads: new Map(),
    timeline: [],
    selectedAgent: null,
    selectedThread: null,
    timeRange: [new Date(Date.now() - 3600000), new Date()],
    filters: {},
    isLoadingHistory: false,
    isConnected: false,

    // Load all history on mount
    loadHistory: async (query) => {
      set({ isLoadingHistory: true });
      try {
        const response = await apiClient.get('/api/monitoring/timeline', { params: query });

        // Process and index data
        const { entries } = response.data;
        const conversations = new Map();
        const messages = [];
        const threads = new Map();

        entries.forEach(entry => {
          if (entry.type === 'conversation') {
            // Group by agent
            if (!conversations.has(entry.agentId)) {
              conversations.set(entry.agentId, []);
            }
            conversations.get(entry.agentId).push(entry);
          } else if (entry.type === 'message') {
            messages.push(entry);
            // Group by thread
            if (entry.threadId) {
              if (!threads.has(entry.threadId)) {
                threads.set(entry.threadId, []);
              }
              threads.get(entry.threadId).push(entry);
            }
          }
        });

        set({
          timeline: entries,
          conversations,
          messages,
          threads,
          isLoadingHistory: false
        });
      } catch (error) {
        console.error('Failed to load history:', error);
        set({ isLoadingHistory: false });
      }
    },

    // Handle real-time updates
    handleRealtimeUpdate: (event) => {
      const state = get();

      switch (event.type) {
        case 'message.sent':
          // Add to messages and timeline
          set({
            messages: [...state.messages, event.data],
            timeline: [...state.timeline, {
              id: event.data.id,
              timestamp: new Date(event.data.timestamp),
              type: 'message',
              agentId: event.data.fromAgent,
              targetAgentId: event.data.toAgent,
              content: event.data.payload,
              threadId: event.data.threadId
            }]
          });
          break;

        case 'conversation.turn':
          // Add to conversations and timeline
          const { conversations } = state;
          const agentConvs = conversations.get(event.data.agentId) || [];
          agentConvs.push(event.data);
          conversations.set(event.data.agentId, agentConvs);

          set({
            conversations: new Map(conversations),
            timeline: [...state.timeline, {
              id: event.data.id,
              timestamp: new Date(event.data.createdAt),
              type: 'conversation',
              agentId: event.data.agentId,
              content: event.data.content,
              threadId: event.data.conversationId
            }]
          });
          break;
      }
    }
  }))
);
```

---

## Implementation Phases

### Phase 1: Fix Current Issues (Prerequisites)
1. Fix `AgentChatPanel` to use correct API
2. Add conversation persistence to existing Zustand store
3. Ensure conversation history loads on mount
4. Add proper error handling

### Phase 2: Backend API Development
1. Implement `/api/monitoring/timeline` endpoint
2. Implement `/api/monitoring/interactions` endpoint
3. Add WebSocket `/api/monitoring/stream` endpoint
4. Add database indexes for performance
5. Test with large datasets (10k+ messages)

### Phase 3: State Management
1. Create `ObservabilityStore` in Zustand
2. Implement data loading and indexing
3. Add WebSocket connection management
4. Add filtering and search logic
5. Test state synchronization

### Phase 4: Timeline Component
1. Create `ConversationTimeline` component
2. Implement virtual scrolling with react-window
3. Add swimlane visualization
4. Add thread correlation lines
5. Implement search and filters

### Phase 5: Message Flow Graph
1. Create `MessageFlowGraph` component
2. Integrate React Flow
3. Implement auto-layout algorithm
4. Add message animation
5. Add interaction handlers

### Phase 6: Integration
1. Create `TeamObservabilityDashboard` container
2. Wire up all components
3. Add panel resizing
4. Implement view synchronization
5. Add keyboard shortcuts

### Phase 7: Polish
1. Add loading states
2. Add error boundaries
3. Optimize performance
4. Add export functionality
5. Write tests

---

## Testing Strategy

### Unit Tests
- Store actions and computed values
- API response parsing
- Filter and search logic
- Timeline entry sorting

### Integration Tests
- API endpoint responses
- WebSocket message handling
- Store synchronization
- Component interactions

### Performance Tests
- Timeline with 10k+ entries
- Graph with 50+ agents
- Real-time updates at 100 msg/sec
- Memory usage monitoring

### User Acceptance Tests
1. Can see all conversation history when opening agent panel
2. Can switch between agents without losing context
3. Can see real-time message flow between agents
4. Can search for specific messages across all agents
5. Can filter by time range, agent, or thread
6. Can export conversation logs

---

## Performance Considerations

### Database
- Add compound indexes for timeline queries
- Use pagination for large result sets
- Cache recent queries

### Frontend
- Virtual scrolling for timeline (react-window)
- Memoize expensive computations
- Debounce search input
- Lazy load agent details
- Use WebWorker for data processing if needed

### WebSocket
- Implement reconnection with exponential backoff
- Buffer updates during reconnection
- Compress large payloads
- Rate limit updates to 10/sec per client

---

## Security Considerations

1. **Data Access** - Ensure agents can only see allowed conversations
2. **Rate Limiting** - Prevent DoS through excessive API calls
3. **Data Retention** - Define retention policy for conversation history
4. **Export Control** - Audit log for data exports
5. **WebSocket Auth** - Validate connections (future when auth implemented)

---

## Migration Plan

1. **Data Migration** - None needed, using existing tables
2. **API Compatibility** - New endpoints, no breaking changes
3. **UI Migration** - New dashboard is additive, doesn't replace existing
4. **Rollback Plan** - Feature flag to disable if issues

---

## Success Metrics

1. **Performance**
   - Timeline loads <2s for 1k entries
   - Real-time updates <100ms latency
   - Graph renders <1s for 20 agents

2. **Usability**
   - Zero lost conversations
   - 100% message visibility
   - Search results <500ms

3. **Reliability**
   - WebSocket reconnection 100% success
   - No data loss during disconnection
   - Graceful degradation without WebSocket

---

## Open Questions

1. **Data Retention** - How long to keep conversation history?
2. **Export Format** - JSON, CSV, or custom format for exports?
3. **Thread Detection** - Automatic vs manual thread correlation?
4. **Layout Persistence** - Store graph layout per user or global?
5. **Performance Threshold** - Max agents/messages to support?

---

## References

- Current Implementation: `ui/src/components/AgentChatPanel.jsx`
- Database Schema: `broker/src/db/schema.js`
- Message Routes: `broker/src/routes/messages.js`
- WebSocket Handler: `broker/src/index.js` (lines 195-250)
- Existing Store: `ui/src/stores/useAgentStore.js`