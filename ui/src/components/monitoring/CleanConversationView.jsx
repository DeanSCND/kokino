import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Bot, ArrowRight } from 'lucide-react';
import { useObservabilityStore } from '../../stores';

const BROKER_URL = import.meta.env.VITE_BROKER_URL || 'http://127.0.0.1:5050';

export const CleanConversationView = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get timeRange from store
  const { timeRange } = useObservabilityStore();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Use timeRange from store or default to today
        const from = timeRange?.[0] || new Date(new Date().setHours(0,0,0,0)).toISOString();
        const to = timeRange?.[1] || new Date(new Date().setHours(23,59,59,999)).toISOString();
        const response = await fetch(`${BROKER_URL}/api/monitoring/timeline?from=${from}&to=${to}&limit=100`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Process entries into proper conversations
        const convMap = {};
        const agentMessages = [];

        data.entries.forEach(entry => {
          if (entry.type === 'message') {
            // This is a direct agent-to-agent message
            agentMessages.push({
              from: entry.agent_id,
              to: entry.target_agent_id,
              content: entry.content,
              timestamp: entry.timestamp
            });
          } else if (entry.type === 'conversation') {
            const threadId = entry.thread_id;
            if (!convMap[threadId]) {
              convMap[threadId] = {
                agent: entry.agent_id,
                thread: threadId,
                turns: []
              };
            }

            const metadata = entry.metadata ?
              (typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata) : {};

            // Determine the actual sender
            let sender = entry.agent_id; // Default to the conversation owner
            let isUserMessage = false;
            let isAgentToAgent = false;

            if (metadata.source === 'broker') {
              if (metadata.originAgent) {
                // This is an agent-to-agent message coming in
                sender = metadata.originAgent;
                isAgentToAgent = true;
              } else if (!metadata.isReply && !metadata.conversationId) {
                // This is a user message
                sender = 'You';
                isUserMessage = true;
              } else if (metadata.isReply) {
                // This is a reply from another agent
                sender = 'Dave'; // We'd need to track this better
                isAgentToAgent = true;
              }
            } else if (metadata.sessionId) {
              // This is an agent response
              sender = entry.agent_id;
            }

            convMap[threadId].turns.push({
              id: entry.id,
              sender: sender,
              content: entry.content,
              timestamp: entry.timestamp,
              isUserMessage: isUserMessage,
              isAgentToAgent: isAgentToAgent,
              metadata: metadata
            });
          }
        });

        // Sort turns by timestamp
        Object.values(convMap).forEach(conv => {
          conv.turns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        });

        setConversations(Object.values(convMap));
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="h-full overflow-auto bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-bold mb-4">Clean Conversation View</h2>

      {conversations.map(conv => (
        <div key={conv.thread} className="mb-8 border rounded-lg p-4">
          <h3 className="text-md font-semibold mb-3 text-blue-600">
            Your Conversation with {conv.agent}
          </h3>

          <div className="space-y-3">
            {conv.turns.map((turn, idx) => {
              // Skip agent-to-agent messages that are just being forwarded
              if (turn.isAgentToAgent && turn.sender !== 'You' && turn.sender !== conv.agent) {
                return (
                  <div key={turn.id || idx} className="flex items-center gap-2 px-3 py-1 bg-yellow-50 rounded text-xs text-gray-600">
                    <ArrowRight className="w-3 h-3" />
                    <span className="italic">
                      {turn.sender} sent a message to {conv.agent}: "{turn.content.substring(0, 50)}..."
                    </span>
                  </div>
                );
              }

              const isYou = turn.sender === 'You';
              const bgColor = isYou ? 'bg-blue-50' : 'bg-gray-50';

              return (
                <div key={turn.id || idx} className={`flex gap-3 p-3 rounded ${bgColor}`}>
                  <div className="flex-shrink-0">
                    {isYou ? (
                      <User className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Bot className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">
                        {turn.sender}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(turn.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700">
                      {turn.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};