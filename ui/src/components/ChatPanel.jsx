import React, { useEffect, useRef } from 'react';
import { MessageSquare, X } from 'lucide-react';

export const ChatPanel = ({ messages = [], isOpen, onClose }) => {
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!isOpen) return null;

    return (
        <div className="absolute bottom-0 right-0 w-96 h-[500px] bg-surface border-l border-t border-border rounded-tl-xl shadow-2xl flex flex-col z-20">
            {/* Header */}
            <div className="h-12 bg-surface-hover flex items-center justify-between px-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <MessageSquare size={16} className="text-accent-purple" />
                    <span className="text-sm font-medium text-text-primary">Team Chat</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-text-secondary hover:text-text-primary transition-colors"
                    aria-label="Close chat panel"
                >
                    <X size={16} />
                </button>
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
            <div className="h-10 bg-surface-hover border-t border-border px-4 flex items-center text-xs text-text-muted">
                {messages.length} message{messages.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
};
