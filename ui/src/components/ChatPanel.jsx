import React, { useEffect, useRef } from 'react';
import { MessageSquare, X } from 'lucide-react';

export const ChatPanel = ({ messages = [] }) => {
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 bg-surface border-b border-border flex flex-col">
            {/* Header */}
            <div className="h-10 bg-surface-hover flex items-center px-4 border-b border-border">
                <MessageSquare size={14} className="text-accent-purple mr-2" />
                <span className="text-xs font-medium text-text-primary uppercase tracking-wider">Team Chat</span>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-text-muted text-sm">
                        No messages yet. Start the team to see conversation.
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                    msg.from === 'Alice' ? 'bg-accent-purple' :
                                    msg.from === 'Bob' ? 'bg-accent-blue' :
                                    msg.from === 'Jerry' ? 'bg-accent-green' :
                                    'bg-text-muted'
                                }`} />
                                <span className="text-xs font-semibold text-text-secondary">
                                    {msg.from}
                                </span>
                                {msg.to && (
                                    <>
                                        <span className="text-xs text-text-muted">→</span>
                                        <span className="text-xs text-text-secondary">{msg.to}</span>
                                    </>
                                )}
                                <span className="text-xs text-text-muted ml-auto">
                                    {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </span>
                            </div>
                            <div className="bg-surface-hover border border-border rounded-lg px-3 py-2 text-sm text-text-primary">
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Footer Status */}
            <div className="h-8 bg-surface-hover border-t border-border px-4 flex items-center text-xs text-text-muted">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
};
