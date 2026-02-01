import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Bot } from 'lucide-react';

export const ConversationView = () => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get today's data
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString(); // Today at 00:00
        const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString(); // Tomorrow at 00:00
        const response = await fetch(`http://127.0.0.1:5050/api/monitoring/timeline?from=${from}&to=${to}&limit=100`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Separate messages from conversation turns
        const msgs = [];
        const convTurns = [];

        data.entries.forEach(entry => {
          if (entry.type === 'message') {
            msgs.push(entry);
          } else if (entry.type === 'conversation') {
            convTurns.push(entry);
          }
        });

        // Group conversation turns by thread
        const grouped = {};
        convTurns.forEach(turn => {
          const threadId = turn.thread_id || 'unknown';
          if (!grouped[threadId]) {
            grouped[threadId] = {
              agent: turn.agent_id,
              thread: threadId,
              turns: []
            };
          }
          grouped[threadId].turns.push(turn);
        });

        // Sort turns within each conversation
        Object.values(grouped).forEach(conv => {
          conv.turns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        });

        setConversations(Object.values(grouped));
        setMessages(msgs);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  // Determine user vs agent messages based on metadata
  const isUserTurn = (turn, index, turns, agentId) => {
    const metadata = turn.metadata ? (typeof turn.metadata === 'string' ? JSON.parse(turn.metadata) : turn.metadata) : {};

    // Messages from the broker that aren't replies are user messages
    if (metadata.source === 'broker' && !metadata.isReply) {
      return true;
    }

    // Messages that are replies from other agents show as from that agent
    if (metadata.isReply || metadata.conversationId) {
      return false; // This is an agent-to-agent message being shown to the user
    }

    // Messages with sessionId and exitCode are agent responses
    if (metadata.sessionId && metadata.exitCode !== undefined) {
      return false;
    }

    // Default: check alternating pattern
    if (index === 0) {
      const content = turn.content || '';
      return !content.startsWith('Yes') && !content.startsWith("I've") && !content.includes('agents currently');
    }
    return index % 2 === 0;
  };

  // Get the sender name for a turn
  const getSenderName = (turn, isUser, agentId) => {
    if (isUser) return 'You';

    const metadata = turn.metadata ? (typeof turn.metadata === 'string' ? JSON.parse(turn.metadata) : turn.metadata) : {};

    // If this is a reply from another agent, show that agent's name
    if (metadata.originAgent) {
      return metadata.originAgent;
    }

    // If this is a message forwarded from another conversation
    if (metadata.conversationId && metadata.conversationId !== turn.thread_id) {
      // This is Dave's response being shown in Alice's conversation
      return 'Dave (via broker)';
    }

    return agentId;
  };

  return (
    <div className="h-full overflow-auto bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-bold mb-4">Conversation View</h2>

      {/* Agent-to-Agent Messages */}
      {messages.length > 0 && (
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2 text-blue-600">Agent Messages</h3>
          <div className="space-y-2">
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded">
                <MessageSquare className="w-5 h-5 text-blue-600 mt-1" />
                <div>
                  <div className="text-sm font-medium">
                    {msg.agent_id} → {msg.target_agent_id}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">{msg.content}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conversations */}
      {conversations.map(conv => (
        <div key={conv.thread} className="mb-6">
          <h3 className="text-md font-semibold mb-2">
            Conversation with {conv.agent}
            <span className="text-xs ml-2 text-gray-500">Thread: {conv.thread.substring(0, 8)}</span>
          </h3>
          <div className="space-y-2">
            {conv.turns.map((turn, idx) => {
              const isUser = isUserTurn(turn, idx, conv.turns, conv.agent);
              const senderName = getSenderName(turn, isUser, conv.agent);
              const isDaveReply = senderName === 'Dave (via broker)';

              return (
                <div
                  key={turn.id || idx}
                  className={`flex items-start gap-3 p-3 rounded ${
                    isUser ? 'bg-gray-50' : isDaveReply ? 'bg-blue-50' : 'bg-green-50'
                  }`}
                >
                  {isUser ? (
                    <User className="w-5 h-5 text-gray-600 mt-1" />
                  ) : isDaveReply ? (
                    <MessageSquare className="w-5 h-5 text-blue-600 mt-1" />
                  ) : (
                    <Bot className="w-5 h-5 text-green-600 mt-1" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {senderName}
                      {isDaveReply && (
                        <span className="text-xs ml-2 text-blue-600">(forwarded response)</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {turn.content}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(turn.timestamp).toLocaleTimeString()}
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