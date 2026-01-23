import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, AlertCircle } from 'lucide-react';

/**
 * ChatBubble - Single message display for headless agent conversations
 *
 * Props:
 * - role: 'user' | 'assistant' | 'system'
 * - content: Message text (markdown supported)
 * - metadata: { timestamp, durationMs, error, etc. }
 */
export const ChatBubble = ({ role, content, metadata = {} }) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isError = metadata.error === true;

  // Format timestamp
  const timestamp = metadata.createdAt
    ? new Date(metadata.createdAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  // Format duration
  const duration = metadata.durationMs
    ? `${(metadata.durationMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar (left side for assistant/system) */}
      {!isUser && (
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isSystem
            ? 'bg-blue-500/10 text-blue-500'
            : isError
            ? 'bg-red-500/10 text-red-500'
            : 'bg-accent-purple/10 text-accent-purple'
        }`}>
          {isError ? (
            <AlertCircle size={16} />
          ) : (
            <Bot size={16} />
          )}
        </div>
      )}

      {/* Message bubble */}
      <div className={`flex flex-col max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-accent-purple text-white'
            : isSystem
            ? 'bg-blue-500/10 border border-blue-500/20 text-text-primary'
            : isError
            ? 'bg-red-500/10 border border-red-500/20 text-red-500'
            : 'bg-surface border border-border text-text-primary'
        }`}>
          <div className={`prose prose-sm max-w-none ${
            isUser ? 'prose-invert' : 'prose-slate'
          }`}>
            <ReactMarkdown
              components={{
                // Customize code blocks
                code: ({ node, inline, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  return inline ? (
                    <code className={`${isUser ? 'bg-white/20' : 'bg-surface-hover'} px-1 py-0.5 rounded text-sm`} {...props}>
                      {children}
                    </code>
                  ) : (
                    <pre className={`${isUser ? 'bg-white/10' : 'bg-background'} p-3 rounded overflow-x-auto`}>
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                // Customize links
                a: ({ node, children, ...props }) => (
                  <a
                    className={`${isUser ? 'text-white underline' : 'text-accent-purple hover:underline'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Metadata footer */}
        {(timestamp || duration) && (
          <div className="flex items-center gap-2 mt-1 px-2">
            <span className="text-xs text-text-muted">
              {timestamp}
              {duration && <> · {duration}</>}
            </span>
          </div>
        )}
      </div>

      {/* Avatar (right side for user) */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-purple flex items-center justify-center">
          <User size={16} className="text-white" />
        </div>
      )}
    </div>
  );
};
