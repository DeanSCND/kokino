import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import { useConversation } from '../hooks/useConversation';
import { useAgentExecute } from '../hooks/useAgentExecute';
import broker from '../services/broker';

/**
 * AgentChatPanel - Full chat interface for headless agent execution
 *
 * Props:
 * - agent: Agent object with agentId, name, role, etc.
 * - onClose: Callback when panel is closed
 */
export const AgentChatPanel = ({ agent, onClose }) => {
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const { conversation, turns, loading, refresh } = useConversation(conversationId, {
    polling: true,
    pollingInterval: 2000 // Poll every 2s for new messages
  });

  const { execute, executing, error: executeError } = useAgentExecute(agent.agentId);

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const conversations = await broker.getConversations(agent.agentId);
        if (conversations.length > 0) {
          // Use most recent conversation
          setConversationId(conversations[0].conversationId);
        }
      } catch (err) {
        console.error('[AgentChatPanel] Failed to load conversations:', err);
      }
    };

    loadConversations();
  }, [agent.agentId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const handleSend = async () => {
    if (!input.trim() || executing) return;

    const prompt = input.trim();
    setInput('');

    try {
      const result = await execute(prompt);

      // Update conversation ID if it changed
      if (result.conversationId && result.conversationId !== conversationId) {
        setConversationId(result.conversationId);
      } else {
        // Refresh to get latest turns
        refresh();
      }
    } catch (err) {
      console.error('[AgentChatPanel] Execute failed:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearConversation = async () => {
    if (!conversationId) return;

    if (!confirm('Clear conversation history? This cannot be undone.')) {
      return;
    }

    try {
      await broker.deleteConversation(conversationId);
      setConversationId(null);
      setInput('');
    } catch (err) {
      console.error('[AgentChatPanel] Failed to clear conversation:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface rounded-lg border border-border w-full max-w-4xl h-[80vh] mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-purple/10 flex items-center justify-center">
              <MessageSquare size={20} className="text-accent-purple" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{agent.name || agent.agentId}</h2>
              <p className="text-sm text-text-secondary">
                {agent.metadata?.role || 'Headless Agent'}
                {conversation?.sessionId && <> · Session: {conversation.sessionId.substring(0, 8)}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversationId && (
              <button
                onClick={handleClearConversation}
                className="p-2 rounded hover:bg-surface-hover transition-colors"
                title="Clear conversation"
              >
                <Trash2 size={18} className="text-text-secondary" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-surface-hover transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && turns.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-text-muted" size={32} />
            </div>
          ) : turns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare size={48} className="text-text-muted mb-4" />
              <p className="text-text-secondary text-lg">No messages yet</p>
              <p className="text-text-muted text-sm mt-2">Send a message to start the conversation</p>
            </div>
          ) : (
            <>
              {turns.map((turn, index) => (
                <ChatBubble
                  key={turn.turnId || index}
                  role={turn.role}
                  content={turn.content}
                  createdAt={turn.createdAt}
                  metadata={turn.metadata}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}

          {/* Thinking indicator */}
          {executing && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-purple/10 flex items-center justify-center">
                <Loader2 size={16} className="animate-spin text-accent-purple" />
              </div>
              <div className="bg-surface border border-border rounded-lg px-4 py-2">
                <span className="text-text-secondary text-sm">Agent is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {executeError && (
          <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
            <p className="text-red-500 text-sm">Error: {executeError}</p>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Shift+Enter for new line)"
              className="flex-1 px-4 py-3 bg-background border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-purple resize-none"
              rows={3}
              disabled={executing}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || executing}
              className="px-6 py-3 rounded-lg bg-accent-purple hover:bg-accent-purple/80 text-white transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed self-end"
            >
              {executing ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
};
