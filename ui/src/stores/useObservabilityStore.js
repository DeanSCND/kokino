/**
 * Observability State Store
 * Issue #169: Persistent monitoring state with real-time updates
 *
 * Manages timeline data, WebSocket connections, and observability UI state
 *
 * USAGE:
 * ```javascript
 * import { useObservabilityStore } from '@/stores';
 *
 * function MyComponent() {
 *   const { loadHistory, connectWebSocket, timeline } = useObservabilityStore();
 *
 *   useEffect(() => {
 *     // Load historical data
 *     loadHistory();
 *
 *     // Connect to real-time stream
 *     connectWebSocket();
 *
 *     // Cleanup on unmount
 *     return () => {
 *       useObservabilityStore.getState().disconnectWebSocket();
 *     };
 *   }, []);
 *
 *   return <div>{timeline.length} events</div>;
 * }
 * ```
 */

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';

const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';

// Derive WebSocket URL from broker URL to respect environment configuration
const WS_URL = (() => {
  const url = new URL(BROKER_URL);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/api/monitoring/stream`;
})();

export const useObservabilityStore = create(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Data Collections (not persisted - loaded from API)
        // NOTE: Maps are not serializable, so they're excluded from persistence
        // via partialize config. Data is reloaded from API on mount.
        timeline: [],
        messages: new Map(), // Indexed by message_id
        conversations: new Map(), // Indexed by agent_id
        threads: new Map(), // Indexed by thread_id

        // UI State (persisted to localStorage)
        selectedAgent: null,
        selectedThread: null,
        timeRange: [
          new Date(Date.now() - 86400000).toISOString(), // 24 hours ago
          new Date().toISOString() // now
        ],
        filters: {
          agents: [],
          types: [],
          search: ''
        },

        // Connection State
        isLoadingHistory: false,
        isConnected: false,
        wsConnection: null,
        connectionError: null,

        // Statistics
        stats: {
          totalMessages: 0,
          totalTurns: 0,
          activeAgents: 0
        },

        // ========================================
        // Data Loading Actions
        // ========================================

        /**
         * Load historical timeline data from API
         */
        loadHistory: async (queryParams = {}) => {
          set({ isLoadingHistory: true });

          try {
            // Recalculate timeRange on each load to get fresh data
            const fromTime = new Date(Date.now() - 86400000).toISOString(); // 24 hours ago
            const toTime = new Date().toISOString(); // now
            const { agents, types } = get().filters;

            const params = new URLSearchParams({
              from: fromTime,
              to: toTime,
              limit: queryParams.limit || 1000,
              offset: queryParams.offset || 0,
              ...queryParams
            });

            if (agents?.length > 0) {
              params.append('agents', agents.join(','));
            }

            if (types?.length > 0) {
              params.append('types', types.join(','));
            }

            const response = await fetch(`${BROKER_URL}/api/monitoring/timeline?${params}`);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const { entries, total } = data;

            // Index data for fast lookups
            const messages = new Map();
            const conversations = new Map();
            const threads = new Map();
            let messageCount = 0;
            let turnCount = 0;

            entries.forEach(entry => {
              if (entry.type === 'message') {
                messages.set(entry.id, entry);
                messageCount++;

                // Index by thread
                if (entry.thread_id) {
                  if (!threads.has(entry.thread_id)) {
                    threads.set(entry.thread_id, []);
                  }
                  threads.get(entry.thread_id).push(entry);
                }
              } else if (entry.type === 'conversation') {
                // Index by agent
                if (!conversations.has(entry.agent_id)) {
                  conversations.set(entry.agent_id, []);
                }
                conversations.get(entry.agent_id).push(entry);
                turnCount++;

                // Also index by thread (conversation_id)
                if (entry.thread_id) {
                  if (!threads.has(entry.thread_id)) {
                    threads.set(entry.thread_id, []);
                  }
                  threads.get(entry.thread_id).push(entry);
                }
              }
            });

            // Count active agents
            const activeAgentSet = new Set();
            entries.forEach(entry => {
              if (entry.agent_id) activeAgentSet.add(entry.agent_id);
              if (entry.target_agent_id) activeAgentSet.add(entry.target_agent_id);
            });

            set({
              timeline: entries,
              messages,
              conversations,
              threads,
              timeRange: [fromTime, toTime], // Update with fresh timestamps
              stats: {
                totalMessages: messageCount,
                totalTurns: turnCount,
                activeAgents: activeAgentSet.size
              },
              isLoadingHistory: false
            });

            return { entries, total };
          } catch (error) {
            console.error('[ObservabilityStore] Failed to load history:', error);
            set({
              isLoadingHistory: false,
              connectionError: error.message
            });
            throw error;
          }
        },

        // ========================================
        // WebSocket Connection Management
        // ========================================

        /**
         * Connect to real-time monitoring stream
         */
        connectWebSocket: () => {
          const { wsConnection } = get();

          // Close existing connection if any
          if (wsConnection) {
            wsConnection.close();
          }

          try {
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => {
              // // console.log('[ObservabilityStore] WebSocket connected');
              set({ isConnected: true, connectionError: null });

              // Apply current filters to WebSocket
              const { filters } = get();
              if (filters.agents.length > 0 || filters.types.length > 0) {
                ws.send(JSON.stringify({
                  type: 'filter',
                  agents: filters.agents.length > 0 ? filters.agents : null,
                  types: filters.types.length > 0 ? filters.types : null
                }));
              }
            };

            ws.onmessage = (event) => {
              const message = JSON.parse(event.data);
              get().handleRealtimeUpdate(message);
            };

            ws.onerror = (error) => {
              console.error('[ObservabilityStore] WebSocket error:', error);
              set({ connectionError: 'WebSocket connection error' });
            };

            ws.onclose = () => {
              // console.log('[ObservabilityStore] WebSocket disconnected');
              set({ isConnected: false, wsConnection: null });

              // Attempt reconnect after 5 seconds
              setTimeout(() => {
                if (get().wsConnection === null) {
                  // console.log('[ObservabilityStore] Attempting reconnect...');
                  get().connectWebSocket();
                }
              }, 5000);
            };

            set({ wsConnection: ws });
          } catch (error) {
            console.error('[ObservabilityStore] Failed to connect WebSocket:', error);
            set({ connectionError: error.message });
          }
        },

        /**
         * Disconnect WebSocket
         */
        disconnectWebSocket: () => {
          const { wsConnection } = get();
          if (wsConnection) {
            wsConnection.close();
            set({ wsConnection: null, isConnected: false });
          }
        },

        /**
         * Handle incoming real-time update
         */
        handleRealtimeUpdate: (event) => {
          const { type, data } = event;

          switch (type) {
            case 'connected':
              // console.log('[ObservabilityStore] Stream connected:', data?.clientId || 'unknown');
              break;

            case 'filter-updated':
              // console.log('[ObservabilityStore] Filters applied:', data);
              break;

            case 'message.sent':
              get()._addMessage(data);
              break;

            case 'conversation.turn':
              get()._addConversationTurn(data);
              break;

            case 'agent.status':
              // console.log('[ObservabilityStore] Agent status changed:', data);
              // Could update agent status in UI if needed
              break;

            case 'shutdown':
              // console.log('[ObservabilityStore] Server shutting down');
              get().disconnectWebSocket();
              break;

            default:
              console.warn('[ObservabilityStore] Unknown event type:', type);
          }
        },

        /**
         * Add new message to timeline (real-time)
         * @private
         */
        _addMessage: (messageData) => {
          set((state) => {
            const newEntry = {
              type: 'message',
              id: messageData.id,
              timestamp: messageData.timestamp,
              agent_id: messageData.fromAgent,
              target_agent_id: messageData.toAgent,
              thread_id: messageData.threadId,
              content: messageData.payload,
              metadata: {}
            };

            // Add to timeline (prepend for newest first)
            const timeline = [newEntry, ...state.timeline];

            // Update messages map
            const messages = new Map(state.messages);
            messages.set(newEntry.id, newEntry);

            // Update threads map
            const threads = new Map(state.threads);
            if (newEntry.thread_id) {
              const threadMessages = threads.get(newEntry.thread_id) || [];
              threads.set(newEntry.thread_id, [newEntry, ...threadMessages]);
            }

            // Update stats
            const stats = {
              ...state.stats,
              totalMessages: state.stats.totalMessages + 1
            };

            return { timeline, messages, threads, stats };
          });
        },

        /**
         * Add new conversation turn to timeline (real-time)
         * @private
         */
        _addConversationTurn: (turnData) => {
          set((state) => {
            const newEntry = {
              type: 'conversation',
              id: String(turnData.turnId),
              timestamp: turnData.timestamp,
              agent_id: turnData.agentId,
              target_agent_id: null,
              thread_id: turnData.conversationId,
              content: turnData.content,
              metadata: {}
            };

            // Add to timeline
            const timeline = [newEntry, ...state.timeline];

            // Update conversations map
            const conversations = new Map(state.conversations);
            const agentConversations = conversations.get(newEntry.agent_id) || [];
            conversations.set(newEntry.agent_id, [newEntry, ...agentConversations]);

            // Update threads map
            const threads = new Map(state.threads);
            const threadMessages = threads.get(newEntry.thread_id) || [];
            threads.set(newEntry.thread_id, [newEntry, ...threadMessages]);

            // Update stats
            const stats = {
              ...state.stats,
              totalTurns: state.stats.totalTurns + 1
            };

            return { timeline, conversations, threads, stats };
          });
        },

        // ========================================
        // UI Actions
        // ========================================

        /**
         * Select an agent for detailed view
         */
        selectAgent: (agentId) => set({ selectedAgent: agentId }),

        /**
         * Select a thread for detailed view
         */
        selectThread: (threadId) => set({ selectedThread: threadId }),

        /**
         * Set time range and reload data
         */
        setTimeRange: async (from, to) => {
          set({ timeRange: [from, to] });
          await get().loadHistory();
        },

        /**
         * Apply filter and update WebSocket if connected
         */
        applyFilter: (filterUpdate) => {
          set((state) => ({
            filters: { ...state.filters, ...filterUpdate }
          }));

          // Update WebSocket filters if connected
          const { wsConnection, filters } = get();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'filter',
              agents: filters.agents.length > 0 ? filters.agents : null,
              types: filters.types.length > 0 ? filters.types : null
            }));
          }

          // Reload history with new filters
          get().loadHistory();
        },

        /**
         * Clear all filters
         */
        clearFilters: () => {
          set({ filters: { agents: [], types: [], search: '' } });

          // Clear WebSocket filters
          const { wsConnection } = get();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'filter',
              agents: null,
              types: null
            }));
          }

          get().loadHistory();
        },

        // ========================================
        // Computed Getters
        // ========================================

        /**
         * Get conversation turns for specific agent
         */
        getAgentConversations: (agentId) => {
          return get().conversations.get(agentId) || [];
        },

        /**
         * Get all messages in a thread
         */
        getThreadMessages: (threadId) => {
          return get().threads.get(threadId) || [];
        },

        /**
         * Get filtered timeline based on current filters
         */
        getFilteredTimeline: () => {
          const { timeline, filters } = get();
          const { agents, types, search } = filters;

          return timeline.filter(entry => {
                // Agent filter
            if (agents.length > 0) {
              const matchesAgent = agents.includes(entry.agent_id) ||
                                   agents.includes(entry.target_agent_id);
              if (!matchesAgent) return false;
            }

            // Type filter
            if (types.length > 0 && !types.includes(entry.type)) {
              return false;
            }

            // Search filter
            if (search && !entry.content?.toLowerCase().includes(search.toLowerCase())) {
              return false;
            }

            return true;
          });
        },

        /**
         * Get metrics for specific agent
         */
        getAgentMetrics: (agentId) => {
          const { timeline } = get();

          const sentMessages = timeline.filter(
            e => e.type === 'message' && e.agent_id === agentId
          ).length;

          const receivedMessages = timeline.filter(
            e => e.type === 'message' && e.target_agent_id === agentId
          ).length;

          const conversationTurns = timeline.filter(
            e => e.type === 'conversation' && e.agent_id === agentId
          ).length;

          const activeThreads = new Set(
            timeline
              .filter(e => e.agent_id === agentId && e.thread_id)
              .map(e => e.thread_id)
          ).size;

          return {
            sentMessages,
            receivedMessages,
            conversationTurns,
            activeThreads
          };
        }
      })),
      {
        name: 'ObservabilityStore',
        version: 3, // v3: Don't persist timeRange (always use fresh 24h window)
        // Only persist UI state, not data (which should be reloaded from API)
        partialize: (state) => ({
          selectedAgent: state.selectedAgent,
          selectedThread: state.selectedThread,
          // timeRange removed - always use fresh timestamps from loadHistory()
          filters: state.filters
        })
      }
    ),
    { name: 'ObservabilityStore' }
  )
);
